use anyhow::{Result, anyhow};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_client::RpcClient as SyncRpcClient;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolInfo {
    pub pool_id: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub vault_a: Pubkey,
    pub vault_b: Pubkey,
    pub lp_mint: Pubkey,
    pub market_id: Pubkey,
    pub open_orders: Pubkey,
    pub pool_type: PoolType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PoolType {
    Standard,
    Stable,
    Clmm,
}

pub struct Raydium {
    rpc_client: Arc<RpcClient>,
    sync_rpc_client: SyncRpcClient,
    wallet: Keypair,
}

impl Raydium {
    pub fn new(rpc_client: Arc<RpcClient>, sync_rpc_client: SyncRpcClient, wallet: Keypair) -> Self {
        Self {
            rpc_client,
            sync_rpc_client,
            wallet,
        }
    }

    pub async fn get_pool_by_mint(&self, mint: &Pubkey) -> Result<Option<PoolInfo>> {
        info!("Looking for pool by mint: {}", mint);
        
        let raydium_pool_program = Pubkey::from_str("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK")?;
        let raydium_clmm_program = Pubkey::from_str("CAMMzw6Wo1oMJ8qCw2JZWBu3K6BVYRtJYV3WJAs5macro")?;
        
        let accounts = self.rpc_client.get_program_accounts(&raydium_pool_program).await?;
        
        for (pubkey, account) in accounts {
            if let Some(pool_info) = self.try_parse_pool(&pubkey, &account.data, mint) {
                info!("Found pool: {}", pubkey);
                return Ok(Some(pool_info));
            }
        }
        
        let clmm_accounts = self.rpc_client.get_program_accounts(&raydium_clmm_program).await?;
        for (pubkey, account) in clmm_accounts {
            if let Some(pool_info) = self.try_parse_clmm_pool(&pubkey, &account.data, mint) {
                info!("Found CLMM pool: {}", pubkey);
                return Ok(Some(pool_info));
            }
        }
        
        Ok(None)
    }

    fn try_parse_pool(&self, pool_id: &Pubkey, data: &[u8], target_mint: &Pubkey) -> Option<PoolInfo> {
        if data.len() < 300 {
            return None;
        }

        let mint_a = Pubkey::try_from(&data[8..40]).ok()?;
        let mint_b = Pubkey::try_from(&data[40..72]).ok()?;
        
        if mint_a != *target_mint && mint_b != *target_mint {
            return None;
        }

        Some(PoolInfo {
            pool_id: *pool_id,
            mint_a,
            mint_b,
            vault_a: Pubkey::try_from(&data[72..104]).ok()?,
            vault_b: Pubkey::try_from(&data[104..136]).ok()?,
            lp_mint: Pubkey::try_from(&data[136..168]).ok()?,
            market_id: Pubkey::try_from(&data[168..200]).ok()?,
            open_orders: Pubkey::try_from(&data[248..280]).ok()?,
            pool_type: PoolType::Standard,
        })
    }

    fn try_parse_clmm_pool(&self, pool_id: &Pubkey, data: &[u8], target_mint: &Pubkey) -> Option<PoolInfo> {
        if data.len() < 400 {
            return None;
        }

        let mint_a = Pubkey::try_from(&data[48..80]).ok()?;
        let mint_b = Pubkey::try_from(&data[80..112]).ok()?;
        
        if mint_a != *target_mint && mint_b != *target_mint {
            return None;
        }

        Some(PoolInfo {
            pool_id: *pool_id,
            mint_a,
            mint_b,
            vault_a: Pubkey::try_from(&data[112..144]).ok()?,
            vault_b: Pubkey::try_from(&data[144..176]).ok()?,
            lp_mint: Pubkey::try_from(&data[32..64]).ok()?,
            market_id: Pubkey::default(),
            open_orders: Pubkey::default(),
            pool_type: PoolType::Clmm,
        })
    }

    pub async fn get_pool_state(&self, pool_id: &Pubkey) -> Result<PoolInfo> {
        info!("Getting pool state for: {}", pool_id);
        
        let account = self.rpc_client.get_account(pool_id).await?;
        
        let pool_info = self.try_parse_pool(pool_id, &account.data, &Pubkey::default())
            .or_else(|| self.try_parse_clmm_pool(pool_id, &account.data, &Pubkey::default()))
            .ok_or_else(|| anyhow!("Failed to parse pool data"))?;
        
        Ok(pool_info)
    }

    pub async fn swap(
        &self,
        amount_in: f64,
        direction: SwapDirection,
        slippage_bps: u64,
        pool_id: &Pubkey,
        pool_info: &PoolInfo,
    ) -> Result<Vec<String>> {
        info!(
            "Executing swap: {} {} via pool {}",
            amount_in,
            direction,
            pool_id
        );

        let (mint_in, mint_out) = match direction {
            SwapDirection::Buy => (pool_info.mint_a, pool_info.mint_b),
            SwapDirection::Sell => (pool_info.mint_b, pool_info.mint_a),
        };

        let price = self.get_pool_price(pool_info).await?;
        let amount_out = amount_in * price;
        let min_amount_out = amount_out * (1.0 - slippage_bps as f64 / 10000.0);

        info!(
            "Swap quote: {} {} -> {} {} (min: {})",
            amount_in,
            mint_in,
            amount_out,
            mint_out,
            min_amount_out
        );

        let mut signatures = Vec::new();

        signatures.push(format!(
            "simulated_swap_sig_{}_{}",
            direction,
            chrono::Utc::now().timestamp_millis()
        ));

        Ok(signatures)
    }

    pub async fn get_pool_price(&self, pool_info: &PoolInfo) -> Result<f64> {
        let reserve_a = self.get_token_balance(&pool_info.vault_a).await?;
        let reserve_b = self.get_token_balance(&pool_info.vault_b).await?;

        if reserve_a == 0.0 || reserve_b == 0.0 {
            return Ok(1.0);
        }

        let price = reserve_b / reserve_a;
        Ok(price)
    }

    async fn get_token_balance(&self, account: &Pubkey) -> Result<f64> {
        let account_data = self.rpc_client.get_token_account_balance(account).await?;
        let amount = account_data.amount.parse::<f64>()?;
        let decimals = account_data.decimals as u32;
        Ok(amount / 10_f64.powi(decimals as i32))
    }

    pub fn calculate_slippage(amount: f64, bps: u64) -> f64 {
        amount * (bps as f64 / 10000.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SwapDirection {
    Buy,
    Sell,
}

impl std::fmt::Display for SwapDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SwapDirection::Buy => write!(f, "Buy"),
            SwapDirection::Sell => write!(f, "Sell"),
        }
    }
}

pub async fn get_pool_state_by_mint(
    rpc_client: Arc<RpcClient>,
    mint: &str,
) -> Result<(Pubkey, PoolInfo)> {
    let mint_pubkey = Pubkey::from_str(mint)?;
    
    let raydium = Raydium::new(
        rpc_client,
        SyncRpcClient::new("https://api.mainnet-beta.solana.com"),
        Keypair::new(),
    );
    
    let pool_info = raydium.get_pool_by_mint(&mint_pubkey)
        .await?
        .ok_or_else(|| anyhow!("No pool found for mint: {}", mint))?;
    
    Ok((pool_info.pool_id, pool_info))
}

pub async fn get_pool_state(
    rpc_client: Arc<RpcClient>,
    pool_id: &str,
) -> Result<PoolInfo> {
    let pool_pubkey = Pubkey::from_str(pool_id)?;
    
    let raydium = Raydium::new(
        rpc_client,
        SyncRpcClient::new("https://api.mainnet-beta.solana.com"),
        Keypair::new(),
    );
    
    raydium.get_pool_state(&pool_pubkey).await
}
