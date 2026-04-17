/**
 * DCA Service
 *
 * Dollar Cost Averaging - Average in pelan-pelan instead of all-in.
 */

import { logger } from "../../utils/logger";

export interface DcaConfig {
  enabled: boolean;
  legs: number;
  legAmountSol: number;
  intervalMinutes: number;
  maxPriceDiffPct: number;
}

export interface DcaLeg {
  legNumber: number;
  amountSol: number;
  executedAt?: string;
  price?: number;
  status: "pending" | "executed" | "skipped";
}

export interface DcaPosition {
  id: string;
  poolAddress: string;
  tokenSymbol: string;
  totalAmountSol: number;
  legs: DcaLeg[];
  currentLeg: number;
  status: "active" | "completed" | "cancelled";
  startTime: string;
  avgEntryPrice: number;
}

export interface DcaCallback {
  (position: DcaPosition, leg: DcaLeg): Promise<{
    success: boolean;
    price?: number;
    error?: string;
  }>;
}

export class DcaService {
  private config: DcaConfig;
  private positions: Map<string, DcaPosition> = new Map();
  private callbacks: Map<string, DcaCallback> = new Map();
  private intervalHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<DcaConfig>) {
    this.config = {
      enabled: false,
      legs: 3,
      legAmountSol: 0.1,
      intervalMinutes: 5,
      maxPriceDiffPct: 20,
      ...config,
    };
  }

  updateConfig(config: Partial<DcaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): DcaConfig {
    return { ...this.config };
  }

  createDcaPosition(
    id: string,
    poolAddress: string,
    tokenSymbol: string,
    totalAmountSol: number,
    config?: Partial<DcaConfig>
  ): DcaPosition | null {
    if (this.positions.has(id)) {
      logger.warn(`DCA position ${id} already exists`);
      return null;
    }

    const legs = config?.legs ?? this.config.legs;
    const legAmount = config?.legAmountSol ?? this.config.legAmountSol;

    if (totalAmountSol < legAmount * legs) {
      logger.warn(`Total amount ${totalAmountSol} too small for ${legs} legs of ${legAmount} SOL`);
      return null;
    }

    const position: DcaPosition = {
      id,
      poolAddress,
      tokenSymbol,
      totalAmountSol,
      legs: Array.from({ length: legs }, (_, i) => ({
        legNumber: i + 1,
        amountSol: legAmount,
        status: "pending",
      })),
      currentLeg: 0,
      status: "active",
      startTime: new Date().toISOString(),
      avgEntryPrice: 0,
    };

    this.positions.set(id, position);
    return position;
  }

  setCallback(positionId: string, callback: DcaCallback): void {
    this.callbacks.set(positionId, callback);
  }

  async executeNextLeg(positionId: string, currentPrice: number): Promise<{
    success: boolean;
    leg?: DcaLeg;
    error?: string;
  }> {
    const position = this.positions.get(positionId);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (position.status !== "active") {
      return { success: false, error: "Position not active" };
    }

    if (position.currentLeg >= position.legs.length) {
      position.status = "completed";
      return { success: false, error: "All legs completed" };
    }

    const leg = position.legs[position.currentLeg];
    if (leg.status === "executed") {
      return { success: false, error: "Leg already executed" };
    }

    const entryPrice = position.legs
      .filter(l => l.status === "executed" && l.price)
      .reduce((sum, l) => sum + (l.price || 0), 0);
    const executedLegs = position.legs.filter(l => l.status === "executed").length;

    if (executedLegs > 0) {
      const avgEntry = entryPrice / executedLegs;
      const priceDiff = Math.abs((currentPrice - avgEntry) / avgEntry) * 100;

      if (priceDiff > this.config.maxPriceDiffPct) {
        leg.status = "skipped";
        position.currentLeg++;
        logger.info(`DCA leg ${leg.legNumber} skipped: price diff ${priceDiff.toFixed(1)}%`);
        return { success: false, error: `Price diff too high: ${priceDiff.toFixed(1)}%` };
      }
    }

    const callback = this.callbacks.get(positionId);
    if (!callback) {
      return { success: false, error: "No callback set" };
    }

    try {
      const result = await callback(position, leg);

      if (result.success) {
        leg.status = "executed";
        leg.executedAt = new Date().toISOString();
        leg.price = result.price || currentPrice;
        position.currentLeg++;

        const executedWithPrice = position.legs.filter(l => l.status === "executed" && l.price);
        if (executedWithPrice.length > 0) {
          position.avgEntryPrice = executedWithPrice.reduce((sum, l) => sum + (l.price || 0), 0) / executedWithPrice.length;
        }

        if (position.currentLeg >= position.legs.length) {
          position.status = "completed";
        }

        logger.info(`DCA leg ${leg.legNumber} executed for ${position.tokenSymbol} at ${leg.price}`);
      }

      return { success: result.success, leg, error: result.error };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  }

  startAutoDca(positionId: string, getCurrentPrice: () => number): void {
    const position = this.positions.get(positionId);
    if (!position) return;

    const intervalMs = (this.config.intervalMinutes * 60 * 1000);

    const handle = setInterval(async () => {
      if (position.status !== "active") {
        this.stopAutoDca(positionId);
        return;
      }

      const price = getCurrentPrice();
      await this.executeNextLeg(positionId, price);
    }, intervalMs);

    this.intervalHandles.set(positionId, handle);
    logger.info(`Auto DCA started for ${positionId}, interval: ${this.config.intervalMinutes}min`);
  }

  stopAutoDca(positionId: string): void {
    const handle = this.intervalHandles.get(positionId);
    if (handle) {
      clearInterval(handle);
      this.intervalHandles.delete(positionId);
      logger.info(`Auto DCA stopped for ${positionId}`);
    }
  }

  cancelPosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (position) {
      position.status = "cancelled";
      this.stopAutoDca(positionId);
      logger.info(`DCA position ${positionId} cancelled`);
    }
  }

  getPosition(positionId: string): DcaPosition | undefined {
    return this.positions.get(positionId);
  }

  getAllPositions(): DcaPosition[] {
    return Array.from(this.positions.values());
  }

  getActivePositions(): DcaPosition[] {
    return this.getAllPositions().filter(p => p.status === "active");
  }

  formatPosition(position: DcaPosition): string {
    const completedLegs = position.legs.filter(l => l.status === "executed").length;
    const totalSpent = completedLegs * position.legs[0]?.amountSol;

    const lines = [
      `*DCA Position: ${position.tokenSymbol}*`,
      ``,
      `Status: ${position.status.toUpperCase()}`,
      `Progress: ${completedLegs}/${position.legs.length} legs`,
      `Total Budget: ${position.totalAmountSol} SOL`,
      `Spent: ${totalSpent.toFixed(4)} SOL`,
      `Avg Entry: ${position.avgEntryPrice > 0 ? position.avgEntryPrice.toFixed(8) : "N/A"}`,
      ``,
      `*Legs:*`,
    ];

    for (const leg of position.legs) {
      const statusIcon = leg.status === "executed" ? "✅" : leg.status === "skipped" ? "⏭️" : "⏳";
      const priceInfo = leg.price ? `@ ${leg.price.toFixed(8)}` : "";
      lines.push(`${statusIcon} Leg ${leg.legNumber}: ${leg.amountSol} SOL ${priceInfo}`);
    }

    return lines.join("\n");
  }
}

export function createDcaService(config?: Partial<DcaConfig>): DcaService {
  return new DcaService(config);
}
