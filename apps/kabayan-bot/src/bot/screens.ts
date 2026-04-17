import { AppConfig, EnvConfig } from "../domain/types";

export interface RuntimeSnapshot {
  appName: string;
  appVersion: string;
  walletAddress?: string;
  balanceSol?: number;
  aiConfigured: boolean;
  rustEngineOk: boolean;
  schedulerActive: boolean;
  startedAt?: string;
}

export interface FeatureStatusSnapshot {
  paperMode: boolean;
  aiSniper: boolean;
  mevSandwich: boolean;
  mevArbitrage: boolean;
  walletIntel: boolean;
  meteora: boolean;
  pnl: boolean;
  copytrade: boolean;
}

export interface MeteoraScreeningSnapshot {
  minTvl: number;
  maxTvl: number;
  minVolume: number;
  minOrganic: number;
  minHolders: number;
  minMcap: number;
  maxMcap: number;
  minBinStep: number;
  maxBinStep: number;
  category: string;
  timeframe: string;
  blockedLaunchpads: string[];
}

export interface PlaceholderActionView {
  title: string;
  summary: string;
  nextStep?: string;
}

function formatBool(value: boolean, on = "✅ ON", off = "❌ OFF"): string {
  return value ? on : off;
}

function formatOptionalValue(
  value: string | number | undefined,
  fallback = "-",
): string {
  if (value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatSol(value?: number): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(4)} SOL`;
}

function formatList(items: string[], emptyLabel = "-"): string {
  if (items.length === 0) {
    return emptyLabel;
  }

  return items.join(", ");
}

export function formatMainMenuScreen(
  runtime: RuntimeSnapshot,
  features: FeatureStatusSnapshot,
): string {
  return [
    `👑 ${runtime.appName} ${runtime.appVersion}`,
    "",
    "Control center utama siap.",
    "Gunakan tombol di bawah untuk semua navigasi dan aksi utama.",
    "",
    "📦 Runtime",
    `• Wallet: ${formatOptionalValue(runtime.walletAddress, "Belum terhubung")}`,
    `• Balance: ${formatSol(runtime.balanceSol)}`,
    `• AI Router: ${formatBool(runtime.aiConfigured, "✅ Ready", "⚠️ Not Ready")}`,
    `• Rust Engine: ${formatBool(runtime.rustEngineOk, "✅ Reachable", "⚠️ Placeholder")}`,
    `• Scheduler: ${formatBool(runtime.schedulerActive)}`,
    "",
    "⚙️ Feature Flags",
    `• AI Sniper: ${formatBool(features.aiSniper)}`,
    `• Paper Mode: ${formatBool(features.paperMode)}`,
    `• Wallet Intel: ${formatBool(features.walletIntel)}`,
    `• Meteora: ${formatBool(features.meteora)}`,
    `• PnL: ${formatBool(features.pnl)}`,
    `• Copytrade: ${formatBool(features.copytrade)}`,
    `• MEV Sandwich: ${formatBool(features.mevSandwich)}`,
    `• MEV Arbitrage: ${formatBool(features.mevArbitrage)}`,
  ].join("\n");
}

export function formatStatusScreen(
  runtime: RuntimeSnapshot,
  env: EnvConfig,
  config: AppConfig,
  features: FeatureStatusSnapshot,
): string {
  return [
    "📊 SYSTEM STATUS",
    "",
    "Runtime",
    `• Environment: ${env.nodeEnv}`,
    `• Port: ${env.port}`,
    `• Started At: ${formatOptionalValue(runtime.startedAt, "-")}`,
    `• Scheduler Active: ${formatBool(runtime.schedulerActive)}`,
    "",
    "Connectivity",
    `• AI Provider: ${config.ai.provider}`,
    `• AI Configured: ${formatBool(runtime.aiConfigured, "✅ Yes", "❌ No")}`,
    `• Rust Copy Engine: ${formatBool(runtime.rustEngineOk, "✅ Reachable", "⚠️ Placeholder")}`,
    `• Helius Key: ${formatBool(Boolean(env.heliusApiKey), "✅ Set", "❌ Missing")}`,
    `• Telegram Token: ${formatBool(Boolean(env.telegramBotToken), "✅ Set", "❌ Missing")}`,
    "",
    "Feature Status",
    `• Wallet Intel: ${formatBool(features.walletIntel)}`,
    `• Meteora: ${formatBool(features.meteora)}`,
    `• PnL: ${formatBool(features.pnl)}`,
    `• Copytrade: ${formatBool(features.copytrade)}`,
    `• Paper Mode: ${formatBool(features.paperMode)}`,
    `• AI Sniper: ${formatBool(features.aiSniper)}`,
    `• Sandwich: ${formatBool(features.mevSandwich)}`,
    `• Arbitrage: ${formatBool(features.mevArbitrage)}`,
  ].join("\n");
}

export function formatSettingsScreen(
  env: EnvConfig,
  config: AppConfig,
  features: FeatureStatusSnapshot,
  notificationPrefs?: {
    screening: boolean;
    positionAlerts: boolean;
    healthIssues: boolean;
    emergencyOnly: boolean;
  },
): string {
  return [
    "⚙️ SETTINGS",
    "",
    "General",
    `• Log Level: ${env.logLevel}`,
    `• Chat Lock: ${formatBool(Boolean(env.chatId), "✅ Restricted", "⚠️ Open")}`,
    `• Daily Report Chat: ${formatOptionalValue(env.dailyReportChatId, "Not Set")}`,
    "",
    "Notifications",
    `• Screening Alerts: ${formatBool(notificationPrefs?.screening ?? true)}`,
    `• Position Alerts: ${formatBool(notificationPrefs?.positionAlerts ?? true)}`,
    `• Health Alerts: ${formatBool(notificationPrefs?.healthIssues ?? true)}`,
    `• Emergency Only: ${formatBool(notificationPrefs?.emergencyOnly ?? false)}`,
    "",
    "Risk",
    `• Daily Capital: ${config.risk.dailyCapital} SOL`,
    `• Deploy Amount: ${config.risk.deployAmountSol} SOL`,
    `• Position Size: ${(config.risk.positionSizePct * 100).toFixed(0)}%`,
    `• Max Deploy: ${config.risk.maxDeployAmount} SOL`,
    `• Gas Reserve: ${config.risk.gasReserve} SOL`,
    `• Min SOL To Open: ${config.risk.minSolToOpen} SOL`,
    `• Stop Loss: ${config.risk.stopLossPct}%`,
    "",
    "Modes",
    `• Paper Mode: ${formatBool(features.paperMode)}`,
    `• AI Sniper: ${formatBool(features.aiSniper)}`,
    `• Copytrade: ${formatBool(features.copytrade)}`,
    `• MEV Sandwich: ${formatBool(features.mevSandwich)}`,
    `• MEV Arbitrage: ${formatBool(features.mevArbitrage)}`,
  ].join("\n");
}

export function formatAiScreen(
  runtime: RuntimeSnapshot,
  config: AppConfig,
): string {
  return [
    "🤖 AI CONTROL",
    "",
    `• Provider: ${config.ai.provider}`,
    `• Configured: ${formatBool(runtime.aiConfigured, "✅ Yes", "❌ No")}`,
    `• Base URL: ${config.ai.baseUrl}`,
    `• Timeout: ${config.ai.timeoutMs} ms`,
    `• Retry Count: ${config.ai.retryCount}`,
    "",
    "Models",
    `• Screening: ${config.ai.models.screeningModel}`,
    `• Management: ${config.ai.models.managementModel}`,
    `• General: ${config.ai.models.generalModel}`,
    "",
    "Peran AI di sistem ini:",
    "• scoring kandidat",
    "• ranking peluang",
    "• reasoning management",
    "• ringkasan dan explanation",
    "",
    "AI tidak menjadi final authority untuk execution.",
  ].join("\n");
}

export function formatMeteoraScreen(
  config: AppConfig,
  screening?: Partial<MeteoraScreeningSnapshot>,
): string {
  const active = {
    minTvl: screening?.minTvl ?? config.meteora.screening.minTvl,
    maxTvl: screening?.maxTvl ?? config.meteora.screening.maxTvl,
    minVolume: screening?.minVolume ?? config.meteora.screening.minVolume,
    minOrganic: screening?.minOrganic ?? config.meteora.screening.minOrganic,
    minHolders: screening?.minHolders ?? config.meteora.screening.minHolders,
    minMcap: screening?.minMcap ?? config.meteora.screening.minMcap,
    maxMcap: screening?.maxMcap ?? config.meteora.screening.maxMcap,
    minBinStep: screening?.minBinStep ?? config.meteora.screening.minBinStep,
    maxBinStep: screening?.maxBinStep ?? config.meteora.screening.maxBinStep,
    category: screening?.category ?? config.meteora.screening.category,
    timeframe: screening?.timeframe ?? config.meteora.screening.timeframe,
    blockedLaunchpads:
      screening?.blockedLaunchpads ?? config.meteora.screening.blockedLaunchpads,
  };

  return [
    "🌊 METEORA MODULE",
    "",
    "Screening Rules",
    `• TVL: ${active.minTvl} - ${active.maxTvl} USD`,
    `• Min Volume: ${active.minVolume}`,
    `• Min Organic: ${active.minOrganic}`,
    `• Min Holders: ${active.minHolders}`,
    `• Market Cap: ${active.minMcap} - ${active.maxMcap} USD`,
    `• Bin Step: ${active.minBinStep} - ${active.maxBinStep}`,
    `• Category: ${active.category}`,
    `• Timeframe: ${active.timeframe}`,
    `• Blocked Launchpads: ${formatList(active.blockedLaunchpads)}`,
    "",
    "Management Rules",
    `• Deploy Amount: ${config.meteora.management.deployAmountSol} SOL`,
    `• Position Size: ${(config.meteora.management.positionSizePct * 100).toFixed(0)}%`,
    `• Max Deploy: ${config.meteora.management.maxDeployAmount} SOL`,
    `• Gas Reserve: ${config.meteora.management.gasReserve} SOL`,
    `• Min SOL To Open: ${config.meteora.management.minSolToOpen} SOL`,
    `• OOR Wait: ${config.meteora.management.outOfRangeWaitMinutes} min`,
    `• Stop Loss: ${config.meteora.management.stopLossPct}%`,
  ].join("\n");
}

export function formatFeatureOverviewScreen(
  features: FeatureStatusSnapshot,
): string {
  return [
    "🧭 FEATURE OVERVIEW",
    "",
    `• Wallet Intel: ${formatBool(features.walletIntel)}`,
    `• Meteora: ${formatBool(features.meteora)}`,
    `• PnL: ${formatBool(features.pnl)}`,
    `• Copytrade: ${formatBool(features.copytrade)}`,
    `• Paper Mode: ${formatBool(features.paperMode)}`,
    `• AI Sniper: ${formatBool(features.aiSniper)}`,
    `• MEV Sandwich: ${formatBool(features.mevSandwich)}`,
    `• MEV Arbitrage: ${formatBool(features.mevArbitrage)}`,
    "",
    "Semua fitur utama akan diakses lewat button, bukan command teks.",
  ].join("\n");
}

export function formatPlaceholderActionScreen(
  view: PlaceholderActionView,
): string {
  return [
    `🧩 ${view.title.toUpperCase()}`,
    "",
    view.summary,
    "",
    `Next Step: ${formatOptionalValue(view.nextStep, "Modul akan dihubungkan pada tahap migrasi berikutnya.")}`,
  ].join("\n");
}

export function formatHealthPlaceholderScreen(
  runtime: RuntimeSnapshot,
): string {
  return [
    "🩺 HEALTH CHECK",
    "",
    `• AI Router: ${formatBool(runtime.aiConfigured, "✅ Ready", "⚠️ Not Ready")}`,
    `• Rust Engine: ${formatBool(runtime.rustEngineOk, "✅ Reachable", "⚠️ Placeholder")}`,
    `• Scheduler: ${formatBool(runtime.schedulerActive)}`,
    `• Started At: ${formatOptionalValue(runtime.startedAt, "-")}`,
    "",
    "Detail health system penuh akan dihubungkan setelah module integration selesai.",
  ].join("\n");
}
