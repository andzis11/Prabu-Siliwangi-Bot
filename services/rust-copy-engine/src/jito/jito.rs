use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{info, debug, warn, error};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitoConfig {
    pub enabled: bool,
    pub tip_amount: u64,
    pub endpoints: Vec<String>,
    pub timeout_ms: u64,
}

impl Default for JitoConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            tip_amount: 10_000, // 0.00001 SOL in lamports
            endpoints: vec![
                "https://mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
                "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles".to_string(),
            ],
            timeout_ms: 5000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitoTipAccount {
    pub address: String,
    pub name: String,
    pub region: String,
}

impl JitoTipAccount {
    pub fn all() -> Vec<Self> {
        vec![
            JitoTipAccount {
                address: "Cw8CFpR84sWShPFpPNED2ANjmMSHfsFDZnxHneXgJZrZ".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "3AVi9Tg9Uo68tJfuvoKvqKNWKkCAmwDBdJorP85GqWpX".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "ADuUkR4vqLUMWXxW9ghcyD5aQDJjJS6Xtt3ZryhcdsLM".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
            JitoTipAccount {
                address: "DfXygks4R4ebeuhnJ3Kj8yYzvkYcpkXxfCKKbU2zzdso".to_string(),
                name: "jito_tip_account".to_string(),
                region: "mainnet".to_string(),
            },
        ]
    }

    pub fn random() -> Self {
        let all = Self::all();
        let idx = rand_index(all.len());
        all[idx].clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    pub params: BundleParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleParams {
    pub transactions: Vec<String>,
    pub encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleResponse {
    #[serde(rename = "jsonrpc")]
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<String>,
    pub error: Option<JitoError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitoError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitoBlockEngineResponse<T> {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<T>,
    pub error: Option<JitoError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendBundleResponse {
    pub signature: String,
}

pub struct JitoClient {
    config: JitoConfig,
    client: reqwest::Client,
}

impl JitoClient {
    pub fn new(config: JitoConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { config, client }
    }

    pub fn default_enabled() -> Self {
        Self::new(JitoConfig::default())
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
    }

    pub fn set_tip_amount(&mut self, amount_lamports: u64) {
        self.config.tip_amount = amount_lamports;
    }

    pub async fn send_bundle(
        &self,
        transactions: Vec<String>,
    ) -> Result<Vec<String>> {
        if !self.config.enabled {
            return Err(anyhow!("Jito bundling is disabled"));
        }

        let endpoint = self.random_endpoint()?;
        info!("Sending bundle to Jito: {}", endpoint);

        let request = BundleRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "sendBundle".to_string(),
            params: BundleParams {
                transactions,
                encoding: "base64".to_string(),
            },
        };

        let response = self.client
            .post(&endpoint)
            .json(&request)
            .send()
            .await?;

        let bundle_response: BundleResponse = response.json().await?;

        if let Some(error) = bundle_response.error {
            error!("Jito bundle error: {} - {}", error.code, error.message);
            return Err(anyhow!("Jito error {}: {}", error.code, error.message));
        }

        let bundle_id = bundle_response.result
            .ok_or_else(|| anyhow!("No bundle ID returned"))?;

        info!("Bundle submitted successfully: {}", bundle_id);

        Ok(vec![bundle_id])
    }

    pub async fn send_bundle_with_tip(
        &self,
        mut transactions: Vec<String>,
    ) -> Result<Vec<String>> {
        if !self.config.enabled {
            return Err(anyhow!("Jito bundling is disabled"));
        }

        let tip_account = JitoTipAccount::random();
        info!("Using Jito tip account: {} ({})", tip_account.address, tip_account.region);

        info!("Bundle will include {} transactions + 1 tip instruction", transactions.len());

        transactions.push(format!("Tip instruction to {}", tip_account.address));

        self.send_bundle(transactions).await
    }

    pub async fn get_bundle_status(
        &self,
        bundle_id: &str,
    ) -> Result<BundleStatus> {
        let endpoint = self.random_endpoint()?;

        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBundleStatuses",
            "params": {
                "ids": [bundle_id]
            }
        });

        let response = self.client
            .post(&endpoint)
            .json(&request)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct StatusResponse {
            result: Option<serde_json::Value>,
        }

        let status_response: StatusResponse = response.json().await?;

        Ok(status_response.result
            .map(|v| BundleStatus::Pending)
            .unwrap_or(BundleStatus::Unknown))
    }

    pub async fn get_tip_accounts(&self) -> Result<Vec<JitoTipAccount>> {
        let endpoint = self.random_endpoint()?;

        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTipAccounts",
            "params": []
        });

        let response = self.client
            .post(&endpoint)
            .json(&request)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct TipResponse {
            result: Vec<String>,
        }

        let tip_response: TipResponse = response.json().await?;

        Ok(tip_response.result
            .into_iter()
            .enumerate()
            .map(|(i, address)| JitoTipAccount {
                address,
                name: "jito_tip_account".to_string(),
                region: format!("account_{}", i),
            })
            .collect())
    }

    fn random_endpoint(&self) -> Result<String> {
        if self.config.endpoints.is_empty() {
            return Err(anyhow!("No Jito endpoints configured"));
        }

        let idx = rand_index(self.config.endpoints.len());
        Ok(self.config.endpoints[idx].clone())
    }
}

fn rand_index(max: usize) -> usize {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as usize;
    nanos % max
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BundleStatus {
    Pending,
    Confirmed,
    Failed,
    Unknown,
}

impl std::fmt::Display for BundleStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BundleStatus::Pending => write!(f, "pending"),
            BundleStatus::Confirmed => write!(f, "confirmed"),
            BundleStatus::Failed => write!(f, "failed"),
            BundleStatus::Unknown => write!(f, "unknown"),
        }
    }
}
