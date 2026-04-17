/**
 * AI Screening Service
 *
 * Combines rule-based filtering with AI-powered scoring
 * for Meteora DLMM pool analysis.
 */

import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import type {
  ScreeningConfig,
  PoolData,
  ScreeningResult,
  ScreeningSession,
  ScreeningHistory,
  AIScreeningRequest,
  AIScreeningResponse,
  DEFAULT_SCREENING_CONFIG,
} from "./types";
import {
  buildScreeningPrompt,
  parseAIScreeningResponse,
  SCREENING_SYSTEM_PROMPT,
  SCREENING_MODEL_CONFIG,
} from "./prompts";
import { OpenRouterClient } from "../../integrations/ai/openrouterClient";
import type { AppConfig } from "../../domain/types";

export interface ScreeningServiceOptions {
  aiClient: OpenRouterClient;
  config: ScreeningConfig;
  appConfig: AppConfig;
}

export class ScreeningService {
  private aiClient: OpenRouterClient;
  private config: ScreeningConfig;
  private appConfig: AppConfig;
  private session: ScreeningSession;
  private history: Map<string, ScreeningHistory> = new Map();
  private poolCache: Map<string, { data: PoolData; result: ScreeningResult; expires: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(options: ScreeningServiceOptions) {
    this.aiClient = options.aiClient;
    this.config = options.config;
    this.appConfig = options.appConfig;
    this.session = this.createSession();
  }

  private createSession(): ScreeningSession {
    return {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      poolsScanned: 0,
      poolsPassed: 0,
      poolsFailed: 0,
      poolsAIAnalyzed: 0,
      status: "idle",
    };
  }

  updateConfig(config: Partial<ScreeningConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("Screening config updated", { config: this.config });
  }

  getSession(): ScreeningSession {
    return { ...this.session };
  }

  getHistory(limit = 50): ScreeningHistory[] {
    return Array.from(this.history.values())
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .slice(0, limit);
  }

  async screenPool(poolData: PoolData, forceAI = false): Promise<ScreeningResult> {
    const startTime = Date.now();
    const cached = this.getCachedResult(poolData.address);

    if (cached && !forceAI) {
      logger.debug("Using cached screening result", { pool: poolData.address });
      return cached;
    }

    const passedRules: string[] = [];
    const failedRules: string[] = [];

    if (!this.config.enabled) {
      return this.createResult(
        poolData,
        passedRules,
        failedRules,
        50,
        50,
        "Screening disabled",
        "watch",
        startTime
      );
    }

    if (this.config.minTvl && poolData.tvl < this.config.minTvl) {
      failedRules.push(`TVL below minimum (${poolData.tvl} < ${this.config.minTvl})`);
    } else {
      passedRules.push(`TVL: ${formatSol(poolData.tvl)}`);
    }

    if (this.config.maxTvl && poolData.tvl > this.config.maxTvl) {
      failedRules.push(`TVL above maximum (${poolData.tvl} > ${this.config.maxTvl})`);
    }

    if (this.config.minVolume && poolData.volume24h < this.config.minVolume) {
      failedRules.push(`Volume below minimum (${poolData.volume24h} < ${this.config.minVolume})`);
    } else {
      passedRules.push(`Volume 24h: ${formatSol(poolData.volume24h)}`);
    }

    if (this.config.minOrganic && poolData.organicScore < this.config.minOrganic) {
      failedRules.push(`Organic score below minimum (${poolData.organicScore} < ${this.config.minOrganic})`);
    } else {
      passedRules.push(`Organic score: ${poolData.organicScore}`);
    }

    if (this.config.minHolders && poolData.holderCount < this.config.minHolders) {
      failedRules.push(`Holder count below minimum (${poolData.holderCount} < ${this.config.minHolders})`);
    } else {
      passedRules.push(`Holders: ${poolData.holderCount}`);
    }

    if (this.config.minMcap && poolData.mcap < this.config.minMcap) {
      failedRules.push(`Market cap below minimum (${poolData.mcap} < ${this.config.minMcap})`);
    } else {
      passedRules.push(`Market cap: ${formatUsd(poolData.mcap)}`);
    }

    if (this.config.maxMcap && poolData.mcap > this.config.maxMcap) {
      failedRules.push(`Market cap above maximum (${poolData.mcap} > ${this.config.maxMcap})`);
    }

    if (this.config.minBinStep && poolData.binStep < this.config.minBinStep) {
      failedRules.push(`Bin step too low (${poolData.binStep} < ${this.config.minBinStep})`);
    } else {
      passedRules.push(`Bin step: ${poolData.binStep / 100}%`);
    }

    if (this.config.maxBinStep && poolData.binStep > this.config.maxBinStep) {
      failedRules.push(`Bin step too high (${poolData.binStep} > ${this.config.maxBinStep})`);
    }

    if (this.config.maxBundlersPct && poolData.bundlersPct > this.config.maxBundlersPct) {
      failedRules.push(`Bundlers % too high (${poolData.bundlersPct}% > ${this.config.maxBundlersPct}%)`);
    } else {
      passedRules.push(`Bundlers: ${poolData.bundlersPct}%`);
    }

    if (this.config.maxTop10Pct && poolData.top10HolderPct > this.config.maxTop10Pct) {
      failedRules.push(`Top 10 holder % too high (${poolData.top10HolderPct}% > ${this.config.maxTop10Pct}%)`);
    } else {
      passedRules.push(`Top 10 holders: ${poolData.top10HolderPct}%`);
    }

    if (this.config.blockedLaunchpads.length > 0 && poolData.launchpad) {
      if (this.config.blockedLaunchpads.includes(poolData.launchpad)) {
        failedRules.push(`Launchpad blocked: ${poolData.launchpad}`);
      }
    }

    if (failedRules.length > 0) {
      const result = this.createResult(
        poolData,
        passedRules,
        failedRules,
        0,
        100,
        `Failed ${failedRules.length} rules`,
        "skip",
        startTime
      );
      this.updateSession(result);
      this.cacheResult(poolData.address, result);
      return result;
    }

    if (!this.aiClient.isConfigured()) {
      const result = this.createResult(
        poolData,
        passedRules,
        failedRules,
        50,
        30,
        "AI not configured, using default score",
        "watch",
        startTime
      );
      this.updateSession(result);
      this.cacheResult(poolData.address, result);
      return result;
    }

    const aiResult = await this.runAIScreening(poolData);

    const result = this.createResult(
      poolData,
      passedRules,
      failedRules,
      aiResult.score,
      aiResult.confidence,
      aiResult.reason,
      aiResult.recommendation,
      startTime
    );

    this.updateSession(result, true);
    this.cacheResult(poolData.address, result);
    return result;
  }

  private async runAIScreening(poolData: PoolData): Promise<AIScreeningResponse> {
    const request: AIScreeningRequest = {
      poolData,
      config: this.config,
      userContext: {
        riskAppetite: "balanced",
        maxPositionSize: this.appConfig.risk.maxDeployAmount,
      },
    };

    const prompt = buildScreeningPrompt(request);

    try {
      const response = await this.aiClient.screening(
        SCREENING_MODEL_CONFIG.model,
        prompt,
        {
          task: "screening",
          model: SCREENING_MODEL_CONFIG.model,
        }
      );

      if (!response.ok || !response.content) {
        logger.warn("AI screening failed, using fallback", { error: response.error });
        return this.getFallbackResponse();
      }

      const parsed = parseAIScreeningResponse(response.content);
      if (!parsed) {
        logger.warn("Failed to parse AI response, using fallback");
        return this.getFallbackResponse();
      }

      logger.info("AI screening completed", {
        pool: poolData.address,
        score: parsed.score,
        recommendation: parsed.recommendation,
      });

      return parsed;
    } catch (error) {
      logger.error("AI screening error", {
        pool: poolData.address,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.getFallbackResponse();
    }
  }

  private getFallbackResponse(): AIScreeningResponse {
    return {
      score: 50,
      confidence: 20,
      recommendation: "watch",
      reason: "AI analysis unavailable, manual review recommended",
      strengths: [],
      risks: ["AI analysis failed"],
      warnings: ["Manual verification needed"],
    };
  }

  private createResult(
    poolData: PoolData,
    passedRules: string[],
    failedRules: string[],
    aiScore: number,
    aiConfidence: number,
    aiReason: string,
    recommendation: ScreeningResult["recommendation"],
    startTime: number
  ): ScreeningResult {
    const result: ScreeningResult = {
      poolAddress: poolData.address,
      passedRules,
      failedRules,
      aiScore,
      aiConfidence,
      aiReason,
      recommendation,
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    this.history.set(poolData.address, {
      id: uuidv4(),
      poolAddress: poolData.address,
      result,
      scannedAt: new Date().toISOString(),
      source: "manual",
    });

    return result;
  }

  private updateSession(result: ScreeningResult, aiAnalyzed = false): void {
    this.session.poolsScanned++;

    if (result.failedRules.length === 0 && result.recommendation !== "skip") {
      this.session.poolsPassed++;
    } else {
      this.session.poolsFailed++;
    }

    if (aiAnalyzed) {
      this.session.poolsAIAnalyzed++;
    }

    this.session.lastScanAt = new Date().toISOString();
  }

  private getCachedResult(poolAddress: string): ScreeningResult | null {
    const cached = this.poolCache.get(poolAddress);
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }
    this.poolCache.delete(poolAddress);
    return null;
  }

  private cacheResult(poolAddress: string, result: ScreeningResult): void {
    this.poolCache.set(poolAddress, {
      data: result as any,
      result,
      expires: Date.now() + this.CACHE_TTL_MS,
    });
  }

  formatScreeningResult(result: ScreeningResult): string {
    const lines: string[] = [
      "🔍 SCREENING RESULT",
      "",
      `📍 Pool: \`${shorten(result.poolAddress)}\``,
      `🤖 AI Score: ${result.aiScore}/100`,
      `📊 Confidence: ${result.aiConfidence}%`,
      `🎯 Recommendation: ${this.formatRecommendation(result.recommendation)}`,
      "",
      `💬 ${result.aiReason}`,
      "",
    ];

    if (result.failedRules.length > 0) {
      lines.push("❌ Failed Rules:");
      result.failedRules.forEach((rule) => lines.push(`  • ${rule}`));
      lines.push("");
    }

    if (result.passedRules.length > 0 && result.passedRules.length <= 5) {
      lines.push("✅ Passed Rules:");
      result.passedRules.forEach((rule) => lines.push(`  • ${rule}`));
      lines.push("");
    }

    lines.push(`⏱️ Processed in ${result.processingTimeMs}ms`);

    return lines.join("\n");
  }

  private formatRecommendation(rec: ScreeningResult["recommendation"]): string {
    switch (rec) {
      case "buy":
        return "🟢 BUY";
      case "watch":
        return "🟡 WATCH";
      case "avoid":
        return "🟠 AVOID";
      case "skip":
        return "🔴 SKIP";
    }
  }

  resetSession(): void {
    this.session = this.createSession();
    logger.info("Screening session reset");
  }

  clearHistory(): void {
    this.history.clear();
    this.poolCache.clear();
    logger.info("Screening history cleared");
  }
}

function formatSol(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function shorten(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export function createScreeningService(options: ScreeningServiceOptions): ScreeningService {
  return new ScreeningService(options);
}
