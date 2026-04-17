use anyhow::{Result, anyhow};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_client::RpcClient as SyncRpcClient;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use tracing::info;

use super::raydium::SwapDirection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PumpInfo {
    pub mint: Pubkey,
    pub bonding_curve: Pubkey,
    pub associated_bonding_curve: Pubkey,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
}

pub struct Pump {
    rpc_client: Arc<RpcClient>,
    sync_rpc_client: SyncRpcClient,
    wallet: Keypair,
}

impl Pump {
    pub fn new(rpc_client: Arc<RpcClient>, sync_rpc_client: SyncRpcClient, wallet: Keypair) -> Self {
        Self {
            rpc_client,
            sync_rpc_client,
            wallet,
        }
    }

    pub async fn get_info(&self, mint: &Pubkey) -> Result<PumpInfo> {
        info!("Getting Pump.fun info for mint: {}", mint);
        
        let pump_program = Pubkey::from_str("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")?;
        let accounts = self.rpc_client.get_program_accounts(&pump_program).await?;
        
        for (pubkey, account) in accounts {
            if let Some(info) = self.try_parse_pump(&pubkey, &account.data, mint) {
                info!("Found Pump.fun token: {}", mint);
                return Ok(info);
            }
        }
        
        Err(anyhow!("Pump.fun token not found"))
    }

    fn try_parse_pump(&self, bonding_curve: &Pubkey, data: &[u8], target_mint: &Pubkey) -> Option<PumpInfo> {
        if data.len() < 300 {
            return None;
        }

        let mint = Pubkey::try_from(&data[56..88]).ok()?;
        
        if mint != *target_mint {
            return None;
        }

        let virtual_token_reserves = u64::from_le_bytes(data[88..96].try_into().ok()?);
        let virtual_sol_reserves = u64::from_le_bytes(data[96..104].try_into().ok()?);
        let real_token_reserves = u64::from_le_bytes(data[104..112].try_into().ok()?);
        let real_sol_reserves = u64::from_le_bytes(data[112..120].try_into().ok()?);
        let token_total_supply = u64::from_le_bytes(data[168..176].try_into().ok()?);
        let complete = data[192] != 0;

        Some(PumpInfo {
            mint,
            bonding_curve: *bonding_curve,
            associated_bonding_curve: Pubkey::default(),
            virtual_token_reserves,
            virtual_sol_reserves,
            real_token_reserves,
            real_sol_reserves,
            token_total_supply,
            complete,
        })
    }

    pub async fn buy(&self, mint: &str, amount_sol: f64, slippage_bps: u64) -> Result<Vec<String>> {
        info!("Pump.fun buy: {} SOL for {}", amount_sol, mint);
        
        let mint_pubkey = Pubkey::from_str(mint)?;
        let pump_info = self.get_info(&mint_pubkey).await?;
        
        let tokens_out = self.calculate_buy_output(amount_sol, &pump_info);
        let min_tokens = tokens_out * (1.0 - slippage_bps as f64 / 10000.0);
        
        info!(
            "Buy quote: {} SOL -> {} tokens (min: {})",
            amount_sol,
            tokens_out,
            min_tokens
        );

        let mut signatures = Vec::new();
        signatures.push(format!(
            "simulated_pump_buy_sig_{}",
            chrono::Utc::now().timestamp_millis()
        ));

        Ok(signatures)
    }

    pub async fn sell(&self, mint: &str, amount_tokens: f64, slippage_bps: u64) -> Result<Vec<String>> {
        info!("Pump.fun sell: {} tokens of {}", amount_tokens, mint);
        
        let mint_pubkey = Pubkey::from_str(mint)?;
        let pump_info = self.get_info(&mint_pubkey).await?;
        
        let sol_out = self.calculate_sell_output(amount_tokens, &pump_info);
        let min_sol = sol_out * (1.0 - slippage_bps as f64 / 10000.0);
        
        info!(
            "Sell quote: {} tokens -> {} SOL (min: {})",
            amount_tokens,
            sol_out,
            min_sol
        );

        let mut signatures = Vec::new();
        signatures.push(format!(
            "simulated_pump_sell_sig_{}",
            chrono::Utc::now().timestamp_millis()
        ));

        Ok(signatures)
    }

    fn calculate_buy_output(&self, sol_in: f64, info: &PumpInfo) -> f64 {
        if info.virtual_sol_reserves == 0 {
            return 0.0;
        }

        let k = (info.virtual_sol_reserves as f64) * (info.virtual_token_reserves as f64);
        let new_sol = info.virtual_sol_reserves as f64 + (sol_in * 1e9);
        let new_tokens = k / new_sol;
        let tokens_out = (info.virtual_token_reserves as f64 - new_tokens) / 1e6;

        tokens_out.max(0.0)
    }

    fn calculate_sell_output(&self, tokens_in: f64, info: &PumpInfo) -> f64 {
        let tokens = (tokens_in * 1e6) as u64;
        
        if info.virtual_token_reserves == 0 {
            return 0.0;
        }

        let k = (info.virtual_sol_reserves as f64) * (info.virtual_token_reserves as f64);
        let new_tokens = info.virtual_token_reserves as f64 + tokens as f64;
        let new_sol = k / new_tokens;
        let sol_out = (info.virtual_sol_reserves as f64 - new_sol) / 1e9;

        sol_out.max(0.0)
    }
}

pub async fn pump_swap(
    rpc_client: Arc<RpcClient>,
    mint: &str,
    amount: f64,
    direction: SwapDirection,
    slippage_bps: u64,
) -> Result<Vec<String>> {
    let pump = Pump::new(
        rpc_client,
        SyncRpcClient::new("https://api.mainnet-beta.solana.com"),
        Keypair::new(),
    );

    match direction {
        SwapDirection::Buy => pump.buy(mint, amount, slippage_bps).await,
        SwapDirection::Sell => pump.sell(mint, amount, slippage_bps).await,
    }
}
