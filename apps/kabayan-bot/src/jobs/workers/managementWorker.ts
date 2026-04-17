/**
 * Management Worker
 *
 * Periodically checks and manages active positions.
 * Handles OOR (Out Of Range) positions, SL/TP, and rebalancing.
 */

import { BaseWorker, type WorkerConfig } from "./baseWorker";
import { EnhancedDLMMService } from "@prabu/meteora";
import { logger } from "../../utils/logger";

export interface ManagementWorkerConfig extends WorkerConfig {
  stopLossPct: number;
  takeProfitPct: number;
  oorWaitMinutes: number;
  autoRebalance: boolean;
  trackedPositions?: string[];
}

export interface PositionDecision {
  positionKey: string;
  action: "hold" | "trim" | "close" | "rebalance" | "emergency";
  reason: string;
  confidence: number;
}

export interface PositionHealth {
  positionKey: string;
  poolAddress: string;
  currentBin: number;
  minBin: number;
  maxBin: number;
  inRange: boolean;
  pnlPct: number;
  timeInRange: number;
  decisions: PositionDecision[];
}

export class ManagementWorker extends BaseWorker {
  private dlmmService: EnhancedDLMMService;
  private stopLossPct: number;
  private takeProfitPct: number;
  private oorWaitMinutes: number;
  private autoRebalance: boolean;
  private trackedPositions: string[];
  private positionsCache: Map<string, PositionHealth> = new Map();
  private notifyCallback?: (decisions: PositionDecision[]) => Promise<void>;

  constructor(config: ManagementWorkerConfig, dlmmService: EnhancedDLMMService) {
    super({
      name: "ManagementWorker",
      intervalMs: config.intervalMs,
      enabled: config.enabled,
    });

    this.dlmmService = dlmmService;
    this.stopLossPct = config.stopLossPct;
    this.takeProfitPct = config.takeProfitPct;
    this.oorWaitMinutes = config.oorWaitMinutes;
    this.autoRebalance = config.autoRebalance;
    this.trackedPositions = config.trackedPositions || [];
  }

  setNotifyCallback(callback: (decisions: PositionDecision[]) => Promise<void>): void {
    this.notifyCallback = callback;
  }

  addPosition(positionKey: string): void {
    if (!this.trackedPositions.includes(positionKey)) {
      this.trackedPositions.push(positionKey);
      logger.info(`ManagementWorker: Now tracking position ${positionKey}`);
    }
  }

  removePosition(positionKey: string): void {
    this.trackedPositions = this.trackedPositions.filter(p => p !== positionKey);
    this.positionsCache.delete(positionKey);
  }

  async execute(): Promise<void> {
    logger.info("ManagementWorker: Starting position management cycle");

    const positions = await this.getActivePositions();
    logger.info(`ManagementWorker: Checking ${positions.length} active positions`);

    const allDecisions: PositionDecision[] = [];

    for (const position of positions) {
      try {
        const decisions = await this.evaluatePosition(position);
        if (decisions.length > 0) {
          allDecisions.push(...decisions);
          await this.executeDecisions(position.positionKey, decisions);
        }

        this.updatePositionCache(position);
      } catch (error) {
        logger.warn(`ManagementWorker: Failed to evaluate position ${position.positionKey}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (allDecisions.length > 0 && this.notifyCallback) {
      await this.notifyCallback(allDecisions);
    }

    logger.info(`ManagementWorker: Made ${allDecisions.length} decisions`);
  }

  private async getActivePositions(): Promise<PositionHealth[]> {
    const positions: PositionHealth[] = [];

    for (const positionKey of this.trackedPositions) {
      const status = await this.dlmmService.getPositionStatus(positionKey);
      if (status) {
        positions.push({
          positionKey,
          poolAddress: status.poolAddress,
          currentBin: status.currentBin,
          minBin: status.minBin,
          maxBin: status.maxBin,
          inRange: status.inRange,
          pnlPct: status.pnl?.pnlPctChange ?? 0,
          timeInRange: 0,
          decisions: [],
        });
      }
    }

    return positions;
  }

  private async evaluatePosition(position: PositionHealth): Promise<PositionDecision[]> {
    const decisions: PositionDecision[] = [];

    if (!position.inRange) {
      decisions.push({
        positionKey: position.positionKey,
        action: "hold",
        reason: `Position is out of range (bin ${position.currentBin} outside ${position.minBin}-${position.maxBin}). Waiting ${this.oorWaitMinutes}min.`,
        confidence: 85,
      });
    }

    if (position.pnlPct <= this.stopLossPct) {
      decisions.push({
        positionKey: position.positionKey,
        action: "emergency",
        reason: `Stop loss triggered! PnL at ${position.pnlPct.toFixed(2)}% below ${this.stopLossPct}% threshold.`,
        confidence: 95,
      });
    }

    if (position.pnlPct >= this.takeProfitPct) {
      decisions.push({
        positionKey: position.positionKey,
        action: "trim",
        reason: `Take profit target reached! PnL at ${position.pnlPct.toFixed(2)}% above ${this.takeProfitPct}% target. Consider taking profit.`,
        confidence: 90,
      });
    }

    return decisions;
  }

  private async executeDecisions(positionKey: string, decisions: PositionDecision[]): Promise<void> {
    for (const decision of decisions) {
      switch (decision.action) {
        case "emergency":
          logger.warn(`ManagementWorker: EMERGENCY for ${positionKey} - ${decision.reason}`);
          break;
        case "close":
          logger.info(`ManagementWorker: Closing position ${positionKey}`);
          break;
        case "trim":
          logger.info(`ManagementWorker: Trimming position ${positionKey}`);
          break;
        case "rebalance":
          if (this.autoRebalance) {
            logger.info(`ManagementWorker: Rebalancing position ${positionKey}`);
          }
          break;
        default:
          logger.debug(`ManagementWorker: Holding position ${positionKey}`);
      }
    }
  }

  private updatePositionCache(position: PositionHealth): void {
    this.positionsCache.set(position.positionKey, position);
  }

  getPositionHealth(positionKey: string): PositionHealth | undefined {
    return this.positionsCache.get(positionKey);
  }

  getAllPositionsHealth(): PositionHealth[] {
    return Array.from(this.positionsCache.values());
  }

  getSummary(): {
    total: number;
    inRange: number;
    oor: number;
    emergency: number;
    avgPnlPct: number;
  } {
    const positions = this.getAllPositionsHealth();
    const inRange = positions.filter((p) => p.inRange).length;
    const emergency = positions.filter((p) =>
      p.decisions.some((d) => d.action === "emergency")
    ).length;
    const avgPnlPct =
      positions.length > 0
        ? positions.reduce((sum, p) => sum + p.pnlPct, 0) / positions.length
        : 0;

    return {
      total: positions.length,
      inRange,
      oor: positions.length - inRange,
      emergency,
      avgPnlPct,
    };
  }
}
