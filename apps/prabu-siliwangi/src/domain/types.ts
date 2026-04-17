export type AIProvider = "openrouter" | "openai" | "groq";

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  telegramBotToken: string;
  chatId?: string;
  dailyReportChatId?: string;
  solanaWalletAddress?: string;
  solanaPrivateKey?: string;
  heliusApiKey?: string;
  jitoApiKey?: string;
  aiProvider: AIProvider;
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  openRouterAppName?: string;
  openRouterSiteUrl?: string;
  rustCopyEngineUrl: string;
  rustApiKey: string;
  databaseUrl?: string;
  sqlitePath?: string;
  logLevel: string;
  mevEnabled: boolean;
  copytradeEnabled: boolean;
  walletIntelEnabled: boolean;
  meteoraEnabled: boolean;
  pnlEnabled: boolean;
  encryptionKey: string;
}

export interface FeatureFlags {
  walletIntel: boolean;
  meteora: boolean;
  pnl: boolean;
  copytrade: boolean;
}

export interface AIModelsConfig {
  screeningModel: string;
  managementModel: string;
  generalModel: string;
}

export interface AIConfig {
  provider: AIProvider;
  baseUrl: string;
  timeoutMs: number;
  retryCount: number;
  models: AIModelsConfig;
}

export interface RiskConfig {
  dailyCapital: number;
  deployAmountSol: number;
  positionSizePct: number;
  maxDeployAmount: number;
  gasReserve: number;
  minSolToOpen: number;
  stopLossPct: number;
}

export interface MeteoraScreeningConfig {
  minFeeActiveTvlRatio: number;
  minTvl: number;
  maxTvl: number;
  minVolume: number;
  minOrganic: number;
  minHolders: number;
  minMcap: number;
  maxMcap: number;
  minBinStep: number;
  maxBinStep: number;
  timeframe: string;
  category: string;
  minTokenFeesSol: number;
  maxBundlersPct: number;
  maxTop10Pct: number;
  blockedLaunchpads: string[];
}

export interface MeteoraManagementConfig {
  deployAmountSol: number;
  positionSizePct: number;
  maxDeployAmount: number;
  gasReserve: number;
  minSolToOpen: number;
  outOfRangeWaitMinutes: number;
  stopLossPct: number;
}

export interface MeteoraConfig {
  screening: MeteoraScreeningConfig;
  management: MeteoraManagementConfig;
}

export interface CopytradeConfig {
  enabled: boolean;
  maxSlippageBps: number;
  maxPositionSol: number;
  copySellEnabled: boolean;
  targetWallets: string[];
}

export interface ScheduleConfig {
  managementIntervalMin: number;
  screeningIntervalMin: number;
  reportIntervalMin: number;
  healthIntervalMin: number;
}

export interface AppConfig {
  features: FeatureFlags;
  ai: AIConfig;
  risk: RiskConfig;
  meteora: MeteoraConfig;
  copytrade: CopytradeConfig;
  schedule: ScheduleConfig;
}
