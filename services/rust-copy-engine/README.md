# Rust Copy Engine

High-performance copy trading service for Prabu-Siliwangi.

## Overview

This service handles the execution layer for copy-trading with ultra-low latency requirements. It monitors target wallets via WebSocket and executes trades on detected events using Jito bundling for MEV protection.

## Features

- HTTP REST API for configuration and control
- **WebSocket wallet monitoring** - Real-time transaction detection
- **Raydium DEX integration** - Standard pools and CLMM pools
- **Pump.fun integration** - New token trading
- **Jito Bundle Support** - MEV protection and faster confirmation
- Configurable slippage and trade limits
- Event broadcasting for real-time updates

## API Endpoints

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Get copy trading status |

### Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/subscriptions` | Add wallet subscription |
| DELETE | `/subscriptions/:wallet` | Remove wallet subscription |
| GET | `/subscriptions` | List all subscriptions |
| GET | `/subscriptions/:wallet/transactions` | Get wallet transactions |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/monitor/start` | Start wallet monitoring |
| POST | `/monitor/stop` | Stop wallet monitoring |
| GET | `/monitor/wallets` | List monitored wallets |

### Trading

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/swap` | Execute swap |
| POST | `/swap/quote` | Get swap quote |
| POST | `/swap/bundle` | Execute swap via Jito bundle |

### Jito

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jito/stats` | Get Jito bundler stats |
| GET | `/jito/status` | Get Jito status |
| GET | `/jito/tip-accounts` | Get Jito tip accounts |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Get current config |
| POST | `/config` | Update config |

## WebSocket Monitoring

The service connects to Solana RPC WebSocket to monitor target wallets in real-time:

1. Subscribe to target wallets
2. Parse incoming transactions
3. Detect buy/sell events
4. Broadcast events for processing

## DEX Integration

### Raydium

Supports:
- Standard AMM pools
- CLMM (Concentrated Liquidity Market Maker) pools

### Pump.fun

Supports:
- New token trading
- Automatic bonding curve detection

## Jito Bundling

Jito provides MEV protection and faster transaction confirmation through bundle submission.

### Features

- Multiple endpoint support (mainnet + regional)
- Random endpoint selection for load balancing
- Configurable tip amount
- Tip account rotation
- Bundle status tracking

### Endpoints

```
https://mainnet.block-engine.jito.wtf
https://amsterdam.mainnet.block-engine.jito.wtf
https://frankfurt.mainnet.block-engine.jito.wtf
https://ny.mainnet.block-engine.jito.wtf
https://tokyo.mainnet.block-engine.jito.wtf
```

### Default Tip Accounts

- `Cw8CFpR84sWShPFpPNED2ANjmMSHfsFDZnxHneXgJZrZ`
- `DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL`
- `96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5`
- `3AVi9Tg9Uo68tJfuvoKvqKNWKkCAmwDBdJorP85GqWpX`
- `HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe`
- `ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49`
- `ADuUkR4vqLUMWXxW9ghcyD5aQDJjJS6Xtt3ZryhcdsLM`
- `DfXygks4R4ebeuhnJ3Kj8yYzvkYcpkXxfCKKbU2zzdso`

## Trading

### Execute Regular Swap

```bash
curl -X POST http://localhost:8787/swap \
  -H "Content-Type: application/json" \
  -d '{
    "target_wallet": "TRADER_WALLET",
    "token_mint": "TOKEN_MINT_ADDRESS",
    "direction": "Buy",
    "amount_sol": 0.1,
    "slippage_bps": 500
  }'
```

### Execute Bundle Swap (via Jito)

```bash
curl -X POST http://localhost:8787/swap/bundle \
  -H "Content-Type: application/json" \
  -d '{
    "token_mint": "TOKEN_MINT_ADDRESS",
    "direction": "Buy",
    "amount_sol": 0.1,
    "slippage_bps": 500
  }'
```

### Get Quote

```bash
curl -X POST http://localhost:8787/swap/quote \
  -H "Content-Type: application/json" \
  -d '{
    "token_mint": "TOKEN_MINT_ADDRESS",
    "amount_sol": 0.1
  }'
```

## Jito Status & Stats

### Check Jito Status

```bash
curl http://localhost:8787/jito/status
```

Response:
```json
{
  "ok": true,
  "jito_enabled": true,
  "endpoints": [...],
  "tip_accounts": [...]
}
```

### Get Bundler Statistics

```bash
curl http://localhost:8787/jito/stats
```

Response:
```json
{
  "ok": true,
  "bundles_sent": 100,
  "bundles_confirmed": 95,
  "bundles_failed": 5,
  "confirmation_rate": 95.0,
  "last_bundle_id": "bundle_id...",
  "last_confirmed_at": 1234567890
}
```

### Get Tip Accounts

```bash
curl http://localhost:8787/jito/tip-accounts
```

## Configuration

Update config via POST `/config`:

```json
{
  "rpc_url": "https://api.mainnet-beta.solana.com",
  "helius_api_key": "your_api_key",
  "ws_url": "wss://mainnet.helius-rpc.com",
  "jito_enabled": true,
  "default_slippage_bps": 500,
  "max_slippage_bps": 1000,
  "min_trade_amount_sol": 0.001,
  "max_trade_amount_sol": 10.0,
  "auto_sell": false,
  "auto_sell_delay_secs": 60,
  "profit_target_pct": 100.0,
  "stop_loss_pct": 20.0
}
```

## Build

```bash
cargo build --release
```

## Run

```bash
cargo run --release
```

The service will start on `http://0.0.0.0:8787`

## Status

- [x] HTTP API server
- [x] State management
- [x] Wallet subscription system
- [x] Config management
- [x] WebSocket wallet monitoring
- [x] Transaction parsing
- [x] Event broadcasting
- [x] Raydium swap integration
- [x] Pump.fun integration
- [x] Jito bundle support
- [x] Health monitoring
- [x] Metrics export
- [x] WebSocket real-time updates
- [x] API authentication middleware
- [x] Dashboard UI
- [ ] Real swap execution (currently simulated)
- [ ] Frontrunning protection
- [ ] Backrunning support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP API (Axum)                        │
│  /health  /status  /subscriptions  /config  /monitor  /swap│
│  /jito/stats  /jito/status  /jito/tip-accounts             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     AppState (RwLock)                      │
│  subscriptions  config  active_trades  wallet_transactions   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   WalletMonitor (WebSocket)                 │
│  Connect to Solana RPC  │  Parse transactions               │
│  Detect buy/sell events │  Broadcast to subscribers         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   TradingEngine                             │
│  ├── Raydium DEX (Standard & CLMM pools)                   │
│  ├── Pump.fun DEX (New tokens)                             │
│  └── Auto pool detection                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Jito Bundler                             │
│  ├── Multiple endpoints (mainnet + regional)               │
│  ├── Tip account rotation                                  │
│  ├── Bundle submission & tracking                          │
│  └── MEV protection                                        │
└─────────────────────────────────────────────────────────────┘
```
