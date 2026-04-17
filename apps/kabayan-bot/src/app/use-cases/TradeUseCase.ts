/**
 * TradeUseCase - Operasi Trading
 *
 * Bertanggung jawab untuk menangani semua operasi trading termasuk:
 * - Buy/Sell execution
 * - Order management
 * - Trade validation
 * - Risk checks sebelum execution
 */

import { UseCaseResult, UseCaseContext } from "./index";
import { PublicKey, Transaction } from "@solana/web3.js";

export interface TradeRequest {
  type: "buy" | "sell";
  tokenMint: string;
  amount: number; // in SOL or tokens
  slippage?: number;
  priorityFee?: number;
}

export interface TradeResult {
  txHash?: string;
  signature?: string;
  status: "pending" | "confirmed" | "failed";
  price?: number;
  amountIn?: number;
  amountOut?: number;
  fee?: number;
  timestamp: number;
}

export interface TradeValidationResult {
  valid: boolean;
  reasons: string[];
  warnings: string[];
}

export class TradeUseCase {
  private context: UseCaseContext;

  constructor(context: UseCaseContext) {
    this.context = context;
  }

  /**
   * Validasi request sebelum eksekusi
   */
  async validate(request: TradeRequest): Promise<TradeValidationResult> {
    const reasons: string[] = [];
    const warnings: string[] = [];

    const { config, env, rpcAdapter } = this.context;

    // Check 1: Apakah feature enabled
    if (!config.features.copytrade && !config.features.meteora) {
      reasons.push("Trading feature is disabled in config");
    }

    // Check 2: Minimal SOL untuk membuka posisi
    const minSolToOpen = config.risk.minSolToOpen;
    if (request.type === "buy" && request.amount < minSolToOpen) {
      reasons.push(`Amount ${request.amount} SOL is below minimum ${minSolToOpen} SOL`);
    }

    // Check 3: Max deploy amount
    const maxDeployAmount = config.risk.maxDeployAmount;
    if (request.amount > maxDeployAmount) {
      reasons.push(`Amount ${request.amount} SOL exceeds maximum ${maxDeployAmount} SOL`);
    }

    // Check 4: Gas reserve
    if (rpcAdapter) {
      const connection = rpcAdapter.getConnection();
      try {
        const balance = await connection.getBalance(
          new PublicKey(env.solanaWalletAddress || "")
        );
        const minBalance = config.risk.gasReserve * 1e9; // Convert to lamports

        if (balance < minBalance) {
          reasons.push(`Insufficient gas reserve. Need at least ${config.risk.gasReserve} SOL`);
        }
      } catch (error) {
        reasons.push(`Failed to check wallet balance: ${error}`);
      }
    }

    // Check 5: Valid token address
    try {
      new PublicKey(request.tokenMint);
    } catch {
      reasons.push("Invalid token mint address");
    }

    // Warnings
    if (request.slippage && request.slippage > 10) {
      warnings.push(`High slippage setting: ${request.slippage}%`);
    }

    if (request.priorityFee && request.priorityFee > 0.1) {
      warnings.push(`High priority fee: ${request.priorityFee} SOL`);
    }

    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
    };
  }

  /**
   * Eksekusi buy order
   */
  async executeBuy(request: TradeRequest): Promise<UseCaseResult<TradeResult>> {
    const { logger, config } = this.context;

    try {
      logger?.info("Starting buy execution", { request });

      // Validate first
      const validation = await this.validate(request);
      if (!validation.valid) {
        logger?.warn("Buy validation failed", { reasons: validation.reasons });
        return {
          success: false,
          error: `Validation failed: ${validation.reasons.join(", ")}`,
        };
      }

      if (validation.warnings.length > 0) {
        logger?.warn("Buy validation warnings", { warnings: validation.warnings });
      }

      // TODO: Implement actual swap execution via Jupiter or Raydium
      // For now, return placeholder

      const result: TradeResult = {
        status: "pending",
        timestamp: Date.now(),
      };

      logger?.info("Buy execution completed", { result });

      return {
        success: true,
        data: result,
        message: "Buy order submitted successfully",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Buy execution failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Eksekusi sell order
   */
  async executeSell(request: TradeRequest): Promise<UseCaseResult<TradeResult>> {
    const { logger, config } = this.context;

    try {
      logger?.info("Starting sell execution", { request });

      // Validate first
      const validation = await this.validate(request);
      if (!validation.valid) {
        logger?.warn("Sell validation failed", { reasons: validation.reasons });
        return {
          success: false,
          error: `Validation failed: ${validation.reasons.join(", ")}`,
        };
      }

      // TODO: Implement actual swap execution via Jupiter or Raydium
      // For now, return placeholder

      const result: TradeResult = {
        status: "pending",
        timestamp: Date.now(),
      };

      logger?.info("Sell execution completed", { result });

      return {
        success: true,
        data: result,
        message: "Sell order submitted successfully",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Sell execution failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get recent trades from history
   */
  async getRecentTrades(limit: number = 10): Promise<UseCaseResult<TradeResult[]>> {
    const { logger, repositories } = this.context;

    try {
      // TODO: Get from repository
      // const trades = await repositories.getTrades(limit);

      return {
        success: true,
        data: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Failed to get recent trades", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Calculate optimal amount based on risk config
   */
  calculateOptimalAmount(walletBalance: number): number {
    const { config } = this.context;

    const positionSizePct = config.risk.positionSizePct / 100;
    const gasReserve = config.risk.gasReserve;
    const maxDeploy = config.risk.maxDeployAmount;

    const availableForTrade = walletBalance - gasReserve;
    const optimalAmount = availableForTrade * positionSizePct;

    return Math.min(optimalAmount, maxDeploy);
  }
}

export function createTradeUseCase(context: UseCaseContext): TradeUseCase {
  return new TradeUseCase(context);
}
