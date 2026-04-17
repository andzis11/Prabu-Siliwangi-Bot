# Prabu-Siliwangi

Prabu-Siliwangi adalah proyek gabungan yang menyatukan beberapa sistem trading, analitik, dan otomasi Solana ke dalam satu arsitektur yang lebih rapi, modular, dan siap dikembangkan.

## Tujuan Proyek

Proyek ini dibuat untuk menggabungkan kekuatan dari beberapa codebase yang berbeda menjadi satu ekosistem terpadu, dengan fokus pada:

- satu pusat kontrol utama berbasis Telegram
- AI sebagai lapisan analisa dan pengambil rekomendasi
- modul screening, wallet intelligence, PnL, Meteora, dan copy trading
- pemisahan yang jelas antara logic bisnis, risk engine, AI layer, dan execution engine
- fondasi yang lebih mudah di-maintain, diaudit, dan diskalakan

## Visi Arsitektur

`Prabu-Siliwangi` dirancang sebagai sistem hybrid modular:

- **Kabayan Bot** sebagai control center utama
- **Wallet Intelligence** untuk analisa funder, bundler, dan pola wallet
- **Meteora Module** untuk screening pool dan manajemen LP/DLMM
- **PnL Renderer** untuk visualisasi hasil trading
- **AI Router** untuk integrasi model AI melalui provider seperti OpenRouter
- **Rust Copy Engine** untuk eksekusi copy-trading berkecepatan tinggi
- **Shared Packages** untuk utilitas, type, dan helper Solana yang bisa dipakai bersama

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

### 4. Run Kabayan Bot

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

## Features

### 🔄 DCA (Dollar Cost Averaging)
- Split position into multiple legs
- Configurable number of legs and intervals
- Skip legs if price moves too far from average
- Auto-execute with callbacks
- Average entry price tracking

### ⏰ Time-Based Exit
- Auto-close positions after X hours
- Warning notifications before expiry
- Configurable default max hours
- Works alongside TP/SL

### 📊 Risk Calculator
- Position sizing based on risk tolerance
- Kelly Criterion calculation
- Sharpe, Sortino, Calmar ratios
- Max drawdown tracking
- Risk/Reward ratio analysis

### 💧 Liquidity Check
- Check pool liquidity before buy
- Slippage estimation
- In-range liquidity analysis
- Configurable thresholds

### 💰 Real-Time Price Feed
- Helius API integration
- Token price tracking
- 24h price change
- Caching untuk avoid rate limits

### 🤖 AI Screening
- Pool screening dengan AI (OpenRouter)
- Rule-based filtering + AI scoring
- Organic score calculation
- Configurable thresholds (TVL, volume, holders, etc.)

### ⚡ Auto Execute
- Automatic buy berdasarkan AI score threshold
- Position sizing (% of capital)
- **Trailing Take Profit (TTP)**: Lock profit dengan trailing
- **Trailing Stop Loss (TSL)**: Stop loss yang mengikuti high price
- Max concurrent positions limit

### 📊 Copy Trade Dashboard
- Real-time position tracking
- Wallet subscription management
- Trade history & analytics
- Win rate, volume, P&L statistics

### 💼 Position Execution
- Execute buy/sell dari screening results
- Configurable slippage & Jito bundler
- Stop Loss & Take Profit automation
- Position tracking dengan P&L

### 🧠 Worker System
- **Screening Worker**: Auto-discover & screen pools
- **Management Worker**: Monitor positions, SL/TP execution
- **Health Worker**: Monitor RPC & service health
- **Report Worker**: Daily/Weekly P&L reports

### 📈 Pool Discovery
- Trending pools dari Helius API
- New token discovery
- Organic score calculation
- Caching untuk avoid rate limits

### 🛡️ Risk Management
- Stop Loss (fixed & trailing)
- Take Profit (fixed & trailing)
- Position sizing limits
- Max concurrent positions
- Token exclusion list

### 📊 Reports & Analytics
- Daily P&L summary
- Weekly aggregation
- Win rate statistics
- Best/worst trades
- Trade history

### 🧪 Backtesting
- Test strategies against historical data
- Multiple strategy comparison
- Equity curve tracking
- Sharpe ratio & max drawdown

### 💾 Persistence
- JSON-based storage
- Trade history
- Position records
- Screening history
- Auto-save dengan interval

### 🔔 Notifications
- Telegram alerts
- Configurable notification preferences
- Emergency alerts
- Position alerts
- Health alerts

## Telegram Menu Structure

```
Main Menu
├── 💼 Trading
│   ├── 📥 Buy Manual
│   ├── 📤 Sell Manual
│   ├── 📜 Trade Journal
│   ├── 📊 Daily Report
│   └── 📅 Weekly Report
├── 🧠 Analysis
│   ├── 📊 System Status
│   ├── 🤖 AI Agent Status
│   ├── 🩺 Health Check
│   └── 🕵️ Wallet Intel
├── ⚙️ Automation
│   ├── 🎯 AI Sniper
│   ├── 🌊 Meteora
│   ├── 🔍 AI Screening
│   ├── 📊 Execution
│   └── ⚡ Auto Execute ⭐
└── 📊 Copy Trade
    ├── 📋 Copy Trade Draft
    ├── 📊 Subscription
    └── 📈 Dashboard
```

## Auto Execute Settings

```
Auto Execute: ✅ ENABLED

Settings
• Min Score: 85
• Position Size: 10%
• Max Positions: 5

Take Profit
• Auto TP: ✅
• TP Target: 50%
• Trailing TP: ✅ (10%)

Stop Loss
• Auto SL: ✅
• SL Target: 20%
• Trailing SL: ✅ (5% from high)

Buttons:
🔄 Trailing TP ON/OFF
🔄 Trailing SL ON/OFF
📈 TTP % (callback)
📉 TSL % (offset from high)
```

## API Endpoints (Rust Copy Engine)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Get copy trading status |
| POST | `/swap` | Execute swap |
| POST | `/swap/bundle` | Execute with Jito bundle |
| POST | `/subscriptions` | Add wallet subscription |
| DELETE | `/subscriptions/:wallet` | Remove subscription |
| GET | `/subscriptions` | List all subscriptions |

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
