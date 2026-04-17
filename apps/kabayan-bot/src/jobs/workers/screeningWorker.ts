/**
 * Screening Worker
 *
 * Periodically screens new pools and updates watchlist.
 */

import { BaseWorker, type WorkerConfig, type WorkerMetrics } from "./baseWorker";
import { ScreeningService } from "../../modules/screening";
import { EnhancedDLMMService } from "@prabu/meteora";
import { PoolDiscoveryService, type PoolData } from "../../modules/pool-discovery";
import { logger } from "../../utils/logger";

export interface ScreeningWorkerConfig extends WorkerConfig {
  poolSources: ("meteora" | "raydium" | "orca" | "trending" | "new")[];
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
}

export class ScreeningWorker extends BaseWorker {
  private screeningService: ScreeningService;
  private dlmmService: EnhancedDLMMService;
  private poolDiscovery: PoolDiscoveryService;
  private poolSources: string[];
  private maxPoolsPerRun: number;
  private minScoreToNotify: number;
  private filters: ScreeningWorkerConfig["filters"];
  private notifyCallback?: (pools: ScreenedPool[]) => Promise<void>;
  private autoExecuteCallback?: (pool: ScreenedPool) => Promise<void>;

  constructor(
    config: ScreeningWorkerConfig,
    screeningService: ScreeningService,
    dlmmService: EnhancedDLMMService,
    poolDiscovery: PoolDiscoveryService
  ) {
    super({
      name: "ScreeningWorker",
      intervalMs: config.intervalMs,
      enabled: config.enabled,
    });

    this.screeningService = screeningService;
    this.dlmmService = dlmmService;
    this.poolDiscovery = poolDiscovery;
    this.poolSources = config.poolSources;
    this.maxPoolsPerRun = config.maxPoolsPerRun;
    this.minScoreToNotify = config.minScoreToNotify;
    this.filters = config.filters;
  }

  setNotifyCallback(callback: (pools: ScreenedPool[]) => Promise<void>): void {
    this.notifyCallback = callback;
  }

  setAutoExecuteCallback(callback: (pool: ScreenedPool) => Promise<void>): void {
    this.autoExecuteCallback = callback;
  }

  async execute(): Promise<void> {
    logger.info("ScreeningWorker: Starting pool screening cycle");

    const pools = await this.fetchCandidatePools();
    logger.info(`ScreeningWorker: Found ${pools.length} candidate pools`);

    const screenedPools: ScreenedPool[] = [];
    let screened = 0;
    let passed = 0;

    for (const pool of pools.slice(0, this.maxPoolsPerRun)) {
      try {
        const result = await this.screeningService.screenPool(pool);

        screened++;
        if (result.recommendation !== "skip" && result.recommendation !== "avoid") {
          passed++;
          screenedPools.push({
            address: pool.address,
            score: result.aiScore,
            confidence: result.aiConfidence,
            recommendation: result.recommendation,
            reason: result.aiReason,
            poolData: pool,
            result,
          });
        }
      } catch (error) {
        logger.warn(`ScreeningWorker: Failed to screen pool ${pool.address}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(`ScreeningWorker: Screened ${screened} pools, ${passed} passed`);

    const highQualityPools = screenedPools
      .filter((p) => p.score >= this.minScoreToNotify)
      .sort((a, b) => b.score - a.score);

    if (highQualityPools.length > 0 && this.notifyCallback) {
      await this.notifyCallback(highQualityPools);
    }

    if (this.autoExecuteCallback) {
      for (const pool of highQualityPools) {
        try {
          await this.autoExecuteCallback(pool);
        } catch (error) {
          logger.warn(`Auto-execute failed for ${pool.poolData.tokenYSymbol}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private async fetchCandidatePools(): Promise<PoolData[]> {
    const pools: PoolData[] = [];

    if (this.poolSources.includes("meteora")) {
      const meteora = await this.poolDiscovery.discoverTrendingPools(10);
      pools.push(...meteora);
    }

    if (this.poolSources.includes("raydium")) {
      const raydium = await this.poolDiscovery.discoverRaydiumPools(10);
      pools.push(...raydium);
    }

    if (this.poolSources.includes("orca")) {
      const orca = await this.poolDiscovery.discoverOrcaPools(10);
      pools.push(...orca);
    }

    if (this.poolSources.includes("trending")) {
      const trending = await this.poolDiscovery.discoverTrendingPools(10);
      pools.push(...trending);
    }

    if (this.poolSources.includes("new")) {
      const newPools = await this.poolDiscovery.discoverNewPools(10);
      pools.push(...newPools);
    }

    let filtered = pools;

    if (this.filters) {
      filtered = this.poolDiscovery.filterPools(pools, this.filters);
    }

    return this.poolDiscovery.sortByOrganicScore(filtered);
  }
}

export interface ScreenedPool {
  address: string;
  score: number;
  confidence: number;
  recommendation: string;
  reason: string;
  poolData: PoolData;
  result: any;
}
