/**
 * Health Worker
 *
 * Monitors health of all system components: RPC, Rust engine, workers, etc.
 */

import { BaseWorker, type WorkerConfig } from "./baseWorker";
import { Connection } from "@solana/web3.js";
import { logger } from "../../utils/logger";

export interface HealthWorkerConfig extends WorkerConfig {
  rpcEndpoint: string;
  rustEngineUrl: string;
  criticalThreshold: number;
  warningThreshold: number;
}

export interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs?: number;
  error?: string;
  lastCheck: string;
}

export class HealthWorker extends BaseWorker {
  private connection: Connection;
  private rustEngineUrl: string;
  private criticalThreshold: number;
  private warningThreshold: number;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private notifyCallback?: (issues: ServiceHealth[]) => Promise<void>;

  constructor(config: HealthWorkerConfig) {
    super({
      name: "HealthWorker",
      intervalMs: config.intervalMs,
      enabled: config.enabled,
    });

    this.connection = new Connection(config.rpcEndpoint, "confirmed");
    this.rustEngineUrl = config.rustEngineUrl;
    this.criticalThreshold = config.criticalThreshold;
    this.warningThreshold = config.warningThreshold;
  }

  setNotifyCallback(callback: (issues: ServiceHealth[]) => Promise<void>): void {
    this.notifyCallback = callback;
  }

  async execute(): Promise<void> {
    logger.debug("HealthWorker: Checking system health");

    const issues: ServiceHealth[] = [];

    await this.checkRPCHealth();
    await this.checkRustEngineHealth();
    await this.checkMemoryUsage();

    for (const health of this.serviceHealth.values()) {
      if (health.status !== "healthy") {
        issues.push(health);
      }
    }

    if (issues.length > 0 && this.notifyCallback) {
      await this.notifyCallback(issues);
    }
  }

  private async checkRPCHealth(): Promise<void> {
    const startTime = Date.now();
    try {
      const slot = await this.connection.getSlot();
      const latencyMs = Date.now() - startTime;

      this.serviceHealth.set("rpc", {
        name: "Solana RPC",
        status: latencyMs > this.criticalThreshold ? "degraded" : "healthy",
        latencyMs,
        lastCheck: new Date().toISOString(),
      });
    } catch (error) {
      this.serviceHealth.set("rpc", {
        name: "Solana RPC",
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
        lastCheck: new Date().toISOString(),
      });
    }
  }

  private async checkRustEngineHealth(): Promise<void> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.rustEngineUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        this.serviceHealth.set("rustEngine", {
          name: "Rust Copy Engine",
          status: "degraded",
          latencyMs,
          error: `HTTP ${response.status}`,
          lastCheck: new Date().toISOString(),
        });
        return;
      }

      this.serviceHealth.set("rustEngine", {
        name: "Rust Copy Engine",
        status: latencyMs > this.criticalThreshold ? "degraded" : "healthy",
        latencyMs,
        lastCheck: new Date().toISOString(),
      });
    } catch (error) {
      this.serviceHealth.set("rustEngine", {
        name: "Rust Copy Engine",
        status: "down",
        error: error instanceof Error ? error.message : "Connection failed",
        lastCheck: new Date().toISOString(),
      });
    }
  }

  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const heapUsagePct = (heapUsedMB / heapTotalMB) * 100;

    let status: "healthy" | "degraded" | "down" = "healthy";
    if (heapUsagePct > 90) {
      status = "down";
    } else if (heapUsagePct > 70) {
      status = "degraded";
    }

    this.serviceHealth.set("memory", {
      name: "Memory (Heap)",
      status,
      lastCheck: new Date().toISOString(),
    });
  }

  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.serviceHealth.get(serviceName);
  }

  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.serviceHealth.values());
  }

  isSystemHealthy(): boolean {
    for (const health of this.serviceHealth.values()) {
      if (health.status === "down") {
        return false;
      }
    }
    return true;
  }
}
