# Prabu-Siliwangi

Platform trading Solana hybrid modular dengan Telegram sebagai control center, integrasi AI untuk screening dan analisis, serta fitur lengkap untuk trading, DCA, copy trading, dan automation.

## Overview

Prabu-Siliwangi adalah sistem trading Solana yang menggabungkan beberapa komponen utama:

- **Telegram Bot** - Control center utama untuk kontrol dan monitoring
- **AI Integration** - Screening dan analisis via OpenRouter
- **Meteora DLMM** - Manajemen liquidity dan posisi
- **Wallet Intelligence** - Analisa wallet, funder detection, bundle analysis
- **PnL Visualization** - Render hasil trading dalam format visual card
- **Rust Copy Engine** - High-performance copy trading service
- **Automation** - Auto-execute, DCA, trailing TP/SL, time-exit

## Arsitektur

```
Prabu-Siliwangi/
├── apps/prabu-siliwangi/     # Telegram bot (main app)
├── packages/                # Reusable modules
│   ├── ai-router/          # AI provider routing (OpenRouter)
│   ├── meteora/            # Meteora DLMM integration
│   ├── pnl-renderer/      # PnL card visualization
│   ├── shared-solana/       # Solana utilities
│   ├── wallet-intel/       # Wallet analysis (Helius)
│   └── shared-types/        # Shared types
├── services/               # External services
│   └── rust-copy-engine/  # Rust copy trading engine
└── scripts/                # CLI scripts
```

Monorepo dengan npm workspaces - semua package bisa di-build dan di-test bersama.

## Struktur Folder

```
Prabu-Siliwangi/
├── apps/
│   └── prabu-siliwangi/          # Telegram bot & orchestration
│       └── src/
│           ├── bot/          # Telegram gateway & UI
│           ├── jobs/         # Scheduled workers
│           │   └── workers/  # Screening, Management, Health, Report workers
│           ├── modules/      # Feature modules
│           │   ├── auto-execute/      # Auto buy/sell with trailing
│           │   ├── backtest/          # Strategy backtesting
│           │   ├── copy-trade/         # Copy trading dashboard
│           │   ├── dca/              # Dollar Cost Averaging
│           │   ├── execution/          # Position execution
│           │   ├── liquidity/         # Liquidity checking
│           │   ├── notifications/      # Telegram alerts
│           │   ├── persistence/        # Database persistence
│           │   ├── pool-discovery/     # Real pool discovery
│           │   ├── price/            # Real-time price feed
│           │   ├── reports/           # Daily/weekly reports
│           │   ├── risk/             # Risk calculator
│           │   ├── screening/         # AI pool screening
│           │   ├── time-exit/        # Time-based exit
│           │   └── wallet-intel/      # Wallet analysis
│           └── integrations/          # External service clients
├── packages/
│   ├── ai-router/            # AI provider routing
│   ├── meteora/              # Meteora DLMM module
│   ├── pnl-renderer/         # PnL visualization
│   ├── shared-solana/        # Solana utilities
│   └── wallet-intel/         # Wallet intelligence
├── services/
│   └── rust-copy-engine/     # Rust copy-trading service
└── scripts/
```

## Prerequisites

- Node.js 20.x atau lebih baru
- Rust (untuk Rust Copy Engine)
- npm atau yarn

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

Copy environment template:

```bash
cp env.template .env
```

Edit `.env` dan isi nilai yang diperlukan:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
CHAT_ID=your_chat_id

# Solana
SOLANA_PRIVATE_KEY=your_private_key
SOLANA_WALLET_ADDRESS=your_wallet_address
HELIUS_API_KEY=your_helius_api_key

# AI Provider
OPENROUTER_API_KEY=your_openrouter_api_key

# Rust Copy Engine
RUST_COPY_ENGINE_URL=http://127.0.0.1:8787
```

### 3. Build Project

```bash
npm run build
```

### 4. Run Prabu Siliwangi

```bash
npm run dev
```

### 5. Run Rust Copy Engine (optional)

```bash
cd services/rust-copy-engine
cargo run
```

## Workspace Commands

```bash
# Build all workspaces
npm run build

# Typecheck all workspaces
npm run typecheck

# Run all tests
npm run test

# Run dev mode (Prabu Siliwangi only)
npm run dev -w @prabu/prabu-siliwangi

# Run specific workspace
npm run build -w @prabu/meteora
```

## Fitur Utama

### 🤖 AI Screening
- Pool screening dengan AI (OpenRouter)
- Organic score calculation
- Filter TVL, volume, holders
- Auto-execute berdasarkan score threshold

### ⚡ Auto Execute
- Automatic buy berdasarkan AI score
- Position sizing (% of capital)
- Trailing Take Profit (TTP)
- Trailing Stop Loss (TSL)
- Max concurrent positions

### 💰 DCA (Dollar Cost Averaging)
- Split posisi menjadi beberapa legs
- Konfigurable interval
- Skip legs jika harga bergerak jauh

### ⏰ Time Exit
- Auto-tutup posisi setelah X jam
- Warning notification sebelum expiry

### 📊 Risk Management
- Position sizing berdasarkan risk tolerance
- Kelly Criterion calculation
- Stop Loss & Take Profit (fixed & trailing)
- Max drawdown tracking

### 💧 Liquidity Check
- Cek pool liquidity sebelum buy
- Slippage estimation
- In-range liquidity analysis

### 💰 Price Feed
- Helius API integration
- Real-time token price
- 24h price change

### 📈 Pool Discovery
- Trending pools dari Helius API
- New token discovery

### 💼 Copy Trading
- Subscribe wallet target
- Real-time position tracking
- Trade history & analytics

### 🧪 Backtesting
- Test strategi dengan historical data
- Multiple strategy comparison
- Equity curve tracking

### 💾 Persistence
- JSON-based storage
- Trade history, positions
- Auto-save interval

### 🔔 Notifications
- Telegram alerts
- Health alerts
- Position alerts

## Telegram Commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Start bot & show main menu |
| `/buy <token>` | Buy token secara manual |
| `/sell <token>` | Sell token |
| `/status` | Show system status |
| `/health` | Health check |
| `/report` | Daily P&L report |
| `/positions` | Show open positions |
| `/wallet <address>` | Wallet analysis |
| `/screen` | Run AI screening |
| `/auto` | Toggle auto execute |
| `/dca <token>` | Start DCA |

## Worker System

- **Screening Worker** - Auto-discover & screen pools
- **Management Worker** - Monitor positions, SL/TP
- **Health Worker** - Monitor RPC & services
- **Report Worker** - Daily/Weekly reports

## API (Rust Copy Engine)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/swap` | Execute swap |
| POST | `/swap/bundle` | Jito bundle |
| POST | `/subscriptions` | Add wallet |
| GET | `/subscriptions` | List wallets |

## Development

### Add new package

1. Create folder di `packages/`
2. Tambahkan `package.json` dengan nama scoped `@prabu/*`
3. Add ke `workspaces` di root `package.json`

### Add new feature

1. Buat module di `packages/` jika reusable
2. Import di `apps/prabu-siliwangi/src/`
3. Tambahkan command di Telegram gateway

## License

Private - All rights reserved
