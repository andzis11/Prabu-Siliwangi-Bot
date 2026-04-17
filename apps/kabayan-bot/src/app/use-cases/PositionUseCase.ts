/**
 * PositionUseCase - Manajemen Posisi
 *
 * Bertanggung jawab untuk menangani semua operasi manajemen posisi termasuk:
 * - Buka posisi baru
 * - Tutup posisi
 * - Update posisi (add/remove liquidity)
 * - Monitoring posisi (OOR, PnL, stop loss)
 * - Sync positions dengan chain
 */

import { UseCaseResult, UseCaseContext } from "./index";
import { PublicKey } from "@solana/web3.js";

export interface PositionRequest {
  poolAddress: string;
  amountSol: number | "max";
  rangePercent?: number; // Untuk range orders
  strategy?: "stable" | "volatile" | "balanced";
}

export interface Position {
  id: string;
  poolAddress: string;
  poolName?: string;
  positionKey: string; // PublicKey of the position
  amountSol: number;
  rangeLower?: number;
  rangeUpper?: number;
  strategy: "stable" | "volatile" | "balanced";
  status: "active" | "closed" | "orphaned";
  entryPrice?: number;
  currentPrice?: number;
  pnlSol?: number;
  pnlPercent?: number;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface PositionStatus {
  positionKey: string;
  status: "active" | "closed" | "orphaned";
  liquidity: number;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  pnlUnrealized?: number;
  pnlPercent?: number;
}

export interface OORCheck {
  isOutOfRange: boolean;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  distancePercent?: number;
  recommendation: "hold" | "rebalance" | "close";
}

export class PositionUseCase {
  private context: UseCaseContext;

  constructor(context: UseCaseContext) {
    this.context = context;
  }

  /**
   * Validasi request sebelum buka posisi
   */
  async validateOpenPosition(request: PositionRequest): Promise<{
    valid: boolean;
    reasons: string[];
    warnings: string[];
  }> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const { config, env, rpcAdapter } = this.context;

    // Check 1: Apakah Meteora feature enabled
    if (!config.features.meteora) {
      reasons.push("Meteora feature is disabled in config");
    }

    // Check 2: Valid pool address
    try {
      new PublicKey(request.poolAddress);
    } catch {
      reasons.push("Invalid pool address");
    }

    // Check 3: Amount validation
    const amount = request.amountSol === "max"
      ? config.meteora.management.maxDeployAmount
      : request.amountSol;

    if (typeof amount === "number") {
      const minSolToOpen = config.meteora.management.minSolToOpen;
      if (amount < minSolToOpen) {
        reasons.push(`Amount ${amount} SOL is below minimum ${minSolToOpen} SOL`);
      }

      const maxDeployAmount = config.meteora.management.maxDeployAmount;
      if (amount > maxDeployAmount) {
        reasons.push(`Amount ${amount} SOL exceeds maximum ${maxDeployAmount} SOL`);
      }
    }

    // Check 4: Gas reserve
    if (rpcAdapter && env.solanaWalletAddress) {
      const connection = rpcAdapter.getConnection();
      try {
        const balance = await connection.getBalance(
          new PublicKey(env.solanaWalletAddress)
        );
        const minBalance = config.risk.gasReserve * 1e9;

        if (balance < minBalance) {
          reasons.push(`Insufficient gas reserve. Need at least ${config.risk.gasReserve} SOL`);
        }
      } catch (error) {
        reasons.push(`Failed to check wallet balance: ${error}`);
      }
    }

    // Check 5: Meteora screening rules
    const screeningConfig = config.meteora.screening;
    // Note: In real implementation, we'd fetch pool info and validate against these rules
    // For now, just add as warnings
    warnings.push("Pool screening validation will be performed by Meteora service");

    // Warnings
    if (request.rangePercent && request.rangePercent > 50) {
      warnings.push(`Wide range: ${request.rangePercent}% may result in low fees`);
    }

    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
    };
  }

  /**
   * Buka posisi baru
   */
  async openPosition(request: PositionRequest): Promise<UseCaseResult<Position>> {
    const { logger, meteoraService, config } = this.context;

    try {
      logger?.info("Starting position open", { request });

      // Validate first
      const validation = await this.validateOpenPosition(request);
      if (!validation.valid) {
        logger?.warn("Position validation failed", { reasons: validation.reasons });
        return {
          success: false,
          error: `Validation failed: ${validation.reasons.join(", ")}`,
        };
      }

      if (validation.warnings.length > 0) {
        logger?.warn("Position validation warnings", { warnings: validation.warnings });
      }

      // Use Meteora service if available
      if (meteoraService) {
        const amount = request.amountSol === "max"
          ? "max"
          : request.amountSol;

        const rangePercent = request.rangePercent || 20;

        const result = await meteoraService.addLiquidity(
          request.poolAddress,
          amount,
          rangePercent,
          "Balanced" // default strategy
        );

        const position: Position = {
          id: `pos_${Date.now()}`,
          poolAddress: request.poolAddress,
          positionKey: result.positionKey,
          amountSol: typeof request.amountSol === "number" ? request.amountSol : 0,
          strategy: request.strategy || "balanced",
          status: "active",
          openedAt: Date.now(),
          updatedAt: Date.now(),
        };

        logger?.info("Position opened successfully", {
          positionKey: result.positionKey,
          poolAddress: request.poolAddress,
        });

        return {
          success: true,
          data: position,
          message: `Position opened successfully. TX: ${result.txHash}`,
        };
      }

      // Fallback if no service
      return {
        success: false,
        error: "Meteora service not configured",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Position open failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Tutup posisi
   */
  async closePosition(positionKey: string): Promise<UseCaseResult<Position>> {
    const { logger, meteoraService } = this.context;

    try {
      logger?.info("Starting position close", { positionKey });

      if (!meteoraService) {
        return {
          success: false,
          error: "Meteora service not configured",
        };
      }

      const result = await meteoraService.removeLiquidity(positionKey);

      const position: Position = {
        id: `pos_${Date.now()}`,
        poolAddress: "",
        positionKey: positionKey,
        amountSol: 0,
        strategy: "balanced",
        status: "closed",
        openedAt: 0,
        updatedAt: Date.now(),
        closedAt: Date.now(),
      };

      logger?.info("Position closed successfully", {
        positionKey,
        txHashes: result,
      });

      return {
        success: true,
        data: position,
        message: `Position closed successfully. TXs: ${result.join(", ")}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Position close failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get semua posisi aktif
   */
  async getActivePositions(): Promise<UseCaseResult<Position[]>> {
    const { logger, meteoraService, repositories } = this.context;

    try {
      // Try to get from Meteora service first
      if (meteoraService) {
        const syncResult = await meteoraService.syncPositions();

        // Define type for sync position data
        interface SyncPositionData {
          poolAddress: string;
          amount: number;
          status: string;
          openedAt: number;
          updatedAt: number;
        }

        // Convert to Position objects
        const positions: Position[] = Object.entries(syncResult.positions as Record<string, SyncPositionData>).map(
          ([key, pos]: [string, SyncPositionData]) => ({
            id: key,
            poolAddress: pos.poolAddress,
            positionKey: key,
            amountSol: pos.amount,
            strategy: "balanced" as const,
            status: pos.status === "active" ? "active" : "closed",
            openedAt: pos.openedAt,
            updatedAt: pos.updatedAt,
          })
        );

        return {
          success: true,
          data: positions,
        };
      }

      // Fallback to repository
      return {
        success: true,
        data: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Failed to get active positions", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get status posisi spesifik
   */
  async getPositionStatus(positionKey: string): Promise<UseCaseResult<PositionStatus>> {
    const { logger, meteoraService } = this.context;

    try {
      if (!meteoraService) {
        return {
          success: false,
          error: "Meteora service not configured",
        };
      }

      const status = await meteoraService.getPositionStatus(positionKey);

      if (!status) {
        return {
          success: false,
          error: "Position not found",
        };
      }

      return {
        success: true,
        data: {
          positionKey,
          status: status.status,
          liquidity: status.liquidity,
          currentPrice: status.currentPrice,
          minPrice: status.minPrice,
          maxPrice: status.maxPrice,
          pnlUnrealized: status.pnlUnrealized,
          pnlPercent: status.pnlPercent,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Failed to get position status", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check apakah posisi out of range
   */
  async checkOOR(positionKey: string): Promise<UseCaseResult<OORCheck>> {
    const { logger, config, meteoraService } = this.context;

    try {
      const statusResult = await this.getPositionStatus(positionKey);

      if (!statusResult.success || !statusResult.data) {
        return {
          success: false,
          error: statusResult.error || "Failed to get position status",
        };
      }

      const status = statusResult.data;

      // Check if out of range
      const isOutOfRange =
        status.currentPrice < status.minPrice || status.currentPrice > status.maxPrice;

      let distancePercent: number | undefined;
      let recommendation: "hold" | "rebalance" | "close" = "hold";

      if (isOutOfRange) {
        const midPrice = (status.minPrice + status.maxPrice) / 2;
        distancePercent = Math.abs((status.currentPrice - midPrice) / midPrice) * 100;

        // Recommendation based on distance
        const oorWaitMinutes = config.meteora.management.outOfRangeWaitMinutes;
        if (distancePercent > 50) {
          recommendation = "close";
        } else if (distancePercent > 20) {
          recommendation = "rebalance";
        } else {
          recommendation = "hold";
        }

        logger?.warn("Position is out of range", {
          positionKey,
          currentPrice: status.currentPrice,
          rangeLower: status.minPrice,
          rangeUpper: status.maxPrice,
          distancePercent,
          recommendation,
        });
      }

      return {
        success: true,
        data: {
          isOutOfRange,
          currentPrice: status.currentPrice,
          rangeLower: status.minPrice,
          rangeUpper: status.maxPrice,
          distancePercent,
          recommendation,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("OOR check failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Rebalance posisi yang out of range
   */
  async rebalancePosition(positionKey: string, targetBinId?: number): Promise<UseCaseResult<Position>> {
    const { logger, meteoraService } = this.context;

    try {
      logger?.info("Starting position rebalance", { positionKey, targetBinId });

      if (!meteoraService) {
        return {
          success: false,
          error: "Meteora service not configured",
        };
      }

      // If target bin specified, use it
      if (targetBinId) {
        const result = await meteoraService.withdrawAndReaddToTargetBin(
          "", // poolAddress would be fetched from position
          positionKey,
          targetBinId
        );

        return {
          success: true,
          data: {} as Position,
          message: `Position rebalanced to bin ${targetBinId}`,
        };
      }

      // Otherwise just close and reopen (simplified)
      const closeResult = await this.closePosition(positionKey);
      if (!closeResult.success) {
        return {
          success: false,
          error: closeResult.error || "Failed to close position for rebalance",
        };
      }

      // Note: In real implementation, we'd need to store the pool address
      // and reopen with similar parameters

      return {
        success: true,
        data: {} as Position,
        message: "Position closed for rebalancing. Please reopen with new range.",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Position rebalance failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Calculate total PnL dari semua posisi
   */
  async calculateTotalPnL(): Promise<UseCaseResult<{
    totalPnLSol: number;
    totalPnLPercent: number;
    activePositions: number;
    profitablePositions: number;
    losingPositions: number;
  }>> {
    const { logger } = this.context;

    try {
      const positionsResult = await this.getActivePositions();

      if (!positionsResult.success) {
        return {
          success: false,
          error: positionsResult.error || "Failed to get positions",
        };
      }

      let totalPnLSol = 0;
      let profitablePositions = 0;
      let losingPositions = 0;

      // Calculate PnL for each position
      for (const position of positionsResult.data || []) {
        if (position.pnlSol !== undefined) {
          totalPnLSol += position.pnlSol;

          if (position.pnlSol > 0) {
            profitablePositions++;
          } else if (position.pnlSol < 0) {
            losingPositions++;
          }
        }
      }

      const totalAmount = positionsResult.data?.reduce(
        (sum, pos) => sum + pos.amountSol,
        0
      ) || 0;

      const totalPnLPercent = totalAmount > 0 ? (totalPnLSol / totalAmount) * 100 : 0;

      logger?.info("Total PnL calculated", {
        totalPnLSol,
        totalPnLPercent,
        activePositions: positionsResult.data?.length || 0,
      });

      return {
        success: true,
        data: {
          totalPnLSol,
          totalPnLPercent,
          activePositions: positionsResult.data?.length || 0,
          profitablePositions,
          losingPositions,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error("Total PnL calculation failed", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format position status untuk Telegram
   */
  formatPositionStatus(position: Position, status?: PositionStatus): string {
    let message = `📊 *Position Status*\n\n`;
    message += `Pool: \`${position.poolAddress}\`\n`;
    message += `Amount: ${position.amountSol} SOL\n`;
    message += `Strategy: ${position.strategy}\n`;
    message += `Status: ${position.status.toUpperCase()}\n`;

    if (status) {
      message += `\n*Current Status:*\n`;
      message += `• Price: ${status.currentPrice}\n`;
      message += `• Range: ${status.minPrice} - ${status.maxPrice}\n`;

      if (status.pnlUnrealized !== undefined) {
        const pnlEmoji = status.pnlUnrealized >= 0 ? "🟢" : "🔴";
        message += `• PnL: ${pnlEmoji} ${status.pnlUnrealized.toFixed(4)} SOL`;
        if (status.pnlPercent !== undefined) {
          message += ` (${status.pnlPercent.toFixed(2)}%)`;
        }
        message += `\n`;
      }

      // OOR status
      const isOOR = status.currentPrice < status.minPrice || status.currentPrice > status.maxPrice;
      if (isOOR) {
        message += `\n⚠️ *Out of Range!*\n`;
        message += `Current price is outside the active range.\n`;
      }
    }

    return message;
  }
}

export function createPositionUseCase(context: UseCaseContext): PositionUseCase {
  return new PositionUseCase(context);
}
