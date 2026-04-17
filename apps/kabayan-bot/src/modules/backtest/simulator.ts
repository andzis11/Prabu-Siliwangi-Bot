export interface BacktestConfig {
  strategy: string;
  startingCapital: number;
  baseRiskPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  hardSlPercent: number;
  trailingDelta: number;
  circuitBreakerPercent: number;
  maxPositions: number;
  simulationDays: number;
  tokensPerDay: number;
}

export interface BacktestTrade {
  tokenMint: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  amountSol: number;
  pnlSol: number;
  pnlPercent: number;
  exitReason: string;
  fees: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  startingCapital: number;
  endingCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  evPerTrade: number;
  totalFeesPaid: number;
  trades: BacktestTrade[];
}

export interface StrategyMetric {
  name: string;
  returnPercent: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  evPerTrade: number;
}

export interface ComparisonResult {
  metrics: StrategyMetric[];
  winner: string;
}

interface SimulatedToken {
  mint: string;
  prices: number[];
  timestamps: number[];
  trend: "pump" | "dump" | "volatile" | "slowrug";
}

interface FeeSchedule {
  buyFee: number;
  sellFee: number;
}

const NORMAL_FEE_SCHEDULE: FeeSchedule = {
  buyFee: 0.005,
  sellFee: 0.005,
};

export const STRATEGIES: Record<string, BacktestConfig> = {
  conservative: {
    strategy: "Conservative",
    startingCapital: 1,
    baseRiskPercent: 3,
    tp1Percent: 25,
    tp2Percent: 50,
    hardSlPercent: 15,
    trailingDelta: 0.08,
    circuitBreakerPercent: 10,
    maxPositions: 3,
    simulationDays: 7,
    tokensPerDay: 5,
  },
  balanced: {
    strategy: "Balanced",
    startingCapital: 1,
    baseRiskPercent: 5,
    tp1Percent: 35,
    tp2Percent: 80,
    hardSlPercent: 20,
    trailingDelta: 0.1,
    circuitBreakerPercent: 15,
    maxPositions: 5,
    simulationDays: 7,
    tokensPerDay: 8,
  },
  aggressive: {
    strategy: "Aggressive",
    startingCapital: 1,
    baseRiskPercent: 8,
    tp1Percent: 50,
    tp2Percent: 120,
    hardSlPercent: 25,
    trailingDelta: 0.12,
    circuitBreakerPercent: 20,
    maxPositions: 7,
    simulationDays: 7,
    tokensPerDay: 12,
  },
  sniper: {
    strategy: "Sniper",
    startingCapital: 1,
    baseRiskPercent: 10,
    tp1Percent: 60,
    tp2Percent: 150,
    hardSlPercent: 30,
    trailingDelta: 0.15,
    circuitBreakerPercent: 25,
    maxPositions: 10,
    simulationDays: 7,
    tokensPerDay: 15,
  },
  diamond_hands: {
    strategy: "Diamond Hands",
    startingCapital: 1,
    baseRiskPercent: 4,
    tp1Percent: 50,
    tp2Percent: 150,
    hardSlPercent: 20,
    trailingDelta: 0.3,
    circuitBreakerPercent: 20,
    maxPositions: 5,
    simulationDays: 7,
    tokensPerDay: 8,
  },
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateSimulatedTokens(config: BacktestConfig): SimulatedToken[] {
  const tokens: SimulatedToken[] = [];
  const totalTokens = config.tokensPerDay * config.simulationDays;

  for (let i = 0; i < totalTokens; i += 1) {
    const prices: number[] = [];
    const timestamps: number[] = [];
    const basePrice = 0.000001 + Math.random() * 0.0001;
    const trendRoll = Math.random();

    const trend: SimulatedToken["trend"] =
      trendRoll < 0.3
        ? "pump"
        : trendRoll < 0.6
          ? "dump"
          : trendRoll < 0.85
            ? "volatile"
            : "slowrug";

    const points = 480;
    let price = basePrice;

    for (let j = 0; j < points; j += 1) {
      const noise = (Math.random() - 0.5) * 0.15;
      let drift = 0;

      if (trend === "pump") {
        if (j < 60) drift = 0.008;
        else if (j < 120) drift = 0.003;
        else drift = -0.001 + Math.random() * 0.002;
      } else if (trend === "dump") {
        if (j < 15) drift = 0.01;
        else if (j < 30) drift = -0.002;
        else drift = -0.005;
      } else if (trend === "volatile") {
        drift = Math.sin(j / 30) * 0.006;
      } else {
        if (j < 30) drift = 0.003;
        else drift = -0.002;
      }

      price = price * (1 + drift + noise);
      price = Math.max(price, basePrice * 0.001);

      prices.push(price);
      timestamps.push(j * 60_000);
    }

    tokens.push({
      mint: "SIM" + i.toString().padStart(6, "0"),
      prices,
      timestamps,
      trend,
    });
  }

  return tokens;
}

function simulateTrade(
  token: SimulatedToken,
  config: BacktestConfig,
): BacktestTrade | null {
  if (token.prices.length < 2) {
    return null;
  }

  const entryIdx = Math.floor(Math.random() * Math.min(30, token.prices.length - 1));
  const entryPrice = token.prices[entryIdx];
  const amountSol = (config.startingCapital * config.baseRiskPercent) / 100;
  const fees = amountSol * (NORMAL_FEE_SCHEDULE.buyFee + NORMAL_FEE_SCHEDULE.sellFee);

  let trailingStop = entryPrice * (1 - config.hardSlPercent / 100);
  let highestPrice = entryPrice;
  let exitPrice = entryPrice;
  let exitIdx = entryIdx;
  let exitReason = "TIMEOUT";

  for (let i = entryIdx + 1; i < token.prices.length; i += 1) {
    const price = token.prices[i];

    if (price > highestPrice) {
      highestPrice = price;
      trailingStop = highestPrice * (1 - config.trailingDelta);
    }

    if (price >= entryPrice * (1 + config.tp2Percent / 100)) {
      exitPrice = price;
      exitIdx = i;
      exitReason = "TP2";
      break;
    }

    if (price >= entryPrice * (1 + config.tp1Percent / 100)) {
      exitPrice = price;
      exitIdx = i;
      exitReason = "TP1";
      break;
    }

    if (price <= entryPrice * (1 - config.hardSlPercent / 100)) {
      exitPrice = price;
      exitIdx = i;
      exitReason = "HARD_SL";
      break;
    }

    if (
      config.trailingDelta > 0 &&
      highestPrice > entryPrice * 1.05 &&
      price <= trailingStop
    ) {
      exitPrice = price;
      exitIdx = i;
      exitReason = "TRAILING_SL";
      break;
    }
  }

  const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const tokenAmount = amountSol / entryPrice;
  const pnlSol = tokenAmount * (exitPrice - entryPrice) - fees;

  return {
    tokenMint: token.mint,
    entryPrice,
    exitPrice,
    entryTime: token.timestamps[entryIdx],
    exitTime: token.timestamps[exitIdx],
    amountSol,
    pnlSol,
    pnlPercent,
    exitReason,
    fees,
  };
}

export async function runBacktest(
  config?: BacktestConfig,
): Promise<BacktestResult> {
  const activeConfig = config || STRATEGIES.balanced;
  const tokens = generateSimulatedTokens(activeConfig);
  const trades: BacktestTrade[] = [];

  for (const token of tokens) {
    const trade = simulateTrade(token, activeConfig);
    if (trade) {
      trades.push(trade);
    }
  }

  const wins = trades.filter((trade) => trade.pnlSol > 0);
  const losses = trades.filter((trade) => trade.pnlSol <= 0);

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnlSol, 0);
  const totalFees = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const grossWins = wins.reduce((sum, trade) => sum + trade.pnlSol, 0);
  const grossLosses = Math.abs(
    losses.reduce((sum, trade) => sum + trade.pnlSol, 0),
  );

  let peak = activeConfig.startingCapital;
  let maxDrawdown = 0;
  let balance = activeConfig.startingCapital;

  for (const trade of trades) {
    balance += trade.pnlSol;
    if (balance > peak) {
      peak = balance;
    }

    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const returns = trades.map((trade) => trade.pnlPercent);
  const avgReturn =
    returns.reduce((sum, value) => sum + value, 0) / (returns.length || 1);
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - avgReturn, 2), 0) /
    (returns.length || 1);
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  const endingCapital = activeConfig.startingCapital + totalPnl;
  const totalReturnPercent = (totalPnl / activeConfig.startingCapital) * 100;

  return {
    config: activeConfig,
    startingCapital: activeConfig.startingCapital,
    endingCapital,
    totalReturn: totalPnl,
    totalReturnPercent,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    profitFactor:
      grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Number.POSITIVE_INFINITY : 0,
    maxDrawdown,
    maxDrawdownPercent: (maxDrawdown / activeConfig.startingCapital) * 100,
    sharpeRatio,
    evPerTrade: trades.length > 0 ? totalPnl / trades.length : 0,
    totalFeesPaid: totalFees,
    trades,
  };
}

export async function compareStrategies(
  names: string[],
  overrides?: Partial<BacktestConfig>,
): Promise<ComparisonResult> {
  const metrics: StrategyMetric[] = [];

  for (const name of names) {
    const preset = STRATEGIES[name];
    if (!preset) {
      continue;
    }

    const config: BacktestConfig = {
      ...preset,
      ...overrides,
    };

    const result = await runBacktest(config);

    metrics.push({
      name,
      returnPercent: result.totalReturnPercent,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      maxDrawdown: result.maxDrawdownPercent,
      sharpeRatio: result.sharpeRatio,
      evPerTrade: result.evPerTrade,
    });
  }

  if (metrics.length === 0) {
    return {
      metrics: [],
      winner: "",
    };
  }

  let winner = metrics[0];
  for (let i = 1; i < metrics.length; i += 1) {
    if (metrics[i].returnPercent > winner.returnPercent) {
      winner = metrics[i];
    }
  }

  return {
    metrics,
    winner: winner.name,
  };
}

export function getStrategyPreset(name: string): BacktestConfig | null {
  return STRATEGIES[name] || null;
}

export function getStrategyPresetNames(): string[] {
  return Object.keys(STRATEGIES);
}

export function formatBacktestResult(result: BacktestResult): string {
  return [
    `📊 Backtest Result — ${result.config.strategy}`,
    "",
    `• Starting Capital: ${result.startingCapital.toFixed(4)} SOL`,
    `• Ending Capital: ${result.endingCapital.toFixed(4)} SOL`,
    `• Total Return: ${result.totalReturn.toFixed(4)} SOL`,
    `• Total Return %: ${result.totalReturnPercent.toFixed(2)}%`,
    `• Total Trades: ${result.totalTrades}`,
    `• Wins: ${result.wins}`,
    `• Losses: ${result.losses}`,
    `• Win Rate: ${result.winRate.toFixed(2)}%`,
    `• Profit Factor: ${
      Number.isFinite(result.profitFactor)
        ? result.profitFactor.toFixed(2)
        : "Infinity"
    }`,
    `• Max Drawdown: ${result.maxDrawdownPercent.toFixed(2)}%`,
    `• Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`,
    `• EV / Trade: ${result.evPerTrade.toFixed(4)} SOL`,
    `• Fees Paid: ${result.totalFeesPaid.toFixed(4)} SOL`,
  ].join("\n");
}

export function formatComparisonResult(result: ComparisonResult): string {
  if (result.metrics.length === 0) {
    return [
      "⚖️ Strategy Comparison",
      "",
      "Tidak ada preset strategy yang valid untuk dibandingkan.",
    ].join("\n");
  }

  const lines: string[] = [
    "⚖️ Strategy Comparison",
    "",
    `🏆 Winner: ${result.winner}`,
    "",
  ];

  for (const metric of result.metrics) {
    lines.push(
      `${metric.name}`,
      `• Return: ${metric.returnPercent.toFixed(2)}%`,
      `• Win Rate: ${metric.winRate.toFixed(2)}%`,
      `• Profit Factor: ${
        Number.isFinite(metric.profitFactor)
          ? metric.profitFactor.toFixed(2)
          : "Infinity"
      }`,
      `• Max Drawdown: ${metric.maxDrawdown.toFixed(2)}%`,
      `• Sharpe: ${metric.sharpeRatio.toFixed(2)}`,
      `• EV/Trade: ${metric.evPerTrade.toFixed(4)} SOL`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

export function buildCustomBacktestConfig(
  strategyName: string,
  overrides: Partial<BacktestConfig> = {},
): BacktestConfig {
  const preset = getStrategyPreset(strategyName) || STRATEGIES.balanced;

  return {
    ...preset,
    ...overrides,
    strategy: overrides.strategy || preset.strategy,
  };
}

export function createRandomizedBacktestSeed(): number {
  return Math.floor(randomBetween(1, 1_000_000_000));
}
