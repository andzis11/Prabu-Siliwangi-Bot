use anyhow::Result;
use tracing::{info, error, warn};

use crate::{CopyTradeRequest, CopyTradeResponse, CopyTradeConfig};
use crate::dex::{Raydium, SwapDirection, pump_swap};
use crate::jito::{Bundler, BundlerStats};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_client::RpcClient as SyncRpcClient;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use std::str::FromStr;
use std::sync::Arc;

pub struct TradingEngine {
    config: CopyTradeConfig,
    rpc_client: Option<Arc<RpcClient>>,
    wallet: Option<Keypair>,
    bundler: Option<Bundler>,
}

impl TradingEngine {
    pub fn new(config: CopyTradeConfig) -> Self {
        let rpc_client = Some(Arc::new(RpcClient::new(config.rpc_url.clone())));

        Self {
            config,
            rpc_client,
            wallet: None,
            bundler: None,
        }
    }

    pub fn with_wallet(mut self, wallet: Keypair) -> Self {
        self.wallet = Some(wallet);
        self
    }

    pub fn with_bundler(mut self) -> Self {
        self.bundler = Some(Bundler::new(&self.config));
        self
    }

    pub async fn execute_copy_trade(&self, request: CopyTradeRequest) -> Result<CopyTradeResponse> {
        info!("Executing copy trade for wallet: {}", request.target_wallet);

        if request.amount_sol < self.config.min_trade_amount_sol {
            return Ok(CopyTradeResponse {
                ok: false,
                signature: None,
                message: "Amount below minimum".to_string(),
                error: Some(format!(
                    "Minimum trade amount is {} SOL",
                    self.config.min_trade_amount_sol
                )),
            });
        }

        if request.amount_sol > self.config.max_trade_amount_sol {
            return Ok(CopyTradeResponse {
                ok: false,
                signature: None,
                message: "Amount above maximum".to_string(),
                error: Some(format!(
                    "Maximum trade amount is {} SOL",
                    self.config.max_trade_amount_sol
                )),
            });
        }

        let slippage = request.slippage_bps.unwrap_or(self.config.default_slippage_bps);
        
        if slippage > self.config.max_slippage_bps {
            return Ok(CopyTradeResponse {
                ok: false,
                signature: None,
                message: "Slippage too high".to_string(),
                error: Some(format!(
                    "Maximum slippage is {} bps",
                    self.config.max_slippage_bps
                )),
            });
        }

        info!(
            "Copy trade params - Amount: {} SOL, Direction: {:?}, Slippage: {} bps",
            request.amount_sol,
            request.direction,
            slippage
        );

        let direction = request.direction.unwrap_or(crate::TradeDirection::Buy);

        match &request.token_mint {
            Some(mint) => {
                self.execute_swap(mint, request.amount_sol, direction, slippage).await
            }
            None => {
                Ok(CopyTradeResponse {
                    ok: false,
                    signature: None,
                    message: "Token mint required".to_string(),
                    error: Some("No token mint provided".to_string()),
                })
            }
        }
    }

    async fn execute_swap(
        &self,
        mint: &str,
        amount_sol: f64,
        direction: crate::TradeDirection,
        slippage_bps: u64,
    ) -> Result<CopyTradeResponse> {
        let mint_pubkey = match Pubkey::from_str(mint) {
            Ok(m) => m,
            Err(e) => {
                return Ok(CopyTradeResponse {
                    ok: false,
                    signature: None,
                    message: "Invalid mint".to_string(),
                    error: Some(format!("Invalid mint address: {}", e)),
                });
            }
        };

        let is_pump = self.is_pump_token(&mint_pubkey).await;
        let swap_direction = match direction {
            crate::TradeDirection::Buy => SwapDirection::Buy,
            crate::TradeDirection::Sell => SwapDirection::Sell,
        };

        if is_pump {
            info!("Executing Pump.fun swap for {}", mint);
            self.execute_pump_swap(mint, amount_sol, swap_direction, slippage_bps).await
        } else {
            info!("Executing Raydium swap for {}", mint);
            self.execute_raydium_swap(mint, amount_sol, swap_direction, slippage_bps).await
        }
    }

    async fn is_pump_token(&self, mint: &Pubkey) -> bool {
        let pump_program = Pubkey::from_str("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P").ok();
        
        if let Some(program) = pump_program {
            if let Some(ref rpc) = self.rpc_client {
                let accounts = rpc.get_program_accounts(&program).await;
                if let Ok(accts) = accounts {
                    for (_, account) in accts {
                        if account.data.len() > 88 {
                            if let Ok(mint_from_curve) = Pubkey::try_from(&account.data[56..88]) {
                                if mint_from_curve == *mint {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
        false
    }

    async fn execute_pump_swap(
        &self,
        mint: &str,
        amount: f64,
        direction: SwapDirection,
        slippage_bps: u64,
    ) -> Result<CopyTradeResponse> {
        let rpc = self.rpc_client.as_ref()
            .ok_or_else(|| anyhow::anyhow!("RPC client not initialized"))?;

        match pump_swap(rpc.clone(), mint, amount, direction, slippage_bps).await {
            Ok(sigs) => {
                let sig = sigs.first().cloned().unwrap_or_default();
                info!("Pump.fun swap executed: {}", sig);
                Ok(CopyTradeResponse {
                    ok: true,
                    signature: Some(sig),
                    message: format!("Pump.fun {} successful", direction),
                    error: None,
                })
            }
            Err(e) => {
                error!("Pump.fun swap failed: {}", e);
                Ok(CopyTradeResponse {
                    ok: false,
                    signature: None,
                    message: "Swap failed".to_string(),
                    error: Some(e.to_string()),
                })
            }
        }
    }

    async fn execute_raydium_swap(
        &self,
        mint: &str,
        amount: f64,
        direction: SwapDirection,
        slippage_bps: u64,
    ) -> Result<CopyTradeResponse> {
        let rpc = self.rpc_client.as_ref()
            .ok_or_else(|| anyhow::anyhow!("RPC client not initialized"))?;

        let mint_pubkey = Pubkey::from_str(mint)?;
        
        let raydium = Raydium::new(
            rpc.clone(),
            SyncRpcClient::new(self.config.rpc_url.clone()),
            Keypair::new(),
        );

        match raydium.get_pool_by_mint(&mint_pubkey).await {
            Ok(Some(pool_info)) => {
                match raydium.swap(amount, direction, slippage_bps, &pool_info.pool_id, &pool_info).await {
                    Ok(sigs) => {
                        let sig = sigs.first().cloned().unwrap_or_default();
                        info!("Raydium swap executed: {}", sig);
                        Ok(CopyTradeResponse {
                            ok: true,
                            signature: Some(sig),
                            message: format!("Raydium {} successful", direction),
                            error: None,
                        })
                    }
                    Err(e) => {
                        error!("Raydium swap failed: {}", e);
                        Ok(CopyTradeResponse {
                            ok: false,
                            signature: None,
                            message: "Swap failed".to_string(),
                            error: Some(e.to_string()),
                        })
                    }
                }
            }
            Ok(None) => {
                Ok(CopyTradeResponse {
                    ok: false,
                    signature: None,
                    message: "No pool found".to_string(),
                    error: Some("No Raydium pool found for this token".to_string()),
                })
            }
            Err(e) => {
                error!("Failed to get pool: {}", e);
                Ok(CopyTradeResponse {
                    ok: false,
                    signature: None,
                    message: "Failed to get pool".to_string(),
                    error: Some(e.to_string()),
                })
            }
        }
    }

    pub async fn execute_swap_with_bundle(
        &mut self,
        mint: &str,
        amount_sol: f64,
        direction: crate::TradeDirection,
        slippage_bps: u64,
    ) -> Result<CopyTradeResponse> {
        info!("Executing swap with Jito bundling");

        if let Some(ref mut bundler) = self.bundler {
            if !bundler.is_enabled() {
                warn!("Bundler disabled, executing regular swap");
                return self.execute_swap(mint, amount_sol, direction, slippage_bps).await;
            }

            info!("Using Jito bundler for swap execution");
            
            let tx = vec!["simulated_swap_tx".to_string()];
            
            match bundler.send_bundle_with_tip(tx, Some(10_000)).await {
                Ok(bundle_id) => {
                    info!("Swap bundled successfully: {}", bundle_id);
                    Ok(CopyTradeResponse {
                        ok: true,
                        signature: Some(bundle_id),
                        message: "Swap bundled via Jito".to_string(),
                        error: None,
                    })
                }
                Err(e) => {
                    error!("Bundle failed, falling back to regular swap: {}", e);
                    self.execute_swap(mint, amount_sol, direction, slippage_bps).await
                }
            }
        } else {
            warn!("No bundler configured, executing regular swap");
            self.execute_swap(mint, amount_sol, direction, slippage_bps).await
        }
    }

    pub async fn check_pool(&self, token_mint: &str) -> Result<Option<String>> {
        info!("Checking pool for token: {}", token_mint);
        
        let mint_pubkey = Pubkey::from_str(token_mint)?;
        
        let is_pump = self.is_pump_token(&mint_pubkey).await;
        if is_pump {
            return Ok(Some(format!("pump:{}", token_mint)));
        }

        let rpc = self.rpc_client.as_ref()
            .ok_or_else(|| anyhow::anyhow!("RPC client not initialized"))?;

        let raydium = Raydium::new(
            rpc.clone(),
            SyncRpcClient::new(self.config.rpc_url.clone()),
            Keypair::new(),
        );

        match raydium.get_pool_by_mint(&mint_pubkey).await {
            Ok(Some(pool_info)) => Ok(Some(format!("raydium:{}", pool_info.pool_id))),
            Ok(None) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub async fn get_bundler_stats(&self) -> Option<BundlerStats> {
        if let Some(ref bundler) = self.bundler {
            Some(bundler.get_stats().await)
        } else {
            None
        }
    }

    pub fn calculate_slippage(&self, amount: f64, bps: u64) -> f64 {
        amount * (bps as f64 / 10000.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CopyTradeDirection {
    Buy,
    Sell,
}

impl Default for CopyTradeDirection {
    fn default() -> Self {
        CopyTradeDirection::Buy
    }
}

pub fn validate_wallet_address(address: &str) -> bool {
    Pubkey::from_str(address).is_ok()
}

pub fn validate_token_mint(mint: &str) -> bool {
    Pubkey::from_str(mint).is_ok() && mint.len() == 44
}

impl From<crate::TradeDirection> for CopyTradeDirection {
    fn from(d: crate::TradeDirection) -> Self {
        match d {
            crate::TradeDirection::Buy => CopyTradeDirection::Buy,
            crate::TradeDirection::Sell => CopyTradeDirection::Sell,
        }
    }
}

impl From<SwapDirection> for CopyTradeDirection {
    fn from(d: SwapDirection) -> Self {
        match d {
            SwapDirection::Buy => CopyTradeDirection::Buy,
            SwapDirection::Sell => CopyTradeDirection::Sell,
        }
    }
}
