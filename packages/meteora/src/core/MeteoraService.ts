// MeteoraService.ts - Temporarily commented out as EnhancedDLMMService is now the primary implementation

// import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
// import { StrategyType } from "@meteora-ag/dlmm";
// import { BN } from "@coral-xyz/anchor";
// import {
//   PositionParams,
//   PositionInfo,
//   AddLiquidityResult,
//   RemoveLiquidityResult,
//   PoolInfo,
//   StrategyPreset,
//   MeteoraConfig
// } from "../types";

// /**
//  * Legacy MeteoraService - Superseded by EnhancedDLMMService
//  * This service is kept for backward compatibility only
//  * New implementations should use EnhancedDLMMService
//  */
// export class MeteoraService {
//   private connection: Connection;
//   private wallet: Keypair;
//   private config: MeteoraConfig;

//   constructor(config: MeteoraConfig) {
//     this.config = config;
//     this.connection = config.connection;
//     this.wallet = Keypair.fromSecretKey(config.walletSecretKey);
//   }

//   async getPoolInfo(poolAddress: string): Promise<PoolInfo> {
//     throw new Error("Legacy MeteoraService is deprecated. Use EnhancedDLMMService instead.");
//   }

//   async addLiquidity(
//     poolAddress: string,
//     solAmount: number,
//     rangePercent: number,
//     strategy: StrategyType
//   ): Promise<AddLiquidityResult> {
//     throw new Error("Legacy MeteoraService is deprecated. Use EnhancedDLMMService instead.");
//   }

//   async removeLiquidity(position: PositionInfo): Promise<RemoveLiquidityResult> {
//     throw new Error("Legacy MeteoraService is deprecated. Use EnhancedDLMMService instead.");
//   }

//   describe(): string {
//     return "Legacy MeteoraService - Deprecated in favor of EnhancedDLMMService";
//   }
// }

// // Factory function for backward compatibility
// export function createMeteoraService(config: MeteoraConfig): MeteoraService {
//   return new MeteoraService(config);
// }

// // Re-export types for backward compatibility
// export type {
//   PositionParams,
//   PositionInfo,
//   AddLiquidityResult,
//   RemoveLiquidityResult,
//   PoolInfo,
//   StrategyPreset,
//   MeteoraConfig
// };
