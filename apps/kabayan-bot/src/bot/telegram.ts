import TelegramBot from "node-telegram-bot-api";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { AppConfig, EnvConfig } from "../domain/types";
import { OpenRouterClient } from "../integrations/ai/openrouterClient";
import { RustCopyEngineClient } from "../integrations/rust-engine/client";
import {
  compareStrategies,
  formatBacktestResult,
  formatComparisonResult,
  getStrategyPreset,
  getStrategyPresetNames,
  runBacktest,
} from "../modules/backtest/simulator";
import { fetchWalletHoldings } from "../modules/trading/walletHoldings";
import { createWalletConfig, getWalletBalance } from "../config/wallet";
import { executeSwap } from "../execution/swap";
import { getPaperPositions, paperBuy, paperSell } from "../execution/paper";
import {
  fetchPortfolioSnapshot,
  formatPnlStatusFromPortfolio,
  formatPortfolioSnapshot,
} from "../modules/trading/portfolio";
import {
  WalletIntelAnalyzer,
  formatWalletIntelAnalysis,
} from "../modules/wallet-intel/analyzer";
import {
  formatBuyDraft,
  formatSellDraft,
  formatSellableAssets,
  getFeeSchedule as getManualTradeFeeSchedule,
  isBuyDraftReady,
  isSellDraftReady,
  type FeeMode,
  type ManualTradeStore,
  type ManualSellDraft,
} from "../state/manualTradeStore";
import {
  formatWalletIntelTarget,
  type WalletIntelStore,
} from "../state/walletIntelStore";
import {
  formatAiScreen,
  formatFeatureOverviewScreen,
  formatSettingsScreen,
  formatStatusScreen,
  type FeatureStatusSnapshot,
} from "./screens";
import { formatRuntimeHealth, getRuntimeHealth } from "../utils/health";
import { logger } from "../utils/logger";
import { RuntimeControlsStore } from "../state/runtimeControls";
import {
  createTradeJournal,
  formatRecentTrades,
} from "../repositories/tradeJournal";
import { EnhancedDLMMService } from "@prabu/meteora";
import type { MeteoraPosition } from "@prabu/meteora/dist/types";
import { PnLRenderer } from "@prabu/pnl-renderer";
import { AIRouterEngine } from "@prabu/ai-router";
import {
  createCopyTradeStore,
  formatCopyTradeDraft,
  getCopyTradeMenu,
  getCopySubscriptionMenu,
  handleCopyTrade,
  handleCopySubscription,
  handleCopySubList,
  handleCopySubAdd,
  handleCopySubRemove,
  handleCopyMonitorStart,
  handleCopyMonitorStop,
  handleCopyBundleSwap,
  CopyTradeStore,
  createCopyTradeDashboard,
  formatDashboardSummary,
  formatPositionsList,
  formatWalletStats,
  formatTradeHistory,
  formatFullDashboard,
  getDashboardMenu,
} from "../modules/copy-trade";
import {
  createPositionExecutionService,
  formatOpenPositions,
  formatPositionDetails,
  formatExecutionResult,
  formatExecutionHistory,
  formatExecutionSummary,
  getExecutionMenu,
} from "../modules/execution";
import {
  ScreeningService,
  PoolData,
} from "../modules/screening";
import {
  getScreeningMenu,
  formatScreeningMenu,
  formatScreeningSession,
  formatScreeningHistory,
  formatScreeningResult,
  formatScreeningPrompt,
} from "../modules/screening/screens";
import type { ScreeningWorker } from "../jobs/workers/screeningWorker";
import type { ManagementWorker } from "../jobs/workers/managementWorker";
import type { HealthWorker } from "../jobs/workers/healthWorker";
import { createBacktestService } from "../modules/backtest";
import { createPriceService } from "../modules/price";
import { createLiquidityService } from "../modules/liquidity";
import { createRiskCalculator } from "../modules/risk";
import { PersistenceService } from "../modules/persistence";
import type { ScreenedPool } from "../jobs/workers/screeningWorker";
import {
  createAutoExecuteService,
  formatAutoExecuteStatus,
  formatAutoPositions,
  getAutoExecuteMenu,
  getTpPctMenu,
  getSlPctMenu,
  getSizeMenu,
  getScoreMenu,
  getTrailingTpMenu,
  getTrailingSlMenu,
  getDcaMenu,
  getTimeExitMenu,
  getLiquidityMenu,
  getRiskMenu,
  getLimitsMenu,
  formatPositionHealth,
} from "../modules/auto-execute";

export interface TelegramGateway {
  start(): void;
  integrateWorkers(workers: {
    screening?: ScreeningWorker;
    management?: ManagementWorker;
    health?: HealthWorker;
  }): void;
}

type MenuTarget =
  | "main"
  | "trading"
  | "analysis"
  | "automation"
  | "settings"
  | "backtest"
  | "help"
  | "copytrade";

function isAuthorized(env: EnvConfig, chatId: number): boolean {
  if (!env.chatId) {
    return true;
  }

  return String(chatId) === String(env.chatId);
}

function getFeatureSnapshot(
  runtimeControls: RuntimeControlsStore,
): FeatureStatusSnapshot {
  const snapshot = runtimeControls.getSnapshot();

  return {
    paperMode: snapshot.paperMode,
    aiSniper: snapshot.aiSniper,
    mevSandwich: snapshot.mevSandwich,
    mevArbitrage: snapshot.mevArbitrage,
    walletIntel: snapshot.features.walletIntel,
    meteora: snapshot.features.meteora,
    pnl: snapshot.features.pnl,
    copytrade: snapshot.features.copytrade,
  };
}

function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💼 Trading", callback_data: "menu:trading" }],
        [{ text: "🧠 Analysis", callback_data: "menu:analysis" }],
        [{ text: "⚙️ Automation", callback_data: "menu:automation" }],
        [{ text: "🛠 Settings", callback_data: "action:settings" }],
        [{ text: "❓ Help", callback_data: "menu:help" }],
      ],
    },
  };
}

function getTradingMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Buy Manual", callback_data: "action:buy_manual" }],
        [{ text: "📤 Sell Manual", callback_data: "action:sell_manual" }],
        [{ text: "💼 Portfolio", callback_data: "action:portfolio" }],
        [
          { text: "📈 PnL Status", callback_data: "action:pnl" },
          { text: "🖼️ PnL Card", callback_data: "action:pnl_card" }
        ],
        [{ text: "📜 Trade Journal", callback_data: "action:journal" }],
        [{ text: "📊 Daily Report", callback_data: "action:daily_report" }],
        [{ text: "📅 Weekly Report", callback_data: "action:weekly_report" }],
        [{ text: "🏧 Withdraw", callback_data: "action:withdraw" }],
        [{ text: "⬅️ Back", callback_data: "menu:main" }],
      ],
    },
  };
}

function getManualBuyMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🪙 Set Token CA", callback_data: "action:buy_set_token" }],
        [
          { text: "0.01", callback_data: "action:buy_amount:0.01" },
          { text: "0.02", callback_data: "action:buy_amount:0.02" },
          { text: "0.05", callback_data: "action:buy_amount:0.05" },
        ],
        [
          { text: "0.10", callback_data: "action:buy_amount:0.10" },
          { text: "0.20", callback_data: "action:buy_amount:0.20" },
          { text: "0.50", callback_data: "action:buy_amount:0.50" },
        ],
        [
          { text: "SAFE", callback_data: "action:buy_fee:SAFE" },
          { text: "NORMAL", callback_data: "action:buy_fee:NORMAL" },
          { text: "AGGRESSIVE", callback_data: "action:buy_fee:AGGRESSIVE" },
        ],
        [{ text: "✅ Confirm Buy", callback_data: "action:buy_confirm" }],
        [{ text: "🔄 Reset Buy Draft", callback_data: "action:buy_reset" }],
        [{ text: "⬅️ Back", callback_data: "menu:trading" }],
      ],
    },
  };
}

function getManualSellMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🪙 Pick Token From Wallet", callback_data: "action:sell_pick_token" }],
        [
          { text: "25%", callback_data: "action:sell_pct:25" },
          { text: "50%", callback_data: "action:sell_pct:50" },
          { text: "75%", callback_data: "action:sell_pct:75" },
        ],
        [{ text: "100% 💰", callback_data: "action:sell_pct:100" }],
        [
          { text: "SAFE", callback_data: "action:sell_fee:SAFE" },
          { text: "NORMAL", callback_data: "action:sell_fee:NORMAL" },
          { text: "AGGRESSIVE", callback_data: "action:sell_fee:AGGRESSIVE" },
        ],
        [{ text: "✅ Confirm Sell", callback_data: "action:sell_confirm" }],
        [{ text: "🔄 Reset Sell Draft", callback_data: "action:sell_reset" }],
        [{ text: "⬅️ Back", callback_data: "menu:trading" }],
      ],
    },
  };
}

function getAnalysisMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 System Status", callback_data: "action:status" }],
        [{ text: "🤖 AI Agent Status", callback_data: "action:ai_status" }],
        [{ text: "🩺 Health Check", callback_data: "action:health" }],
        [{ text: "🕵️ Wallet Intel", callback_data: "action:wallet_intel" }],
        [{ text: "📊 Backtest", callback_data: "menu:backtest" }],
        [{ text: "⬅️ Back", callback_data: "menu:main" }],
      ],
    },
  };
}

function getWalletIntelMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👛 Use Wallet From Env", callback_data: "action:wallet_intel_use_env" }],
        [{ text: "✍️ Input Wallet Address", callback_data: "action:wallet_intel_set_wallet" }],
        [{ text: "🪙 Set Token CA (Optional)", callback_data: "action:wallet_intel_set_token" }],
        [{ text: "▶️ Run Analysis", callback_data: "action:wallet_intel_run" }],
        [{ text: "🔄 Clear Target", callback_data: "action:wallet_intel_reset" }],
        [{ text: "⬅️ Back", callback_data: "menu:analysis" }],
      ],
    },
  };
}

function getAutomationMenu(runtimeControls: RuntimeControlsStore) {
  const snapshot = runtimeControls.getSnapshot();

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `🎯 AI Sniper ${snapshot.aiSniper ? "✅" : "❌"}`,
            callback_data: "action:toggle_sniper",
          },
        ],
        [
          {
            text: `🥪 MEV Sandwich ${snapshot.mevSandwich ? "✅" : "❌"}`,
            callback_data: "action:toggle_mev_sandwich",
          },
        ],
        [
          {
            text: `⚡ MEV Arbitrage ${snapshot.mevArbitrage ? "✅" : "❌"}`,
            callback_data: "action:toggle_mev_arbitrage",
          },
        ],
        [
          {
            text: `📋 Copy Trade ${snapshot.copytradeEnabled ? "✅" : "❌"}`,
            callback_data: "action:toggle_copytrade",
          },
        ],
        [{ text: "🌊 Meteora", callback_data: "action:meteora" }],
        [{ text: "🔍 AI Screening", callback_data: "action:screening" }],
        [{ text: "📊 Execution", callback_data: "action:execution" }],
        [{ text: "⚡ Auto Execute", callback_data: "action:auto_menu" }],
        [{ text: "⬅️ Back", callback_data: "menu:main" }],
      ],
    },
  };
}

function getSettingsMenu(runtimeControls: RuntimeControlsStore) {
  const snapshot = runtimeControls.getSnapshot();

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `📝 Paper Mode ${snapshot.paperMode ? "✅" : "❌"}`,
            callback_data: "action:toggle_paper",
          },
        ],
        [
          {
            text: `🎯 AI Sniper ${snapshot.aiSniper ? "✅" : "❌"}`,
            callback_data: "action:toggle_sniper",
          },
        ],
        [
          {
            text: `📋 Copytrade ${snapshot.copytradeEnabled ? "✅" : "❌"}`,
            callback_data: "action:toggle_copytrade",
          },
        ],
        [
          {
            text: `🕵️ Wallet Intel ${snapshot.features.walletIntel ? "✅" : "❌"}`,
            callback_data: "action:toggle_wallet_intel",
          },
        ],
        [
          {
            text: `🌊 Meteora ${snapshot.features.meteora ? "✅" : "❌"}`,
            callback_data: "action:toggle_meteora",
          },
        ],
        [
          {
            text: `📈 PnL ${snapshot.features.pnl ? "✅" : "❌"}`,
            callback_data: "action:toggle_pnl",
          },
        ],
        [{ text: "🔐 Authorization", callback_data: "action:authorization" }],
        [{ text: "🧩 Feature Overview", callback_data: "action:features" }],
        [{ text: "⬅️ Back", callback_data: "menu:main" }],
      ],
    },
  };
}

function getBacktestMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎯 Single Strategy", callback_data: "action:bt_single" }],
        [{ text: "⚖️ Compare All", callback_data: "action:bt_compare" }],
        [{ text: "👁️ View Presets", callback_data: "action:bt_presets" }],
        [{ text: "⬅️ Back", callback_data: "menu:analysis" }],
      ],
    },
  };
}

function getBacktestStrategyMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Conservative", callback_data: "action:bt_run:conservative" }],
        [{ text: "Balanced", callback_data: "action:bt_run:balanced" }],
        [{ text: "Aggressive", callback_data: "action:bt_run:aggressive" }],
        [{ text: "Sniper", callback_data: "action:bt_run:sniper" }],
        [{ text: "Diamond Hands", callback_data: "action:bt_run:diamond_hands" }],
        [{ text: "⬅️ Back", callback_data: "menu:backtest" }],
      ],
    },
  };
}

function getMeteoraMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Add LP", callback_data: "action:meteora_add" }],
        [{ text: "📊 Positions", callback_data: "action:meteora_positions" }],
        [{ text: "🔄 Sync", callback_data: "action:meteora_sync" }],
        [
          { text: "💎 Harvest", callback_data: "action:meteora_harvest" },
          { text: "📈 APR", callback_data: "action:meteora_apr" },
        ],
        [
          { text: "📉 IL Calc", callback_data: "action:meteora_il" },
          { text: "❤️ Health", callback_data: "action:meteora_health" },
        ],
        [{ text: "🔄 Rebalance", callback_data: "action:meteora_rebalance" }],
        [{ text: "📍 Bins", callback_data: "action:meteora_bins" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
}

function getHelpMenu() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: "menu:main" }]],
    },
  };
}

function getScreeningSettingsMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎯 Min TVL: $10K", callback_data: "action:screen_setting:minTvl" }],
        [{ text: "📊 Min Volume: $500", callback_data: "action:screen_setting:minVolume" }],
        [{ text: "👥 Min Holders: 500", callback_data: "action:screen_setting:minHolders" }],
        [{ text: "💎 Min MCap: $150K", callback_data: "action:screen_setting:minMcap" }],
        [{ text: "⚠️ Max Bundlers: 30%", callback_data: "action:screen_setting:maxBundlers" }],
        [{ text: "👑 Max Top10: 60%", callback_data: "action:screen_setting:maxTop10" }],
        [{ text: "🔄 Reset to Defaults", callback_data: "action:screen_reset_config" }],
        [{ text: "⬅️ Back", callback_data: "action:screen_menu" }],
      ],
    },
  };
}

function getCopyTradeMenuFromStore(store: CopyTradeStore, chatId: number) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👛 Set Target Wallet", callback_data: "action:copy_set_wallet" }],
        [{ text: "🪙 Set Token Mint", callback_data: "action:copy_set_token" }],
        [
          { text: "0.01", callback_data: "action:copy_amount:0.01" },
          { text: "0.05", callback_data: "action:copy_amount:0.05" },
          { text: "0.10", callback_data: "action:copy_amount:0.1" },
        ],
        [
          { text: "0.25", callback_data: "action:copy_amount:0.25" },
          { text: "0.50", callback_data: "action:copy_amount:0.5" },
          { text: "1.00", callback_data: "action:copy_amount:1" },
        ],
        [{ text: "✅ Execute Copy", callback_data: "action:copy_execute" }],
        [{ text: "⚡ Execute Bundle", callback_data: "action:copy_bundle" }],
        [{ text: "📊 Status", callback_data: "action:copy_status" }],
        [{ text: "🔄 Reset", callback_data: "action:copy_reset" }],
        [{ text: "⬅️ Back", callback_data: "menu:automation" }],
      ],
    },
  };
}

function renderMenu(
  target: MenuTarget,
  runtimeControls: RuntimeControlsStore,
) {
  switch (target) {
    case "trading":
      return {
        text: [
          "💼 Trading Menu",
          "",
          "Semua aksi utama dipusatkan melalui button.",
          "Command teks tidak dipakai sebagai jalur utama operasi.",
        ].join("\n"),
        options: getTradingMenu(),
      };
    case "analysis":
      return {
        text: [
          "🧠 Analysis Menu",
          "",
          "Akses AI status, health check, wallet intelligence, dan backtest dari sini.",
        ].join("\n"),
        options: getAnalysisMenu(),
      };
    case "automation":
      return {
        text: [
          "⚙️ Automation Menu",
          "",
          "Kelola sniper, MEV, copy-trade, dan Meteora melalui button.",
        ].join("\n"),
        options: getAutomationMenu(runtimeControls),
      };
    case "settings":
      return {
        text: [
          "🛠 Settings Menu",
          "",
          "Semua pengaturan utama dipusatkan di sini dan bisa di-toggle saat runtime.",
        ].join("\n"),
        options: getSettingsMenu(runtimeControls),
      };
    case "backtest":
      return {
        text: [
          "📊 Backtest Menu",
          "",
          "Tahap berikutnya kita akan sambungkan engine backtest penuh ke menu ini.",
        ].join("\n"),
        options: getBacktestMenu(),
      };
    case "help":
      return {
        text: [
          "❓ Help",
          "",
          "Gunakan tombol untuk berpindah menu.",
          "Command yang tetap dipertahankan hanya sebagai entry point seperti /start.",
        ].join("\n"),
        options: getHelpMenu(),
      };
    case "copytrade":
      return {
        text: [
          "📋 Copy Trade Menu",
          "",
          "Execute copy trades from target wallets.",
          "Make sure Rust Copy Engine is running on port 8787.",
        ].join("\n"),
        options: getCopyTradeMenu(),
      };
    case "main":
    default:
      return {
        text: [
          "👑 Prabu-Siliwangi aktif.",
          "",
          "Semua command utama sekarang diarahkan ke sistem button.",
          "Pilih area yang ingin kamu buka:",
        ].join("\n"),
        options: getMainMenu(),
      };
  }
}

function renderActionMessage(action: string): string {
  switch (action) {
    case "buy_manual":
      return "📥 Buy Manual dipilih.\n\nFlow eksekusi buy manual akan dihubungkan pada tahap migrasi berikutnya.";
    case "sell_manual":
      return "📤 Sell Manual dipilih.\n\nFlow eksekusi sell manual akan dihubungkan pada tahap migrasi berikutnya.";
    case "portfolio":
      return "💼 Portfolio dipilih.\n\nData posisi dan ringkasan portfolio akan dihubungkan setelah migrasi repository dan execution layer.";
    case "pnl":
      return "📈 PnL dipilih.\n\nRenderer PnL akan diintegrasikan setelah modul `pnl-renderer` mulai dipakai.";
    case "withdraw":
      return "🏧 Withdraw dipilih.\n\nFlow withdraw aman dengan validasi address dan amount akan ditambahkan pada tahap berikutnya.";
    case "wallet_intel":
      return "🕵️ Wallet Intel dipilih.\n\nGunakan submenu untuk memilih wallet target lalu jalankan analisa nyata via Helius.";
    case "sell_pick_token":
      return "📤 Sell token sekarang memakai daftar holdings yang tersedia di wallet/portfolio, bukan input CA manual.";
    case "toggle_sniper":
      return "🎯 AI Sniper dipilih.\n\nKontrol sniper akan dibuat penuh dengan button seperti di Kabayan lama.";
    case "mev_menu":
      return "🥪 MEV Bot dipilih.\n\nMenu sandwich, arbitrage, dan status MEV akan dihubungkan pada tahap berikutnya.";
    case "copytrade":
      return "📋 Copy Trade dipilih.\n\nIntegrasi ke rust copy engine akan dibuat setelah service contract final.";
    case "meteora":
      return "🌊 Meteora dipilih.\n\nScreening dan management pool Meteora akan ditempatkan di sini.";
    case "toggle_paper":
      return "📝 Paper Mode dipilih.\n\nSwitch paper/live mode akan dibuat via button dan config runtime.";
    case "authorization":
      return "🔐 Authorization dipilih.\n\nPengaturan akses chat dan admin policy akan ditempatkan di sini.";
    case "features":
      return "🧩 Feature Flags dipilih.\n\nKontrol modul aktif/nonaktif akan dihubungkan ke config system.";
    default:
      return "Fitur ini masih placeholder dan akan dihubungkan pada tahap migrasi berikutnya.";
}
}

function formatSlippageBps(slippageBps: number): string {
  return `${slippageBps} bps (${(slippageBps / 100).toFixed(2)}%)`;
}

function isValidSolanaAddress(value: string): boolean {
  try {
    const trimmed = value.trim();
    // First validate length (32-88 chars for base58 Solana addresses)
    if (trimmed.length < 32 || trimmed.length > 88) {
      return false;
    }
    // Then validate base58 encoding using bs58
    bs58.decode(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isValidSolanaPrivateKey(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  try {
    bs58.decode(value.trim());
    return true;
  } catch {
    return false;
  }
}

export function createTelegramGateway(
  env: EnvConfig,
  config: AppConfig,
  aiClient: AIRouterEngine,
  rustClient: RustCopyEngineClient,
  runtimeControls: RuntimeControlsStore,
  manualTradeStore: ManualTradeStore,
  walletIntelStore: WalletIntelStore,
  dlmmService: EnhancedDLMMService,
  pnlRenderer: PnLRenderer,
  screeningService: ScreeningService,
): TelegramGateway {
  const walletIntelAnalyzer = new WalletIntelAnalyzer({
    heliusApiKey: env.heliusApiKey,
  });
  const tradeJournal = createTradeJournal();
  const copyTradeStore = createCopyTradeStore();
  const copyTradeDashboard = createCopyTradeDashboard(rustClient, dlmmService);
  const executionService = createPositionExecutionService(rustClient, dlmmService);
  const backtestService = createBacktestService();

  const priceService = createPriceService(env.heliusApiKey);
  const liquidityService = createLiquidityService(env.heliusApiKey);
  const riskCalculator = createRiskCalculator();
  const persistenceService = new PersistenceService({ path: "./data/positions.json" });

  const autoExecuteService = createAutoExecuteService({
    enabled: false,
    minScoreToExecute: 85,
    positionSizePct: 10,
    maxConcurrentPositions: 5,
    useTrailingTp: true,
    useTrailingSl: true,
    useDca: false,
    useTimeExit: false,
    useLiquidityCheck: true,
    useRiskCalculator: false,
    fixedTpPct: 50,
    fixedSlPct: 20,
    trailingTp: {
      activationPct: 25,
      callbackPct: 10,
    },
    trailingSl: {
      offsetPct: 5,
    },
    dcaConfig: {
      legs: 3,
      legAmountPct: 33,
      intervalMinutes: 5,
    },
    timeExitConfig: {
      maxHours: 24,
      warningBeforeHours: 1,
    },
    liquidityConfig: {
      minLiquiditySol: 5,
    },
    riskConfig: {
      riskPerTradePct: 2,
    },
  });

  autoExecuteService.setLiquidityCallback(async (poolAddress: string, amountSol: number) => {
    try {
      const check = await liquidityService.checkLiquidity(poolAddress, amountSol);
      return {
        canExecute: check.canExecute,
        reasons: check.reasons,
      };
    } catch (error) {
      logger.warn(`Liquidity check failed for ${poolAddress}, allowing execution`);
      return { canExecute: true, reasons: ["Liquidity check skipped due to error"] };
    }
  });

  autoExecuteService.setRiskCallback(async (capital: number) => {
    try {
      const profile = riskCalculator.getDefaultProfile();
      return (capital * profile.riskPerTradePct) / 100;
    } catch (error) {
      logger.warn("Risk calculation failed, using default 2%");
      return capital * 0.02;
    }
  });

  autoExecuteService.setDcaCallback(async (poolSnapshot, amountSol, legNumber) => {
    try {
      logger.info(`DCA: Executing leg ${legNumber} for ${poolSnapshot.tokenYSymbol}, amount: ${amountSol} SOL`);

      if (runtimeControls.getSnapshot().paperMode) {
        return { success: true, signature: `paper_dca_leg${legNumber}` };
      }

      const pool: ScreenedPool = {
        address: poolSnapshot.address,
        score: poolSnapshot.score,
        confidence: 0.8,
        recommendation: "buy",
        reason: "DCA leg",
        poolData: {
          address: poolSnapshot.address,
          tokenYSymbol: poolSnapshot.tokenYSymbol,
          tvl: poolSnapshot.tvl,
          volume24h: poolSnapshot.volume24h,
        } as any,
        result: null,
      };

      const result = await executionService.executeBuyFromScreening(pool, amountSol);
      return { success: result.success, signature: result.signature, error: result.error };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`DCA leg ${legNumber} failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  });

  autoExecuteService.setPriceCallback(async (mint: string) => {
    try {
      const price = await priceService.getPrice(mint);
      if (price && price.price > 0) {
        return price.price;
      }
    } catch (error) {
      logger.debug(`Price fetch failed for ${mint}, using fallback`);
    }

    const cached = priceService.getCacheStats();
    if (cached.size > 0) {
      const mockPrice = 0.0001 + Math.random() * 0.01;
      logger.debug(`Using mock price ${mockPrice.toFixed(8)} for ${mint}`);
      return mockPrice;
    }

    return 0.0001;
  });

  autoExecuteService.setNotifyCallback(async (message) => {
    const chatId = env.chatId ? parseInt(env.chatId, 10) : null;
    if (chatId && botInstance) {
      await botInstance.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
  });

  autoExecuteService.setPersistCallback({
    savePositions: async (positions) => {
      persistenceService.saveAutoPositions(positions);
    },
    loadPositions: async () => {
      return persistenceService.getAutoPositions();
    },
  });

  autoExecuteService.startMonitoring(30000);

  autoExecuteService.loadPositions().catch(() => {});

  autoExecuteService.setExecuteCallback(async (pool, amountSol) => {
    try {
      logger.info(`Auto-execute: Attempting to buy ${pool.poolData.tokenYSymbol} for ${amountSol} SOL`);

      if (runtimeControls.getSnapshot().paperMode) {
        const entry = tradeJournal.addEntry({
          chatId: env.chatId ? parseInt(env.chatId) : 0,
          type: "buy",
          tokenMint: pool.address,
          amountSol,
          feeMode: "NORMAL",
          slippageBps: 500,
          status: "success",
          method: "paper",
          metadata: {
            poolAddress: pool.address,
            aiScore: pool.score,
            aiRecommendation: pool.recommendation,
          },
        });

        return { success: true, signature: `paper_${entry.id}` };
      }

      const result = await executionService.executeBuyFromScreening(pool, amountSol);

      if (result.success) {
        tradeJournal.addEntry({
          chatId: env.chatId ? parseInt(env.chatId) : 0,
          type: "buy",
          tokenMint: pool.address,
          amountSol,
          feeMode: "NORMAL",
          slippageBps: 500,
          status: "success",
          method: "jupiter",
          txHash: result.signature,
          metadata: {
            poolAddress: pool.address,
            aiScore: pool.score,
            aiRecommendation: pool.recommendation,
          },
        });
      }

      return { success: result.success, signature: result.signature, error: result.error };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Auto-execute buy failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  });

  autoExecuteService.setSellCallback(async (position, reason, pnlPct) => {
    try {
      logger.info(`Auto-execute: Selling ${position.tokenSymbol}, reason: ${reason}, PnL: ${pnlPct?.toFixed(2)}%`);

      if (runtimeControls.getSnapshot().paperMode) {
        return { success: true, signature: `paper_sell_${position.id}` };
      }

      const result = await executionService.executeSell(position.id, 100);

      if (result.success) {
        tradeJournal.addEntry({
          chatId: env.chatId ? parseInt(env.chatId) : 0,
          type: "sell",
          tokenMint: position.tokenMint,
          amountToken: 0,
          feeMode: "NORMAL",
          slippageBps: 500,
          status: "success",
          method: "jupiter",
          txHash: result.signature,
          metadata: {
            positionId: position.id,
            exitReason: reason,
            pnlPct,
          },
        });
      }

      return { success: result.success, signature: result.signature, error: result.error };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Auto-execute sell failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  });

  autoExecuteService.startMonitoring(30000);

  const screeningPendingInput = new Map<number, boolean>();

  let botInstance: TelegramBot | null = null;

  function setupBotEvents(bot: TelegramBot) {
    // Handle polling errors
    bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', {
        error: error.message,
        stack: error.stack
      });
    });

    // Handle webhook errors (if any)
    bot.on('webhook_error', (error) => {
      logger.error('Telegram webhook error:', {
        error: error.message,
        stack: error.stack
      });
    });

    // Handle generic errors
    bot.on('error', (error) => {
      logger.error('Telegram generic error:', {
        error: error.message,
        stack: error.stack
      });
    });

    // Handle callback query errors (query expired)
    bot.on('callback_query', (query) => {
      logger.info('Callback query received:', {
        id: query.id,
        data: query.data,
      });
    });

    // Prevent unhandled promise rejections from callback queries
    process.on('unhandledRejection', (reason, promise) => {
      const errorMsg = reason instanceof Error ? reason.message : String(reason);

      // Ignore query expired errors - they're normal when users click old buttons
      if (errorMsg.includes('query is too old')) {
        logger.info('Ignoring expired query error:', { message: errorMsg });
        return;
      }

      logger.error('Unhandled Rejection:', {
        promise,
        reason: errorMsg,
      });
      process.exit(1);
    });
  }

  return {
    start() {
      if (!env.telegramBotToken) {
        logger.warn(
          "TELEGRAM_BOT_TOKEN belum diisi. Telegram gateway tidak dijalankan.",
        );
        return;
      }

      const bot = new TelegramBot(env.telegramBotToken, {
        polling: true,
        filepath: false,
      });

      botInstance = bot;
      setupBotEvents(bot);

      const startedAt = new Date().toISOString();
      logger.info('Telegram bot initialized with polling', {
        token: env.telegramBotToken.substring(0, 10) + '...',
        startedAt
      });

      const sendMenu = async (
        chatId: number,
        target: MenuTarget,
        messageId?: number,
      ): Promise<void> => {
        // Validate chatId
        if (typeof chatId !== "number" || chatId <= 0) {
          logger.warn("Invalid chatId for sendMenu", { chatId });
          return;
        }

        const screen = renderMenu(target, runtimeControls);

        if (messageId) {
          try {
            await bot.editMessageText(screen.text, {
              chat_id: chatId,
              message_id: messageId,
              ...screen.options,
            });
            return;
          } catch (error) {
            logger.warn("Gagal edit message menu, fallback ke sendMessage.", {
              target,
              chatId,
              error,
            });
          }
        }

        await bot.sendMessage(chatId, screen.text, screen.options);
      };

      const sendManualBuyScreen = async (chatId: number): Promise<void> => {
        // Validate chatId
        if (typeof chatId !== "number" || chatId <= 0) {
          logger.warn("Invalid chatId for sendManualBuyScreen", { chatId });
          return;
        }

        const draft = manualTradeStore.getBuyDraft(chatId);
        await bot.sendMessage(chatId, formatBuyDraft(draft), getManualBuyMenu());
      };

      const sendManualSellScreen = async (chatId: number): Promise<void> => {
        // Validate chatId
        if (typeof chatId !== "number" || chatId <= 0) {
          logger.warn("Invalid chatId for sendManualSellScreen", { chatId });
          return;
        }

        const draft = manualTradeStore.getSellDraft(chatId);
        await bot.sendMessage(chatId, formatSellDraft(draft), getManualSellMenu());
      };

      const getAvailableSellDrafts = (chatId: number): ManualSellDraft[] => {
        const sellDraft = manualTradeStore.getSellDraft(chatId);
        const assets = manualTradeStore.getSellableAssets(chatId);

        return assets.map((asset) => ({
          ...sellDraft,
          tokenMint: asset.tokenMint,
        }));
      };

      const getSellTokenPickerMenu = (chatId: number) => {
        const drafts = getAvailableSellDrafts(chatId);

        if (drafts.length === 0) {
          return {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Refresh Holdings", callback_data: "action:sell_manual" }],
                [{ text: "⬅️ Back", callback_data: "menu:trading" }],
              ],
            },
          };
        }

        return {
          reply_markup: {
            inline_keyboard: [
              ...drafts.map((draft) => [
                {
                  text: `Sell ${draft.tokenMint?.slice(0, 8)}...`,
                  callback_data: `action:sell_select:${draft.tokenMint}`,
                },
              ]),
              [{ text: "🔄 Refresh Holdings", callback_data: "action:sell_manual" }],
              [{ text: "⬅️ Back", callback_data: "menu:trading" }],
            ],
          },
        };
      };

      const sendSellTokenPicker = async (chatId: number): Promise<void> => {
        if (runtimeControls.getSnapshot().paperMode) {
          const paperPositions = getPaperPositions(chatId);
          manualTradeStore.setSellableAssets(
            chatId,
            paperPositions.map((position) => ({
              tokenMint: position.tokenMint,
              amountLabel: `${position.tokenAmount.toFixed(6)} paper units`,
              amountUi: position.tokenAmount,
            })),
          );

          const assets = manualTradeStore.getSellableAssets(chatId);
          const message =
            assets.length > 0
              ? [
                  "ðŸ“¤ MANUAL SELL",
                  "",
                  "Paper mode aktif. Daftar token diambil dari paper positions, bukan wallet live.",
                  "",
                  formatSellableAssets(assets),
                ].join("\n")
              : [
                  "ðŸ“¤ MANUAL SELL",
                  "",
                  "Paper mode aktif, tetapi belum ada paper position yang bisa dijual.",
                  "Lakukan paper buy dulu sebelum mencoba paper sell.",
                ].join("\n");

          await bot.sendMessage(chatId, message, getSellTokenPickerMenu(chatId));
          return;
        }

        if (!env.solanaWalletAddress) {
          manualTradeStore.setSellableAssets(chatId, []);
          await bot.sendMessage(
            chatId,
            [
              "📤 MANUAL SELL",
              "",
              "SOLANA_WALLET_ADDRESS belum diisi di environment.",
              "Isi address wallet dulu agar bot bisa memuat holdings nyata dari wallet.",
            ].join("\n"),
            getSellTokenPickerMenu(chatId),
          );
          return;
        }

        if (!env.heliusApiKey) {
          manualTradeStore.setSellableAssets(chatId, []);
          await bot.sendMessage(
            chatId,
            [
              "📤 MANUAL SELL",
              "",
              "HELIUS_API_KEY belum diisi di environment.",
              "Isi Helius API key dulu agar bot bisa memuat holdings wallet.",
            ].join("\n"),
            getSellTokenPickerMenu(chatId),
          );
          return;
        }

        try {
          const holdingsResult = await fetchWalletHoldings(env.solanaWalletAddress, {
            heliusApiKey: env.heliusApiKey,
          });

          manualTradeStore.setSellableAssets(
            chatId,
            holdingsResult.holdings.map((holding) => ({
              tokenMint: holding.tokenMint,
              symbol: holding.symbol,
              amountLabel: holding.amountLabel,
              amountUi: holding.amountUi,
              decimals: holding.decimals,
            })),
          );

          const assets = manualTradeStore.getSellableAssets(chatId);

          await bot.sendMessage(
            chatId,
            formatSellableAssets(assets),
            getSellTokenPickerMenu(chatId),
          );
        } catch (error) {
          manualTradeStore.setSellableAssets(chatId, []);
          const message =
            error instanceof Error
              ? error.message
              : "Unknown holdings fetch error.";
          await bot.sendMessage(
            chatId,
            [
              "📤 MANUAL SELL",
              "",
              "Gagal memuat holdings wallet dari Helius.",
              `Reason: ${message}`,
            ].join("\n"),
            getSellTokenPickerMenu(chatId),
          );
        }
      };

      const promptForTokenInput = async (
        chatId: number,
        side: "buy" | "sell",
      ): Promise<void> => {
        if (side === "sell") {
          await sendSellTokenPicker(chatId);
          return;
        }

        manualTradeStore.setPendingInput(chatId, "buy_token");

        await bot.sendMessage(
          chatId,
          [
            "🪙 Kirim token CA untuk manual buy.",
            "",
            "Contoh:",
            "So11111111111111111111111111111111111111112",
          ].join("\n"),
          getManualBuyMenu(),
        );
      };

      const sendManualBuyConfirmation = async (chatId: number): Promise<void> => {
        const draft = manualTradeStore.getBuyDraft(chatId);

        if (!isBuyDraftReady(draft)) {
          await bot.sendMessage(
            chatId,
            "⚠️ Draft buy belum lengkap. Isi token CA, amount SOL, dan fee mode dulu.",
            getManualBuyMenu(),
          );
          return;
        }

        const fee = getManualTradeFeeSchedule(draft.feeMode);
        const tokenMint = draft.tokenMint as string;

        if (!isValidSolanaAddress(tokenMint)) {
          await bot.sendMessage(
            chatId,
            "❌ Token CA tidak valid. Pastikan mint address Solana benar.",
            getManualBuyMenu(),
          );
          return;
        }

        if (tokenMint === "SOL" || tokenMint === "So11111111111111111111111111111111111111112") {
          await bot.sendMessage(
            chatId,
            "❌ Manual buy SOL -> SOL tidak valid. Pilih token mint tujuan yang berbeda dari SOL.",
            getManualBuyMenu(),
          );
          return;
        }

        if (runtimeControls.getSnapshot().paperMode) {
          const paper = paperBuy(
            chatId,
            tokenMint,
            1,
            draft.amountSol as number,
          );

          if (!paper.success) {
            await bot.sendMessage(
              chatId,
              `❌ Paper buy gagal.\n\nReason: ${paper.error || "Unknown paper buy error."}`,
              getManualBuyMenu(),
            );
            return;
          }

          // RECORD: Journal paper buy
          const journalEntry = tradeJournal.addEntry({
            chatId,
            type: "buy",
            tokenMint,
            amountSol: draft.amountSol as number,
            amountToken: paper.purchasedTokenAmount,
            feeMode: draft.feeMode,
            slippageBps: fee.slippageBuy,
            status: "success",
            method: "paper",
            metadata: {
              paperMode: true,
            },
          });

          manualTradeStore.resetBuyDraft(chatId);

          await bot.sendMessage(
            chatId,
            [
              "✅ PAPER BUY SUCCESS",
              "",
              `• Token: ${draft.tokenMint}`,
              `• Amount: ${draft.amountSol?.toFixed(4)} SOL`,
              `• Token Amount: ${paper.purchasedTokenAmount.toFixed(6)}`,
              `• Fee Mode: ${draft.feeMode}`,
              `• Slippage Buy: ${formatSlippageBps(fee.slippageBuy)}`,
              `• Journal ID: ${journalEntry.id}`,
              "",
              "Paper mode aktif, jadi transaksi tidak dikirim ke chain.",
            ].join("\n"),
            getManualBuyMenu(),
          );
          return;
        }

        try {
          const walletCfg = createWalletConfig();
          const balance = await getWalletBalance(
            walletCfg.connection,
            walletCfg.walletPublicKey,
          );

          // HARDENED: Validate sufficient balance with gas reserve
          const gasReserve = Math.max(config.risk.gasReserve, 0.01);
          const requiredBalance = (draft.amountSol as number) + gasReserve;

          if (balance.sol < requiredBalance) {
            await bot.sendMessage(
              chatId,
              `❌ Saldo tidak cukup untuk buy + gas reserve.\n\nRequired: ${requiredBalance.toFixed(4)} SOL\nAvailable: ${balance.sol.toFixed(4)} SOL\nGas Reserve: ${gasReserve.toFixed(4)} SOL`,
              getManualBuyMenu(),
            );
            return;
          }

          await bot.sendMessage(
            chatId,
            "🚀 Mengirim manual buy ke Jupiter...",
            getManualBuyMenu(),
          );

          // RECORD: Journal pending live buy
          const journalEntry = tradeJournal.addEntry({
            chatId,
            type: "buy",
            tokenMint: draft.tokenMint as string,
            amountSol: draft.amountSol as number,
            feeMode: draft.feeMode,
            slippageBps: fee.slippageBuy,
            status: "pending",
            method: "jupiter",
          });

          // Validate private key before execution
          if (!env.solanaPrivateKey || !isValidSolanaPrivateKey(env.solanaPrivateKey)) {
            await bot.sendMessage(
              chatId,
              `❌ SOLANA_PRIVATE_KEY tidak valid atau tidak tersedia.\n\nTransaksi live tidak dapat dilakukan. Pastikan私 ada di environment variable.`,
              getManualBuyMenu(),
            );
            return;
          }

          const result = await executeSwap(
            {
              connection: walletCfg.connection,
              secretKeyBase58: env.solanaPrivateKey,
            },
            "SOL",
            tokenMint,
            draft.amountSol as number,
            fee.slippageBuy,
          );

          if (!result.success) {
            // UPDATE: Journal failed
            tradeJournal.updateEntry(journalEntry.id, {
              status: "failed",
              error: result.error || "Unknown swap error",
              completedAt: new Date().toISOString(),
            });

            await bot.sendMessage(
              chatId,
              `❌ Manual buy gagal.\n\nReason: ${result.error || "Unknown swap error."}`,
              getManualBuyMenu(),
            );
            return;
          }

          // UPDATE: Journal success
          tradeJournal.updateEntry(journalEntry.id, {
            status: "success",
            txHash: result.txHash || undefined,
            completedAt: new Date().toISOString(),
          });

          manualTradeStore.resetBuyDraft(chatId);

          await bot.sendMessage(
            chatId,
            [
              "✅ MANUAL BUY SUCCESS",
              "",
              `• Token: ${draft.tokenMint}`,
              `• Amount: ${draft.amountSol?.toFixed(4)} SOL`,
              `• Fee Mode: ${draft.feeMode}`,
              `• Slippage Buy: ${formatSlippageBps(fee.slippageBuy)}`,
              `• Method: ${result.method}`,
              `• TX: ${result.txHash}`,
              `• Journal ID: ${journalEntry.id}`,
            ].join("\n"),
            getManualBuyMenu(),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown buy execution error.";

          await bot.sendMessage(
            chatId,
            `❌ Manual buy gagal.\n\nReason: ${message}`,
            getManualBuyMenu(),
          );
        }
      };

      const sendManualSellConfirmation = async (chatId: number): Promise<void> => {
        const draft = manualTradeStore.getSellDraft(chatId);

        if (!isSellDraftReady(draft)) {
          await bot.sendMessage(
            chatId,
            "⚠️ Draft sell belum lengkap. Pilih token dari holdings, tentukan sell percentage, lalu pilih fee mode.",
            getManualSellMenu(),
          );
          return;
        }

        const fee = getManualTradeFeeSchedule(draft.feeMode);
        const tokenMint = draft.tokenMint as string;
        const selectedAsset = manualTradeStore
          .getSellableAssets(chatId)
          .find((asset) => asset.tokenMint === tokenMint);

        if (!isValidSolanaAddress(tokenMint)) {
          await bot.sendMessage(
            chatId,
            "❌ Token sell tidak valid. Mint address tidak bisa diparse sebagai address Solana.",
            getManualSellMenu(),
          );
          return;
        }

        if (!selectedAsset || !selectedAsset.amountUi || selectedAsset.amountUi <= 0) {
          await bot.sendMessage(
            chatId,
            "❌ Token sell tidak ditemukan di holdings wallet saat ini.",
            getManualSellMenu(),
          );
          return;
        }

        const sellRatio = (draft.sellPercent as number) / 100;
        const sellAmountUi = selectedAsset.amountUi * sellRatio;

        if (runtimeControls.getSnapshot().paperMode) {
          const paper = paperSell(
            chatId,
            tokenMint,
            1,
            sellRatio,
          );

          if (!paper.success) {
            await bot.sendMessage(
              chatId,
              `❌ Paper sell gagal.\n\nReason: ${paper.error || "Unknown paper sell error."}`,
              getManualSellMenu(),
            );
            return;
          }

          // RECORD: Journal paper sell
          const journalEntry = tradeJournal.addEntry({
            chatId,
            type: "sell",
            tokenMint,
            amountToken: paper.soldTokenAmount,
            feeMode: draft.feeMode,
            slippageBps: fee.slippageSell,
            status: "success",
            method: "paper",
            paperPnl: paper.pnl,
            proceedsSol: paper.receivedSol,
            metadata: {
              paperMode: true,
              sellPercent: draft.sellPercent,
            },
          });

          manualTradeStore.resetSellDraft(chatId);

          await bot.sendMessage(
            chatId,
            [
              "✅ PAPER SELL SUCCESS",
              "",
              `• Token: ${draft.tokenMint}`,
              `• Sell Percent: ${draft.sellPercent}%`,
              `• Token Amount: ${paper.soldTokenAmount.toFixed(6)}`,
              `• Proceeds: ${paper.receivedSol.toFixed(4)} SOL`,
              `• Fee Mode: ${draft.feeMode}`,
              `• Slippage Sell: ${formatSlippageBps(fee.slippageSell)}`,
              `• PnL: ${paper.pnl >= 0 ? "+" : ""}${paper.pnl.toFixed(4)} SOL`,
              `• Journal ID: ${journalEntry.id}`,
              "",
              "Paper mode aktif, jadi transaksi tidak dikirim ke chain.",
            ].join("\n"),
            getManualSellMenu(),
          );
          return;
        }

        try {
          const walletCfg = createWalletConfig();

          await bot.sendMessage(
            chatId,
            "🚀 Mengirim manual sell ke Jupiter...",
            getManualSellMenu(),
          );

          // RECORD: Journal pending live sell
          const journalEntry = tradeJournal.addEntry({
            chatId,
            type: "sell",
            tokenMint,
            amountToken: sellAmountUi,
            feeMode: draft.feeMode,
            slippageBps: fee.slippageSell,
            status: "pending",
            method: "jupiter",
            metadata: {
              sellPercent: draft.sellPercent,
            },
          });

          // Validate private key before execution
          if (!env.solanaPrivateKey || !isValidSolanaPrivateKey(env.solanaPrivateKey)) {
            await bot.sendMessage(
              chatId,
              `❌ SOLANA_PRIVATE_KEY tidak valid atau tidak tersedia.\n\nTransaksi live tidak dapat dilakukan.`,
              getManualSellMenu(),
            );
            return;
          }

          const result = await executeSwap(
            {
              connection: walletCfg.connection,
              secretKeyBase58: env.solanaPrivateKey,
            },
            tokenMint,
            "SOL",
            sellAmountUi,
            fee.slippageSell,
            {
              inputDecimals: selectedAsset.decimals ?? 9,
            },
          );

          if (!result.success) {
            // UPDATE: Journal failed
            tradeJournal.updateEntry(journalEntry.id, {
              status: "failed",
              error: result.error || "Unknown swap error",
              completedAt: new Date().toISOString(),
            });

            await bot.sendMessage(
              chatId,
              `❌ Manual sell gagal.\n\nReason: ${result.error || "Unknown swap error."}`,
              getManualSellMenu(),
            );
            return;
          }

          // UPDATE: Journal success
          tradeJournal.updateEntry(journalEntry.id, {
            status: "success",
            txHash: result.txHash || undefined,
            completedAt: new Date().toISOString(),
          });

          manualTradeStore.resetSellDraft(chatId);

          await bot.sendMessage(
            chatId,
            [
              "✅ MANUAL SELL SUCCESS",
              "",
              `• Token: ${draft.tokenMint}`,
              `• Sell Percent: ${draft.sellPercent}%`,
              `• Token Amount: ${sellAmountUi.toFixed(6)}`,
              `• Fee Mode: ${draft.feeMode}`,
              `• Slippage Sell: ${formatSlippageBps(fee.slippageSell)}`,
              `• Method: ${result.method}`,
              `• TX: ${result.txHash}`,
              `• Journal ID: ${journalEntry.id}`,
            ].join("\n"),
            getManualSellMenu(),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown sell execution error.";

          await bot.sendMessage(
            chatId,
            `❌ Manual sell gagal.\n\nReason: ${message}`,
            getManualSellMenu(),
          );
        }
      };

      const sendMainMenuWithSummary = async (
        chatId: number,
        messageId?: number,
      ): Promise<void> => {
        const rustStatus = await rustClient.ping();
        const features = getFeatureSnapshot(runtimeControls);
        const text = [
          "👑 Prabu-Siliwangi aktif.",
          "",
          "Semua command utama sekarang diarahkan ke sistem button.",
          "",
          "📌 Ringkasan runtime",
          `• AI Router: ${aiClient.isConfigured() ? "✅ Ready" : "❌ Not Ready"}`,
          `• Rust Engine: ${rustStatus.ok ? "✅ Reachable" : "⚠️ Placeholder"}`,
          `• Scheduler: ✅ Active`,
          `• Started At: ${startedAt}`,
          "",
          "Pilih area yang ingin kamu buka:",
        ].join("\n");

        const options = getMainMenu();

        if (messageId) {
          try {
            await bot.editMessageText(text, {
              chat_id: chatId,
              message_id: messageId,
              ...options,
            });
            return;
          } catch (error) {
            logger.warn("Gagal edit home screen, fallback ke sendMessage.", {
              chatId,
              error,
            });
          }
        }

        await bot.sendMessage(chatId, text, options);
      };

      const sendStatusScreen = async (chatId: number): Promise<void> => {
        const rustStatus = await rustClient.ping();
        const runtime = {
          appName: "Prabu-Siliwangi",
          appVersion: "0.1.0",
          aiConfigured: aiClient.isConfigured(),
          rustEngineOk: rustStatus.ok,
          schedulerActive: true,
          startedAt,
        };

        const text = formatStatusScreen(
          runtime,
          env,
          config,
          getFeatureSnapshot(runtimeControls),
        );

        await bot.sendMessage(chatId, text, getAnalysisMenu());
      };

      const sendHealthScreen = async (chatId: number): Promise<void> => {
        const rustStatus = await rustClient.ping();
        const health = getRuntimeHealth({
          aiConfigured: aiClient.isConfigured(),
          rustEngineOk: rustStatus.ok,
          schedulerActive: true,
          startedAt,
        });

        await bot.sendMessage(chatId, formatRuntimeHealth(health), getAnalysisMenu());
      };

      const sendMeteoraScreen = async (chatId: number): Promise<void> => {
        const text = [
          "🌊 METEORA DLMM",
          "",
          "Modul integrasi Meteora aktif.",
          "Gunakan tombol untuk mengelola posisi dan screening pool.",
          "",
          `• DLMM Service: ✅ Ready`,
          `• Auto-rebalance: ⚠️ Placeholder`,
        ].join("\n");

        await bot.sendMessage(chatId, text, getMeteoraMenu());
      };

      const sendAiStatusScreen = async (chatId: number): Promise<void> => {
        const rustStatus = await rustClient.ping();
        const runtime = {
          appName: "Prabu-Siliwangi",
          appVersion: "0.1.0",
          aiConfigured: aiClient.isConfigured(),
          rustEngineOk: rustStatus.ok,
          schedulerActive: true,
          startedAt,
        };

        await bot.sendMessage(
          chatId,
          formatAiScreen(runtime, config),
          getAnalysisMenu(),
        );
      };

      const sendSettingsScreen = async (chatId: number): Promise<void> => {
        await bot.sendMessage(
          chatId,
          formatSettingsScreen(
            env,
            config,
            getFeatureSnapshot(runtimeControls),
          ),
          getSettingsMenu(runtimeControls),
        );
      };

      const sendFeatureOverviewScreen = async (
        chatId: number,
      ): Promise<void> => {
        await bot.sendMessage(
          chatId,
          formatFeatureOverviewScreen(getFeatureSnapshot(runtimeControls)),
          getSettingsMenu(runtimeControls),
        );
      };

      const sendAuthorizationScreen = async (chatId: number): Promise<void> => {
        const text = [
          "🔐 AUTHORIZATION",
          "",
          `• Restricted Chat ID: ${env.chatId || "Not Set"}`,
          `• Daily Report Chat ID: ${env.dailyReportChatId || "Not Set"}`,
          `• Current Mode: ${env.chatId ? "Restricted" : "Open"}`,
          "",
          "Jika CHAT_ID diisi, hanya chat tersebut yang diizinkan memakai bot ini.",
        ].join("\n");

        await bot.sendMessage(chatId, text, getSettingsMenu(runtimeControls));
      };

      const sendWalletIntelScreen = async (chatId: number): Promise<void> => {
        const target = walletIntelStore.getTarget(chatId);
        const info = [
          "🕵️ WALLET INTEL",
          "",
          formatWalletIntelTarget(target),
          "",
          `• Analyzer Configured: ${walletIntelAnalyzer.isConfigured() ? "✅ Yes" : "❌ No"}`,
          `• Default Wallet From Env: ${env.solanaWalletAddress || "-"}`,
          "",
          "Pilih target wallet lalu jalankan analisa.",
        ].join("\n");

        await bot.sendMessage(chatId, info, getWalletIntelMenu());
      };

      const promptWalletIntelInput = async (
        chatId: number,
        kind: "wallet_address" | "token_address",
      ): Promise<void> => {
        walletIntelStore.setPendingInput(chatId, kind);

        await bot.sendMessage(
          chatId,
          kind === "wallet_address"
            ? "👛 Kirim wallet address yang ingin dianalisa."
            : "🪙 Kirim token CA opsional untuk analisa transfer token.",
          getWalletIntelMenu(),
        );
      };

      const runWalletIntelAnalysis = async (chatId: number): Promise<void> => {
        // Check for race condition - prevent concurrent analysis for same chat
        if (walletIntelStore.isAnalyzing(chatId)) {
          await bot.sendMessage(
            chatId,
            "⚠️ Analisis wallet sedang berjalan. Mohon tunggu hingga selesai atau coba lagi.",
            getWalletIntelMenu(),
          );
          return;
        }

        // Set analyzing flag
        walletIntelStore.setAnalyzing(chatId, true);

        const target = walletIntelStore.getTarget(chatId);
        const walletAddress = target.walletAddress || env.solanaWalletAddress;

        if (!walletIntelAnalyzer.isConfigured()) {
          walletIntelStore.setAnalyzing(chatId, false);
          await bot.sendMessage(
            chatId,
            "❌ Wallet Intel belum siap. HELIUS_API_KEY belum diisi.",
            getWalletIntelMenu(),
          );
          return;
        }

        if (!walletAddress) {
          walletIntelStore.setAnalyzing(chatId, false);
          await bot.sendMessage(
            chatId,
            "⚠️ Wallet target belum diisi. Pilih wallet dulu sebelum run analysis.",
            getWalletIntelMenu(),
          );
          return;
        }

        try {
          const analysis = await walletIntelAnalyzer.analyzeWallet(
            walletAddress,
            target.tokenAddress,
          );

          await bot.sendMessage(
            chatId,
            formatWalletIntelAnalysis(analysis),
            getWalletIntelMenu(),
          );
        } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Unknown wallet intel analysis error.";

            await bot.sendMessage(
              chatId,
              `❌ Wallet Intel analysis gagal.\n\nReason: ${message}`,
              getWalletIntelMenu(),
            );
          } finally {
            // Ensure flag is cleared even on error
            walletIntelStore.setAnalyzing(chatId, false);
          }
        };

      const sendBacktestPresetScreen = async (chatId: number): Promise<void> => {
        const names = getStrategyPresetNames();
        const lines = [
          "👁️ Backtest Presets",
          "",
        ];

        for (const name of names) {
          const preset = getStrategyPreset(name);
          if (!preset) {
            continue;
          }

          lines.push(
            `${preset.strategy}`,
            `• Risk: ${preset.baseRiskPercent}%`,
            `• TP1: ${preset.tp1Percent}%`,
            `• TP2: ${preset.tp2Percent}%`,
            `• SL: ${preset.hardSlPercent}%`,
            `• Trailing: ${(preset.trailingDelta * 100).toFixed(0)}%`,
            "",
          );
        }

        await bot.sendMessage(chatId, lines.join("\n").trimEnd(), getBacktestMenu());
      };

      const sendPortfolioScreen = async (chatId: number): Promise<void> => {
        if (!env.solanaWalletAddress) {
          await bot.sendMessage(
            chatId,
            [
              "💼 PORTFOLIO",
              "",
              "SOLANA_WALLET_ADDRESS belum diisi di environment.",
              "Isi wallet address dulu agar snapshot portfolio bisa dimuat.",
            ].join("\n"),
            getTradingMenu(),
          );
          return;
        }

        if (!env.heliusApiKey) {
          await bot.sendMessage(
            chatId,
            [
              "💼 PORTFOLIO",
              "",
              "HELIUS_API_KEY belum diisi di environment.",
              "Isi Helius API key dulu agar snapshot portfolio bisa dimuat.",
            ].join("\n"),
            getTradingMenu(),
          );
          return;
        }

        try {
          const snapshot = await fetchPortfolioSnapshot(env.solanaWalletAddress, {
            heliusApiKey: env.heliusApiKey,
          });

          await bot.sendMessage(
            chatId,
            formatPortfolioSnapshot(snapshot),
            getTradingMenu(),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown portfolio fetch error.";

          await bot.sendMessage(
            chatId,
            [
              "💼 PORTFOLIO",
              "",
              "Gagal memuat portfolio wallet.",
              `Reason: ${message}`,
            ].join("\n"),
            getTradingMenu(),
          );
        }
      };

      const sendPnlScreen = async (chatId: number): Promise<void> => {
        if (!env.solanaWalletAddress) {
          await bot.sendMessage(
            chatId,
            [
              "📈 PNL STATUS",
              "",
              "SOLANA_WALLET_ADDRESS belum diisi di environment.",
              "Isi wallet address dulu agar valuasi portfolio bisa dimuat.",
            ].join("\n"),
            getTradingMenu(),
          );
          return;
        }

        if (!env.heliusApiKey) {
          await bot.sendMessage(
            chatId,
            [
              "📈 PNL STATUS",
              "",
              "HELIUS_API_KEY belum diisi di environment.",
              "Isi Helius API key dulu agar valuasi portfolio bisa dimuat.",
            ].join("\n"),
            getTradingMenu(),
          );
          return;
        }

        try {
          const snapshot = await fetchPortfolioSnapshot(env.solanaWalletAddress, {
            heliusApiKey: env.heliusApiKey,
          });

          await bot.sendMessage(
            chatId,
            formatPnlStatusFromPortfolio(snapshot),
            getTradingMenu(),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown PnL fetch error.";

          await bot.sendMessage(
            chatId,
            [
              "📈 PNL STATUS",
              "",
              "Gagal memuat status PnL dari snapshot portfolio.",
              `Reason: ${message}`,
            ].join("\n"),
            getTradingMenu(),
          );
        }
      };

      const sendJournalScreen = async (chatId: number): Promise<void> => {
        const recentTrades = tradeJournal.getRecentEntries(20);
        const text = formatRecentTrades(recentTrades);

        await bot.sendMessage(
          chatId,
          text,
          getTradingMenu(),
        );
      };

      const runSingleBacktest = async (
        chatId: number,
        strategyName: string,
      ): Promise<void> => {
        const preset = getStrategyPreset(strategyName);

        if (!preset) {
          await bot.sendMessage(
            chatId,
            "Preset strategy tidak ditemukan.",
            getBacktestMenu(),
          );
          return;
        }

        try {
          const result = await runBacktest(preset);
          await bot.sendMessage(
            chatId,
            formatBacktestResult(result),
            getBacktestMenu(),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown backtest error.";
          await bot.sendMessage(
            chatId,
            `❌ Backtest gagal.\n\nReason: ${message}`,
            getBacktestMenu(),
          );
        }
      };

      const runBacktestComparison = async (chatId: number): Promise<void> => {
        try {
          const result = await compareStrategies(getStrategyPresetNames());
          await bot.sendMessage(
            chatId,
            formatComparisonResult(result),
            getBacktestMenu(),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown comparison error.";
          await bot.sendMessage(
            chatId,
            `❌ Strategy comparison gagal.\n\nReason: ${message}`,
            getBacktestMenu(),
          );
        }
      };

      bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
        if (!isAuthorized(env, msg.chat.id)) {
          await bot.sendMessage(msg.chat.id, "⛔ Unauthorized access");
          return;
        }

        await sendMainMenuWithSummary(msg.chat.id);
      });

      bot.onText(/\/menu/, async (msg: TelegramBot.Message) => {
        if (!isAuthorized(env, msg.chat.id)) {
          await bot.sendMessage(msg.chat.id, "⛔ Unauthorized access");
          return;
        }

        await sendMainMenuWithSummary(msg.chat.id);
      });

      bot.onText(/\/help/, async (msg: TelegramBot.Message) => {
        if (!isAuthorized(env, msg.chat.id)) {
          await bot.sendMessage(msg.chat.id, "⛔ Unauthorized access");
          return;
        }

        await sendMenu(msg.chat.id, "help");
      });

      bot.on("message", async (msg: TelegramBot.Message) => {
        if (!msg.text || msg.text.startsWith("/")) {
          return;
        }

        const chatId = msg.chat.id;
        if (!isAuthorized(env, chatId)) {
          return;
        }

        const walletIntelPending = walletIntelStore.getPendingInput(chatId);

        if (walletIntelPending.kind === "wallet_address") {
          walletIntelStore.setWalletAddress(chatId, msg.text.trim());
          await bot.sendMessage(
            chatId,
            "✅ Wallet target untuk Wallet Intel sudah diisi.",
            getWalletIntelMenu(),
          );
          await sendWalletIntelScreen(chatId);
          return;
        }

        if (walletIntelPending.kind === "token_address") {
          walletIntelStore.setTokenAddress(chatId, msg.text.trim());
          await bot.sendMessage(
            chatId,
            "✅ Token CA untuk Wallet Intel sudah diisi.",
            getWalletIntelMenu(),
          );
          await sendWalletIntelScreen(chatId);
          return;
        }

        const state = manualTradeStore.getState(chatId);

        if (state.pendingInput.kind === "buy_token") {
          manualTradeStore.setBuyToken(chatId, msg.text.trim());
          await bot.sendMessage(
            chatId,
            "✅ Token CA untuk manual buy sudah diisi.",
            getManualBuyMenu(),
          );
          await sendManualBuyScreen(chatId);
          return;
        }

        const copyTradePending = copyTradeStore.getPendingInput(chatId);

        if (copyTradePending === "copy_wallet") {
          if (!isValidSolanaAddress(msg.text)) {
            await bot.sendMessage(chatId, "❌ Invalid wallet address. Please enter a valid Solana wallet address.");
            return;
          }
          copyTradeStore.setTargetWallet(chatId, msg.text.trim());
          copyTradeStore.clearPendingInput(chatId);
          await bot.sendMessage(chatId, "✅ Target wallet untuk Copy Trade sudah diisi.");
          await bot.sendMessage(chatId, formatCopyTradeDraft(
            copyTradeStore.getTargetWallet(chatId),
            copyTradeStore.getTokenMint(chatId),
            copyTradeStore.getAmountSol(chatId),
          ), getCopyTradeMenuFromStore(copyTradeStore, chatId));
          return;
        }

        if (copyTradePending === "copy_token") {
          if (!isValidSolanaAddress(msg.text)) {
            await bot.sendMessage(chatId, "❌ Invalid token mint. Please enter a valid Solana token mint address.");
            return;
          }
          copyTradeStore.setTokenMint(chatId, msg.text.trim());
          copyTradeStore.clearPendingInput(chatId);
          await bot.sendMessage(chatId, "✅ Token mint untuk Copy Trade sudah diisi.");
          await bot.sendMessage(chatId, formatCopyTradeDraft(
            copyTradeStore.getTargetWallet(chatId),
            copyTradeStore.getTokenMint(chatId),
            copyTradeStore.getAmountSol(chatId),
          ), getCopyTradeMenuFromStore(copyTradeStore, chatId));
          return;
        }

        if (screeningPendingInput.get(chatId)) {
          screeningPendingInput.delete(chatId);
          const poolAddress = msg.text.trim();

          if (!isValidSolanaAddress(poolAddress)) {
            await bot.sendMessage(chatId, "❌ Invalid pool address. Please enter a valid Solana address.");
            await bot.sendMessage(chatId, formatScreeningMenu(), getScreeningMenu());
            return;
          }

          await bot.sendMessage(chatId, "🔍 Screening pool...");

          try {
            const poolData: PoolData = {
              address: poolAddress,
              tokenXSymbol: "SOL",
              tokenYSymbol: "TOKEN",
              tvl: 50000,
              volume24h: 10000,
              fee24h: 500,
              organicScore: 75,
              holderCount: 1000,
              mcap: 500000,
              binStep: 100,
              top10HolderPct: 25,
              bundlersPct: 15,
            };

            const result = await screeningService.screenPool(poolData);
            await bot.sendMessage(
              chatId,
              formatScreeningResult(result),
              { parse_mode: "Markdown" }
            );
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            await bot.sendMessage(chatId, `❌ Screening failed: ${errMsg}`);
          }

          await bot.sendMessage(chatId, formatScreeningMenu(), getScreeningMenu());
          return;
        }

      });

      bot.on("callback_query", async (query: TelegramBot.CallbackQuery) => {
        const chatId = query.message?.chat.id;
        const messageId = query.message?.message_id;
        const data = query.data;

        if (!chatId || !messageId || !data) {
          return;
        }

        if (!isAuthorized(env, chatId)) {
          await bot.answerCallbackQuery(query.id, {
            text: "⛔ Unauthorized access",
          });
          return;
        }

        if (data.startsWith("menu:")) {
          const target = data.replace("menu:", "") as MenuTarget;
          await bot.answerCallbackQuery(query.id);

          if (target === "main") {
            await sendMainMenuWithSummary(chatId, messageId);
            return;
          }

          await sendMenu(chatId, target, messageId);
          return;
        }

        if (data.startsWith("action:bt_run:")) {
          const strategyName = data.replace("action:bt_run:", "");
          await bot.answerCallbackQuery(query.id, {
            text: `Running ${strategyName} backtest...`,
          });
          await runSingleBacktest(chatId, strategyName);
          return;
        }

        if (data.startsWith("action:buy_amount:")) {
          const amount = Number(data.replace("action:buy_amount:", ""));
          await bot.answerCallbackQuery(query.id, {
            text: `Buy amount set to ${amount.toFixed(2)} SOL`,
          });
          manualTradeStore.setBuyAmount(chatId, amount);
          await sendManualBuyScreen(chatId);
          return;
        }

        if (data.startsWith("action:copy_amount:")) {
          const amount = Number(data.replace("action:copy_amount:", ""));
          await bot.answerCallbackQuery(query.id, {
            text: `Copy amount set to ${amount.toFixed(2)} SOL`,
          });
          copyTradeStore.setAmountSol(chatId, amount);
          await bot.sendMessage(chatId, formatCopyTradeDraft(
            copyTradeStore.getTargetWallet(chatId),
            copyTradeStore.getTokenMint(chatId),
            copyTradeStore.getAmountSol(chatId),
          ), getCopyTradeMenuFromStore(copyTradeStore, chatId));
          return;
        }

        if (data.startsWith("action:buy_fee:")) {
          const feeMode = data.replace("action:buy_fee:", "") as FeeMode;
          await bot.answerCallbackQuery(query.id, {
            text: `Buy fee mode set to ${feeMode}`,
          });
          manualTradeStore.setBuyFeeMode(chatId, feeMode);
          await sendManualBuyScreen(chatId);
          return;
        }

        if (data.startsWith("action:sell_pct:")) {
          const sellPercent = Number(data.replace("action:sell_pct:", ""));
          await bot.answerCallbackQuery(query.id, {
            text: `Sell percent set to ${sellPercent}%`,
          });
          manualTradeStore.setSellPercent(chatId, sellPercent);
          await sendManualSellScreen(chatId);
          return;
        }

        if (data.startsWith("action:sell_fee:")) {
          const feeMode = data.replace("action:sell_fee:", "") as FeeMode;
          await bot.answerCallbackQuery(query.id, {
            text: `Sell fee mode set to ${feeMode}`,
          });
          manualTradeStore.setSellFeeMode(chatId, feeMode);
          await sendManualSellScreen(chatId);
          return;
        }

        if (data.startsWith("action:sell_select:")) {
          const tokenMint = data.replace("action:sell_select:", "");
          await bot.answerCallbackQuery(query.id, {
            text: `Sell token selected: ${tokenMint.slice(0, 8)}...`,
          });
          manualTradeStore.setSellToken(chatId, tokenMint);
          await sendManualSellScreen(chatId);
          return;
        }

        if (data.startsWith("action:")) {
          const action = data.replace("action:", "");
          await bot.answerCallbackQuery(query.id);

          switch (action) {
            case "status":
              await sendStatusScreen(chatId);
              return;
            case "settings":
              await sendSettingsScreen(chatId);
              return;
            case "ai_status":
              await sendAiStatusScreen(chatId);
              return;
            case "health":
              await sendHealthScreen(chatId);
              return;
            case "buy_manual":
              await sendManualBuyScreen(chatId);
              return;
            case "sell_manual":
              await sendSellTokenPicker(chatId);
              return;
            case "portfolio":
              await sendPortfolioScreen(chatId);
              return;
            case "pnl":
              await sendPnlScreen(chatId);
              return;
            case "journal":
              await sendJournalScreen(chatId);
              return;
            case "buy_set_token":
              await promptForTokenInput(chatId, "buy");
              return;
            case "sell_pick_token":
              await sendSellTokenPicker(chatId);
              return;
            case "buy_reset":
              manualTradeStore.resetBuyDraft(chatId);
              await bot.sendMessage(
                chatId,
                "🔄 Manual buy draft di-reset.",
                getManualBuyMenu(),
              );
              await sendManualBuyScreen(chatId);
              return;
            case "sell_reset":
              manualTradeStore.resetSellDraft(chatId);
              await bot.sendMessage(
                chatId,
                "🔄 Manual sell draft di-reset.",
                getManualSellMenu(),
              );
              await sendManualSellScreen(chatId);
              return;
            case "buy_confirm":
              await sendManualBuyConfirmation(chatId);
              return;
            case "sell_confirm":
              await sendManualSellConfirmation(chatId);
              return;
            case "toggle_paper": {
              const snapshot = runtimeControls.togglePaperMode();
              await bot.sendMessage(
                chatId,
                `📝 Paper Mode sekarang ${snapshot.paperMode ? "✅ ON" : "❌ OFF"}.`,
                getSettingsMenu(runtimeControls),
              );
              return;
            }
            case "toggle_sniper": {
              const snapshot = runtimeControls.toggleAiSniper();
              await bot.sendMessage(
                chatId,
                `🎯 AI Sniper sekarang ${snapshot.aiSniper ? "✅ ON" : "❌ OFF"}.`,
                getAutomationMenu(runtimeControls),
              );
              return;
            }
            case "toggle_copytrade": {
              const snapshot = runtimeControls.toggleCopytradeEnabled();
              await bot.sendMessage(
                chatId,
                `📋 Copytrade sekarang ${snapshot.copytradeEnabled ? "✅ ON" : "❌ OFF"}.`,
                getSettingsMenu(runtimeControls),
              );
              return;
            }
            case "toggle_wallet_intel": {
              const snapshot = runtimeControls.toggleFeature("walletIntel");
              await bot.sendMessage(
                chatId,
                `🕵️ Wallet Intel sekarang ${snapshot.features.walletIntel ? "✅ ON" : "❌ OFF"}.`,
                getSettingsMenu(runtimeControls),
              );
              return;
            }
            case "toggle_meteora": {
              const snapshot = runtimeControls.toggleFeature("meteora");
              await bot.sendMessage(
                chatId,
                `🌊 Meteora sekarang ${snapshot.features.meteora ? "✅ ON" : "❌ OFF"}.`,
                getSettingsMenu(runtimeControls),
              );
              return;
            }
            case "toggle_pnl": {
              const snapshot = runtimeControls.toggleFeature("pnl");
              await bot.sendMessage(
                chatId,
                `📈 PnL sekarang ${snapshot.features.pnl ? "✅ ON" : "❌ OFF"}.`,
                getSettingsMenu(runtimeControls),
              );
              return;
            }
            case "toggle_mev_sandwich": {
              const snapshot = runtimeControls.toggleMevSandwich();
              await bot.sendMessage(
                chatId,
                `🥪 MEV Sandwich sekarang ${snapshot.mevSandwich ? "✅ ON" : "❌ OFF"}.`,
                getAutomationMenu(runtimeControls),
              );
              return;
            }
            case "toggle_mev_arbitrage": {
              const snapshot = runtimeControls.toggleMevArbitrage();
              await bot.sendMessage(
                chatId,
                `⚡ MEV Arbitrage sekarang ${snapshot.mevArbitrage ? "✅ ON" : "❌ OFF"}.`,
                getAutomationMenu(runtimeControls),
              );
              return;
            }
            case "authorization":
              await sendAuthorizationScreen(chatId);
              return;
            case "features":
              await sendFeatureOverviewScreen(chatId);
              return;
            case "bt_single":
              await bot.sendMessage(
                chatId,
                "🎯 Pilih preset strategy untuk menjalankan single backtest:",
                getBacktestStrategyMenu(),
              );
              return;
            case "bt_compare":
              await runBacktestComparison(chatId);
              return;
            case "bt_presets":
              await sendBacktestPresetScreen(chatId);
              return;
            case "wallet_intel":
              await sendWalletIntelScreen(chatId);
              return;
            case "wallet_intel_use_env":
              if (!env.solanaWalletAddress) {
                await bot.sendMessage(
                  chatId,
                  "⚠️ SOLANA_WALLET_ADDRESS belum diisi di environment.",
                  getWalletIntelMenu(),
                );
                return;
              }
              walletIntelStore.setWalletAddress(chatId, env.solanaWalletAddress);
              await bot.sendMessage(
                chatId,
                "✅ Wallet target diambil dari environment.",
                getWalletIntelMenu(),
              );
              await sendWalletIntelScreen(chatId);
              return;
            case "wallet_intel_set_wallet":
              await promptWalletIntelInput(chatId, "wallet_address");
              return;
            case "wallet_intel_set_token":
              await promptWalletIntelInput(chatId, "token_address");
              return;
            case "wallet_intel_run":
              await runWalletIntelAnalysis(chatId);
              return;
            case "wallet_intel_reset":
              walletIntelStore.resetTarget(chatId);
              await bot.sendMessage(
                chatId,
                "🔄 Wallet Intel target di-reset.",
                getWalletIntelMenu(),
              );
              await sendWalletIntelScreen(chatId);
              return;
            case "meteora":
              await sendMeteoraScreen(chatId);
              return;
            case "meteora_sync":
              await bot.answerCallbackQuery(query.id, { text: "Syncing from chain..." });
              try {
                const syncResult = await dlmmService.syncPositions();
                await bot.sendMessage(
                  chatId,
                  `🔄 *Sync Complete*\n\nTotal: ${syncResult.total}\nAdded: ${syncResult.added}\nRemoved: ${syncResult.removed}`,
                  { parse_mode: "Markdown" }
                );
              } catch (error) {
                await bot.sendMessage(chatId, `❌ Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
              }
              return;
            case "meteora_add":
              await bot.sendMessage(chatId, "➕ Kirim pool address Meteora untuk mulai Add LP.");
              return;
            case "meteora_positions": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi Meteora aktif.");
              } else {
                const lines = ["📊 *Meteora Positions*\n"];
                for (const pos of positions) {
                  const shortKey = pos.publicKey.slice(0, 8) + "..." + pos.publicKey.slice(-4);
                  lines.push(
                    `• \`${shortKey}\``,
                    `  Pool: \`${pos.poolAddress.slice(0, 8)}...\``,
                    `  Range: ${pos.minBinId} - ${pos.maxBinId}`,
                    `  Amount: ${pos.solAmount} SOL`,
                    `  Added: ${new Date(pos.addedAt).toLocaleDateString()}`,
                    ""
                  );
                }
                await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "Markdown" });
              }
              return;
            }
            case "meteora_harvest": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk harvest fees.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "💎 *Harvest Fees*\n\nPilih posisi untuk harvest fees:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_harvest_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "meteora_apr": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk lihat APR.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "📈 *APR Tracking*\n\nPilih posisi:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_apr_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "meteora_il": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk hitung IL.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "📉 *IL Calculator*\n\nPilih posisi:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_il_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "meteora_health": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk cek health.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "❤️ *Position Health*\n\nPilih posisi:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_health_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "meteora_bins": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk lihat bins.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "📍 *Bin Visualization*\n\nPilih posisi:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_bins_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "meteora_rebalance": {
              const positions = Object.values((dlmmService as any).config?.positions || {}) as MeteoraPosition[];
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "📭 Tidak ada posisi untuk rebalance.");
              } else {
                await bot.sendMessage(
                  chatId,
                  "🔄 *Rebalance Suggestion*\n\nPilih posisi:",
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: positions.slice(0, 5).map(pos => [{
                        text: `${pos.poolAddress.slice(0, 8)}...`,
                        callback_data: `action:meteora_rebalance_pos:${pos.publicKey}`,
                      }]).concat([[{ text: "⬅️ Back", callback_data: "action:meteora" }]]),
                    },
                  }
                );
              }
              return;
            }
            case "pnl_card":
              await bot.answerCallbackQuery(query.id, { text: "Generating PnL card..." });
              try {
                const buffer = await pnlRenderer.generateCard({
                  pairName: "SOL/USDC",
                  pnlUsd: 125.50,
                  pnlPct: 15.2,
                  depositedUsd: 825.00,
                });
                await bot.sendPhoto(chatId, buffer, { caption: "📈 Prabu-Siliwangi PnL Report" });
              } catch (err) {
                await bot.sendMessage(chatId, "❌ Gagal generate kartu PnL.");
              }
              return;
            case "copytrade":
              await bot.sendMessage(chatId, formatCopyTradeDraft(
                copyTradeStore.getTargetWallet(chatId),
                copyTradeStore.getTokenMint(chatId),
                copyTradeStore.getAmountSol(chatId),
              ), getCopyTradeMenuFromStore(copyTradeStore, chatId));
              return;
            case "copy_set_wallet":
              copyTradeStore.setPendingInput(chatId, "copy_wallet");
              await bot.sendMessage(chatId, "👛 Kirim wallet address yang ingin di-copy:");
              return;
            case "copy_set_token":
              copyTradeStore.setPendingInput(chatId, "copy_token");
              await bot.sendMessage(chatId, "🪙 Kirim token mint address:");
              return;
            case "copy_execute":
              await handleCopyTrade(bot, chatId, rustClient, copyTradeStore);
              return;
            case "copy_bundle":
              await handleCopyBundleSwap(bot, chatId, copyTradeStore);
              return;
            case "copy_status":
              await handleCopySubscription(bot, chatId, rustClient);
              return;
            case "dashboard_refresh":
            case "dashboard_summary":
            case "dashboard_positions":
            case "dashboard_wallets":
            case "dashboard_history": {
              const dashboard = await copyTradeDashboard.getDashboard();

              switch (action) {
                case "dashboard_refresh":
                case "dashboard_summary":
                  await bot.sendMessage(chatId, formatFullDashboard(dashboard), getDashboardMenu());
                  break;
                case "dashboard_positions":
                  await bot.sendMessage(chatId, formatPositionsList(dashboard.positions), getDashboardMenu());
                  break;
                case "dashboard_wallets":
                  const walletMsg = dashboard.wallets.length > 0
                    ? dashboard.wallets.map(w => formatWalletStats(w)).join("\n\n")
                    : "📭 No wallet stats available";
                  await bot.sendMessage(chatId, walletMsg, getDashboardMenu());
                  break;
                case "dashboard_history":
                  await bot.sendMessage(chatId, formatTradeHistory(dashboard.recentTrades), getDashboardMenu());
                  break;
              }
              return;
            }
            case "copy_reset":
              copyTradeStore.clearTrade(chatId);
              await bot.sendMessage(chatId, "🔄 Copy trade draft di-reset.");
              await bot.sendMessage(chatId, formatCopyTradeDraft(null, null, null), getCopyTradeMenuFromStore(copyTradeStore, chatId));
              return;
            case "screening":
              await bot.sendMessage(chatId, formatScreeningMenu(), getScreeningMenu());
              return;
            case "screen_pool":
              screeningPendingInput.set(chatId, true);
              await bot.sendMessage(
                chatId,
                formatScreeningPrompt(""),
                getScreeningMenu()
              );
              return;
            case "screen_history":
              const history = screeningService.getHistory(10);
              await bot.sendMessage(chatId, formatScreeningHistory(history), getScreeningMenu());
              return;
            case "screen_stats":
              const session = screeningService.getSession();
              await bot.sendMessage(chatId, formatScreeningSession(session), getScreeningMenu());
              return;
            case "screen_settings":
              await bot.sendMessage(chatId, "⚙️ Screening Settings", getScreeningSettingsMenu());
              return;
            case "screen_reset_config":
              screeningService.resetSession();
              await bot.sendMessage(chatId, "🔄 Screening session reset.", getScreeningMenu());
              return;
            case "screen_menu":
              await bot.sendMessage(chatId, formatScreeningMenu(), getScreeningMenu());
              return;
            case "execution":
              await bot.sendMessage(chatId, formatExecutionSummary(executionService.getSummary()), getExecutionMenu());
              return;
            case "exec_positions":
              await bot.sendMessage(chatId, formatOpenPositions(executionService.getOpenPositions()), getExecutionMenu());
              return;
            case "exec_history":
              await bot.sendMessage(chatId, formatExecutionHistory(executionService.getExecutionHistory()), getExecutionMenu());
              return;
            case "exec_summary":
              await bot.sendMessage(chatId, formatExecutionSummary(executionService.getSummary()), getExecutionMenu());
              return;
            case "exec_quick_buy":
              await bot.sendMessage(chatId, "📥 Quick Buy\n\nEnter token mint and amount to buy.", getExecutionMenu());
              return;
            case "exec_quick_sell": {
              const positions = executionService.getOpenPositions();
              if (positions.length === 0) {
                await bot.sendMessage(chatId, "❌ No open positions to sell.", getExecutionMenu());
              } else {
                const sellOptions = positions.map(p => ({
                  text: `📤 ${p.tokenSymbol} (${p.amountSol.toFixed(4)} SOL)`,
                  callback_data: `action:exec_sell:${p.id}`,
                }));
                await bot.sendMessage(chatId, "📤 Select position to sell:", {
                  reply_markup: {
                    inline_keyboard: [
                      ...sellOptions.map(o => [o]),
                      [{ text: "⬅️ Back", callback_data: "action:execution" }],
                    ],
                  },
                });
              }
              return;
            }
            case "daily_report":
            case "weekly_report": {
              await bot.sendMessage(chatId, "📊 Report feature coming soon...", getTradingMenu());
              return;
            }
            case "backtest_run":
            case "backtest_ai":
            case "backtest_conservative":
            case "backtest_aggressive": {
              await bot.sendMessage(chatId, "📊 Backtest feature ready!\n\nUse /backtest <token> <days> to run.", getBacktestMenu());
              return;
            }
            case "backtest_compare": {
              await bot.sendMessage(chatId, "📊 Compare strategies feature ready!", getBacktestMenu());
              return;
            }
            case "auto_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(config), getAutoExecuteMenu(config));
              return;
            }
            case "auto_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ enabled: !currentConfig.enabled });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_tp_sl_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "📈 TP/SL Settings\n\nSelect TP or SL percentage:", {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🎯 TP %", callback_data: "action:auto_tp_pct" }],
                    [{ text: "🛡️ SL %", callback_data: "action:auto_sl_pct" }],
                    [{ text: "⬅️ Back", callback_data: "action:auto_menu" }],
                  ],
                },
              });
              return;
            }
            case "auto_tp_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useTrailingTp: !currentConfig.useTrailingTp });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_sl_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useTrailingSl: !currentConfig.useTrailingSl });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_tp_pct": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select Take Profit percentage:", getTpPctMenu(config.fixedTpPct));
              return;
            }
            case "auto_sl_pct": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select Stop Loss percentage:", getSlPctMenu(config.fixedSlPct));
              return;
            }
            case "auto_size": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select position size (% of capital):", getSizeMenu(config.positionSizePct));
              return;
            }
            case "auto_score": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select minimum score to execute:", getScoreMenu(config.minScoreToExecute));
              return;
            }
            case "auto_positions": {
              const positions = autoExecuteService.getPositions();
              await bot.sendMessage(chatId, formatAutoPositions(positions), getAutoExecuteMenu(autoExecuteService.getConfig()));
              return;
            }
            case "auto_ttp_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useTrailingTp: !currentConfig.useTrailingTp });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_tsl_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useTrailingSl: !currentConfig.useTrailingSl });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_ttp_pct": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select Trailing TP callback percentage:", getTrailingTpMenu(config.trailingTp.callbackPct));
              return;
            }
            case "auto_tsl_pct": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "Select Trailing SL offset percentage:", getTrailingSlMenu(config.trailingSl.offsetPct));
              return;
            }
            case "auto_dca_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "💎 DCA Settings", getDcaMenu({
                useDca: config.useDca,
                legs: config.dcaConfig.legs,
                legAmountPct: config.dcaConfig.legAmountPct,
                intervalMinutes: config.dcaConfig.intervalMinutes,
              }));
              return;
            }
            case "auto_dca_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useDca: !currentConfig.useDca });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_dca_legs": {
              const config = autoExecuteService.getConfig();
              const newLegs = config.dcaConfig.legs >= 5 ? 2 : config.dcaConfig.legs + 1;
              autoExecuteService.updateConfig({
                dcaConfig: { ...config.dcaConfig, legs: newLegs }
              });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "💎 DCA Settings", getDcaMenu({
                useDca: newConfig.useDca,
                legs: newConfig.dcaConfig.legs,
                legAmountPct: newConfig.dcaConfig.legAmountPct,
                intervalMinutes: newConfig.dcaConfig.intervalMinutes,
              }));
              return;
            }
            case "auto_dca_interval": {
              const config = autoExecuteService.getConfig();
              const intervals = [1, 5, 10, 15, 30];
              const currentIdx = intervals.indexOf(config.dcaConfig.intervalMinutes);
              const nextIdx = (currentIdx + 1) % intervals.length;
              autoExecuteService.updateConfig({
                dcaConfig: { ...config.dcaConfig, intervalMinutes: intervals[nextIdx] }
              });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "💎 DCA Settings", getDcaMenu({
                useDca: newConfig.useDca,
                legs: newConfig.dcaConfig.legs,
                legAmountPct: newConfig.dcaConfig.legAmountPct,
                intervalMinutes: newConfig.dcaConfig.intervalMinutes,
              }));
              return;
            }
            case "auto_time_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "⏱️ Time Exit Settings", getTimeExitMenu({
                useTimeExit: config.useTimeExit,
                maxHours: config.timeExitConfig.maxHours,
                warningBeforeHours: config.timeExitConfig.warningBeforeHours,
              }));
              return;
            }
            case "auto_time_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useTimeExit: !currentConfig.useTimeExit });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_liq_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "💧 Liquidity Check Settings", getLiquidityMenu({
                useLiquidityCheck: config.useLiquidityCheck,
                minLiquiditySol: config.liquidityConfig.minLiquiditySol,
              }));
              return;
            }
            case "auto_liq_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useLiquidityCheck: !currentConfig.useLiquidityCheck });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_risk_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "📐 Risk Calculator Settings", getRiskMenu({
                useRiskCalculator: config.useRiskCalculator,
                riskPerTradePct: config.riskConfig.riskPerTradePct,
              }));
              return;
            }
            case "auto_risk_toggle": {
              const currentConfig = autoExecuteService.getConfig();
              autoExecuteService.updateConfig({ useRiskCalculator: !currentConfig.useRiskCalculator });
              const newConfig = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, formatAutoExecuteStatus(newConfig), getAutoExecuteMenu(newConfig));
              return;
            }
            case "auto_limits_menu": {
              const config = autoExecuteService.getConfig();
              await bot.sendMessage(chatId, "🚫 Trading Limits", getLimitsMenu({
                maxPerToken: config.tradingLimits.maxPerToken,
                maxDailyTradesPerToken: config.tradingLimits.maxDailyTradesPerToken,
                cooldownMinutes: config.tradingLimits.cooldownMinutes,
              }));
              return;
            }
            case "auto_health": {
              const positionsWithHealth = autoExecuteService.getPositionsWithHealth();
              await bot.sendMessage(chatId, formatPositionHealth(positionsWithHealth), getAutoExecuteMenu(autoExecuteService.getConfig()));
              return;
            }
            default: {
              if (action.startsWith("auto_tp_set:")) {
                const pct = parseInt(action.replace("auto_tp_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({ fixedTpPct: pct });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Take Profit set to ${pct}%`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_sl_set:")) {
                const pct = parseInt(action.replace("auto_sl_set:", ""));
                autoExecuteService.updateConfig({ fixedSlPct: pct });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Stop Loss set to ${pct}%`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_size_set:")) {
                const pct = parseInt(action.replace("auto_size_set:", ""));
                autoExecuteService.updateConfig({ positionSizePct: pct });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Position size set to ${pct}%`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_score_set:")) {
                const score = parseInt(action.replace("auto_score_set:", ""));
                autoExecuteService.updateConfig({ minScoreToExecute: score });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Min score set to ${score}`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_ttp_set:")) {
                const pct = parseInt(action.replace("auto_ttp_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  trailingTp: { ...config.trailingTp, callbackPct: pct }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Trailing TP callback set to ${pct}%`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_tsl_set:")) {
                const pct = parseInt(action.replace("auto_tsl_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  trailingSl: { ...config.trailingSl, offsetPct: pct }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Trailing SL offset set to ${pct}%`, getAutoExecuteMenu(newConfig));
                return;
              }
              if (action.startsWith("auto_time_set:")) {
                const hours = parseInt(action.replace("auto_time_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  timeExitConfig: { ...config.timeExitConfig, maxHours: hours }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Time Exit set to ${hours}h`, getTimeExitMenu({
                  useTimeExit: newConfig.useTimeExit,
                  maxHours: newConfig.timeExitConfig.maxHours,
                  warningBeforeHours: newConfig.timeExitConfig.warningBeforeHours,
                }));
                return;
              }
              if (action.startsWith("auto_liq_set:")) {
                const minLiq = parseInt(action.replace("auto_liq_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  liquidityConfig: { ...config.liquidityConfig, minLiquiditySol: minLiq }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Min liquidity set to ${minLiq} SOL`, getLiquidityMenu({
                  useLiquidityCheck: newConfig.useLiquidityCheck,
                  minLiquiditySol: newConfig.liquidityConfig.minLiquiditySol,
                }));
                return;
              }
              if (action.startsWith("auto_risk_set:")) {
                const riskPct = parseInt(action.replace("auto_risk_set:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  riskConfig: { ...config.riskConfig, riskPerTradePct: riskPct }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Risk per trade set to ${riskPct}%`, getRiskMenu({
                  useRiskCalculator: newConfig.useRiskCalculator,
                  riskPerTradePct: newConfig.riskConfig.riskPerTradePct,
                }));
                return;
              }
              if (action.startsWith("auto_limit_max_token:")) {
                const maxToken = parseInt(action.replace("auto_limit_max_token:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  tradingLimits: { ...config.tradingLimits, maxPerToken: maxToken }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Max per token set to ${maxToken}`, getLimitsMenu({
                  maxPerToken: newConfig.tradingLimits.maxPerToken,
                  maxDailyTradesPerToken: newConfig.tradingLimits.maxDailyTradesPerToken,
                  cooldownMinutes: newConfig.tradingLimits.cooldownMinutes,
                }));
                return;
              }
              if (action.startsWith("auto_limit_daily:")) {
                const dailyLimit = parseInt(action.replace("auto_limit_daily:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  tradingLimits: { ...config.tradingLimits, maxDailyTradesPerToken: dailyLimit }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Daily limit set to ${dailyLimit}`, getLimitsMenu({
                  maxPerToken: newConfig.tradingLimits.maxPerToken,
                  maxDailyTradesPerToken: newConfig.tradingLimits.maxDailyTradesPerToken,
                  cooldownMinutes: newConfig.tradingLimits.cooldownMinutes,
                }));
                return;
              }
              if (action.startsWith("auto_limit_cooldown:")) {
                const cooldown = parseInt(action.replace("auto_limit_cooldown:", ""));
                const config = autoExecuteService.getConfig();
                autoExecuteService.updateConfig({
                  tradingLimits: { ...config.tradingLimits, cooldownMinutes: cooldown }
                });
                const newConfig = autoExecuteService.getConfig();
                await bot.sendMessage(chatId, `✅ Cooldown set to ${cooldown}min`, getLimitsMenu({
                  maxPerToken: newConfig.tradingLimits.maxPerToken,
                  maxDailyTradesPerToken: newConfig.tradingLimits.maxDailyTradesPerToken,
                  cooldownMinutes: newConfig.tradingLimits.cooldownMinutes,
                }));
                return;
              }
              if (action.startsWith("meteora_harvest_pos:")) {
                const positionKey = action.replace("meteora_harvest_pos:", "");
                try {
                  const result = await (dlmmService as any).harvestFees(positionKey);
                  if (result.success) {
                    await bot.sendMessage(chatId, `✅ Fees harvested!\nSignature: ${result.signature}`, getMeteoraMenu());
                  } else {
                    await bot.sendMessage(chatId, `❌ Harvest failed: ${result.error}`, getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              if (action.startsWith("meteora_apr_pos:")) {
                const positionKey = action.replace("meteora_apr_pos:", "");
                try {
                  const positions = (dlmmService as any).config?.positions || {};
                  const pos = positions[positionKey];
                  if (pos) {
                    const apr = await (dlmmService as any).calculateAPR(pos.poolAddress, positionKey);
                    await bot.sendMessage(chatId, (dlmmService as any).formatAPR(apr), { parse_mode: "Markdown", ...getMeteoraMenu() });
                  } else {
                    await bot.sendMessage(chatId, "❌ Position not found", getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              if (action.startsWith("meteora_il_pos:")) {
                const positionKey = action.replace("meteora_il_pos:", "");
                try {
                  const il = await (dlmmService as any).calculateIL(positionKey);
                  if (il) {
                    await bot.sendMessage(chatId, (dlmmService as any).formatIL(il), { parse_mode: "Markdown", ...getMeteoraMenu() });
                  } else {
                    await bot.sendMessage(chatId, "❌ Position not found", getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              if (action.startsWith("meteora_health_pos:")) {
                const positionKey = action.replace("meteora_health_pos:", "");
                try {
                  const health = await (dlmmService as any).getPositionHealth(positionKey);
                  if (health) {
                    await bot.sendMessage(chatId, (dlmmService as any).formatPositionHealth(health), { parse_mode: "Markdown", ...getMeteoraMenu() });
                  } else {
                    await bot.sendMessage(chatId, "❌ Position not found", getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              if (action.startsWith("meteora_bins_pos:")) {
                const positionKey = action.replace("meteora_bins_pos:", "");
                try {
                  const positions = (dlmmService as any).config?.positions || {};
                  const pos = positions[positionKey];
                  if (pos) {
                    const vis = await (dlmmService as any).getBinVisualization(pos.poolAddress, positionKey);
                    await bot.sendMessage(chatId, (dlmmService as any).formatBinVisualization(vis), { parse_mode: "Markdown", ...getMeteoraMenu() });
                  } else {
                    await bot.sendMessage(chatId, "❌ Position not found", getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              if (action.startsWith("meteora_rebalance_pos:")) {
                const positionKey = action.replace("meteora_rebalance_pos:", "");
                try {
                  const suggestion = await (dlmmService as any).suggestRebalance(positionKey);
                  if (suggestion) {
                    await bot.sendMessage(chatId, (dlmmService as any).formatRebalanceSuggestion(suggestion), { parse_mode: "Markdown", ...getMeteoraMenu() });
                  } else {
                    await bot.sendMessage(chatId, "❌ Position not found", getMeteoraMenu());
                  }
                } catch (error) {
                  await bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : "Unknown"}`, getMeteoraMenu());
                }
                return;
              }
              await bot.sendMessage(
                chatId,
                renderActionMessage(action),
                getMainMenu(),
              );
              return;
            }
          }
        }

        await bot.answerCallbackQuery(query.id, {
          text: "Action belum tersedia",
        });
      });

      logger.info("Telegram gateway aktif dengan button-based menu.");
    },

    integrateWorkers(workers) {
      if (!botInstance) {
        logger.warn("Cannot integrate workers: Telegram bot not started");
        return;
      }

      const chatId = env.chatId ? parseInt(env.chatId, 10) : null;

      if (!chatId) {
        logger.warn("Cannot integrate workers: No chatId configured");
        return;
      }

      if (workers.screening) {
        workers.screening.setAutoExecuteCallback(async (pool) => {
          const summary = autoExecuteService.getSummary();

          if (!summary.enabled) {
            logger.info("Auto-execute disabled, skipping");
            return;
          }

          const canExecute = await autoExecuteService.shouldExecute(pool);
          if (!canExecute.canExecute) {
            logger.info(`Auto-execute check failed: ${canExecute.reasons.join(", ")}`);
            return;
          }

          const result = await autoExecuteService.execute(pool);
          if (result.success) {
            logger.info(`Auto-executed ${pool.poolData.tokenYSymbol}, position: ${result.positionId}`);
            if (botInstance && chatId) {
              botInstance.sendMessage(chatId,
                `⚡ *Auto Execute*\n\n` +
                `Token: ${pool.poolData.tokenYSymbol}\n` +
                `Score: ${pool.score}\n` +
                `Amount: ${result.amountSol} SOL\n` +
                `Position ID: ${result.positionId}`
              );
            }
          } else {
            logger.warn(`Auto-execute failed: ${result.error}`);
          }
        });
      }

      const { integrateAllWorkers } = require("../modules/notifications/integration");
      integrateAllWorkers(workers, botInstance, {
        chatId,
        preferences: {
          alerts: {
            screening: config.features.meteora,
            positionAlerts: config.features.copytrade,
            healthIssues: true,
            emergencyOnly: false,
          },
          minScreeningScore: 75,
        },
      });

      logger.info("Workers integrated with Telegram notifications");
    },
  };
}
