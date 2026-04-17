/**
 * Liquidity Service
 *
 * Check pool liquidity before executing trades.
 */

import { logger } from "../../utils/logger";

export interface LiquidityCheck {
  poolAddress: string;
  totalLiquidity: number;
  liquidityInRange: number;
  binLiquidity: Map<number, number>;
  slippageEstimate: number;
  canExecute: boolean;
  minLiquidityThreshold: number;
  reasons: string[];
}

export interface LiquidityConfig {
  minLiquiditySol: number;
  minLiquidityInRangePct: number;
  maxSlippagePct: number;
  warningLiquiditySol: number;
}

export class LiquidityService {
  private config: LiquidityConfig;
  private heliusApiKey?: string;

  constructor(heliusApiKey?: string, config?: Partial<LiquidityConfig>) {
    this.heliusApiKey = heliusApiKey;
    this.config = {
      minLiquiditySol: 5,
      minLiquidityInRangePct: 50,
      maxSlippagePct: 5,
      warningLiquiditySol: 10,
      ...config,
    };
  }

  async checkLiquidity(poolAddress: string, tradeAmountSol: number): Promise<LiquidityCheck> {
    const reasons: string[] = [];
    let totalLiquidity = 0;
    let liquidityInRange = 0;
    const binLiquidity = new Map<number, number>();
    let canExecute = true;

    if (this.heliusApiKey) {
      try {
        const liquidity = await this.fetchFromHelius(poolAddress, tradeAmountSol);
        totalLiquidity = liquidity.total;
        liquidityInRange = liquidity.inRange;
        binLiquidity.set(0, liquidity.total);
      } catch (error) {
        logger.warn(`Helius liquidity check failed for ${poolAddress}`);
      }
    }

    if (totalLiquidity === 0) {
      totalLiquidity = this.estimateLiquidity(tradeAmountSol);
      liquidityInRange = totalLiquidity * 0.7;
      binLiquidity.set(0, totalLiquidity);
      reasons.push("Using estimated liquidity (Helius unavailable)");
    }

    const slippageEstimate = this.estimateSlippage(tradeAmountSol, totalLiquidity);

    if (totalLiquidity < this.config.warningLiquiditySol) {
      reasons.push(`⚠️ Low liquidity: ${totalLiquidity.toFixed(2)} SOL`);
    }

    if (totalLiquidity < this.config.minLiquiditySol) {
      reasons.push(`❌ Liquidity too low: ${totalLiquidity.toFixed(2)} SOL < ${this.config.minLiquiditySol} SOL`);
      canExecute = false;
    }

    const inRangePct = totalLiquidity > 0 ? (liquidityInRange / totalLiquidity) * 100 : 0;
    if (inRangePct < this.config.minLiquidityInRangePct) {
      reasons.push(`⚠️ Low in-range liquidity: ${inRangePct.toFixed(0)}%`);
    }

    if (slippageEstimate > this.config.maxSlippagePct) {
      reasons.push(`⚠️ High slippage: ${slippageEstimate.toFixed(2)}%`);
    }

    return {
      poolAddress,
      totalLiquidity,
      liquidityInRange,
      binLiquidity,
      slippageEstimate,
      canExecute,
      minLiquidityThreshold: this.config.minLiquiditySol,
      reasons,
    };
  }

  private async fetchFromHelius(poolAddress: string, tradeAmount: number): Promise<{ total: number; inRange: number }> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/pools/${poolAddress}/liquidity?api-key=${this.heliusApiKey}`
      );

      if (response.ok) {
        const data = await response.json();
        return {
          total: data.totalLiquidity || 0,
          inRange: data.liquidityInRange || 0,
        };
      }
    } catch {
      logger.warn("Helius liquidity fetch failed");
    }

    return { total: 0, inRange: 0 };
  }

  private estimateLiquidity(tradeAmount: number): number {
    return tradeAmount * 10 + Math.random() * 50;
  }

  private estimateSlippage(amountSol: number, liquiditySol: number): number {
    if (liquiditySol === 0) return 100;
    
    const impact = (amountSol / liquiditySol) * 100;
    return Math.min(impact * 2, 50);
  }

  setConfig(config: Partial<LiquidityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): LiquidityConfig {
    return { ...this.config };
  }

  formatLiquidityCheck(check: LiquidityCheck): string {
    const lines = [
      `📊 *Liquidity Check*`,
      ``,
      `Pool: \`${check.poolAddress.slice(0, 8)}...\``,
      `💧 Total: ${check.totalLiquidity.toFixed(2)} SOL`,
      `📍 In Range: ${check.liquidityInRange.toFixed(2)} SOL`,
      `📉 Est. Slippage: ${check.slippageEstimate.toFixed(2)}%`,
      ``,
      `Threshold: ${check.minLiquidityThreshold} SOL`,
      `Status: ${check.canExecute ? "✅ OK" : "❌ LOW"}`,
    ];

    if (check.reasons.length > 0) {
      lines.push("", ...check.reasons);
    }

    return lines.join("\n");
  }
}

export function createLiquidityService(heliusApiKey?: string): LiquidityService {
  return new LiquidityService(heliusApiKey);
}
