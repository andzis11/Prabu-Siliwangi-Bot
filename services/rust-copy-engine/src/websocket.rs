use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
use tracing::{info, error, debug, warn};

use crate::{CopyTradeEvent, TradeDirection, TradeStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTransfer {
    pub from: Pubkey,
    pub to: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub decimals: u8,
}

#[derive(Debug, Clone)]
pub struct WalletTransaction {
    pub signature: String,
    pub slot: u64,
    pub timestamp: i64,
    pub transfers: Vec<ParsedTransfer>,
    pub fee: u64,
    pub success: bool,
}

pub struct WalletMonitor {
    ws_url: String,
    subscriptions: Arc<RwLock<HashSet<String>>>,
    event_sender: broadcast::Sender<CopyTradeEvent>,
}

impl WalletMonitor {
    pub fn new(ws_url: String) -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self {
            ws_url,
            subscriptions: Arc::new(RwLock::new(HashSet::new())),
            event_sender: sender,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CopyTradeEvent> {
        self.event_sender.subscribe()
    }

    pub async fn add_wallet(&self, wallet: &str) -> Result<()> {
        let mut subs = self.subscriptions.write().await;
        subs.insert(wallet.to_string());
        info!("Added wallet to monitoring: {}", wallet);
        Ok(())
    }

    pub async fn remove_wallet(&self, wallet: &str) -> Result<()> {
        let mut subs = self.subscriptions.write().await;
        subs.remove(wallet);
        info!("Removed wallet from monitoring: {}", wallet);
        Ok(())
    }

    pub async fn get_wallets(&self) -> Vec<String> {
        let subs = self.subscriptions.read().await;
        subs.iter().cloned().collect()
    }

    pub async fn start(mut self) -> Result<()> {
        loop {
            match self.connect_and_monitor().await {
                Ok(_) => {
                    warn!("WebSocket disconnected, will reconnect...");
                }
                Err(e) => {
                    error!("WebSocket error: {}, reconnecting in 5s...", e);
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    }

    async fn connect_and_monitor(&mut self) -> Result<()> {
        info!("Connecting to WebSocket: {}", self.ws_url);
        
        let (ws_stream, _) = connect_async(&self.ws_url).await?;
        let (mut write, mut read) = ws_stream.split();

        info!("WebSocket connected successfully");

        let wallets = self.get_wallets().await;
        for wallet in &wallets {
            let msg = self.create_subscription_msg(wallet);
            write.send(msg.to_string().into()).await?;
            info!("Subscribed to wallet: {}", wallet);
        }

        let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(30));

        loop {
            tokio::select! {
                msg = read.next() => {
                    match msg {
                        Some(Ok(WsMessage::Text(text))) => {
                            if let Err(e) = self.handle_message(&text).await {
                                debug!("Error handling message: {}", e);
                            }
                        }
                        Some(Ok(WsMessage::Pong(_))) => {
                            debug!("Received pong");
                        }
                        Some(Ok(WsMessage::Close(_))) => {
                            info!("WebSocket closed by server");
                            break;
                        }
                        Some(Err(e)) => {
                            error!("WebSocket error: {}", e);
                            break;
                        }
                        None => {
                            info!("WebSocket stream ended");
                            break;
                        }
                        _ => {}
                    }
                }
                _ = ping_interval.tick() => {
                    if let Err(e) = write.send(json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "ping"
                    }).to_string().into()).await {
                        warn!("Failed to send ping: {}", e);
                        break;
                    }
                }
            }
        }

        Ok(())
    }

    async fn handle_message(&self, text: &str) -> Result<()> {
        let json: Value = serde_json::from_str(text)?;

        if let Some(result) = json.get("result").or_else(|| json.get("params").and_then(|p| p.get("result"))) {
            self.process_subscription_result(result).await?;
        }

        if let Some(error) = json.get("error") {
            debug!("RPC error: {:?}", error);
        }

        Ok(())
    }

    async fn process_subscription_result(&self, result: &Value) -> Result<()> {
        let signature = result["signature"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        debug!("Processing transaction: {}", signature);

        let subscriptions = self.subscriptions.read().await;
        
        if let Some(transaction) = self.parse_transaction(result, &subscriptions).await {
            if transaction.transfers.is_empty() {
                return Ok(());
            }

            for transfer in &transaction.transfers {
                let event = CopyTradeEvent {
                    signature: signature.clone(),
                    source_wallet: transfer.from.to_string(),
                    token_mint: transfer.mint.to_string(),
                    direction: self.detect_direction(&transaction.transfers),
                    amount_in: transfer.amount as f64 / 10_f64.powi(transfer.decimals as i32),
                    amount_out: 0.0,
                    timestamp: transaction.timestamp,
                    status: TradeStatus::Detected,
                };

                info!(
                    "Detected trade: {} {} SOL for {}",
                    if event.direction == TradeDirection::Buy { "BUY" } else { "SELL" },
                    event.amount_in,
                    event.token_mint
                );

                let _ = self.event_sender.send(event);
            }
        }

        Ok(())
    }

    async fn parse_transaction(&self, result: &Value, _subscriptions: &HashSet<String>) -> Option<WalletTransaction> {
        let signature = result["signature"].as_str()?.to_string();
        let slot = result["slot"].as_u64().unwrap_or(0);
        let timestamp = chrono::Utc::now().timestamp();

        let meta = result.get("transaction")?.get("meta")?;
        let success = meta.get("err").is_none();
        let fee = meta.get("fee").and_then(|f| f.as_u64()).unwrap_or(0);

        let mut transfers = Vec::new();

        if let Some(post_token_balances) = meta.get("postTokenBalances").and_then(|b| b.as_array()) {
            if let Some(pre_token_balances) = meta.get("preTokenBalances").and_then(|b| b.as_array()) {
                for post in post_token_balances {
                    if let Some(post_amount) = post.get("uiTokenAmount").and_then(|a| a.get("uiAmount")).and_then(|a| a.as_f64()) {
                        if let Some(post_mint) = post.get("mint").and_then(|m| m.as_str()) {
                            if let Some(post_owner) = post.get("owner").and_then(|o| o.as_str()) {
                                let pre_amount = pre_token_balances.iter()
                                    .filter(|p| {
                                        p.get("mint").and_then(|m| m.as_str()) == Some(post_mint) &&
                                        p.get("owner").and_then(|o| o.as_str()) == Some(post_owner)
                                    })
                                    .find_map(|p| p.get("uiTokenAmount").and_then(|a| a.get("uiAmount")).and_then(|a| a.as_f64()))
                                    .unwrap_or(0.0);

                                let amount_diff = post_amount - pre_amount;
                                if amount_diff.abs() > 0.0001 {
                                    if let (Ok(mint), Ok(owner)) = (
                                        Pubkey::from_str(post_mint),
                                        Pubkey::from_str(post_owner)
                                    ) {
                                        let decimals = post.get("uiTokenAmount")
                                            .and_then(|a| a.get("decimals"))
                                            .and_then(|d| d.as_u64())
                                            .unwrap_or(9) as u8;

                                        let from_addr = if amount_diff < 0.0 { owner } else { Pubkey::default() };
                                        let to_addr = if amount_diff > 0.0 { owner } else { Pubkey::default() };

                                        transfers.push(ParsedTransfer {
                                            from: from_addr,
                                            to: to_addr,
                                            mint,
                                            amount: (amount_diff.abs() * 10_f64.powi(decimals as i32)) as u64,
                                            decimals,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Some(WalletTransaction {
            signature,
            slot,
            timestamp,
            transfers,
            fee,
            success,
        })
    }

    fn detect_direction(&self, transfers: &[ParsedTransfer]) -> TradeDirection {
        let sol_transfers: Vec<_> = transfers.iter()
            .filter(|t| t.mint.to_string() == "So11111111111111111111111111111111111111112")
            .collect();

        if sol_transfers.is_empty() {
            return TradeDirection::Buy;
        }

        let has_outgoing_sol = sol_transfers.iter().any(|t| t.amount > 0);
        if has_outgoing_sol {
            TradeDirection::Buy
        } else {
            TradeDirection::Sell
        }
    }

    fn create_subscription_msg(&self, wallet: &str) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "transactionSubscribe",
            "params": [
                {
                    "failed": false,
                    "accountInclude": [wallet],
                },
                {
                    "commitment": "processed",
                    "encoding": "jsonParsed",
                    "transactionDetails": "full",
                    "maxSupportedTransactionVersion": 0
                }
            ]
        })
    }
}

impl Default for WalletMonitor {
    fn default() -> Self {
        Self::new("wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY".to_string())
    }
}
