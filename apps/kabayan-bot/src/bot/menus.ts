import TelegramBot from "node-telegram-bot-api";
import { AppConfig } from "../domain/types";

export type InlineKeyboardMarkup = TelegramBot.InlineKeyboardMarkup;
export type InlineKeyboardButton = TelegramBot.InlineKeyboardButton;

export const CALLBACKS = {
  MAIN_MENU: "main_menu",
  TRADING_MENU: "trading_menu",
  STATUS_MENU: "status_menu",
  SETTINGS_MENU: "settings_menu",
  AI_MENU: "ai_menu",
  WALLET_MENU: "wallet_menu",
  METEORA_MENU: "meteora_menu",
  COPYTRADE_MENU: "copytrade_menu",
  BACKTEST_MENU: "backtest_menu",
  PNL_MENU: "pnl_menu",
  HEALTH_MENU: "health_menu",
  REPORTS_MENU: "reports_menu",
  HELP_MENU: "help_menu",

  REFRESH_HOME: "refresh_home",
  REFRESH_STATUS: "refresh_status",
  REFRESH_HEALTH: "refresh_health",

  BUY_MANUAL: "buy_manual",
  SELL_MANUAL: "sell_manual",
  PORTFOLIO: "portfolio",
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",

  AI_STATUS: "ai_status",
  AI_SCREENING: "ai_screening",
  AI_MANAGEMENT: "ai_management",
  AI_GENERAL: "ai_general",

  SNIPER_SETTINGS: "sniper_settings",
  TOGGLE_COPYTRADE: "toggle_copytrade",
  TOGGLE_MEV: "toggle_mev",
  TOGGLE_METEORA: "toggle_meteora",
  TOGGLE_WALLET_INTEL: "toggle_wallet_intel",
  TOGGLE_PNL: "toggle_pnl",

  WALLET_OVERVIEW: "wallet_overview",
  WALLET_INTEL: "wallet_intel",
  ALPHA_WALLETS: "alpha_wallets",

  METEORA_SCREENING: "meteora_screening",
  METEORA_POSITIONS: "meteora_positions",
  METEORA_PRESETS: "meteora_presets",

  COPYTRADE_STATUS: "copytrade_status",
  COPYTRADE_TARGETS: "copytrade_targets",
  COPYTRADE_POLICY: "copytrade_policy",

  BACKTEST_SINGLE: "bt_single",
  BACKTEST_COMPARE: "bt_compare",
  BACKTEST_PRESETS: "bt_presets",
  BACKTEST_CUSTOM: "bt_custom",
  BACKTEST_RUN_CONSERVATIVE: "bt_run:conservative",
  BACKTEST_RUN_BALANCED: "bt_run:balanced",
  BACKTEST_RUN_AGGRESSIVE: "bt_run:aggressive",
  BACKTEST_RUN_SNIPER: "bt_run:sniper",
  BACKTEST_RUN_DIAMOND_HANDS: "bt_run:diamond_hands",

  PNL_SUMMARY: "pnl_summary",
  PNL_CARD: "pnl_card",
  PNL_GIF: "pnl_gif",

  HEALTH_CHECK: "health_check",
  REPORT_DAILY: "report_daily",
  REPORT_WEEKLY: "report_weekly",

  HELP_OVERVIEW: "help_overview",
} as const;

export type CallbackKey = (typeof CALLBACKS)[keyof typeof CALLBACKS];

export interface HomeMenuContext {
  walletLabel?: string;
  balanceLabel?: string;
  copytradeEnabled?: boolean;
  meteoraEnabled?: boolean;
  walletIntelEnabled?: boolean;
  pnlEnabled?: boolean;
}

function btn(text: string, callback_data: string): InlineKeyboardButton {
  return { text, callback_data };
}

function markup(
  inline_keyboard: InlineKeyboardButton[][],
): { reply_markup: InlineKeyboardMarkup } {
  return {
    reply_markup: {
      inline_keyboard,
    },
  };
}

function featureState(enabled: boolean | undefined): string {
  return enabled ? "✅" : "❌";
}

function boolFromConfig(value: boolean | undefined, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value;
}

export function buildHomeMenu(
  config: AppConfig,
  context: HomeMenuContext = {},
): { reply_markup: InlineKeyboardMarkup } {
  const walletIntelEnabled = boolFromConfig(
    context.walletIntelEnabled,
    config.features.walletIntel,
  );
  const meteoraEnabled = boolFromConfig(
    context.meteoraEnabled,
    config.features.meteora,
  );
  const pnlEnabled = boolFromConfig(context.pnlEnabled, config.features.pnl);
  const copytradeEnabled = boolFromConfig(
    context.copytradeEnabled,
    config.features.copytrade || config.copytrade.enabled,
  );

  return markup([
    [btn("📊 Dashboard", CALLBACKS.STATUS_MENU)],
    [btn("💼 Trading", CALLBACKS.TRADING_MENU)],
    [btn("🤖 AI", CALLBACKS.AI_MENU)],
    [btn(`🏦 Wallet Intel ${featureState(walletIntelEnabled)}`, CALLBACKS.WALLET_MENU)],
    [btn(`🌊 Meteora ${featureState(meteoraEnabled)}`, CALLBACKS.METEORA_MENU)],
    [btn(`🪞 Copytrade ${featureState(copytradeEnabled)}`, CALLBACKS.COPYTRADE_MENU)],
    [btn(`📈 PnL ${featureState(pnlEnabled)}`, CALLBACKS.PNL_MENU)],
    [btn("🧪 Backtest", CALLBACKS.BACKTEST_MENU)],
    [btn("⚙️ Settings", CALLBACKS.SETTINGS_MENU)],
    [
      btn("🩺 Health", CALLBACKS.HEALTH_MENU),
      btn("📄 Reports", CALLBACKS.REPORTS_MENU),
    ],
    [btn("❓ Help", CALLBACKS.HELP_MENU)],
  ]);
}

export function buildTradingMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("📥 Buy Manual", CALLBACKS.BUY_MANUAL)],
    [btn("📤 Sell Manual", CALLBACKS.SELL_MANUAL)],
    [btn("💼 Portfolio", CALLBACKS.PORTFOLIO)],
    [
      btn("💰 Deposit", CALLBACKS.DEPOSIT),
      btn("🏧 Withdraw", CALLBACKS.WITHDRAW),
    ],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildStatusMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("🔄 Refresh Status", CALLBACKS.REFRESH_STATUS)],
    [btn("💼 Trading", CALLBACKS.TRADING_MENU)],
    [btn("🤖 AI", CALLBACKS.AI_MENU)],
    [btn("🩺 Health", CALLBACKS.HEALTH_MENU)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildAiMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("🤖 AI Status", CALLBACKS.AI_STATUS)],
    [btn("🧠 Screening Model", CALLBACKS.AI_SCREENING)],
    [btn("📈 Management Model", CALLBACKS.AI_MANAGEMENT)],
    [btn("💬 General Assistant", CALLBACKS.AI_GENERAL)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildWalletMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("👛 Wallet Overview", CALLBACKS.WALLET_OVERVIEW)],
    [btn("🕵️ Wallet Intelligence", CALLBACKS.WALLET_INTEL)],
    [btn("⭐ Alpha Wallets", CALLBACKS.ALPHA_WALLETS)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildMeteoraMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("🔎 Pool Screening", CALLBACKS.METEORA_SCREENING)],
    [btn("📦 Active Positions", CALLBACKS.METEORA_POSITIONS)],
    [btn("🧰 Presets", CALLBACKS.METEORA_PRESETS)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildCopytradeMenu(
  enabled: boolean,
): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [
      btn(
        `${enabled ? "🛑 Disable" : "✅ Enable"} Copytrade`,
        CALLBACKS.TOGGLE_COPYTRADE,
      ),
    ],
    [btn("📡 Copytrade Status", CALLBACKS.COPYTRADE_STATUS)],
    [btn("🎯 Target Wallets", CALLBACKS.COPYTRADE_TARGETS)],
    [btn("📐 Policy", CALLBACKS.COPYTRADE_POLICY)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildPnlMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("📈 PnL Summary", CALLBACKS.PNL_SUMMARY)],
    [btn("🖼️ PnL Card", CALLBACKS.PNL_CARD)],
    // TODO: Add GIF generator later
    // [btn("🎞️ PnL GIF", CALLBACKS.PNL_GIF)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildBacktestMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("🎯 Single Strategy", CALLBACKS.BACKTEST_SINGLE)],
    [btn("⚖️ Compare All", CALLBACKS.BACKTEST_COMPARE)],
    [btn("👁️ View Presets", CALLBACKS.BACKTEST_PRESETS)],
    [btn("🔧 Custom Config", CALLBACKS.BACKTEST_CUSTOM)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildBacktestStrategyMenu(): {
  reply_markup: InlineKeyboardMarkup;
} {
  return markup([
    [btn("Conservative", CALLBACKS.BACKTEST_RUN_CONSERVATIVE)],
    [btn("Balanced", CALLBACKS.BACKTEST_RUN_BALANCED)],
    [btn("Aggressive", CALLBACKS.BACKTEST_RUN_AGGRESSIVE)],
    [btn("Sniper", CALLBACKS.BACKTEST_RUN_SNIPER)],
    [btn("Diamond Hands", CALLBACKS.BACKTEST_RUN_DIAMOND_HANDS)],
    [btn("⬅️ Back", CALLBACKS.BACKTEST_MENU)],
  ]);
}

export function buildSettingsMenu(
  config: AppConfig,
): { reply_markup: InlineKeyboardMarkup } {
  const copytradeEnabled = config.features.copytrade || config.copytrade.enabled;

  return markup([
    [btn("⚙️ Sniper Settings", CALLBACKS.SNIPER_SETTINGS)],
    [
      btn(
        `${copytradeEnabled ? "🛑" : "✅"} Toggle Copytrade`,
        CALLBACKS.TOGGLE_COPYTRADE,
      ),
    ],
    [btn("🔁 Toggle Meteora", CALLBACKS.TOGGLE_METEORA)],
    [btn("🕵️ Toggle Wallet Intel", CALLBACKS.TOGGLE_WALLET_INTEL)],
    [btn("📈 Toggle PnL", CALLBACKS.TOGGLE_PNL)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildHealthMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("🩺 Run Health Check", CALLBACKS.HEALTH_CHECK)],
    [btn("🔄 Refresh", CALLBACKS.REFRESH_HEALTH)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildReportsMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("📄 Daily Report", CALLBACKS.REPORT_DAILY)],
    [btn("🗓️ Weekly Report", CALLBACKS.REPORT_WEEKLY)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function buildHelpMenu(): { reply_markup: InlineKeyboardMarkup } {
  return markup([
    [btn("📘 Button Guide", CALLBACKS.HELP_OVERVIEW)],
    [btn("⬅️ Back", CALLBACKS.MAIN_MENU)],
  ]);
}

export function getMenuByCallback(
  callback: string,
  config: AppConfig,
): { reply_markup: InlineKeyboardMarkup } | null {
  switch (callback) {
    case CALLBACKS.MAIN_MENU:
    case CALLBACKS.REFRESH_HOME:
      return buildHomeMenu(config);
    case CALLBACKS.TRADING_MENU:
      return buildTradingMenu();
    case CALLBACKS.STATUS_MENU:
    case CALLBACKS.REFRESH_STATUS:
      return buildStatusMenu();
    case CALLBACKS.AI_MENU:
      return buildAiMenu();
    case CALLBACKS.WALLET_MENU:
      return buildWalletMenu();
    case CALLBACKS.METEORA_MENU:
      return buildMeteoraMenu();
    case CALLBACKS.COPYTRADE_MENU:
      return buildCopytradeMenu(config.features.copytrade || config.copytrade.enabled);
    case CALLBACKS.PNL_MENU:
      return buildPnlMenu();
    case CALLBACKS.BACKTEST_MENU:
      return buildBacktestMenu();
    case CALLBACKS.BACKTEST_SINGLE:
      return buildBacktestStrategyMenu();
    case CALLBACKS.SETTINGS_MENU:
      return buildSettingsMenu(config);
    case CALLBACKS.HEALTH_MENU:
    case CALLBACKS.REFRESH_HEALTH:
      return buildHealthMenu();
    case CALLBACKS.REPORTS_MENU:
      return buildReportsMenu();
    case CALLBACKS.HELP_MENU:
      return buildHelpMenu();
    default:
      return null;
  }
}
