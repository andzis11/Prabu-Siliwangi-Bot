use anyhow::Result;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::{CopyTradeConfig, CopyTradeEvent, CopyTradeStatus, WalletMonitor, WalletSubscription};

const STATE_FILE: &str = "state.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct PersistedState {
    config: CopyTradeConfig,
    subscriptions: Vec<WalletSubscription>,
}

pub struct AppState {
    pub config: CopyTradeConfig,
    pub subscriptions: HashMap<String, WalletSubscription>,
    pub active_trades: HashMap<String, CopyTradeEvent>,
    pub today_trades: Vec<CopyTradeEvent>,
    pub wallet_transactions: HashMap<String, Vec<CopyTradeEvent>>,
    pub event_sender: broadcast::Sender<CopyTradeEvent>,
    pub monitor: Option<WalletMonitor>,
    pub monitor_task: Option<tokio::task::JoinHandle<()>>,
}

impl AppState {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1000);
        let mut state = Self {
            config: CopyTradeConfig::default(),
            subscriptions: HashMap::new(),
            active_trades: HashMap::new(),
            today_trades: Vec::new(),
            wallet_transactions: HashMap::new(),
            event_sender: sender,
            monitor: None,
            monitor_task: None,
        };

        if let Err(e) = state.load_state() {
            warn!("Could not load previous state: {}. Using defaults.", e);
        }

        state
    }

    fn save_state(&self) -> Result<()> {
        let persisted = PersistedState {
            config: self.config.clone(),
            subscriptions: self.subscriptions.values().cloned().collect(),
        };

        let json = serde_json::to_string_pretty(&persisted)?;
        fs::write(STATE_FILE, json)?;
        info!("State saved to {}", STATE_FILE);
        Ok(())
    }

    fn load_state(&mut self) -> Result<()> {
        if !Path::new(STATE_FILE).exists() {
            return Ok(());
        }

        let json = fs::read_to_string(STATE_FILE)?;
        let persisted: PersistedState = serde_json::from_str(&json)?;

        self.config = persisted.config;
        for sub in persisted.subscriptions {
            self.subscriptions.insert(sub.wallet_address.clone(), sub);
        }

        info!(
            "State loaded from {}. Config and {} subscriptions restored.",
            STATE_FILE,
            self.subscriptions.len()
        );
        Ok(())
    }

    pub fn get_status(&self) -> CopyTradeStatus {
        let total_volume: f64 = self.today_trades.iter().map(|e| e.amount_in).sum();
        let pnl: f64 = self
            .today_trades
            .iter()
            .filter(|e| e.direction == crate::TradeDirection::Sell)
            .map(|e| e.amount_out - e.amount_in)
            .sum();

        CopyTradeStatus {
            subscriptions: self.subscriptions.len(),
            active_trades: self.active_trades.len(),
            total_trades_today: self.today_trades.len(),
            total_volume_today_sol: total_volume,
            pnl_today_sol: pnl,
        }
    }

    pub async fn add_subscription(&mut self, sub: WalletSubscription) -> Result<()> {
        let wallet_address = sub.wallet_address.clone();
        info!("Adding subscription for wallet: {}", wallet_address);

        if wallet_address.is_empty() {
            anyhow::bail!("Wallet address cannot be empty");
        }

        self.subscriptions.insert(wallet_address.clone(), sub);

        if let Some(ref mut monitor) = self.monitor {
            monitor.add_wallet(&wallet_address).await?;
        }

        let _ = self.save_state();
        Ok(())
    }

    pub async fn remove_subscription(&mut self, wallet: &str) -> Result<()> {
        info!("Removing subscription for wallet: {}", wallet);

        if self.subscriptions.remove(wallet).is_none() {
            warn!("Subscription not found for wallet: {}", wallet);
            anyhow::bail!("Subscription not found");
        }

        if let Some(ref mut monitor) = self.monitor {
            monitor.remove_wallet(wallet).await?;
        }

        let _ = self.save_state();
        Ok(())
    }

    pub fn list_subscriptions(&self) -> Vec<WalletSubscription> {
        self.subscriptions.values().cloned().collect()
    }

    pub fn get_wallet_transactions(&self, wallet: &str) -> Vec<CopyTradeEvent> {
        self.wallet_transactions
            .get(wallet)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_config(&self) -> serde_json::Value {
        serde_json::to_value(&self.config).unwrap_or_default()
    }

    pub fn update_config(&mut self, config_json: serde_json::Value) -> Result<()> {
        info!("Updating config");

        // Deserialize incoming JSON into our config structure
        if let Ok(new_config) = serde_json::from_value(config_json) {
            self.config = new_config;
            info!("Config updated successfully");
            let _ = self.save_state();
            Ok(())
        } else {
            error!("Invalid config format received");
            anyhow::bail!("Invalid config format")
        }
    }

    pub fn add_event(&mut self, event: CopyTradeEvent) {
        self.active_trades
            .insert(event.signature.clone(), event.clone());
        self.today_trades.push(event.clone());

        self.wallet_transactions
            .entry(event.source_wallet.clone())
            .or_insert_with(Vec::new)
            .push(event);
    }

    pub fn update_event_status(&mut self, signature: &str, status: crate::TradeStatus) {
        if let Some(event) = self.active_trades.get_mut(signature) {
            event.status = status.clone();
            if status == crate::TradeStatus::Confirmed || status == crate::TradeStatus::Failed {
                self.active_trades.remove(signature);
            }
        }
    }

    pub async fn start_monitoring(&mut self) -> Result<()> {
        if self.monitor.is_some() {
            warn!("Monitoring already started");
            return Ok(());
        }

        let ws_url = self.config.ws_url.clone().unwrap_or_else(|| {
            if let Some(ref key) = self.config.helius_api_key {
                format!("wss://mainnet.helius-rpc.com/?api-key={}", key)
            } else {
                "wss://api.mainnet-beta.solana.com".to_string()
            }
        });

        info!("Starting wallet monitoring with WS URL: {}", ws_url);

        let monitor = crate::WalletMonitor::new(ws_url.clone());

        for wallet in self.subscriptions.keys() {
            monitor.add_wallet(wallet).await?;
        }

        let _receiver = monitor.subscribe();

        self.monitor = Some(monitor);

        info!("Wallet monitoring started");
        Ok(())
    }

    pub fn stop_monitoring(&mut self) {
        if let Some(handle) = self.monitor_task.take() {
            handle.abort();
        }
        self.monitor = None;
        info!("Wallet monitoring stopped");
    }

    pub fn list_monitored_wallets(&self) -> Vec<String> {
        if let Some(ref monitor) = self.monitor {
            Vec::new()
        } else {
            self.subscriptions.keys().cloned().collect()
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
