import { AppConfig } from "../domain/types";

export const DEFAULT_APP_CONFIG: AppConfig = {
  features: {
    walletIntel: true,
    meteora: true,
    pnl: true,
    copytrade: false,
  },

  ai: {
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    timeoutMs: 30_000,
    retryCount: 2,
    models: {
      screeningModel: "openai/gpt-oss-20b:free",
      managementModel: "openai/gpt-oss-20b:free",
      generalModel: "openai/gpt-oss-20b:free",
    },
  },

  risk: {
    dailyCapital: 1,
    deployAmountSol: 0.5,
    positionSizePct: 0.35,
    maxDeployAmount: 50,
    gasReserve: 0.2,
    minSolToOpen: 0.55,
    stopLossPct: -15,
  },

  meteora: {
    screening: {
      minFeeActiveTvlRatio: 0.05,
      minTvl: 10_000,
      maxTvl: 150_000,
      minVolume: 500,
      minOrganic: 60,
      minHolders: 500,
      minMcap: 150_000,
      maxMcap: 10_000_000,
      minBinStep: 80,
      maxBinStep: 125,
      timeframe: "5m",
      category: "trending",
      minTokenFeesSol: 30,
      maxBundlersPct: 30,
      maxTop10Pct: 60,
      blockedLaunchpads: [],
    },

    management: {
      deployAmountSol: 0.5,
      positionSizePct: 0.35,
      maxDeployAmount: 50,
      gasReserve: 0.2,
      minSolToOpen: 0.55,
      outOfRangeWaitMinutes: 30,
      stopLossPct: -15,
    },
  },

  copytrade: {
    enabled: false,
    maxSlippageBps: 500,
    maxPositionSol: 0.5,
    copySellEnabled: true,
    targetWallets: [],
  },

  schedule: {
    managementIntervalMin: 10,
    screeningIntervalMin: 30,
    reportIntervalMin: 1440,
    healthIntervalMin: 5,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeConfig<T>(base: T, override?: Partial<T>): T {
  if (override === undefined) {
    return base;
  }

  if (!isRecord(base) || !isRecord(override)) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(override)) {
    const baseValue = result[key];
    const overrideValue = override[key as keyof T];

    if (overrideValue === undefined) {
      continue;
    }

    if (Array.isArray(baseValue) && Array.isArray(overrideValue)) {
      result[key] = overrideValue;
      continue;
    }

    if (isRecord(baseValue) && isRecord(overrideValue)) {
      result[key] = mergeConfig(baseValue, overrideValue);
      continue;
    }

    result[key] = overrideValue;
  }

  return result as T;
}
