/**
 * Base Worker Class
 *
 * Provides common functionality for all background workers.
 */

import { logger } from "../../utils/logger";

export interface WorkerConfig {
  name: string;
  intervalMs: number;
  enabled: boolean;
  onError?: (error: Error) => void;
}

export interface WorkerMetrics {
  name: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  runCount: number;
  successCount: number;
  errorCount: number;
  avgRunTimeMs: number;
}

export abstract class BaseWorker {
  protected config: WorkerConfig;
  protected timer: NodeJS.Timeout | null = null;
  protected metrics: WorkerMetrics;
  protected isRunning = false;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.metrics = {
      name: config.name,
      runCount: 0,
      successCount: 0,
      errorCount: 0,
      avgRunTimeMs: 0,
    };
  }

  abstract execute(): Promise<void>;

  start(): void {
    if (this.timer) {
      logger.warn(`${this.config.name}: Worker already started`);
      return;
    }

    if (!this.config.enabled) {
      logger.info(`${this.config.name}: Worker disabled`);
      return;
    }

    logger.info(`${this.config.name}: Starting worker with ${this.config.intervalMs / 1000}s interval`);

    this.isRunning = true;
    this.runOnce();

    this.timer = setInterval(() => {
      this.runOnce();
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info(`${this.config.name}: Worker stopped`);
  }

  async runOnce(): Promise<void> {
    if (this.isRunning) {
      await this.safeExecute();
    }
  }

  private async safeExecute(): Promise<void> {
    const startTime = Date.now();
    this.metrics.lastRunAt = new Date().toISOString();
    this.metrics.runCount++;

    try {
      logger.debug(`${this.config.name}: Executing...`);
      await this.execute();

      const runTime = Date.now() - startTime;
      this.metrics.lastSuccessAt = new Date().toISOString();
      this.metrics.successCount++;

      this.updateAvgRunTime(runTime);

      logger.debug(`${this.config.name}: Completed in ${runTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.metrics.lastErrorAt = new Date().toISOString();
      this.metrics.lastError = errorMessage;
      this.metrics.errorCount++;

      logger.error(`${this.config.name}: Error - ${errorMessage}`);

      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(errorMessage));
      }
    }
  }

  private updateAvgRunTime(newRunTime: number): void {
    const totalTime = this.metrics.avgRunTimeMs * (this.metrics.successCount - 1) + newRunTime;
    this.metrics.avgRunTimeMs = totalTime / this.metrics.successCount;
  }

  getMetrics(): WorkerMetrics {
    return { ...this.metrics };
  }

  isHealthy(): boolean {
    if (!this.config.enabled) return true;
    if (!this.isRunning) return false;

    if (this.metrics.lastErrorAt) {
      const lastErrorTime = new Date(this.metrics.lastErrorAt).getTime();
      const now = Date.now();
      const hoursSinceError = (now - lastErrorTime) / (1000 * 60 * 60);

      if (hoursSinceError < 1) {
        return false;
      }
    }

    return true;
  }

  getStatus(): { name: string; running: boolean; healthy: boolean; metrics: WorkerMetrics } {
    return {
      name: this.config.name,
      running: this.isRunning,
      healthy: this.isHealthy(),
      metrics: this.getMetrics(),
    };
  }
}
