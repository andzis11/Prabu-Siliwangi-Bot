/**
 * Use Cases Index
 *
 * Layer ini bertanggung jawab untuk mengorganisir business logic aplikasi.
 * Setiap use case mewakili satu operasi atau alur kerja spesifik.
 *
 * Struktur:
 * - TradeUseCase: operasi trading (buy/sell)
 * - WalletIntelUseCase: analisa wallet
 * - PositionUseCase: manajemen posisi
 * - ScreeningUseCase: screening peluang
 * - PnLUseCase: perhitungan dan rendering PnL
 * - CopyTradeUseCase: kontrol copy trading
 */

export { TradeUseCase } from "./TradeUseCase";
export { WalletIntelUseCase } from "./WalletIntelUseCase";
export { PositionUseCase } from "./PositionUseCase";
// TODO: Add when ready
// export { ScreeningUseCase } from "./ScreeningUseCase";
// export { PnLUseCase } from "./PnLUseCase";
// export { CopyTradeUseCase } from "./CopyTradeUseCase";

/**
 * UseCaseResult - Standard return type untuk semua use case
 */
export interface UseCaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * UseCaseContext - Context yang Passed ke setiap use case
 * Berisi semua dependency yang dibutuhkan
 */
export interface UseCaseContext {
  // Config
  env: import("../../domain/types").EnvConfig;
  config: import("../../domain/types").AppConfig;

  // Services
  aiEngine?: import("@prabu/ai-router").AIRouterEngine;
  meteoraService?: import("@prabu/meteora").EnhancedDLMMService;
  walletIntelService?: import("@prabu/wallet-intel").WalletIntelService;
  pnlRenderer?: import("@prabu/pnl-renderer").PnLRenderer;
  rpcAdapter?: import("@prabu/shared-solana").RPCAdapter;

  // Repositories
  repositories?: import("../../repositories").RepositoryLayer;

  // Logger
  logger?: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
  };
}
