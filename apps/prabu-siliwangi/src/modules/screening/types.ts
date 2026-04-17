/**
 * AI Screening Module Types
 *
 * Defines all types for the AI-powered screening system
 * that combines rule-based filtering with AI scoring.
 */

export interface ScreeningConfig {
  enabled: boolean;
  minTvl: number;
  maxTvl: number;
  minVolume: number;
  minOrganic: number;
  minHolders: number;
  minMcap: number;
  maxMcap: number;
  minBinStep: number;
  maxBinStep: number;
  maxBundlersPct: number;
  maxTop10Pct: number;
  blockedLaunchpads: string[];
}

export interface PoolData {
  address: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  tvl: number;
  volume24h: number;
  fee24h: number;
  organicScore: number;
  holderCount: number;
  mcap: number;
  binStep: number;
  top10HolderPct: number;
  bundlersPct: number;
  launchpad?: string;
  createdAt?: string;
  liquidityType?: "stable" | "volatile";
}

export interface ScreeningResult {
  poolAddress: string;
  passedRules: string[];
  failedRules: string[];
  aiScore: number;
  aiConfidence: number;
  aiReason: string;
  recommendation: ScreeningRecommendation;
  timestamp: string;
  processingTimeMs: number;
}

export type ScreeningRecommendation = "buy" | "watch" | "avoid" | "skip";

export interface AIScreeningRequest {
  poolData: PoolData;
  config: ScreeningConfig;
  userContext?: {
    riskAppetite: "conservative" | "balanced" | "aggressive";
    maxPositionSize?: number;
  };
}

export interface AIScreeningResponse {
  score: number;
  confidence: number;
  recommendation: ScreeningRecommendation;
  reason: string;
  strengths: string[];
  risks: string[];
  warnings: string[];
}

export interface ScreeningSession {
  id: string;
  startedAt: string;
  poolsScanned: number;
  poolsPassed: number;
  poolsFailed: number;
  poolsAIAnalyzed: number;
  lastScanAt?: string;
  status: "idle" | "scanning" | "completed" | "error";
}

export interface ScreeningHistory {
  id: string;
  poolAddress: string;
  result: ScreeningResult;
  scannedAt: string;
  source: "manual" | "scheduled" | "watchlist";
}

export const DEFAULT_SCREENING_CONFIG: ScreeningConfig = {
  enabled: true,
  minTvl: 10000,
  maxTvl: 150000,
  minVolume: 500,
  minOrganic: 60,
  minHolders: 500,
  minMcap: 150000,
  maxMcap: 10000000,
  minBinStep: 80,
  maxBinStep: 125,
  maxBundlersPct: 30,
  maxTop10Pct: 60,
  blockedLaunchpads: [],
};
