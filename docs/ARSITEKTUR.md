# Dokumen Arsitektur Prabu-Siliwangi

## 1. Ringkasan Proyek

Prabu-Siliwangi adalah proyek unify yang menggabungkan beberapa sistem trading, analitik, dan otomasi Solana ke dalam satu arsitektur modular yang rapi dan siap dikembangkan. Proyek ini didasarkan pada rekomendasi dari dokumen Fix Prabu.txt yang mengidentifikasi perlunya konsolidasi beberapa bot Telegram standalone menjadi satu sistem terpusat.

Tujuan utama proyek ini adalah menciptakan sistem hybrid modular di mana Kabayan Bot berfungsi sebagai control center utama, dengan modul-modul tambahan seperti wallet intelligence, Meteora, PnL renderer, dan Rust copy engine yang dapat beroperasi secara terintegrasi namun tetap memiliki batas tanggung jawab yang jelas.

## 2. Keputusan Arsitektur Dasar

### 2.1 Pilihan Struktur Utama

Arsitektur yang dipilih adalah model hybrid modular dengan Kabayan-Bot-Codex sebagai core utama. Keputusan ini diambil berdasarkan pertimbangan bahwa Kabayan sudah memiliki fondasi paling lengkap dengan menu Telegram, auth chat, database, AI/risk engine, execution, scanner, health check, dan backtest. Dengan demikian, ia cocok menjadi control plane yang mengkoordinasikan semua modul lainnya.

Beberapa keputusan kunci yang mendukung arsitektur ini antara lain adalah penggunaan satu pintu masuk untuk semua interaksi user melalui Telegram, pemisahan antara logic bisnis dan execution engine, penggunaan AI sebagai lapisan reasoning namun tidak memiliki otoritas final untuk eksekusi, serta konfigurasi-driven system yang memungkinkan perubahan perilaku tanpa memodifikasi source code.

### 2.2 Prinsip Dasar Sistem

Sistem ini dibangun di atas beberapa prinsip dasar yang harus dipatuhi dalam implementasi. Prinsip pertama adalah single gateway di mana semua interaksi пользователя masuk melalui satu bot utama agar routing, session, auth, dan audit lebih mudah dikelola.

Prinsip kedua adalah AI sebagai assistant bukan executor di mana AI digunakan untuk scoring, ranking peluang, penjelasan keputusan, saran strategi, dan ringkasan laporan. Keputusan final tetap dibatasi oleh hard risk rules, balance check, stop loss, gas reserve, security gate, dan whitelist/blocklist.

Prinsip ketiga adalah config-driven system di mana perilaku sistem dikendalikan oleh konfigurasi yang dapat diubah tanpa perlu menyentuh source code inti. Ini mencakup screening rules, management rules, schedule, AI model selection, dan risk limits.

Prinsip keempat adalah modularity yang memungkinkan setiap domain dipisahkan menjadi modul agar lebih mudah diuji, dikembangkan, dipindahkan, diganti provider-nya, dan dihubungkan ke service lain.

## 3. Struktur Folder Ideal

### 3.1 Struktur Level Tinggi

Struktur direktori utama проекта terdiri dari beberapa direktori уровень atas yang masing-masing memiliki tanggung jawab spesifik. Aplikasi utama berada di apps/, package reusable berada di packages/, services eksternal berada di services/, dokumentasi berada di docs/, dan infrastruktur berada di infra/.

```

Combine/Prabu-Siliwangi/
├── apps/
│   └── prabu-siliwangi          # Bot Telegram utama dan orchestration
├── packages/                 # Modul reusable
│   ├── wallet-intel        # Analisa wallet dan forensic
│   ├── meteora             # DLMM dan liquidity management
│   ├── pnl-renderer        # Visualisasi PnL
│   ├── ai-router           # AI provider dan model routing
│   ├── shared-solana       # Utility Solana bersama
│   └── shared-types        # Tipe data dan kontrak bersama
├── services/
│   └── rust-copy-engine    # Copy trading ultra-fast
├── docs/                    # Dokumentasi arsitektur
└── infra/                   # PM2, Docker, scripts
```

### 3.2 Struktur Apps

Direktori apps/prabu-siliwangi berisi struktur internal untuk bot utama. Bagian ini mencakup src/app untuk use case dan orchestrator utama, src/bot untuk Telegram router, command handler, dan inline menu, src/integrations untuk koneksi ke service eksternal seperti AI dan Rust engine, serta src/jobs untuk worker yang menjadwalkan tugas seperti screening dan management.

```

apps/prabu-siliwangi/src/
├── app/
│   ├── orchestrator.ts     # Orchestrator utama
│   └── use-cases/          # Use case per fitur
├── bot/
│   ├── telegram.ts         # Telegram gateway
│   ├── router.ts           # Command router
│   ├── handlers/           # Command handlers
│   ├── keyboards/          # Inline keyboards
│   └── screens/            # Menu screens
├── integrations/
│   ├── ai/
│   │   ├── openrouter.ts   # OpenRouter client
│   │   └── prompts.ts      # Prompt templates
│   └── rust-engine/
│       └── client.ts       # Rust engine client
├── jobs/
│   ├── scheduler.ts        # Job scheduler
│   ├── screening.ts        # Screening worker
│   ├── management.ts       # Position management worker
│   └── reporting.ts        # Report worker
├── config/
│   ├── env.ts              # Environment loader
│   ├── default.ts          # Default config
│   ├── user.ts             # User config loader
│   └── validation.ts       # Config validator
├── domain/
│   ├── types.ts            # Tipe data domain
│   └── errors.ts           # Custom errors
├── state/                   # In-memory state
├── repositories/            # Database access
├── modules/                 # Module internal
│   ├── wallet-intel/       # Wallet analyzer logic
│   ├── meteora/            # Meteora logic
│   └── pnl/                # PnL logic
└── utils/                   # Utility functions
```

### 3.3 Struktur Packages

Setiap package dalam packages/ memiliki struktur internal yang konsisten. Package wallet-intel menangani analisa funding source, bundle detection, token transfer analysis, dan label lookup. Package meteora menangani pool screening, DLMM logic, preset management, dan position management. Package pnl-renderer menangani fetching data PnL, generation kartu, dan generation GIF.

Package ai-router berfungsi sebagai abstraksi provider AI dengan model selector, structured output, dan task-based routing. Package shared-solana berisi RPC helper, wallet helper, token utils, dan shared validation. Package shared-types berisi event types, trade result, position model, dan command payload.

```

packages/wallet-intel/src/
├── helius.ts               # Helius API client
├── walletIntel.ts          # Wallet analysis logic
├── bundleDetector.ts       # Bundle detection
├── types.ts                # Tipe data
└── index.ts                # Exports

packages/meteora/src/
├── dlmm.ts                 # DLMM wrapper
├── enhanced-dlmm.ts        # Enhanced DLMM service
├── poolScreener.ts         # Pool screening
├── positionManager.ts      # Position management
├── preset.ts               # Preset management
├── types.ts                # Tipe data
└── index.ts                # Exports

packages/pnl-renderer/src/
├── fetchPnl.ts             # Fetch PnL data
├── cardGenerator.ts        # Generate card image
├── gifGenerator.ts         # Generate GIF
├── types.ts                # Tipe data
└── index.ts                # Exports

packages/ai-router/src/
├── openrouter.ts           # OpenRouter client
├── modelSelector.ts        # Model selection logic
├── outputParser.ts         # Parse AI output
├── types.ts                # Tipe data
└── index.ts                # Exports

packages/shared-solana/src/
├── rpc.ts                  # RPC helper
├── wallet.ts               # Wallet operations
├── token.ts                # Token utilities
├── validation.ts           # Validation helpers
├── types.ts                # Tipe data
└── index.ts                # Exports

packages/shared-types/src/
├── event.ts                # Event types
├── trade.ts                # Trade types
├── position.ts             # Position types
├── config.ts               # Config types
└── index.ts                # Exports
```

### 3.4 Struktur Services

Direktori services/rust-copy-engine berisi service copy trading berbasis Rust. Service ini bertanggung jawab untuk monitor target wallet, listen websocket atau transaction stream, ultra-fast copy execution, dan emit event trade success atau fail.

```

services/rust-copy-engine/
├── src/
│   ├── main.rs             # Entry point
│   ├── config.rs           # Config management
│   ├── wallet.rs           # Wallet monitoring
│   ├── executor.rs         # Trade execution
│   ├── events.rs           # Event emitting
│   └── api.rs              # HTTP/gRPC API
├── Cargo.toml
└── README.md
```

## 4. Sistem Konfigurasi

### 4.1 Sumber Konfigurasi

Konfigurasi sistem разделена menjadi tiga sumber utama dengan prioritas load yang jelas. Sumber pertama adalah .env untuk secret seperti token API, private key, dan endpoint service. Sumber kedua adalah config/default.json untuk nilai default yang aman. Sumber ketiga adalah config/user-config.json untuk tuning perilaku sistem.

Prioritas override configurasi adalah default config sebagai basis, user config sebagai override, dan admin runtime override jika diperlukan.

### 4.2 Struktur Konfigurasi Global

Konfigurasi global mencakup beberapa section utama. Section ai mengatur provider, model yang digunakan untuk screening, management, dan general, serta timeout dan retry policy.

```

{
  "ai": {
    "provider": "openrouter",
    "models": {
      "screeningModel": "qwen/qwen-2.5-7b-instruct:free",
      "managementModel": "anthropic/claude-3.5-sonnet",
      "generalModel": "meta-llama/llama-3.1-8b-instruct"
    },
    "timeout": 30000,
    "maxRetries": 3,
    "rateLimit": {
      "requestsPerMinute": 60,
      "requestsPerDay": 1000
    }
  },
  "risk": {
    "dailyCapital": 10,
    "positionSizePct": 10,
    "maxDeployAmount": 2,
    "gasReserve": 0.1,
    "minSolToOpen": 0.5,
    "stopLossPct": 20,
    "emergencyBreaker": {
      "enabled": true,
      "drawdownThreshold": 30
    }
  },
  "schedule": {
    "screeningIntervalMin": 30,
    "managementIntervalMin": 10,
    "reportIntervalMin": 60,
    "healthIntervalMin": 5
  },
  "features": {
    "walletIntel": true,
    "meteora": true,
    "pnl": true,
    "copytrade": true,
    "aiRouter": true
  }
}
```

### 4.3 Konfigurasi Modul Meteora

Konfigurasi Meteora terpisah karena spesifik untuk liquidity management. Configuration ini menentukan rules untuk screening pool dan parameter untuk manajemen posisi.

```

{
  "meteora": {
    "screening": {
      "minFeeActiveTvlRatio": 0.001,
      "minTvl": 10000,
      "maxTvl": 5000000,
      "minVolume": 5000,
      "minOrganic": 30,
      "minHolders": 50,
      "minMcap": 10000,
      "maxMcap": 50000000,
      "maxBundlersPct": 5,
      "maxTop10Pct": 30,
      "minBinStep": 1,
      "maxBinStep": 10,
      "blockedLaunchpads": [
        "pump.fun",
        "raydium"
      ]
    },
    "management": {
      "deployAmountSol": 0.5,
      "positionSizePct": 10,
      "maxDeployAmount": 2,
      "gasReserve": 0.1,
      "minSolToOpen": 0.5,
      "outOfRangeWaitMinutes": 60,
      "stopLossPct": 15,
      "takeProfitPct": 50,
      "rebalanceThreshold": 20
    },
    "schedule": {
      "screeningIntervalMin": 30,
      "managementIntervalMin": 10
    }
  }
}
```

### 4.4 Konfigurasi Wallet Intelligence

Konfigurasi untuk wallet analyzer module yang menentukan threshold untuk deteksi bundle dan policy untuk labeling.

```

{
  "walletIntel": {
    "bundleThreshold": 3,
    "suspiciousScoreThreshold": 70,
    "labelPolicy": {
      "autoLabelCEX": true,
      "autoLabelDeployer": true,
      "autoLabelBundle": true
    },
    "cache": {
      "enabled": true,
      "ttlMinutes": 60
    }
  }
}
```

### 4.5 Konfigurasi Copy Trading

Konfigurasi untuk modul copy trading yang mengontrol bagaimana sistem mengikuti wallet target.

```

{
  "copytrade": {
    "enabled": true,
    "defaultConfig": {
      "minConfidence": 70,
      "maxSlippage": 5,
      "amountCap": 1,
      "copySell": true,
      "autoStopLoss": true
    },
    "targets": [],
    "execution": {
      "timeoutMs": 5000,
      "maxRetries": 2
    }
  }
}
```

## 5. Alur Logic Sistem

### 5.1 Flow Utama User Request

Alur utama menggambarkan bagaimana sistem menangani request dari user melalui Telegram. Pertama, user mengirim command ke Telegram. Kedua, Kabayan bot menerima request melalui Telegram gateway. Ketiga, router mengidentifikasi intent berdasarkan command atau button click. Keempat, request masuk ke orchestrator atau use case yang sesuai.

Kelima, orchestrator mengambil data dari modul terkait. Keenam, rule engine menjalankan validasi. Ketujuh, jika membutuhkan reasoning, panggil AI. Kedelapan, risk engine memutuskan boleh atau tidak. Kesembilan, executor menjalankan aksi. Kesepuluh, simpan ke database. Kesebelas, kirim hasil ke Telegram. Keduabelas, log keputusan dan alasan.

```

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  Telegram   │────▶│   Router    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │Orchestrator │
                                        └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │Rule Engine  │           │ AI Reasoning│           │Data Fetcher │
             └─────────────┘           └─────────────┘           └─────────────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │Risk Engine  │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Executor   │
                                        └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │  Database   │           │  Telegram   │           │    Log      │
             │  Storage    │           │ Notification│           │  System     │
             └─────────────┘           └─────────────┘           └─────────────┘
```

### 5.2 Flow Screening

Flow screening menjelaskan bagaimana sistem mencari dan mengevaluasi peluang. Worker screening berjalan sesuai schedule yang dikonfigurasi. Sistem mengambil kandidat berupa token, pool, atau wallet dari sumber data. Kemudian rule-based filter dijalankan mencakup TVL, volume, holders, mcap, top holder concentration, bundler percentage, dan blocked launchpad.

Kandidat yang lolos filter dikirim ke AI screening untuk scoring. AI mengembalikan opportunity score, risk score, reason, dan suggested action. Kandidat disimpan ke database dengan skor mereka.最后, shortlist dikirim ke user atau masuk ke watchlist untuk monitoring lebih lanjut.

```

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Schedule   │────▶│Data Fetcher  │────▶│Rule Filter   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ AI Screening │
                                         │   Scoring    │
                                         └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   Database   │
                                         │   Storage    │
                                         └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   Telegram   │
                                         │ Notification │
                                         └──────────────┘
```

### 5.3 Flow Position Management

Position management berjalan untuk posisi yang sudah terbuka. Worker management berjalan sesuai schedule. Sistem memuat semua posisi aktif dari database. Hard checks dijalankan terlebih dahulu mencakup stop loss, gas reserve, minimum wallet balance, drawdown, dan emergency breaker.

Jika masih aman setelah hard checks, baru panggil AI management. AI mengembalikan rekomendasi hold, trim, atau close beserta confidence dan explanation. Risk engine mereview hasil AI untuk validasi akhir. Executor menjalankan aksi yang decided. Database diperbarui dengan status baru. Telegram notification dikirim ke user dengan hasil dan alasan.

```

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Schedule   │────▶│Load Positions│────▶│Hard Checks   │
└──────────────┘     └──────────────┘     └──────────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                       ┌──────────────┐                  ┌──────────────┐
                       │ AI Management│                  │Risk Override │
                       │   Scoring    │                  │   Apply      │
                       └──────────────┘                  └──────────────┘
                              │                                 │
                              └────────────────┬────────────────┘
                                               ▼
                                        ┌──────────────┐
                                        │  Executor    │
                                        └──────────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                       ┌──────────────┐                  ┌──────────────┐
                       │  Database    │                  │   Telegram   │
                       │   Update     │                  │ Notification│
                       └──────────────┘                  └──────────────┘
```

### 5.4 Flow Wallet Analyzer

Wallet analyzer berfungsi untuk menganalisis wallet address yang diberikan user. User mengirim wallet address melalui command atau inline button. Modul wallet-intel mengambil data dari Helius API. Analisis dilakukan mencakup funding source, label, bundle atau distribution pattern, dan suspicious behavior.

Rule engine menghitung skor dasar berdasarkan data on-chain. AI merangkum dan menjelaskan hasil analisis. Bot mengirim hasil ke user mencakup status aman, medium, atau suspicious beserta alasan dan rekomendasi apakah layak dimasukkan ke alpha watchlist.

### 5.5 Flow Meteora

Meteora flow menangani liquidity management. Worker atau user request mengambil pool kandidate. Rule filter dijalankan menggunakan konfigurasi spesifik mencakup minTvl, maxTvl, minVolume, minOrganic, minHolders, minMcap, minBinStep, maxBinStep, dan blockedLaunchpads.

AI screening menilai pool yang lolos filter. Jika user mengaktifkan auto-manage, sistem membuka posisi sesuai risk config. Sistem memonitor posisi untuk out-of-range dan melakukan close atau redeploy jika diperlukan. Semua perubahan disimpan ke database dan dilaporkan ke user.

### 5.6 Flow PnL Renderer

PnL renderer menghasilkan visualisasi hasil trading. User meminta PnL dengan command /pnl. Sistem mengambil trade history dari database. Hitung ringkasan包含 win rate, total profit, average trade, dan lainnya. Renderer menghasilkan gambar atau GIF. AI memberikan summary opsional包含 insight tentang performa dan warning jika ada pattern mencurigakan.

### 5.7 Flow Copy Trading

Copy trading memerlukan arsitektur khusus karena sensitif terhadap kecepatan. Rust engine monitor target wallet dan chain events. Kabayan mengirim config target dan policy ke Rust engine. Rust engine execute trade ultra-fast saat event terdeteksi. Rust engine mengirim status kembali ke Kabayan包含 detected, buy sent, sell sent, failed, atau pnl snapshot. Kabayan update database dan kirim notification ke Telegram.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  Kabayan    │────▶│Rust Engine  │
│  Activate   │     │   Config    │     │   Start     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Monitor    │
                                        │  Target     │
                                        │  Wallet     │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Execute    │
                                        │   Trade     │
                                        └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │   Event     │           │  Database   │           │  Telegram   │
             │  Emitter    │           │   Update    │           │ Notification│
             └─────────────┘           └─────────────┘           └─────────────┘
```

## 6. Integrasi AI

### 6.1 Arsitektur AI Layer

AI layer dibangun dengan arsitektur provider-agnostic sehingga mudah diganti atau ditambah provider baru. Abstraksi provider memungkinkan sistemswitch antara OpenRouter, OpenAI, Groq, atau provider lain tanpa mengubah business logic. Model selector memilih model yang tepat berdasarkan task. Task-based routing mengarahkan request ke model yang sesuai.

```

┌─────────────────────────────────────────────┐
│              Application Layer              │
│         (Use Cases, Orchestrator)           │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│              AI Router Layer                │
│  ┌─────────────────────────────────────┐   │
│  │         Task Classifier             │   │
│  │  screening | management | general   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│            Model Selector                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │screening │ │management│ │ general  │    │
│  │  Model   │ │  Model   │ │  Model   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│            Provider Layer                   │
│  ┌─────────────────────────────────────┐   │
│  │     OpenRouter / OpenAI / Groq      │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 6.2 Pembagian Model

Setiap task membutuhkan karakteristik model yang berbeda. Model screening digunakan untuk klasifikasi kandidat, risk score awal, summarization cepat, dan tugas cheap high-volume. Karakteristiknya adalah cepat, murah, dan output terstruktur.

Model management digunakan untuk evaluasi posisi terbuka, reasoning hold atau trim atau close, dan keputusan sensitif. Karakteristiknya adalah lebih stabil dan lebih akurat, boleh sedikit lebih mahal.

Model general digunakan untuk chat user, explain result, command natural language, dan report. Karakteristiknya adalah lebih ramah dan lebih fleksibel.

### 6.3 Prompt Structure

Setiap model membutuhkan prompt yang dioptimisasi untuk tugasnya. Prompt screening fokus pada input data pool atau token dan output JSON dengan risk score, opportunity score, reason, dan recommended action. Prompt management fokus pada input data posisi dan market dan output JSON dengan action, confidence, dan explanation. Prompt general fokus pada input user message dan output yang conversational namun informatif.

### 6.4 Output Parsing

Semua output AI harus berupa JSON terstruktur untuk memudahkan processing. Sistem menggunakan output parser untuk mengekstrak field yang diperlukan dari response AI. Jika parsing gagal, sistem menggunakan fallback values dan mencatat ke log untuk debugging.

## 7. Otoritas Keputusan

### 7.1 Urutan Otoritas Final

Untuk menjaga keamanan sistem, keputusan final diambil melalui urutan otoritas yang jelas. Urutan ini memastikan bahwa AI tidak memiliki otoritas mutlak untuk mengeksekusi transaksi.

Prioritas pertama adalah security dan hard validation yang memastikan transaksi valid, wallet valid, dan tidak ada red flag. Prioritas kedua adalah risk engine yang menerapkan position size limits, max exposure, dan drawdown limits. Prioritas ketiga adalah strategy rules yang menentukan strategy-specific rules dan mode selection. Prioritas keempat adalah AI recommendation yang memberikan scoring dan suggestion. Prioritas kelima adalah user preference yang mempertimbangkan user settings dan manual override. Prioritas keenam adalah execution engine yang akhirnya mengeksekusi transaksi.

### 7.2 Hard Rules yang Tidak Boleh Dioverride

Beberapa hard rules harus selalu diterapkan dan tidak boleh dioverride oleh AI atau user preference. Rules tersebut antara lain adalah gas reserve di mana jika saldo kurang dari gas reserve, jangan buka posisi. Stop loss adalah di mana jika stop loss tercapai, tetap exit terlepas dari AI recommendation. Max allocation adalah di mana jika sudah melebihi max deploy amount, jangan tambahkan posisi baru. Balance check adalah di waar saldo tidak cukup untuk membuka posisi, skip. Security gate adalah di mana jika terdeteksi aktivitas mencurigakan, blokir transaksi.

## 8. Database Schema

### 8.1 Entities Utama

Sistem membutuhkan beberapa entitas utama dalam database untuk menyimpan data yang diperlukan. Entitas users menyimpan data user termasuk Telegram ID, username, settings, dan created at. Entitas wallets menyimpan data wallet yang diassociate dengan user mencakup address, label, dan created at.

Entitas positions menyimpan data posisi aktif dan tertutup mencakup pool, amount, entry price, current price, pnl, status, dan opened at. Entitas trades menyimpan history transaksi mencakup type, amount, price, fee, tx hash, timestamp, dan related position. Entitas watchlists menyimpan list token atau pool yang dimonitoring oleh user.

Entitas copy targets menyimpan target wallet untuk copy trading mencakup address, config, status, dan performance. Entitas screening candidates menyimpan hasil screening mencakup pool, scores, reason, status, dan screened at. Entitas ai decisions menyimpan log keputusan AI mencakup input summary, model, output, confidence, final action, dan timestamp.

Entitas notifications menyimpan log notifikasi yang dikirim ke user mencakup type, message, sent at, dan status. Entitas health logs menyimpan status kesehatan sistem mencakup component, status, message, dan timestamp.

### 8.2 AI Decision Logging

Pencatatan keputusan AI sangat penting untuk audit dan debugging. Setiap keputusan AI harus dicatat包含 input summary, model yang digunakan, output lengkap, confidence score, final action yang diambil, apakah keputusan dioverride oleh risk engine, dan timestamp.

## 9. Roadmap Implementasi

### 9.1 Fase 1 Fondasi

Fase pertama berfokus pada pembangunan fondasi proyek. Minggu pertama mencakup setup struktur project, konfigurasi environment system, dan OpenRouter adapter. Minggu kedua mencakup refactoring Kabayan bot structure, penambahan command router, dan penambahan use case layer.

Minggu ketiga mencakup implementasi config loader dengan validation, implementasi user-config.json support, dan implementasi fallback ke default config. Minggu keempat mencakup setup database schema, implementasi repositories, dan implementasi basic logging.

### 9.2 Fase 2 Integrasi Wallet Analyzer

Fase kedua berfokus pada integrasi modul wallet analyzer. Minggu kelima mencakup ekstraksi logic dari walletanalyzer-main, pembuatan package wallet-intel, dan implementasi Helius client. Minggu keenam mencakup implementasi funding source analysis, implementasi bundle detection, dan implementasi wallet scoring.

Minggu ketujuh mencakup integrasi ke Kabayan bot sebagai command, penambahan menu wallet analyzer, dan testing end-to-end. Minggu kedelapan mencakup optimasi cache, error handling, dan documentation.

### 9.3 Fase 3 Integrasi Meteora

Fase ketiga berfokus pada integrasi modul Meteora. Minggu kesembilan mencakup ekstraksi core logic dari meteora-bin-hunter-master, pembuatan package meteora, dan implementasi DLMM wrapper. Minggu десятый mencakup implementasi pool screener, implementasi preset management, dan implementasi position manager.

Minggu sebelas mencakup implementasi config screening dan management rules, implementasi worker screening dan management, dan integrasi ke Kabayan menu. Minggu duabelas mencakup implementasi OOR handling, testing, dan documentation.

### 9.4 Fase 4 Integrasi PnL Renderer

Fase keempat berfokus pada integrasi modul PnL renderer. Minggu tigabelas mencakup ekstraksi renderer dari pnlbotdc-main, pembuatan package pnl-renderer, dan implementasi card generator. Minggu empatbelas mencakup implementasi GIF generator, implementasi PnL fetcher dari DB, dan integrasi ke command /pnl.

Minggu limabelas mencakup implementasi report generation dengan AI, implementasi schedule report, dan testing end-to-end.

### 9.5 Fase 5 Integrasi Rust Copy Engine

Fase kelima berfokus pada integrasi Rust copy engine. Minggu enambelas mencakup setup Rust service dari Solana-Copy-Trading-Bot-master, implementasi config management via environment, dan implementasi API untuk komunikasi dengan Node. Minggu tujuhbelas mencakup implementasi wallet monitoring, implementasi fast execution, dan implementasi event emitting.

Minggu delapan belas mencakup implementasi client di Kabayan, implementasi start dan stop command, dan implementasi status monitoring. Minggu sembilan belas mencakup implementasi notification flow, testing latency, dan optimization.

### 9.6 Fase 6 Monitoring dan Audit

Fase terakhir berfokus pada monitoring dan audit trail. Minggu duapuluh mencakup implementasi health check worker, implementasi alerting, dan implementasi dashboard monitoring. Minggu dua puluh satu mencakup implementasi AI decision logging, implementasi config snapshots, dan implementasi audit trail. Minggu dua puluh dua mencakup implementasi daily report, implementasi weekly summary, dan implementasi performance metrics.

## 10. Dependency dan Tech Stack

### 10.1 Tech Stack Utama

Proyek menggunakan beberapa teknologi utama. Untuk runtime, digunakan Node.js versi 20 atau lebih tinggi. Untuk bahasa, digunakan TypeScript untuk semua kode aplikasi dan Rust untuk copy engine. Untuk database, digunakan SQLite untuk development dan PostgreSQL untuk production.

Untuk AI, digunakan OpenRouter sebagai provider utama dengan kemungkinan tambahan provider lain. Untuk blockchain, digunakan Solana web3.js dan Meteora DLMM. Untuk Telegram, digunakan node-telegram-bot-api. Untuk deployment, digunakan PM2 untuk process management dan Docker untuk containerization.

### 10.2 Dependency Utama

Dependency utama untuk aplikasi Node.js antara lain adalah @solana/web3.js untuk interaksi Solana, @meteora-ag/dlmm untuk DLMM, node-telegram-bot-api untuk Telegram, axios untuk HTTP client, dotenv untuk environment variables, winston untuk logging, dan zod untuk validasi data.

Dependency utama untuk Rust antara lain adalah solana-sdk untuk Solana, tokio untuk async runtime, serde untuk serialization, reqwest untuk HTTP client, dan tungstenite untuk WebSocket.

## 11. Catatan Implementasi

### 11.1 Prioritas Fitur

Dalam implementasi, beberapa fitur harus diprioritaskan daripada yang lain. Prioritas tertinggi adalah security dan risk management karena tanpa ini sistem bisa mengalami kerugian finansial. Prioritas kedua adalah Telegram bot functioning karena ini adalah interface utama user.

Prioritas ketiga adalah config system karena ini memungkinkan tuning tanpa redeploy. Prioritas keempat adalah basic AI integration karena ini memberikan nilai tambah untuk decision making. Prioritas kelima adalah modul-modul tambahan karena ini memperkaya fungsionalitas sistem.

### 11.2 Testing Strategy

Strategy testing mencakup beberapa pendekatan. Unit测试 untuk fungsi individual dan utility. Integration测试 untuk alur kerja antar modul. End-to-end测试 untuk alur lengkap dari user request sampai execution. Load测试 untuk memastikan sistem bisa menangani beban yang diharapkan.

### 11.3 Error Handling

Error handling harus bersifat komprehensif di semua layer. User-facing errors harus ramah dan informatif. Internal errors harus di-log dengan detail lengkap untuk debugging. Retry logic harus diimplementasikan untuk operasi yang bisa retry. Circuit breaker harus diimplementasikan untuk external service calls.

## 12. Kesimpulan

Dokumen arsitektur ini memberikan blueprint komprehensif untuk implementasi Prabu-Siliwangi. Dengan mengikuti struktur dan prinsip yang dijelaskan di atas, sistem akan memiliki fondasi yang solid untuk berkembang lebih lanjut.

Poin-poin kunci yang harus diingat adalah single gateway untuk semua interaksi user, AI sebagai assistant bukan executor dengan hard rules yang selalu menang, konfigurasi-driven yang memungkinkan tuning tanpa code change, modularitas yang memungkinkan pengembangan dan maintenance yang mudah, serta logging dan audit trail yang komprehensif untuk keamanan dan debugging.

Jika ada pertanyaan atau klarifikasi needed tentang arsitektur ini, jangan ragu untuk bertanya sebelum memulai implementasi.