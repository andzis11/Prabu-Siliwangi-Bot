use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use tracing::{info, error, warn};
use std::sync::Arc;
use tokio::sync::RwLock;

use super::{JitoClient, JitoConfig, BundleStatus};
use crate::CopyTradeConfig;

#[derive(Debug, Clone)]
pub struct BundlerStats {
    pub bundles_sent: u64,
    pub bundles_confirmed: u64,
    pub bundles_failed: u64,
    pub last_bundle_id: Option<String>,
    pub last_confirmed_at: Option<i64>,
}

impl Default for BundlerStats {
    fn default() -> Self {
        Self {
            bundles_sent: 0,
            bundles_confirmed: 0,
            bundles_failed: 0,
            last_bundle_id: None,
            last_confirmed_at: None,
        }
    }
}

pub struct Bundler {
    jito: JitoClient,
    stats: Arc<RwLock<BundlerStats>>,
}

impl Bundler {
    pub fn new(config: &CopyTradeConfig) -> Self {
        let jito_config = JitoConfig {
            enabled: config.jito_enabled,
            tip_amount: 10_000,
            endpoints: vec![
                "https://mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
            ],
            timeout_ms: 5000,
        };

        Self {
            jito: JitoClient::new(jito_config),
            stats: Arc::new(RwLock::new(BundlerStats::default())),
        }
    }

    pub async fn send_bundle(&self, transactions: Vec<String>) -> Result<String> {
        if !self.jito.is_enabled() {
            warn!("Jito bundling is disabled, skipping bundle send");
            return Err(anyhow!("Jito bundling is disabled"));
        }

        info!("Sending bundle with {} transactions", transactions.len());

        match self.jito.send_bundle(transactions.clone()).await {
            Ok(bundle_ids) => {
                let bundle_id = bundle_ids.first().cloned().unwrap_or_default();
                
                let mut stats = self.stats.write().await;
                stats.bundles_sent += 1;
                stats.last_bundle_id = Some(bundle_id.clone());

                info!("Bundle sent successfully: {}", bundle_id);
                Ok(bundle_id)
            }
            Err(e) => {
                let mut stats = self.stats.write().await;
                stats.bundles_failed += 1;

                error!("Failed to send bundle: {}", e);
                Err(e)
            }
        }
    }

    pub async fn send_bundle_with_tip(
        &mut self,
        transactions: Vec<String>,
        tip_lamports: Option<u64>,
    ) -> Result<String> {
        if !self.jito.is_enabled() {
            warn!("Jito bundling is disabled, skipping bundle send");
            return Err(anyhow!("Jito bundling is disabled"));
        }

        if let Some(tip) = tip_lamports {
            self.jito.set_tip_amount(tip);
        }

        info!("Sending bundle with tip, {} transactions", transactions.len());

        match self.jito.send_bundle_with_tip(transactions.clone()).await {
            Ok(bundle_ids) => {
                let bundle_id = bundle_ids.first().cloned().unwrap_or_default();
                
                let mut stats = self.stats.write().await;
                stats.bundles_sent += 1;
                stats.last_bundle_id = Some(bundle_id.clone());

                info!("Bundle with tip sent successfully: {}", bundle_id);
                Ok(bundle_id)
            }
            Err(e) => {
                let mut stats = self.stats.write().await;
                stats.bundles_failed += 1;

                error!("Failed to send bundle with tip: {}", e);
                Err(e)
            }
        }
    }

    pub async fn check_bundle_status(&self, bundle_id: &str) -> Result<BundleStatus> {
        self.jito.get_bundle_status(bundle_id).await
    }

    pub async fn confirm_bundle(&mut self, bundle_id: &str) -> Result<()> {
        let status = self.check_bundle_status(bundle_id).await?;
        
        match status {
            BundleStatus::Confirmed => {
                let mut stats = self.stats.write().await;
                stats.bundles_confirmed += 1;
                stats.last_confirmed_at = Some(chrono::Utc::now().timestamp());
                info!("Bundle confirmed: {}", bundle_id);
                Ok(())
            }
            BundleStatus::Failed => {
                error!("Bundle failed: {}", bundle_id);
                Err(anyhow!("Bundle failed"))
            }
            BundleStatus::Pending => {
                warn!("Bundle still pending: {}", bundle_id);
                Ok(())
            }
            BundleStatus::Unknown => {
                warn!("Bundle status unknown: {}", bundle_id);
                Ok(())
            }
        }
    }

    pub async fn get_stats(&self) -> BundlerStats {
        self.stats.read().await.clone()
    }

    pub fn is_enabled(&self) -> bool {
        self.jito.is_enabled()
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.jito.set_enabled(enabled);
    }

    pub async fn get_tip_accounts(&self) -> Result<Vec<super::JitoTipAccount>> {
        self.jito.get_tip_accounts().await
    }

    pub async fn simulate_frontrun(
        &self,
        target_tx: &str,
        frontrun_tx: Vec<String>,
    ) -> Result<Vec<String>> {
        if !self.jito.is_enabled() {
            return Err(anyhow!("Jito bundling is required for frontrunning"));
        }

        info!("Simulating frontrun bundle");

        let mut bundle_txs = Vec::new();
        bundle_txs.extend(frontrun_tx.into_iter());
        bundle_txs.push(target_tx.to_string());

        self.send_bundle(bundle_txs).await?;
        Ok(vec![])
    }

    pub async fn simulate_backrun(
        &self,
        target_tx: &str,
        backrun_tx: Vec<String>,
    ) -> Result<Vec<String>> {
        if !self.jito.is_enabled() {
            return Err(anyhow!("Jito bundling is required for backrunning"));
        }

        info!("Simulating backrun bundle");

        let mut bundle_txs = Vec::new();
        bundle_txs.push(target_tx.to_string());
        bundle_txs.extend(backrun_tx.into_iter());

        self.send_bundle(bundle_txs).await?;
        Ok(vec![])
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleTransaction {
    pub transaction: String,
    pub slot: Option<u64>,
    pub timestamp: i64,
}

impl BundleTransaction {
    pub fn new(transaction: String) -> Self {
        Self {
            transaction,
            slot: None,
            timestamp: chrono::Utc::now().timestamp(),
        }
    }

    pub fn with_slot(mut self, slot: u64) -> Self {
        self.slot = Some(slot);
        self
    }
}
