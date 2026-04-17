/**
 * Time Exit Service
 *
 * Auto-close positions after X hours, not just TP/SL.
 */

import { logger } from "../../utils/logger";

export interface TimeExitConfig {
  enabled: boolean;
  defaultMaxHours: number;
  warningBeforeHours: number;
}

export interface TimedPosition {
  positionId: string;
  tokenSymbol: string;
  entryTime: string;
  maxExitTime: string;
  status: "active" | "warning" | "expired";
  notifiedWarning: boolean;
  notifiedExpired: boolean;
}

export interface TimeExitCallback {
  (position: TimedPosition, reason: "time" | "warning"): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export class TimeExitService {
  private config: TimeExitConfig;
  private positions: Map<string, TimedPosition> = new Map();
  private callbacks: Map<string, TimeExitCallback> = new Map();
  private checkInterval?: NodeJS.Timeout;

  constructor(config?: Partial<TimeExitConfig>) {
    this.config = {
      enabled: false,
      defaultMaxHours: 24,
      warningBeforeHours: 1,
      ...config,
    };
  }

  updateConfig(config: Partial<TimeExitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TimeExitConfig {
    return { ...this.config };
  }

  addPosition(
    positionId: string,
    tokenSymbol: string,
    entryTime: string,
    maxHours?: number
  ): TimedPosition {
    const hours = maxHours ?? this.config.defaultMaxHours;
    const entry = new Date(entryTime);
    const maxExit = new Date(entry.getTime() + hours * 60 * 60 * 1000);

    const timedPosition: TimedPosition = {
      positionId,
      tokenSymbol,
      entryTime,
      maxExitTime: maxExit.toISOString(),
      status: "active",
      notifiedWarning: false,
      notifiedExpired: false,
    };

    this.positions.set(positionId, timedPosition);
    logger.info(`Time exit set for ${tokenSymbol}: ${hours}h (expires ${maxExit.toLocaleString()})`);

    return timedPosition;
  }

  removePosition(positionId: string): void {
    this.positions.delete(positionId);
  }

  setCallback(positionId: string, callback: TimeExitCallback): void {
    this.callbacks.set(positionId, callback);
  }

  checkPositions(): void {
    const now = Date.now();

    for (const [positionId, position] of this.positions) {
      if (position.status === "expired") continue;

      const maxExitTime = new Date(position.maxExitTime).getTime();
      const hoursRemaining = (maxExitTime - now) / (1000 * 60 * 60);
      const warningThreshold = this.config.warningBeforeHours;

      if (hoursRemaining <= 0) {
        position.status = "expired";

        if (!position.notifiedExpired) {
          position.notifiedExpired = true;
          this.triggerCallback(position, "time");
        }
      } else if (hoursRemaining <= warningThreshold && !position.notifiedWarning) {
        position.status = "warning";
        position.notifiedWarning = true;
        this.triggerCallback(position, "warning");
        logger.info(`Time exit warning for ${position.tokenSymbol}: ${hoursRemaining.toFixed(1)}h remaining`);
      }
    }
  }

  private async triggerCallback(position: TimedPosition, reason: "time" | "warning"): Promise<void> {
    const callback = this.callbacks.get(position.positionId);
    if (callback) {
      try {
        await callback(position, reason);
      } catch (error) {
        logger.error(`Time exit callback failed for ${position.positionId}`, { error });
      }
    }
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkPositions();
    }, intervalMs);

    logger.info(`Time exit monitoring started, interval: ${intervalMs}ms`);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      logger.info("Time exit monitoring stopped");
    }
  }

  getPosition(positionId: string): TimedPosition | undefined {
    return this.positions.get(positionId);
  }

  getAllPositions(): TimedPosition[] {
    return Array.from(this.positions.values());
  }

  getActivePositions(): TimedPosition[] {
    return this.getAllPositions().filter(p => p.status !== "expired");
  }

  formatPositionsList(): string {
    const active = this.getActivePositions();

    if (active.length === 0) {
      return "📭 No active time exits";
    }

    const lines = ["*Time Exit Positions*\n"];
    const now = Date.now();

    for (const pos of active) {
      const maxExit = new Date(pos.maxExitTime).getTime();
      const hoursRemaining = (maxExit - now) / (1000 * 60 * 60);
      const timeText = hoursRemaining > 0 
        ? `${hoursRemaining.toFixed(1)}h remaining` 
        : "EXPIRED";

      const statusIcon = pos.status === "warning" ? "⚠️" : "⏰";

      lines.push(
        `${statusIcon} *${pos.tokenSymbol}*`,
        `   ${timeText}`,
        `   Max: ${new Date(pos.maxExitTime).toLocaleTimeString()}`,
        ""
      );
    }

    return lines.join("\n");
  }

  getSummary(): {
    total: number;
    active: number;
    warning: number;
    expired: number;
    config: TimeExitConfig;
  } {
    const all = this.getAllPositions();
    return {
      total: all.length,
      active: all.filter(p => p.status === "active").length,
      warning: all.filter(p => p.status === "warning").length,
      expired: all.filter(p => p.status === "expired").length,
      config: this.getConfig(),
    };
  }
}

export function createTimeExitService(config?: Partial<TimeExitConfig>): TimeExitService {
  return new TimeExitService(config);
}
