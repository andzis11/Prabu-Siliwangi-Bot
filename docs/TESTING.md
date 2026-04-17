# Testing Guide - Prabu-Siliwangi

## ✅ Test Results Summary

### Test 1: Startup Test ✅ PASSED
- **Status**: Bot berhasil startup tanpa crash
- **Env Validation**: Working - correctly detected PAPER MODE
- **Trade Journal**: Working - loaded from file
- **Scheduler**: Working - background jobs started
- **Telegram Gateway**: Working - button-based menu initialized
- **Note**: Telegram 404 errors expected karena belum ada valid bot token

---

## 📋 Next Testing Steps

### Prerequisites
Kamu perlu setup dulu sebelum test penuh:

1. **Buat Telegram Bot** (jika belum):
   - Buka Telegram, cari `@BotFather`
   - Kirim `/newbot`
   - Ikuti instruksi sampai dapat bot token
   - Token akan terlihat seperti: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

2. **Update `.env`**:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz  # Ganti dengan tokenmu
   CHAT_ID=your_chat_id  # Optional: untuk restrict access
   ```

3. **(Optional) Setup Wallet** untuk live trading:
   ```env
   SOLANA_PRIVATE_KEY=your_base58_private_key
   SOLANA_WALLET_ADDRESS=your_wallet_address
   HELIUS_API_KEY=your_helius_api_key
   ```

---

### Test 2: Button Flow Test

**Setup**:
```bash
# Update .env dengan TELEGRAM_BOT_TOKEN yang valid
npm run dev
```

**Test Flow**:
1. Buka bot di Telegram
2. Kirim `/start`
3. Expected: Bot reply dengan menu utama + buttons
4. Click `💼 Trading`
5. Expected: Trading menu muncul dengan buttons
6. Click `📥 Buy Manual`
7. Expected: Buy draft form muncul
8. Click `🪙 Set Token CA`
9. Expected: Bot minta input token address
10. Kirim token address (contoh: `So11111111111111111111111111111111111111112`)
11. Expected: Token CA tersimpan, form updated
12. Click amount (contoh: `0.01`)
13. Expected: Amount tersimpan
14. Click fee mode (contoh: `SAFE`)
15. Expected: Fee mode tersimpan
16. Click `✅ Confirm Buy`
17. Expected: Success message dengan Journal ID

**Verify**:
- Check console log untuk "Trade journal entry added"
- Check file `data/journal/trades.json` ada entry baru

---

### Test 3: Paper Trade End-to-End

**Setup**: Pastikan di `.env`:
```env
# Kosongkan untuk paper mode
SOLANA_PRIVATE_KEY=
SOLANA_WALLET_ADDRESS=
```

**Test Flow - BUY**:
1. `/start` → `💼 Trading` → `📥 Buy Manual`
2. Set Token CA: `So11111111111111111111111111111111111111112` (SOL)
3. Set Amount: `0.01`
4. Set Fee: `SAFE`
5. Confirm Buy
6. Expected: `✅ PAPER BUY SUCCESS` dengan Journal ID

**Test Flow - SELL**:
1. `/start` → `💼 Trading` → `📤 Sell Manual`
2. Bot akan load holdings dari wallet (jika ada)
3. Atau bisa langsung confirm jika ada position dari paper buy
4. Expected: `✅ PAPER SELL SUCCESS` dengan PnL

---

### Test 4: Trade Journal Persistence

**Verify File Created**:
```bash
# Check journal file exists
dir data\journal\trades.json
```

**Check Content**:
```bash
type data\journal\trades.json
```

**Expected Format**:
```json
[
  {
    "id": "trade_1234567890_abcdef",
    "chatId": 123456,
    "type": "buy",
    "tokenMint": "So11111111111111111111111111111111111111112",
    "amountSol": 0.01,
    "feeMode": "SAFE",
    "slippageBps": 10,
    "status": "success",
    "method": "paper",
    "timestamp": "2026-04-14T16:00:00.000Z",
    "metadata": {
      "paperMode": true
    }
  }
]
```

**Test Journal Menu**:
1. `/start` → `💼 Trading` → `📜 Trade Journal`
2. Expected: List of recent trades (max 20)
3. Format: Status icon, token, amount, timestamp, dll

---

### Test 5: Wallet Intel (Requires Helius API Key)

**Setup**:
```env
HELIUS_API_KEY=your_helius_key
SOLANA_WALLET_ADDRESS=any_solana_address
```

**Test Flow**:
1. `/start` → `🧠 Analysis` → `🕵️ Wallet Intel`
2. Click `👛 Use Wallet From Env`
3. Click `▶️ Run Analysis`
4. Expected: Analysis result dengan funding source, identity, dll

---

### Test 6: Portfolio & PnL (Requires Helius + Wallet)

**Setup**:
```env
HELIUS_API_KEY=your_helius_key
SOLANA_WALLET_ADDRESS=your_wallet_with_tokens
```

**Test Flow**:
1. `/start` → `💼 Trading` → `💼 Portfolio`
2. Expected: Portfolio snapshot dengan prices dari Jupiter
3. `/start` → `💼 Trading` → `📈 PnL`
4. Expected: PnL status dengan estimated value

---

## 🐛 Troubleshooting

### Bot tidak respond di Telegram
- Check: `TELEGRAM_BOT_TOKEN` sudah benar?
- Check: Console log ada error?
- Check: Bot token masih valid di BotFather?

### Paper trade tidak jalan
- Check: Pastikan `SOLANA_PRIVATE_KEY` kosong (paper mode)
- Check: Console log untuk error messages

### Journal tidak tersimpan
- Check: Folder `data/journal` ada?
- Check: Write permission ke folder tersebut?
- Check: Console log saat save journal

### Env validation error
- Check: `.env` file ada di root project?
- Check: Format `.env` benar (no quotes around values)?
- Check: Required fields tidak kosong?

---

## 📊 Success Criteria

✅ **Test 1 (Startup)**: PASSED - Bot jalan tanpa crash
⏳ **Test 2 (Button Flow)**: Butuh valid Telegram token
⏳ **Test 3 (Paper Trade)**: Butuh valid Telegram token  
⏳ **Test 4 (Journal)**: Butuh Test 3 selesai dulu
⏳ **Test 5 (Wallet Intel)**: Butuh Helius API key
⏳ **Test 6 (Portfolio)**: Butuh Helius API key + wallet

---

## 🚀 Production Checklist

Sebelum deploy ke production:

- [ ] Valid Telegram bot token
- [ ] SOLANA_PRIVATE_KEY backed up aman
- [ ] HELIUS_API_KEY dengan quota cukup
- [ ] OPENROUTER_API_KEY (kalau mau AI feature)
- [ ] CHAT_ID diisi untuk restrict access
- [ ] LOG_LEVEL = "info" atau "warn" (bukan "debug")
- [ ] Backup strategy untuk `data/journal/trades.json`
- [ ] Process manager (PM2/supervisor) untuk auto-restart
- [ ] Monitoring setup (health checks)

---

## 📝 Notes

- Bot sekarang dalam **PAPER MODE** oleh default
- Semua trade journal tersimpan di `data/journal/trades.json`
- Env validation prevents crash tapi tetap log warnings
- AI features akan return placeholder sampai API key diisi
- Rust copy engine masih placeholder sampai service setup
- generate visual assets
- format summaries

It should not become the source of truth for trading history. Trade history should come from the main data layer.

### Rust Copy Engine
This service should focus on:
- speed
- event monitoring
- execution

It should not become the main source of business policy.
Business policy should be decided in the main app and passed into the Rust service via configuration or commands.

---

## Decision Flow

### A. User-Initiated Flow

Example:
manual action, wallet analysis, PnL request, Meteora action

Flow:
1. user sends command/button action
2. Telegram app parses intent
3. app loads relevant config and user context
4. module use case runs
5. deterministic validation and policy checks run
6. AI reasoning runs only if needed
7. risk engine approves or rejects
8. execution or read-only response happens
9. result is persisted
10. notification is sent back to the user

### B. Screening Flow

Used for:
- pool screening
- wallet candidate scoring
- opportunity prioritization

Flow:
1. scheduler starts screening cycle
2. candidate data is collected
3. deterministic filters remove obviously bad candidates
4. AI screening scores survivors
5. scores and reasons are stored
6. shortlisted opportunities are presented or queued

### C. Position Management Flow

Used for:
- active position monitoring
- hold / trim / close decisions

Flow:
1. scheduler starts management cycle
2. active positions are loaded
3. hard rules execute first
4. if position survives hard rules, AI management reasoning may run
5. risk engine reviews recommendation
6. action is executed if approved
7. result and reasoning are stored
8. user receives status/report

### D. Copy-Trading Flow

Flow:
1. user activates copy-trading strategy
2. control plane writes target config and policy
3. Rust service receives target configuration
4. Rust monitors chain or wallet activity
5. matching action is detected
6. Rust executes trade quickly
7. Rust returns result/event
8. control plane stores event and notifies user

---

## AI Layer Design

## AI Roles

AI should be used for:

- candidate scoring
- structured explanations
- risk classification assistance
- strategy comparison
- report summarization
- operator guidance

AI should not be used for:

- direct raw transaction sending
- bypassing hard safety rules
- overriding emergency exits
- replacing deterministic checks
- acting without sufficient input/context

## Model Separation

Recommended task split:

### `screeningModel`
Purpose:
- screening candidates
- lightweight scoring
- quick ranking

Desired traits:
- low cost
- fast
- structured output

### `managementModel`
Purpose:
- active position reasoning
- hold / reduce / close guidance
- deeper explanations

Desired traits:
- more stable
- better reasoning consistency

### `generalModel`
Purpose:
- chat
- natural-language explanations
- report summarization
- user assistance

Desired traits:
- helpful instruction following
- good summarization quality

## Provider Strategy

Primary AI provider:
- OpenRouter

Reasons:
- flexible model routing
- simpler provider abstraction
- easier experimentation across models
- future fallback possibilities

---

## Configuration Strategy

Configuration should be divided into three layers.

### 1. Environment Variables
Used for secrets and deployment-specific values.

Examples:
- Telegram bot token
- Solana private key
- Helius API key
- OpenRouter API key
- service endpoints

### 2. Default Config
Safe fallback values committed with the codebase.

Purpose:
- baseline behavior
- predictable startup
- safe defaults for local development

### 3. User Config
Editable runtime tuning values.

Purpose:
- screening thresholds
- risk preferences
- schedules
- model selection
- feature enable/disable flags

## Recommended Config Domains

### `ai`
- provider
- screening model
- management model
- general model
- timeout
- retries
- structured output mode

### `risk`
- daily capital
- position size percentage
- max deploy amount
- gas reserve
- minimum open balance
- stop loss
- emergency breaker thresholds

### `meteora`
- min/max TVL
- min volume
- min organic score
- min holders
- min/max market cap
- min/max bin step
- launchpad blocklist
- out-of-range handling rules

### `copytrade`
- enabled
- target wallets
- amount caps
- slippage policy
- copy-sell policy
- execution mode

### `walletIntel`
- suspicious thresholds
- bundler thresholds
- identity/label policy

### `schedule`
- screening interval
- management interval
- reporting interval
- health-check interval

---

## Data and Persistence

The system should persist enough data to support:
- auditing
- reporting
- replay/debugging
- user-facing transparency

## Suggested Data Domains

- users
- wallets
- positions
- trades
- screening candidates
- copy-trade targets
- notifications
- health logs
- config snapshots
- AI decisions

## Important: AI Decision Logging

Store:
- task type
- model used
- sanitized input summary
- structured output
- confidence score
- final action
- whether hard rules overrode the AI recommendation

This is important for:
- debugging
- trust
- post-mortem analysis
- future model evaluation

---

## Scheduling and Workers

The system should support scheduled jobs for:

- screening
- position management
- daily reporting
- health monitoring
- stale lock cleanup if needed

Each worker should:
- be idempotent where possible
- log start/end status
- record failures clearly
- avoid overlapping runs if the same job is already active

---

## Security and Safety

### Required Safety Layers

- authorization checks for bot commands
- config validation on startup
- wallet balance checks
- gas reserve enforcement
- max position cap enforcement
- stop-loss enforcement
- whitelists / blocklists
- rate limiting
- structured logging
- health monitoring

### Secret Handling

Secrets must never be:
- hardcoded in source files
- committed to version control
- mixed into user-editable JSON config

Secrets belong in environment variables or a secure secret store.

---

## Recommended Execution Authority Order

Final authority should follow this order:

1. security validation
2. configuration validation
3. risk engine
4. strategy rules
5. AI recommendation
6. execution layer
7. reporting/logging

This keeps the system predictable and safe.

---

## Integration Plan

### Phase 1 — Establish Core Foundation
Build:
- root project structure
- main Telegram control plane
- config loader
- AI provider abstraction
- docs and operational conventions

### Phase 2 — Integrate Wallet Intelligence
Import and adapt:
- funding analysis
- suspicious bundling detection
- label enrichment

Expose through:
- bot command/menu
- internal package API

### Phase 3 — Integrate Meteora Logic
Import and adapt:
- pool filtering
- strategy presets
- position management logic

Expose through:
- module APIs
- bot menu flows
- scheduled workers

### Phase 4 — Integrate PnL Rendering
Import and adapt:
- renderers
- media pipelines
- reporting summaries

Expose through:
- Telegram responses
- daily/periodic reporting

### Phase 5 — Integrate Rust Copy Engine
Separate:
- execution service
- event monitoring
- copy-trade flow

Connect through:
- internal client or service adapter
- config synchronization
- execution event reporting

### Phase 6 — Harden for Operations
Add:
- health reporting
- AI audit logs
- config snapshots
- better observability
- failure recovery flow

---

## Recommended First Milestone

The first milestone should not try to integrate everything at once.

Priority order:
1. create unified main project structure
2. centralize config and environment handling
3. add OpenRouter-based AI routing
4. integrate wallet intelligence
5. integrate Meteora module
6. integrate PnL rendering
7. integrate Rust copy engine last

This order reduces risk and keeps the platform usable while it grows.

---

## Final Summary


- one main Telegram control plane
- internal reusable domain packages
- one AI routing layer
- one external Rust service for speed-critical execution

The intended logic is:

config -> deterministic rules -> AI reasoning -> risk validation -> execution -> persistence -> notification

That architecture gives the project:
- modularity
- safety
- flexibility
- explainability
- room to scale

without sacrificing execution speed where it matters most.
