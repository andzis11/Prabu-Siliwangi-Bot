/**
 * Position Execution Service
 *
 * Handles executing trades from screening/management decisions.
 */

import { RustCopyEngineClient } from "../../integrations/rust-engine/client";
import { EnhancedDLMMService } from "@prabu/meteora";
import { logger } from "../../utils/logger";
import type { ScreenedPool } from "../../jobs/workers/screeningWorker";
import type { PositionDecision, PositionHealth } from "../../jobs/workers/managementWorker";

export interface ExecutionConfig {
  maxSlippageBps: number;
  useJitoBundler: boolean;
  maxPositionSol: number;
  autoSellOnTp: boolean;
  autoSellOnSl: boolean;
}

export interface ExecutionResult {
  success: boolean;
  signature?: string;
  message: string;
  error?: string;
  poolAddress: string;
  tokenSymbol: string;
  direction: "buy" | "sell";
  amountSol: number;
  timestamp: string;
}

export interface Position {
  id: string;
  poolAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  entryPrice: number;
  entryTime: string;
  amountSol: number;
  amountTokens: number;
  status: "open" | "closed" | "pending";
  exitPrice?: number;
  exitTime?: string;
  pnlSol: number;
  pnlPct: number;
  stopLoss?: number;
  takeProfit?: number;
}

export class PositionExecutionService {
  private rustClient: RustCopyEngineClient;
  private dlmmService: EnhancedDLMMService;
  private config: ExecutionConfig;
  private openPositions: Map<string, Position> = new Map();
  private executionHistory: ExecutionResult[] = [];

  constructor(
    rustClient: RustCopyEngineClient,
    dlmmService: EnhancedDLMMService,
    config: ExecutionConfig
  ) {
    this.rustClient = rustClient;
    this.dlmmService = dlmmService;
    this.config = config;
  }

  async executeBuyFromScreening(
    pool: ScreenedPool,
    amountSol: number
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing buy for ${pool.poolData.tokenYSymbol}`, {
      pool: pool.address,
      amount: amountSol,
      score: pool.score,
    });

    try {
      if (amountSol > this.config.maxPositionSol) {
        amountSol = this.config.maxPositionSol;
        logger.warn(`Amount capped at max position size: ${amountSol} SOL`);
      }

      const response = await fetch(`${this.rustClient.getBaseUrl()}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_wallet: "",
          token_mint: pool.address,
          direction: "Buy",
          amount_sol: amountSol,
          slippage_bps: this.config.maxSlippageBps,
          use_jito: this.config.useJitoBundler,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        const position: Position = {
          id: this.generatePositionId(),
          poolAddress: pool.address,
          tokenMint: pool.address,
          tokenSymbol: pool.poolData.tokenYSymbol,
          entryPrice: pool.poolData.tvl / (pool.poolData.volume24h || 1),
          entryTime: new Date().toISOString(),
          amountSol,
          amountTokens: 0,
          status: "open",
          pnlSol: 0,
          pnlPct: 0,
        };

        this.openPositions.set(position.id, position);

        const executionResult: ExecutionResult = {
          success: true,
          signature: result.signature,
          message: `Bought ${pool.poolData.tokenYSymbol} for ${amountSol} SOL`,
          poolAddress: pool.address,
          tokenSymbol: pool.poolData.tokenYSymbol,
          direction: "buy",
          amountSol,
          timestamp: new Date().toISOString(),
        };

        this.executionHistory.push(executionResult);
        logger.info(`Buy executed successfully`, { signature: result.signature });

        return executionResult;
      } else {
        const errorResult: ExecutionResult = {
          success: false,
          message: "Execution failed",
          error: result.error || result.message,
          poolAddress: pool.address,
          tokenSymbol: pool.poolData.tokenYSymbol,
          direction: "buy",
          amountSol,
          timestamp: new Date().toISOString(),
        };

        this.executionHistory.push(errorResult);
        return errorResult;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Buy execution failed: ${errorMsg}`);

      const errorResult: ExecutionResult = {
        success: false,
        message: "Execution failed",
        error: errorMsg,
        poolAddress: pool.address,
        tokenSymbol: pool.poolData.tokenYSymbol,
        direction: "buy",
        amountSol,
        timestamp: new Date().toISOString(),
      };

      this.executionHistory.push(errorResult);
      return errorResult;
    }
  }

  async executeSell(
    positionId: string,
    percentage: number = 100
  ): Promise<ExecutionResult> {
    const position = this.openPositions.get(positionId);

    if (!position) {
      return {
        success: false,
        message: "Position not found",
        error: "Position ID not found",
        poolAddress: "",
        tokenSymbol: "",
        direction: "sell",
        amountSol: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const amountToSell = position.amountSol * (percentage / 100);

    logger.info(`Executing sell for position ${positionId}`, {
      token: position.tokenSymbol,
      amount: amountToSell,
      percentage,
    });

    try {
      const response = await fetch(`${this.rustClient.getBaseUrl()}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_wallet: "",
          token_mint: position.tokenMint,
          direction: "Sell",
          amount_sol: amountToSell,
          slippage_bps: this.config.maxSlippageBps,
          use_jito: this.config.useJitoBundler,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        if (percentage === 100) {
          position.status = "closed";
          position.exitTime = new Date().toISOString();
          position.pnlSol = result.pnl_sol || 0;
          position.pnlPct = result.pnl_pct || 0;
          this.openPositions.delete(positionId);
        } else {
          position.amountSol -= amountToSell;
        }

        const executionResult: ExecutionResult = {
          success: true,
          signature: result.signature,
          message: `Sold ${percentage}% of ${position.tokenSymbol} for ${amountToSell} SOL`,
          poolAddress: position.poolAddress,
          tokenSymbol: position.tokenSymbol,
          direction: "sell",
          amountSol: amountToSell,
          timestamp: new Date().toISOString(),
        };

        this.executionHistory.push(executionResult);
        return executionResult;
      } else {
        return {
          success: false,
          message: "Sell failed",
          error: result.error || result.message,
          poolAddress: position.poolAddress,
          tokenSymbol: position.tokenSymbol,
          direction: "sell",
          amountSol: amountToSell,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Sell execution failed: ${errorMsg}`);

      return {
        success: false,
        message: "Sell execution failed",
        error: errorMsg,
        poolAddress: position.poolAddress,
        tokenSymbol: position.tokenSymbol,
        direction: "sell",
        amountSol: amountToSell,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async handleManagementDecision(
    decision: PositionDecision,
    position: PositionHealth
  ): Promise<ExecutionResult | null> {
    switch (decision.action) {
      case "emergency":
        logger.warn(`Emergency close for position ${decision.positionKey}`);
        return this.executeSell(decision.positionKey, 100);

      case "trim":
        if (this.config.autoSellOnTp) {
          logger.info(`Auto-trimming position ${decision.positionKey}`);
          return this.executeSell(decision.positionKey, 50);
        }
        return null;

      case "close":
        logger.info(`Closing position ${decision.positionKey}`);
        return this.executeSell(decision.positionKey, 100);

      default:
        return null;
    }
  }

  setStopLoss(positionId: string, stopLossPct: number): void {
    const position = this.openPositions.get(positionId);
    if (position) {
      position.stopLoss = stopLossPct;
      logger.info(`Stop loss set for ${position.tokenSymbol}: ${stopLossPct}%`);
    }
  }

  setTakeProfit(positionId: string, takeProfitPct: number): void {
    const position = this.openPositions.get(positionId);
    if (position) {
      position.takeProfit = takeProfitPct;
      logger.info(`Take profit set for ${position.tokenSymbol}: ${takeProfitPct}%`);
    }
  }

  getOpenPositions(): Position[] {
    return Array.from(this.openPositions.values());
  }

  getPosition(positionId: string): Position | undefined {
    return this.openPositions.get(positionId);
  }

  getExecutionHistory(limit: number = 50): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  getSummary(): {
    openPositions: number;
    totalPnlSol: number;
    executionsToday: number;
    successRate: number;
  } {
    const positions = this.getOpenPositions();
    const today = new Date().toISOString().split("T")[0];
    const todayExecutions = this.executionHistory.filter(
      (e) => e.timestamp.split("T")[0] === today
    );

    const successfulExecutions = todayExecutions.filter((e) => e.success);

    return {
      openPositions: positions.length,
      totalPnlSol: positions.reduce((sum, p) => sum + p.pnlSol, 0),
      executionsToday: todayExecutions.length,
      successRate:
        todayExecutions.length > 0
          ? (successfulExecutions.length / todayExecutions.length) * 100
          : 0,
    };
  }

  private generatePositionId(): string {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function createPositionExecutionService(
  rustClient: RustCopyEngineClient,
  dlmmService: EnhancedDLMMService,
  config?: Partial<ExecutionConfig>
): PositionExecutionService {
  const defaultConfig: ExecutionConfig = {
    maxSlippageBps: 500,
    useJitoBundler: true,
    maxPositionSol: 1.0,
    autoSellOnTp: false,
    autoSellOnSl: true,
    ...config,
  };

  return new PositionExecutionService(rustClient, dlmmService, defaultConfig);
}
