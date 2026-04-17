# Prabu-Siliwangi Architecture

## Vision

`Prabu-Siliwangi` is a combined Solana operations platform that unifies:

- Telegram bot operations
- AI-assisted trading decisions
- Wallet intelligence and screening
- Meteora DLMM pool management
- PnL rendering and reporting
- High-speed Rust-based copy-trading execution

The system is designed so that all user-facing interactions happen through one main control plane, while specialized modules and services handle domain-specific work.

---

## Core Architecture Principles

### 1. One Main User Gateway
All user interactions should go through a single Telegram bot application.

Why:
- avoids handler conflicts
- centralizes auth/session management
- provides one consistent UI
- simplifies logging and audit trails

### 2. AI Assists, But Does Not Own Final Execution
AI is used for:
- scoring
- ranking
- explanation
- summarization
- strategy suggestions

AI must not bypass:
- stop loss
- gas reserve
- max allocation
- hard safety rules
- blocklists / whitelists
- balance validation

### 3. Deterministic Rules Run Before AI
The expected decision order is:

1. config load
2. validation
3. deterministic screening
4. AI reasoning
5. risk engine review
6. execution
7. persistence
8. notification

### 4. Speed-Critical Logic Stays Separate
Copy-trading and other latency-sensitive execution paths should remain in a dedicated Rust service.

Why:
- lower latency
- cleaner separation of concerns
- Node/TypeScript app remains focused on orchestration and UX

---

## High-Level System Layout

### Applications

#### `apps/prabu-siliwangi`
Primary control plane.

Responsibilities:
- Telegram bot commands and menus
- session/auth handling
- orchestration of modules
- config loading
- invoking AI tasks
- persisting results
- reporting and notifications

### Packages

#### `packages/wallet-intel`
Wallet analysis and funding intelligence.

Responsibilities:
- funding source lookup
- suspicious bundle detection
- identity/label enrichment
- wallet scoring
- alpha wallet recommendations

Source inspiration:
- `walletanalyzer-main`

#### `packages/meteora`
Meteora / DLMM domain logic.

Responsibilities:
- pool screening
- strategy presets
- liquidity deployment logic
- position management
- out-of-range handling
- pool safety checks

Source inspiration:
- `meteora-bin-hunter-master`

#### `packages/pnl-renderer`
PnL visualization and media rendering.

Responsibilities:
- PnL calculations
- image generation
- GIF generation
- summary presentation

Source inspiration:
- `pnlbotdc-main` rendering logic only

#### `packages/ai-router`
AI abstraction layer.

Responsibilities:
- provider selection
- model routing by task
- prompt assembly
- structured output parsing
- retries / fallback handling

Primary provider target:
- OpenRouter

#### `packages/shared-solana`
Shared Solana helpers.

Responsibilities:
- RPC helpers
- wallet helpers
- token/account utilities
- common validation/parsing
- reusable on-chain adapters

#### `packages/shared-types`
Shared contracts and type definitions.

Responsibilities:
- cross-module DTOs
- AI response shapes
- trade result models
- config interfaces
- event payloads

### Services

#### `services/rust-copy-engine`
Dedicated high-speed copy-trading service.

Responsibilities:
- subscribe to target wallets/events
- detect trade opportunities
- execute fast copy-trades
- report execution outcomes
- expose status back to control plane

Source inspiration:
- `Solana-Copy-Trading-Bot-master`

### Infrastructure

#### `infra/`
Deployment and operational support.

Responsibilities:
- environment templates
- process manager configuration
- deployment scripts
- containerization and CI/CD support
- runtime operational notes

### Documentation

#### `docs/`
Long-form design notes and system decisions.

---

## Module Boundaries

### Telegram Control Plane
The control plane should be responsible for:
- receiving commands
- collecting required input
- checking authorization
- dispatching use cases
- displaying results

It should not contain heavy domain logic directly. Domain logic should live in packages/modules.

### Wallet Intelligence Module
This module should not know about Telegram-specific UI details.
It should receive input such as:
- wallet address
- token address
- policy/config

It should return:
- funding analysis
- suspicious score
- labels
- explanation data
- recommendation summary

### Meteora Module
This module should own:
- pool eligibility evaluation
- deployment sizing suggestions
- OOR management logic
- pool-specific config interpretation

It should not own:
- Telegram button rendering
- generic app session state
- global AI provider selection

### PnL Renderer
This module should remain presentation-focused:
- compute display-friendly stats
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

`Prabu-Siliwangi` should be built as a hybrid modular platform:

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

---

## Implementation Status (2024)

### Completed Modules

- [x] Kabayan Bot (Telegram gateway)
- [x] Wallet Intel module
- [x] Meteora module
- [x] PnL Renderer
- [x] AI Router
- [x] Rust Copy Engine

### Rust Copy Engine Features

- [x] HTTP REST API
- [x] State management
- [x] Wallet subscription system
- [x] Config management
- [x] WebSocket wallet monitoring
- [x] Transaction parsing
- [x] Event broadcasting
- [x] Raydium swap integration
- [x] Pump.fun integration
- [x] Jito bundle support
- [x] Health monitoring & metrics
- [x] Web Dashboard

### API Endpoints (Rust Copy Engine)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed health with checks |
| GET | `/metrics` | Service metrics |
| GET | `/status` | Copy trading status |
| POST | `/subscriptions` | Add wallet subscription |
| GET | `/subscriptions` | List subscriptions |
| DELETE | `/subscriptions/:wallet` | Remove subscription |
| GET | `/subscriptions/:wallet/transactions` | Get wallet transactions |
| POST | `/monitor/start` | Start monitoring |
| POST | `/monitor/stop` | Stop monitoring |
| GET | `/monitor/wallets` | List monitored wallets |
| POST | `/swap` | Execute swap |
| POST | `/swap/quote` | Get swap quote |
| POST | `/swap/bundle` | Execute bundle swap |
| GET | `/jito/stats` | Jito statistics |
| GET | `/jito/status` | Jito status |
| GET | `/jito/tip-accounts` | Jito tip accounts |
| GET | `/config` | Get config |
| POST | `/config` | Update config |

### Telegram Bot Commands

- `/start` - Start the bot
- `/help` - Show help menu
- `/copy` - Copy trade menu

### Web Dashboard

Available at `services/rust-copy-engine/static/index.html`

Features:
- Real-time status
- Subscription management
- Swap execution
- Jito statistics
- Configuration management
- System logs