/**
 * Backtest Service
 *
 * Tests trading strategies against historical data.
 */

import { logger } from "../../utils/logger";

export interface BacktestConfig {
  initialCapital: number;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  entryStrategy: "immediate" | "delayed" | "signal";
}

export interface BacktestTrade {
  entryTime: string;
  exitTime: string;
  tokenMint: string;
  entryPrice: number;
  exitPrice: number;
  amountSol: number;
  pnlSol: number;
  pnlPct: number;
  exitReason: "tp" | "sl" | "manual" | "time";
  confidence: number;
}

export interface BacktestResult {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: string; value: number }>;
}

export interface StrategySignal {
  tokenMint: string;
  tokenSymbol: string;
  action: "buy" | "sell";
  confidence: number;
  price: number;
  reason: string;
  timestamp: string;
}

export class BacktestService {
  private config: BacktestConfig;

  constructor(config: Partial<BacktestConfig> = {}) {
    this.config = {
      initialCapital: 10,
      positionSizePct: 0.1,
      stopLossPct: 10,
      takeProfitPct: 50,
      maxPositions: 5,
      entryStrategy: "immediate",
      ...config,
    };
  }

  async runBacktest(
    historicalData: Array<{
      timestamp: string;
      tokenMint: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>,
    signals: StrategySignal[],
    name: string = "Backtest"
  ): Promise<BacktestResult> {
    logger.info(`Starting backtest: ${name}`, {
      dataPoints: historicalData.length,
      signals: signals.length,
    });

    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ time: string; value: number }> = [];
    
    let capital = this.config.initialCapital;
    let peakCapital = capital;
    let maxDrawdown = 0;

    const openPositions: Map<string, { 
      entryPrice: number; 
      amountSol: number; 
      entryTime: string;
      tokenMint: string;
    }> = new Map();

    for (const dataPoint of historicalData) {
      const relevantSignals = signals.filter(
        s => s.tokenMint === dataPoint.tokenMint && 
             new Date(s.timestamp) <= new Date(dataPoint.timestamp)
      );

      for (const signal of relevantSignals) {
        if (signal.action === "buy" && !openPositions.has(signal.tokenMint)) {
          if (openPositions.size >= this.config.maxPositions) continue;

          const positionSize = capital * this.config.positionSizePct;
          openPositions.set(signal.tokenMint, {
            entryPrice: dataPoint.close,
            amountSol: positionSize,
            entryTime: dataPoint.timestamp,
            tokenMint: signal.tokenMint,
          });
        } else if (signal.action === "sell" && openPositions.has(signal.tokenMint)) {
          const position = openPositions.get(signal.tokenMint)!;
          const pnlPct = ((dataPoint.close - position.entryPrice) / position.entryPrice) * 100;
          const pnlSol = position.amountSol * (pnlPct / 100);

          trades.push({
            entryTime: position.entryTime,
            exitTime: dataPoint.timestamp,
            tokenMint: position.tokenMint,
            entryPrice: position.entryPrice,
            exitPrice: dataPoint.close,
            amountSol: position.amountSol,
            pnlSol,
            pnlPct,
            exitReason: "manual",
            confidence: signal.confidence,
          });

          capital += pnlSol;
          openPositions.delete(signal.tokenMint);
        }
      }

      for (const [tokenMint, position] of openPositions) {
        const priceChange = ((dataPoint.close - position.entryPrice) / position.entryPrice) * 100;

        if (priceChange >= this.config.takeProfitPct) {
          const pnlSol = position.amountSol * (this.config.takeProfitPct / 100);

          trades.push({
            entryTime: position.entryTime,
            exitTime: dataPoint.timestamp,
            tokenMint,
            entryPrice: position.entryPrice,
            exitPrice: dataPoint.close,
            amountSol: position.amountSol,
            pnlSol,
            pnlPct: this.config.takeProfitPct,
            exitReason: "tp",
            confidence: 0,
          });

          capital += pnlSol;
          openPositions.delete(tokenMint);
        } else if (priceChange <= -this.config.stopLossPct) {
          const pnlSol = position.amountSol * (-this.config.stopLossPct / 100);

          trades.push({
            entryTime: position.entryTime,
            exitTime: dataPoint.timestamp,
            tokenMint,
            entryPrice: position.entryPrice,
            exitPrice: dataPoint.close,
            amountSol: position.amountSol,
            pnlSol,
            pnlPct: -this.config.stopLossPct,
            exitReason: "sl",
            confidence: 0,
          });

          capital += pnlSol;
          openPositions.delete(tokenMint);
        }
      }

      equityCurve.push({
        time: dataPoint.timestamp,
        value: capital,
      });

      if (capital > peakCapital) {
        peakCapital = capital;
      }

      const drawdown = ((peakCapital - capital) / peakCapital) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    for (const [, position] of openPositions) {
      const lastData = historicalData[historicalData.length - 1];
      if (lastData) {
        const pnlPct = ((lastData.close - position.entryPrice) / position.entryPrice) * 100;
        const pnlSol = position.amountSol * (pnlPct / 100);

        trades.push({
          entryTime: position.entryTime,
          exitTime: lastData.timestamp,
          tokenMint: position.tokenMint,
          entryPrice: position.entryPrice,
          exitPrice: lastData.close,
          amountSol: position.amountSol,
          pnlSol,
          pnlPct,
          exitReason: "time",
          confidence: 0,
        });

        capital += pnlSol;
      }
    }

    const winningTrades = trades.filter(t => t.pnlSol > 0);
    const losingTrades = trades.filter(t => t.pnlSol <= 0);

    const returns = equityCurve.map((e, i) => 
      i > 0 ? (e.value - equityCurve[i - 1].value) / equityCurve[i - 1].value : 0
    );
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return {
      id: `backtest_${Date.now()}`,
      name,
      startDate: historicalData[0]?.timestamp || "",
      endDate: historicalData[historicalData.length - 1]?.timestamp || "",
      initialCapital: this.config.initialCapital,
      finalCapital: capital,
      totalReturn: capital - this.config.initialCapital,
      totalReturnPct: ((capital - this.config.initialCapital) / this.config.initialCapital) * 100,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      avgWin: winningTrades.length > 0 
        ? winningTrades.reduce((s, t) => s + t.pnlSol, 0) / winningTrades.length 
        : 0,
      avgLoss: losingTrades.length > 0 
        ? losingTrades.reduce((s, t) => s + t.pnlSol, 0) / losingTrades.length 
        : 0,
      bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnlSol)) : 0,
      worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnlSol)) : 0,
      maxDrawdown,
      sharpeRatio,
      trades,
      equityCurve,
    };
  }

  formatBacktestResult(result: BacktestResult): string {
    const pnlEmoji = result.totalReturn >= 0 ? "🟢" : "🔴";
    const drawdownColor = result.maxDrawdown > 30 ? "🔴" : result.maxDrawdown > 15 ? "🟡" : "🟢";

    return [
      `📊 *Backtest Result: ${result.name}*`,
      "",
      `📅 ${result.startDate.split("T")[0]} → ${result.endDate.split("T")[0]}`,
      "",
      "*Performance*",
      `${pnlEmoji} Total Return: ${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn.toFixed(4)} SOL (${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(2)}%)`,
      `💰 Final Capital: ${result.finalCapital.toFixed(4)} SOL`,
      "",
      "*Trades*",
      `📈 Total: ${result.totalTrades}`,
      `✅ Win: ${result.winningTrades} | ❌ Loss: ${result.losingTrades}`,
      `🎯 Win Rate: ${result.winRate.toFixed(1)}%`,
      "",
      "*Statistics*",
      `📊 Avg Win: +${result.avgWin.toFixed(4)} SOL`,
      `📉 Avg Loss: ${result.avgLoss.toFixed(4)} SOL`,
      `🏆 Best: +${result.bestTrade.toFixed(4)} SOL`,
      `💸 Worst: ${result.worstTrade.toFixed(4)} SOL`,
      "",
      "*Risk*",
      `${drawdownColor} Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`,
      `📐 Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`,
    ].join("\n");
  }

  compareStrategies(results: BacktestResult[]): string {
    const sorted = [...results].sort((a, b) => b.totalReturnPct - a.totalReturnPct);

    const lines: string[] = [
      "*Strategy Comparison*",
      "",
      "Rank | Strategy | Return | Win Rate | Drawdown | Sharpe",
      "-----|---------|--------|----------|-----------|-------",
    ];

    sorted.forEach((r, i) => {
      const pnlSign = r.totalReturnPct >= 0 ? "+" : "";
      const ddColor = r.maxDrawdown > 30 ? "🔴" : r.maxDrawdown > 15 ? "🟡" : "🟢";
      
      lines.push(
        `${i + 1}. | ${r.name} | ${pnlSign}${r.totalReturnPct.toFixed(1)}% | ${r.winRate.toFixed(0)}% | ${ddColor}${r.maxDrawdown.toFixed(1)}% | ${r.sharpeRatio.toFixed(2)}`
      );
    });

    return lines.join("\n");
  }
}

export function createBacktestService(config?: Partial<BacktestConfig>): BacktestService {
  return new BacktestService(config);
}
