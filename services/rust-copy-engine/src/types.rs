use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletSubscription {
    pub wallet_address: String,
    pub enabled: bool,
    pub min_amount_sol: f64,
    pub slippage_bps: u64,
    pub use_jito: bool,
}

impl Default for WalletSubscription {
    fn default() -> Self {
        Self {
            wallet_address: String::new(),
            enabled: true,
            min_amount_sol: 0.01,
            slippage_bps: 500,
            use_jito: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyTradeEvent {
    pub signature: String,
    pub source_wallet: String,
    pub token_mint: String,
    pub direction: TradeDirection,
    pub amount_in: f64,
    pub amount_out: f64,
    pub timestamp: i64,
    pub status: TradeStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TradeDirection {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TradeStatus {
    Detected,
    Executing,
    Submitted,
    Confirmed,
    Failed,
}

impl std::fmt::Display for TradeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeStatus::Detected => write!(f, "detected"),
            TradeStatus::Executing => write!(f, "executing"),
            TradeStatus::Submitted => write!(f, "submitted"),
            TradeStatus::Confirmed => write!(f, "confirmed"),
            TradeStatus::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyTradeConfig {
    pub rpc_url: String,
    pub helius_api_key: Option<String>,
    pub ws_url: Option<String>,
    pub jito_enabled: bool,
    pub default_slippage_bps: u64,
    pub max_slippage_bps: u64,
    pub min_trade_amount_sol: f64,
    pub max_trade_amount_sol: f64,
    pub auto_sell: bool,
    pub auto_sell_delay_secs: u64,
    pub profit_target_pct: Option<f64>,
    pub stop_loss_pct: Option<f64>,
}

impl Default for CopyTradeConfig {
    fn default() -> Self {
        Self {
            rpc_url: "https://api.mainnet-beta.solana.com".to_string(),
            helius_api_key: None,
            ws_url: None,
            jito_enabled: true,
            default_slippage_bps: 500,
            max_slippage_bps: 1000,
            min_trade_amount_sol: 0.001,
            max_trade_amount_sol: 10.0,
            auto_sell: false,
            auto_sell_delay_secs: 60,
            profit_target_pct: None,
            stop_loss_pct: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyTradeStatus {
    pub subscriptions: usize,
    pub active_trades: usize,
    pub total_trades_today: usize,
    pub total_volume_today_sol: f64,
    pub pnl_today_sol: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyTradeRequest {
    pub target_wallet: String,
    pub token_mint: Option<String>,
    pub direction: Option<TradeDirection>,
    pub amount_sol: f64,
    pub slippage_bps: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyTradeResponse {
    pub ok: bool,
    pub signature: Option<String>,
    pub message: String,
    pub error: Option<String>,
}
