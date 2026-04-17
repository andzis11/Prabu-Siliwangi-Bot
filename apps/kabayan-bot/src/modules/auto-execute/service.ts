/**
 * Auto Execute Service
 *
 * Automatically executes trades based on screening results with:
 * - Real-time price from Helius
 * - Liquidity checking
 * - DCA support
 * - Time-based exit
 * - Risk-based position sizing
 */

import { logger } from "../../utils/logger";
import type { ScreenedPool } from "../../jobs/workers/screeningWorker";

export interface AutoExecuteConfig {
  enabled: boolean;
  minScoreToExecute: number;
  positionSizePct: number;
  maxConcurrentPositions: number;
  useRiskCalculator: boolean;
  useDca: boolean;
  useTimeExit: boolean;
  useLiquidityCheck: boolean;
  useTrailingTp: boolean;
  useTrailingSl: boolean;
  dcaConfig: {
    legs: number;
    legAmountPct: number;
    intervalMinutes: number;
  };
  timeExitConfig: {
    maxHours: number;
    warningBeforeHours: number;
  };
  liquidityConfig: {
    minLiquiditySol: number;
  };
  riskConfig: {
    riskPerTradePct: number;
  };
  trailingTp: {
    activationPct: number;
    callbackPct: number;
  };
  trailingSl: {
    offsetPct: number;
  };
  fixedTpPct: number;
  fixedSlPct: number;
  tradingLimits: {
    maxPerToken: number;
    maxDailyTradesPerToken: number;
    cooldownMinutes: number;
  };
}

export interface TrackedPosition {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  entryPrice: number;
  currentPrice: number;
  highPrice: number;
  entryTime: string;
  amountSol: number;
  totalInvestedSol: number;
  targetTpPrice: number;
  stopLossPrice: number;
  status: "watching" | "closed";
  tpTriggered: boolean;
  slTriggered: boolean;
  trailingTpActive: boolean;
  trailingSlActive: boolean;
  trailingTpTrigger: number;
  trailingSlTrigger: number;
  isDca: boolean;
  dcaLegsCompleted: number;
  dcaLastLegTime?: number;
  dcaPool?: DcaPoolSnapshot;
  timeExitAt?: string;
}

export interface ExecuteCallback {
  (pool: ScreenedPool, amountSol: number): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }>;
}

export interface SellCallback {
  (position: TrackedPosition, reason: string, pnlPct?: number): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }>;
}

export interface PriceCallback {
  (tokenMint: string): Promise<number>;
}

export interface LiquidityCallback {
  (poolAddress: string, amountSol: number): Promise<{
    canExecute: boolean;
    reasons: string[];
  }>;
}

export interface RiskCallback {
  (capital: number): Promise<number>;
}

export interface DcaLegCallback {
  (pool: DcaPoolSnapshot, amountSol: number, legNumber: number): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }>;
}

export interface NotificationCallback {
  (message: string): Promise<void>;
}

export interface PositionHealth {
  overall: number;
  pnlScore: number;
  timeScore: number;
  trendScore: number;
  recommendation: "hold" | "add" | "reduce" | "exit";
}

export interface DcaPoolSnapshot {
  address: string;
  tokenYSymbol: string;
  tvl: number;
  volume24h: number;
  score: number;
}

export interface PositionSnapshot {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  entryPrice: number;
  currentPrice: number;
  highPrice: number;
  entryTime: string;
  amountSol: number;
  totalInvestedSol: number;
  status: "watching" | "closed";
  tpTriggered: boolean;
  slTriggered: boolean;
  trailingTpActive: boolean;
  trailingSlActive: boolean;
  trailingTpTrigger: number;
  trailingSlTrigger: number;
  isDca: boolean;
  dcaLegsCompleted: number;
  timeExitAt?: string;
}

export interface PersistenceCallback {
  savePositions: (positions: PositionSnapshot[]) => Promise<void>;
  loadPositions: () => Promise<PositionSnapshot[]>;
}

export class AutoExecuteService {
  private config: AutoExecuteConfig;
  private positions: Map<string, TrackedPosition> = new Map();
  private currentCapital: number;
  private executeCallback?: ExecuteCallback;
  private sellCallback?: SellCallback;
  private priceCallback?: PriceCallback;
  private liquidityCallback?: LiquidityCallback;
  private riskCallback?: RiskCallback;
  private dcaCallback?: DcaLegCallback;
  private notifyCallback?: NotificationCallback;
  private persistCallback?: PersistenceCallback;
  private monitorInterval?: NodeJS.Timeout;
  private tokenTradeHistory: Map<string, number[]> = new Map();
  private lastTradeTime: number = 0;

  constructor(
    config: Partial<AutoExecuteConfig> = {},
    initialCapital: number = 10
  ) {
    this.config = {
      enabled: false,
      minScoreToExecute: 85,
      positionSizePct: 10,
      maxConcurrentPositions: 5,
      useRiskCalculator: false,
      useDca: false,
      useTimeExit: false,
      useLiquidityCheck: true,
      useTrailingTp: true,
      useTrailingSl: true,
      dcaConfig: {
        legs: 3,
        legAmountPct: 33,
        intervalMinutes: 5,
      },
      timeExitConfig: {
        maxHours: 24,
        warningBeforeHours: 1,
      },
      liquidityConfig: {
        minLiquiditySol: 5,
      },
      riskConfig: {
        riskPerTradePct: 2,
      },
      trailingTp: {
        activationPct: 25,
        callbackPct: 10,
      },
      trailingSl: {
        offsetPct: 5,
      },
      fixedTpPct: 50,
      fixedSlPct: 20,
      tradingLimits: {
        maxPerToken: 2,
        maxDailyTradesPerToken: 5,
        cooldownMinutes: 5,
      },
    };
    this.config = { ...this.config, ...config };
    this.currentCapital = initialCapital;
  }

  updateConfig(updates: Partial<AutoExecuteConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info("AutoExecute config updated", { updates });
  }

  getConfig(): AutoExecuteConfig {
    return { ...this.config };
  }

  setExecuteCallback(callback: ExecuteCallback): void {
    this.executeCallback = callback;
  }

  setSellCallback(callback: SellCallback): void {
    this.sellCallback = callback;
  }

  setPriceCallback(callback: PriceCallback): void {
    this.priceCallback = callback;
  }

  setLiquidityCallback(callback: LiquidityCallback): void {
    this.liquidityCallback = callback;
  }

  setRiskCallback(callback: RiskCallback): void {
    this.riskCallback = callback;
  }

  setDcaCallback(callback: DcaLegCallback): void {
    this.dcaCallback = callback;
  }

  setNotifyCallback(callback: NotificationCallback): void {
    this.notifyCallback = callback;
  }

  setPersistCallback(callback: PersistenceCallback): void {
    this.persistCallback = callback;
  }

  async loadPositions(): Promise<void> {
    if (!this.persistCallback) return;

    try {
      const saved = await this.persistCallback.loadPositions();
      if (saved && Array.isArray(saved)) {
        for (const snapshot of saved) {
          if (snapshot.status === "watching") {
            this.positions.set(snapshot.id, {
              id: snapshot.id,
              tokenMint: snapshot.tokenMint,
              tokenSymbol: snapshot.tokenSymbol,
              entryPrice: snapshot.entryPrice,
              currentPrice: snapshot.currentPrice,
              highPrice: snapshot.highPrice,
              entryTime: snapshot.entryTime,
              amountSol: snapshot.amountSol,
              totalInvestedSol: snapshot.totalInvestedSol,
              targetTpPrice: snapshot.entryPrice * (1 + this.config.fixedTpPct / 100),
              stopLossPrice: snapshot.entryPrice * (1 - this.config.fixedSlPct / 100),
              status: "watching",
              tpTriggered: false,
              slTriggered: false,
              trailingTpActive: snapshot.trailingTpActive,
              trailingSlActive: snapshot.trailingSlActive,
              trailingTpTrigger: snapshot.trailingTpTrigger,
              trailingSlTrigger: snapshot.trailingSlTrigger,
              isDca: snapshot.isDca,
              dcaLegsCompleted: snapshot.dcaLegsCompleted,
              timeExitAt: snapshot.timeExitAt,
            });
          }
        }
        logger.info(`Loaded ${this.positions.size} positions from persistence`);
      }
    } catch (error) {
      logger.warn("Failed to load positions from persistence", {
        error: error instanceof Error ? error.message : "Unknown"
      });
    }
  }

  async savePositions(): Promise<void> {
    if (!this.persistCallback) return;

    try {
      const snapshots: PositionSnapshot[] = Array.from(this.positions.values()).map(p => ({
        id: p.id,
        tokenMint: p.tokenMint,
        tokenSymbol: p.tokenSymbol,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        highPrice: p.highPrice,
        entryTime: p.entryTime,
        amountSol: p.amountSol,
        totalInvestedSol: p.totalInvestedSol,
        status: p.status,
        tpTriggered: p.tpTriggered,
        slTriggered: p.slTriggered,
        trailingTpActive: p.trailingTpActive,
        trailingSlActive: p.trailingSlActive,
        trailingTpTrigger: p.trailingTpTrigger,
        trailingSlTrigger: p.trailingSlTrigger,
        isDca: p.isDca,
        dcaLegsCompleted: p.dcaLegsCompleted,
        timeExitAt: p.timeExitAt,
      }));

      await this.persistCallback.savePositions(snapshots);
      logger.debug(`Saved ${snapshots.length} positions to persistence`);
    } catch (error) {
      logger.warn("Failed to save positions to persistence", {
        error: error instanceof Error ? error.message : "Unknown"
      });
    }
  }

  setCurrentCapital(capital: number): void {
    this.currentCapital = capital;
  }

  async shouldExecute(pool: ScreenedPool): Promise<{ canExecute: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    if (!this.config.enabled) {
      reasons.push("Auto-execute disabled");
      return { canExecute: false, reasons };
    }

    if (pool.score < this.config.minScoreToExecute) {
      reasons.push(`Score ${pool.score} < ${this.config.minScoreToExecute}`);
      return { canExecute: false, reasons };
    }

    if (this.positions.size >= this.config.maxConcurrentPositions) {
      reasons.push(`Max positions (${this.config.maxConcurrentPositions}) reached`);
      return { canExecute: false, reasons };
    }

    const existingPosition = Array.from(this.positions.values()).find(
      p => p.tokenMint === pool.address && p.status !== "closed"
    );
    if (existingPosition) {
      reasons.push("Position already exists");
      return { canExecute: false, reasons };
    }

    const tokenPositions = Array.from(this.positions.values()).filter(
      p => p.tokenMint === pool.address
    );
    if (tokenPositions.length >= this.config.tradingLimits.maxPerToken) {
      reasons.push(`Max positions per token (${this.config.tradingLimits.maxPerToken}) reached`);
      return { canExecute: false, reasons };
    }

    const now = Date.now();
    const cooldownMs = this.config.tradingLimits.cooldownMinutes * 60 * 1000;
    if (now - this.lastTradeTime < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - this.lastTradeTime)) / 1000);
      reasons.push(`Cooldown active: ${remainingSeconds}s remaining`);
      return { canExecute: false, reasons };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const dailyTrades = this.tokenTradeHistory.get(pool.address) || [];
    const recentDailyTrades = dailyTrades.filter(t => t >= todayMs);
    if (recentDailyTrades.length >= this.config.tradingLimits.maxDailyTradesPerToken) {
      reasons.push(`Daily trade limit (${this.config.tradingLimits.maxDailyTradesPerToken}) reached`);
      return { canExecute: false, reasons };
    }

    if (this.config.useLiquidityCheck && this.liquidityCallback) {
      let amountSol = this.calculatePositionSize();
      const liquidityCheck = await this.liquidityCallback(pool.address, amountSol);
      if (!liquidityCheck.canExecute) {
        return { canExecute: false, reasons: liquidityCheck.reasons };
      }
      reasons.push(...liquidityCheck.reasons);
    }

    return { canExecute: true, reasons };
  }

  private calculatePositionSize(): number {
    if (this.config.useRiskCalculator && this.riskCallback) {
      return this.currentCapital * (this.config.riskConfig.riskPerTradePct / 100);
    }
    return this.currentCapital * 0.1;
  }

  async execute(pool: ScreenedPool): Promise<{
    success: boolean;
    positionId?: string;
    amountSol?: number;
    error?: string;
  }> {
    const shouldCheck = await this.shouldExecute(pool);
    if (!shouldCheck.canExecute) {
      return { success: false, error: shouldCheck.reasons.join("; ") };
    }

    let amountSol = this.calculatePositionSize();

    if (amountSol < 0.01) {
      return { success: false, error: "Amount too small" };
    }

    if (!this.executeCallback) {
      return { success: false, error: "Execute callback not set" };
    }

    try {
      const result = await this.executeCallback(pool, amountSol);

      if (result.success) {
        this.lastTradeTime = Date.now();
        const tokenHistory = this.tokenTradeHistory.get(pool.address) || [];
        tokenHistory.push(Date.now());
        this.tokenTradeHistory.set(pool.address, tokenHistory);

        const entryPrice = pool.poolData.tvl / (pool.poolData.volume24h || 1);
        const position: TrackedPosition = {
          id: `auto_${Date.now()}`,
          tokenMint: pool.address,
          tokenSymbol: pool.poolData.tokenYSymbol,
          entryPrice,
          currentPrice: entryPrice,
          highPrice: entryPrice,
          entryTime: new Date().toISOString(),
          amountSol,
          totalInvestedSol: amountSol,
          targetTpPrice: entryPrice * (1 + this.config.fixedTpPct / 100),
          stopLossPrice: entryPrice * (1 - this.config.fixedSlPct / 100),
          status: "watching",
          tpTriggered: false,
          slTriggered: false,
          trailingTpActive: false,
          trailingSlActive: false,
          trailingTpTrigger: 0,
          trailingSlTrigger: 0,
          isDca: this.config.useDca,
          dcaLegsCompleted: 1,
          dcaLastLegTime: Date.now(),
          dcaPool: this.config.useDca ? {
            address: pool.address,
            tokenYSymbol: pool.poolData.tokenYSymbol,
            tvl: pool.poolData.tvl,
            volume24h: pool.poolData.volume24h,
            score: pool.score,
          } : undefined,
        };

        if (this.config.useTimeExit) {
          const exitTime = new Date();
          exitTime.setHours(exitTime.getHours() + this.config.timeExitConfig.maxHours);
          position.timeExitAt = exitTime.toISOString();
        }

        this.positions.set(position.id, position);
        logger.info(`Auto-execute: Opened ${pool.poolData.tokenYSymbol} at ${entryPrice}, amount: ${amountSol} SOL`);

        if (this.notifyCallback) {
          const dcaText = position.isDca ? `\n• DCA: ${position.dcaLegsCompleted}/${this.config.dcaConfig.legs} legs` : "";
          await this.notifyCallback(
            `📊 *Position Opened*\n\n` +
            `Token: ${position.tokenSymbol}\n` +
            `Entry: ${entryPrice.toFixed(8)}\n` +
            `Amount: ${amountSol} SOL\n` +
            `Total Invested: ${position.totalInvestedSol} SOL\n` +
            `TP: ${this.config.fixedTpPct}% | SL: ${this.config.fixedSlPct}%${dcaText}`
          );
        }

        this.savePositions().catch(() => {});
        return { success: true, positionId: position.id, amountSol };
      }

      return { success: false, error: result.error };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  }

  private async checkAndExecuteDca(position: TrackedPosition): Promise<{ executed: boolean; legNumber: number }> {
    if (!this.config.useDca || !position.dcaPool) {
      return { executed: false, legNumber: 0 };
    }

    const { legs, legAmountPct, intervalMinutes } = this.config.dcaConfig;

    if (position.dcaLegsCompleted >= legs) {
      return { executed: false, legNumber: position.dcaLegsCompleted };
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    const now = Date.now();
    const lastLegTime = position.dcaLastLegTime || new Date(position.entryTime).getTime();

    if (now - lastLegTime < intervalMs) {
      return { executed: false, legNumber: position.dcaLegsCompleted };
    }

    if (!this.dcaCallback) {
      return { executed: false, legNumber: position.dcaLegsCompleted };
    }

    const legAmount = this.calculatePositionSize() * (legAmountPct / 100);

    if (legAmount < 0.01) {
      return { executed: false, legNumber: position.dcaLegsCompleted };
    }

    try {
      const result = await this.dcaCallback(position.dcaPool, legAmount, position.dcaLegsCompleted + 1);

      if (result.success) {
        position.dcaLegsCompleted += 1;
        position.dcaLastLegTime = now;
        position.totalInvestedSol += legAmount;

        const newEntryPrice = (position.entryPrice * (position.dcaLegsCompleted - 1) + position.currentPrice) / position.dcaLegsCompleted;
        position.entryPrice = newEntryPrice;

        position.targetTpPrice = position.entryPrice * (1 + this.config.fixedTpPct / 100);
        position.stopLossPrice = position.entryPrice * (1 - this.config.fixedSlPct / 100);

        logger.info(`DCA leg ${position.dcaLegsCompleted}/${legs} executed for ${position.tokenSymbol}, added ${legAmount} SOL`);

        if (this.notifyCallback) {
          await this.notifyCallback(
            `💎 *DCA Leg ${position.dcaLegsCompleted}/${legs}*\n\n` +
            `Token: ${position.tokenSymbol}\n` +
            `Price: ${position.currentPrice.toFixed(8)}\n` +
            `Added: ${legAmount} SOL\n` +
            `Total Invested: ${position.totalInvestedSol} SOL\n` +
            `New Entry: ${position.entryPrice.toFixed(8)}`
          );
        }

        this.savePositions().catch(() => {});
        return { executed: true, legNumber: position.dcaLegsCompleted };
      }
    } catch (error) {
      logger.warn(`DCA leg execution failed for ${position.tokenSymbol}`, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return { executed: false, legNumber: position.dcaLegsCompleted };
  }

  async checkAndExecuteTpSl(): Promise<void> {
    if (!this.priceCallback) return;

    for (const position of this.positions.values()) {
      if (position.status === "closed") continue;

      try {
        position.currentPrice = await this.priceCallback(position.tokenMint);
      } catch {
        continue;
      }

      position.highPrice = Math.max(position.highPrice, position.currentPrice);

      if (this.config.useDca && position.isDca && position.dcaPool) {
        const dcaResult = await this.checkAndExecuteDca(position);
        if (dcaResult.executed) {
          logger.info(`DCA leg ${dcaResult.legNumber} executed for ${position.tokenSymbol}`);
        }
      }

      if (this.config.useTrailingTp) {
        const profitFromEntry = ((position.highPrice - position.entryPrice) / position.entryPrice) * 100;

        if (profitFromEntry >= this.config.trailingTp.activationPct && !position.trailingTpActive) {
          position.trailingTpActive = true;
          position.trailingTpTrigger = position.highPrice * (1 - this.config.trailingTp.callbackPct / 100);
          logger.info(`Trailing TP activated for ${position.tokenSymbol} at ${position.highPrice}`);

          if (this.notifyCallback) {
            await this.notifyCallback(
              `🎯 *Trailing TP Activated*\n\n` +
              `Token: ${position.tokenSymbol}\n` +
              `High: ${position.highPrice.toFixed(8)}\n` +
              `Callback at: ${position.trailingTpTrigger.toFixed(8)}`
            );
          }
        }

        if (position.trailingTpActive && position.currentPrice <= position.trailingTpTrigger) {
          await this.closePosition(position, "trailing_tp");
          continue;
        }
      } else {
        if (position.currentPrice >= position.targetTpPrice && !position.tpTriggered) {
          await this.closePosition(position, "tp");
          continue;
        }
      }

      if (this.config.useTrailingSl) {
        if (!position.trailingSlActive) {
          position.trailingSlActive = true;
          position.trailingSlTrigger = position.highPrice * (1 - this.config.trailingSl.offsetPct / 100);
        }

        if (position.currentPrice <= position.trailingSlTrigger) {
          await this.closePosition(position, "trailing_sl");
          continue;
        }
      } else {
        if (position.currentPrice <= position.stopLossPrice && !position.slTriggered) {
          await this.closePosition(position, "sl");
          continue;
        }
      }

      if (this.config.useTimeExit && position.timeExitAt) {
        const exitTime = new Date(position.timeExitAt);
        if (Date.now() >= exitTime.getTime()) {
          await this.closePosition(position, "time_exit");
          continue;
        }
      }
    }
  }

  private async closePosition(position: TrackedPosition, reason: string): Promise<void> {
    position.status = "closed";
    position.tpTriggered = reason.includes("tp");
    position.slTriggered = reason.includes("sl");

    const pnlPct = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const pnlSol = position.totalInvestedSol * (pnlPct / 100);

    if (this.sellCallback) {
      await this.sellCallback(position, reason, pnlPct);
    }

    logger.info(`Auto-execute: Closed ${position.tokenSymbol} via ${reason} at ${position.currentPrice}`);

    if (this.notifyCallback) {
      const reasonEmoji = reason.includes("tp") ? "🎯" : reason.includes("sl") ? "🛡️" : "⏱️";
      const reasonText = reason.includes("tp") ? "Take Profit" :
                         reason.includes("sl") ? "Stop Loss" :
                         reason.includes("time") ? "Time Exit" :
                         reason.includes("trailing_tp") ? "Trailing TP" :
                         reason.includes("trailing_sl") ? "Trailing SL" : reason;

      await this.notifyCallback(
        `${reasonEmoji} *Position Closed*\n\n` +
        `Token: ${position.tokenSymbol}\n` +
        `Reason: ${reasonText}\n` +
        `Exit Price: ${position.currentPrice.toFixed(8)}\n` +
        `Entry Price: ${position.entryPrice.toFixed(8)}\n` +
        `Total Invested: ${position.totalInvestedSol} SOL\n` +
        `PnL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL)`
      );
    }

    this.savePositions().catch(() => {});
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.monitorInterval = setInterval(async () => {
      await this.checkAndExecuteTpSl();
      this.cleanupClosedPositions();
    }, intervalMs);

    logger.info(`Auto-execute monitoring started, interval: ${intervalMs}ms`);
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  cleanupClosedPositions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, position] of this.positions.entries()) {
      if (position.status === "closed") {
        const closedTime = position.currentPrice > 0 ? now : now;
        if (now - closedTime > maxAgeMs) {
          this.positions.delete(id);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} closed positions from memory`);
    }

    return cleaned;
  }

  getPositions(): TrackedPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status !== "closed");
  }

  getAllPositions(): TrackedPosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(positionId: string): TrackedPosition | undefined {
    return this.positions.get(positionId);
  }

  calculateHealth(position: TrackedPosition): PositionHealth {
    const pnlPct = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const timeElapsed = Date.now() - new Date(position.entryTime).getTime();
    const hoursElapsed = timeElapsed / (1000 * 60 * 60);
    const maxHours = this.config.timeExitConfig.maxHours;
    const timeRemainingPct = Math.max(0, 100 - (hoursElapsed / maxHours) * 100);
    const priceFromHigh = ((position.highPrice - position.currentPrice) / position.highPrice) * 100;

    let pnlScore = 50;
    if (pnlPct > 20) pnlScore = 90;
    else if (pnlPct > 10) pnlScore = 75;
    else if (pnlPct > 0) pnlScore = 60;
    else if (pnlPct > -10) pnlScore = 40;
    else pnlScore = 20;

    let timeScore = timeRemainingPct;

    let trendScore = 50;
    if (position.trailingTpActive) {
      trendScore = 80;
    } else if (priceFromHigh < 5) {
      trendScore = 70;
    } else if (priceFromHigh < 10) {
      trendScore = 55;
    } else if (priceFromHigh < 20) {
      trendScore = 40;
    } else {
      trendScore = 20;
    }

    const overall = Math.round((pnlScore * 0.4 + timeScore * 0.2 + trendScore * 0.4));

    let recommendation: "hold" | "add" | "reduce" | "exit";
    if (overall >= 70) recommendation = "hold";
    else if (overall >= 50 && pnlPct > 5) recommendation = "add";
    else if (overall >= 40 || pnlPct < -15) recommendation = "reduce";
    else recommendation = "exit";

    return {
      overall,
      pnlScore,
      timeScore: Math.round(timeScore),
      trendScore,
      recommendation,
    };
  }

  getPositionsWithHealth(): Array<{ position: TrackedPosition; health: PositionHealth }> {
    return Array.from(this.positions.values())
      .filter(p => p.status !== "closed")
      .map(position => ({
        position,
        health: this.calculateHealth(position),
      }));
  }

  applyBacktestOptimizedParams(params: {
    fixedTpPct?: number;
    fixedSlPct?: number;
    trailingTpActivationPct?: number;
    trailingTpCallbackPct?: number;
    trailingSlOffsetPct?: number;
    timeExitMaxHours?: number;
  }): void {
    const updates: Partial<AutoExecuteConfig> = {};

    if (params.fixedTpPct !== undefined) {
      updates.fixedTpPct = params.fixedTpPct;
    }
    if (params.fixedSlPct !== undefined) {
      updates.fixedSlPct = params.fixedSlPct;
    }
    if (params.trailingTpActivationPct !== undefined || params.trailingTpCallbackPct !== undefined) {
      updates.trailingTp = {
        activationPct: params.trailingTpActivationPct ?? this.config.trailingTp.activationPct,
        callbackPct: params.trailingTpCallbackPct ?? this.config.trailingTp.callbackPct,
      };
    }
    if (params.trailingSlOffsetPct !== undefined) {
      updates.trailingSl = {
        offsetPct: params.trailingSlOffsetPct,
      };
    }
    if (params.timeExitMaxHours !== undefined) {
      updates.timeExitConfig = {
        ...this.config.timeExitConfig,
        maxHours: params.timeExitMaxHours,
      };
    }

    this.updateConfig(updates);
    logger.info("Applied backtest-optimized parameters", { params });
  }

  getOptimalParamsFromBacktest(results: Array<{
    tpPct: number;
    slPct: number;
    returnPct: number;
    winRate: number;
  }>): {
    bestTpPct: number;
    bestSlPct: number;
    expectedReturn: number;
  } {
    let bestResult = results[0];

    for (const result of results) {
      const score = result.returnPct * 0.5 + result.winRate * 50 * 0.5;
      const bestScore = bestResult.returnPct * 0.5 + bestResult.winRate * 50 * 0.5;
      if (score > bestScore) {
        bestResult = result;
      }
    }

    const avgReturn = results.reduce((sum, r) => sum + r.returnPct, 0) / results.length;

    return {
      bestTpPct: bestResult.tpPct,
      bestSlPct: bestResult.slPct,
      expectedReturn: avgReturn,
    };
  }

  removePosition(positionId: string): void {
    this.positions.delete(positionId);
  }

  getSummary(): {
    enabled: boolean;
    activePositions: number;
    config: AutoExecuteConfig;
  } {
    return {
      enabled: this.config.enabled,
      activePositions: this.positions.size,
      config: this.getConfig(),
    };
  }
}

export function createAutoExecuteService(
  config?: Partial<AutoExecuteConfig>,
  initialCapital?: number
): AutoExecuteService {
  return new AutoExecuteService(config, initialCapital);
}
