import { AppConfig } from "../domain/types";
import logger from "../utils/logger";
import { BaseWorker, type WorkerMetrics } from "./workers/baseWorker";
import { ScreeningWorker, type ScreeningWorkerConfig } from "./workers/screeningWorker";
import { ManagementWorker, type ManagementWorkerConfig } from "./workers/managementWorker";
import { HealthWorker, type HealthWorkerConfig } from "./workers/healthWorker";
import { ReportWorker, createReportWorker } from "./workers/reportWorker";
import type { ScreeningService } from "../modules/screening";
import type { EnhancedDLMMService } from "@prabu/meteora";
import type { EnvConfig } from "../domain/types";
import { PoolDiscoveryService, createPoolDiscoveryService } from "../modules/pool-discovery";
import { DailyReportService, createDailyReportService } from "../modules/reports";

export interface Scheduler {
  start(): void;
  stop(): void;
  getWorkerMetrics(): Record<string, WorkerMetrics>;
}

export interface WorkerInstances {
  screening?: ScreeningWorker;
  management?: ManagementWorker;
  health?: HealthWorker;
  dailyReport?: ReportWorker;
  weeklyReport?: ReportWorker;
}

export interface WorkerConfigInput {
  screening: {
    enabled: boolean;
    intervalMs: number;
    poolSources: string[];
    maxPoolsPerRun: number;
    minScoreToNotify: number;
    filters?: {
      minTvl?: number;
      maxTvl?: number;
      minVolume?: number;
      minOrganic?: number;
      maxBundlersPct?: number;
      maxTop10Pct?: number;
    };
  };
  management: {
    enabled: boolean;
    intervalMs: number;
    stopLossPct: number;
    takeProfitPct: number;
    oorWaitMinutes: number;
    autoRebalance: boolean;
    trackedPositions?: string[];
  };
  health: {
    enabled: boolean;
    intervalMs: number;
    rpcEndpoint: string;
    rustEngineUrl: string;
    criticalThreshold: number;
    warningThreshold: number;
  };
}

export function createWorkerInstances(
  config: WorkerConfigInput,
  deps: {
    screeningService: ScreeningService;
    dlmmService: EnhancedDLMMService;
    env: EnvConfig;
    poolDiscovery: PoolDiscoveryService;
  }
): WorkerInstances {
  const instances: WorkerInstances = {};

  if (config.health.enabled) {
    const healthConfig: HealthWorkerConfig = {
      name: "HealthWorker",
      intervalMs: config.health.intervalMs,
      enabled: config.health.enabled,
      rpcEndpoint: config.health.rpcEndpoint,
      rustEngineUrl: config.health.rustEngineUrl,
      criticalThreshold: config.health.criticalThreshold,
      warningThreshold: config.health.warningThreshold,
    };
    instances.health = new HealthWorker(healthConfig);
  }

  if (config.screening.enabled) {
    const screeningConfig: ScreeningWorkerConfig = {
      name: "ScreeningWorker",
      intervalMs: config.screening.intervalMs,
      enabled: config.screening.enabled,
      poolSources: config.screening.poolSources as ("meteora" | "raydium" | "orca" | "trending" | "new")[],
      maxPoolsPerRun: config.screening.maxPoolsPerRun,
      minScoreToNotify: config.screening.minScoreToNotify,
      filters: config.screening.filters,
    };
    instances.screening = new ScreeningWorker(
      screeningConfig,
      deps.screeningService,
      deps.dlmmService,
      deps.poolDiscovery
    );
  }

  if (config.management.enabled) {
    const managementConfig: ManagementWorkerConfig = {
      name: "ManagementWorker",
      intervalMs: config.management.intervalMs,
      enabled: config.management.enabled,
      stopLossPct: config.management.stopLossPct,
      takeProfitPct: config.management.takeProfitPct,
      oorWaitMinutes: config.management.oorWaitMinutes,
      autoRebalance: config.management.autoRebalance,
    };
    instances.management = new ManagementWorker(
      managementConfig,
      deps.dlmmService
    );
  }

  return instances;
}

export function createScheduler(
  config: AppConfig,
  instances: WorkerInstances
): Scheduler {
  return {
    start() {
      logger.info("Scheduler starting all workers");

      if (instances.health) {
        instances.health.start();
      }

      if (instances.screening) {
        instances.screening.start();
      }

      if (instances.management) {
        instances.management.start();
      }

      if (instances.dailyReport) {
        instances.dailyReport.start();
      }

      if (instances.weeklyReport) {
        instances.weeklyReport.start();
      }

      logger.info("Scheduler started all workers");
    },

    stop() {
      instances.health?.stop();
      instances.screening?.stop();
      instances.management?.stop();
      instances.dailyReport?.stop();
      instances.weeklyReport?.stop();

      logger.info("Scheduler stopped all workers");
    },

    getWorkerMetrics() {
      const metrics: Record<string, WorkerMetrics> = {};

      if (instances.health) {
        metrics.health = instances.health.getMetrics();
      }
      if (instances.screening) {
        metrics.screening = instances.screening.getMetrics();
      }
      if (instances.management) {
        metrics.management = instances.management.getMetrics();
      }
      if (instances.dailyReport) {
        metrics.dailyReport = instances.dailyReport.getMetrics();
      }
      if (instances.weeklyReport) {
        metrics.weeklyReport = instances.weeklyReport.getMetrics();
      }

      return metrics;
    },
  };
}
