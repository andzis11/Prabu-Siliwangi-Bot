/**
 * Risk Calculator Service
 *
 * Calculate position size based on risk tolerance.
 */

export interface RiskProfile {
  riskPerTradePct: number;
  maxDrawdownPct: number;
  targetWinRate: number;
  avgRRR: number;
}

export interface PositionSizingResult {
  recommendedSizeSol: number;
  riskAmountSol: number;
  potentialProfitSol: number;
  potentialLossSol: number;
  riskRewardRatio: number;
  kellyCriterionPct: number;
  positionSizePct: number;
}

export interface TradeAnalysis {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  currentCapital: number;
  riskProfile: RiskProfile;
}

export class RiskCalculatorService {
  private defaultProfile: RiskProfile = {
    riskPerTradePct: 2,
    maxDrawdownPct: 20,
    targetWinRate: 40,
    avgRRR: 2,
  };

  calculatePositionSize(analysis: TradeAnalysis): PositionSizingResult {
    const { entryPrice, stopLossPrice, takeProfitPrice, currentCapital, riskProfile } = analysis;
    
    const profile = { ...this.defaultProfile, ...riskProfile };

    const riskDistancePct = Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100;
    const rewardDistancePct = Math.abs((takeProfitPrice - entryPrice) / entryPrice) * 100;
    const riskRewardRatio = rewardDistancePct / riskDistancePct;

    const riskAmountSol = (currentCapital * profile.riskPerTradePct) / 100;
    const positionSizeBasedOnRisk = riskAmountSol / (riskDistancePct / 100);

    const positionSizeSol = Math.min(
      positionSizeBasedOnRisk,
      currentCapital * 0.2
    );

    const positionSizePct = (positionSizeSol / currentCapital) * 100;
    const potentialProfitSol = positionSizeSol * (rewardDistancePct / 100);
    const potentialLossSol = positionSizeSol * (riskDistancePct / 100);

    const winRate = profile.targetWinRate / 100;
    const avgRRR = riskRewardRatio;
    const kellyPct = (winRate * avgRRR - (1 - winRate)) * 100;
    const kellyCriterionPct = Math.max(0, Math.min(100, kellyPct));

    return {
      recommendedSizeSol: Math.round(positionSizeSol * 10000) / 10000,
      riskAmountSol: Math.round(riskAmountSol * 10000) / 10000,
      potentialProfitSol: Math.round(potentialProfitSol * 10000) / 10000,
      potentialLossSol: Math.round(potentialLossSol * 10000) / 10000,
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      kellyCriterionPct: Math.round(kellyCriterionPct * 100) / 100,
      positionSizePct: Math.round(positionSizePct * 100) / 100,
    };
  }

  calculateMaxPositionSize(
    currentCapital: number,
    openPositions: number,
    maxDrawdownPct: number
  ): { maxPerPosition: number; maxTotalExposure: number } {
    const remainingDrawdown = maxDrawdownPct;
    const remainingPositions = 10 - openPositions;
    
    const maxTotalExposure = (currentCapital * remainingDrawdown) / 100;
    const maxPerPosition = maxTotalExposure / Math.max(1, remainingPositions);

    return {
      maxPerPosition: Math.round(maxPerPosition * 10000) / 10000,
      maxTotalExposure: Math.round(maxTotalExposure * 10000) / 10000,
    };
  }

  calculateBreakevenWinRate(winRate: number, lossRate: number): number {
    if (lossRate === 0) return 100;
    return 1 / (1 + winRate / lossRate) * 100;
  }

  calculateExpectedValue(
    winRate: number,
    avgWin: number,
    avgLoss: number
  ): number {
    return (winRate * avgWin) - ((1 - winRate) * Math.abs(avgLoss));
  }

  calculateSharpeRatio(
    returns: number[],
    riskFreeRate: number = 0.02
  ): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    return (avgReturn - riskFreeRate) / stdDev;
  }

  calculateSortinoRatio(
    returns: number[],
    targetReturn: number = 0,
    riskFreeRate: number = 0.02
  ): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < targetReturn);
    
    if (downsideReturns.length === 0) return Infinity;

    const downsideVariance = downsideReturns.reduce(
      (sum, r) => sum + Math.pow(r - targetReturn, 2), 0
    ) / returns.length;
    const downsideDev = Math.sqrt(downsideVariance);

    if (downsideDev === 0) return 0;

    return (avgReturn - riskFreeRate) / downsideDev;
  }

  calculateCalmarRatio(
    totalReturn: number,
    maxDrawdown: number,
    years: number
  ): number {
    if (maxDrawdown === 0 || years === 0) return 0;
    const annualizedReturn = totalReturn / years;
    return annualizedReturn / maxDrawdown;
  }

  calculateMaxDrawdown(equityCurve: number[]): number {
    if (equityCurve.length < 2) return 0;

    let peak = equityCurve[0];
    let maxDrawdown = 0;

    for (const value of equityCurve) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  setDefaultProfile(profile: Partial<RiskProfile>): void {
    this.defaultProfile = { ...this.defaultProfile, ...profile };
  }

  getDefaultProfile(): RiskProfile {
    return { ...this.defaultProfile };
  }

  formatPositionSizing(result: PositionSizingResult): string {
    return [
      `*Position Sizing Result*`,
      ``,
      `💰 Recommended Size: ${result.recommendedSizeSol} SOL`,
      `📊 Size: ${result.positionSizePct}% of capital`,
      ``,
      `*Risk Analysis*`,
      `⚠️ Risk Amount: ${result.riskAmountSol} SOL`,
      `📈 Potential Profit: +${result.potentialProfitSol} SOL`,
      `📉 Potential Loss: -${result.potentialLossSol} SOL`,
      `🎯 R:R Ratio: 1:${result.riskRewardRatio}`,
      ``,
      `*Kelly Criterion*`,
      `📊 Optimal Size: ${result.kellyCriterionPct}%`,
      `   (Based on win rate & R:R)`,
    ].join("\n");
  }

  formatRiskSummary(
    capital: number,
    openPositions: number,
    profile: RiskProfile
  ): string {
    const { maxPerPosition, maxTotalExposure } = this.calculateMaxPositionSize(
      capital,
      openPositions,
      profile.maxDrawdownPct
    );

    const remainingDrawdown = profile.maxDrawdownPct;

    return [
      `*Risk Summary*`,
      ``,
      `💵 Capital: ${capital.toFixed(4)} SOL`,
      `📊 Open Positions: ${openPositions}/10`,
      `🎯 Risk/Trade: ${profile.riskPerTradePct}%`,
      `⚠️ Max Drawdown: ${profile.maxDrawdownPct}%`,
      ``,
      `*Limits*`,
      `📏 Max/Position: ${maxPerPosition.toFixed(4)} SOL`,
      `📊 Max Exposure: ${maxTotalExposure.toFixed(4)} SOL (${remainingDrawdown}%)`,
    ].join("\n");
  }
}

export function createRiskCalculator(): RiskCalculatorService {
  return new RiskCalculatorService();
}
