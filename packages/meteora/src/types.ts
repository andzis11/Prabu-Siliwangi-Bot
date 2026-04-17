import { StrategyType } from "@meteora-ag/dlmm";

export interface MeteoraPreset {
  id: string;
  name: string;
  sol: number | "max" | string; // 1, "max", "50%"
  range: number;
  strategy: StrategyType;
}

export interface MeteoraPosition {
  publicKey: string;
  poolAddress: string;
  minBinId: number;
  maxBinId: number;
  activeBinAtAdd: number;
  solAmount: number;
  rangePercent: number;
  strategyStr: string;
  addedAt: string;
  txHash: string;
  cachedBinIds: number[];
  walletId: string;
  synced?: boolean;
}

export interface MeteoraPoolInfo {
  address: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  activeBin: number;
  binStep: number;
  baseFee: number;
  volume24h?: number;
  tvl?: number;
}

export interface MeteoraPnL {
  pnlUsd: number;
  pnlSol: number;
  pnlPctChange: number;
  unrealizedPnlSol: number;
  unclaimedFeeTokenX: Record<string, any>;
  unclaimedFeeTokenY: Record<string, any>;
  allTimeFees: Record<string, any>;
  tokenXSymbol: string;
  tokenYSymbol: string;
  solPrice: number;
}

export interface ExtremeSession {
  chatId: number;
  poolAddress: string;
  positionKey: string;
  targetBinId: number;
  solAmount: number | "max" | string;
  status: "active" | "executing" | "oor" | "waiting" | "stopped";
  cycleCount: number;
  timer?: NodeJS.Timeout;
}

export interface WalletConfig {
  id: string;
  name: string;
  pubkey: string;
  envKey: string;
}

export interface MeteoraConfig {
  wallets: Record<string, WalletConfig>;
  activeWalletId: string | null;
  positions: Record<string, MeteoraPosition>;
  presets: Record<string, MeteoraPreset>;
  activePresetId: string | null;
}

export interface RPCEndpoint {
  label: string;
  url: string;
}

export interface SolResolveResult {
  amount: number;
  isPercent: boolean;
  isMax: boolean;
}

export interface PoolScreeningResult {
  address: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  tvl: number;
  volume24h: number;
  fee24h: number;
  binStep: number;
  activeBin: number;
}

export interface PositionStatus {
  positionKey: string;
  poolAddress: string;
  currentBin: number;
  minBin: number;
  maxBin: number;
  inRange: boolean;
  pnl?: MeteoraPnL;
  positionData?: MeteoraPosition;
}

export interface BinHealth {
  binId: number;
  price: number;
  liquidity: number;
  isActive: boolean;
  distanceFromCurrent: number;
  status: "active" | "below" | "above" | "far_below" | "far_above";
}

export interface BinVisualization {
  bins: BinHealth[];
  currentBin: number;
  rangeMin: number;
  rangeMax: number;
  positionBins: number[];
}

export interface FeeHarvestResult {
  success: boolean;
  signature?: string;
  feesClaimed: {
    tokenX: number;
    tokenY: number;
    tokenXSymbol: string;
    tokenYSymbol: string;
  };
  error?: string;
}

export interface ILCalculation {
  entryPrice: number;
  currentPrice: number;
  priceChangePct: number;
  impermanentLossSol: number;
  impermanentLossPct: number;
  holdingValueSol: number;
  positionValueSol: number;
  lossRatio: number;
}

export interface APRTracking {
  apr: number;
  apy: number;
  dailyRate: number;
  fees24h: number;
  fees7d: number;
  fees30d: number;
  totalFees: number;
  volume24h: number;
  feeApr: number;
  feeApy: number;
}

export interface MeteoraPositionHealth {
  overall: number;
  inRange: boolean;
  binHealth: number;
  pnlScore: number;
  feeScore: number;
  timeScore: number;
  recommendation: "hold" | "add" | "reduce" | "exit" | "harvest_fees";
  reasons: string[];
}

export interface SyncResult {
  total: number;
  added: number;
  removed: number;
}

export interface ExtremeModeConfig {
  monitorInterval: number;
  minSolAmount: number;
  feeBuffer: number;
}

export const DEFAULT_EXTREME_CONFIG: ExtremeModeConfig = {
  monitorInterval: 2500, // 2.5 detik
  minSolAmount: 0.001,
  feeBuffer: 0.08, // Buffer untuk fee transaksi
};

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const DLMM_PNL_API = "https://dlmm.datapi.meteora.ag/positions";
