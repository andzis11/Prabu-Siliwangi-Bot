import { TradeJournalEntry, TradeJournalStore } from "../../repositories/tradeJournal";

export interface JournalTradeMetadata {
  matchedWithSellId?: string;
  paperMode?: boolean;
  sellPercent?: number;
  [key: string]: unknown;
}

export interface PnLSnapshot {
  walletAddress: string;
  fetchedAt: string;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  realizedPnLSol: number;
  realizedPnLPct: number;
  totalFeesPaidSol: number;
  avgWinSol: number;
  avgLossSol: number;
  profitFactor: number;
  maxWinSol: number;
  maxLossSol: number;
  lastTradeAt?: string;
}

export interface TradePnLCalculation {
  entryTrade?: TradeJournalEntry;
  exitTrade?: TradeJournalEntry;
  realizedPnLSol: number;
  realizedPnLPct: number;
  feesSol: number;
}

export interface PnLRendererOptions {
  journal: TradeJournalStore;
  walletAddress?: string;
}

interface PositionLot {
  entryTrade: TradeJournalEntry;
  tokenAmount: number;
  remainingTokenAmount: number;
  costBasisSol: number;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function shortAddress(address: string, size = 6): string {
  if (!address || address.length <= size * 2) {
    return address;
  }

  return `${address.slice(0, size)}...${address.slice(-size)}`;
}

function getFeesSol(entry: TradeJournalEntry): number {
  const metadata = entry.metadata as JournalTradeMetadata | undefined;
  const rawValue = metadata?.feesSol;
  const parsed = Number(rawValue ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTokenAmount(entry: TradeJournalEntry): number {
  const parsed = Number(entry.amountToken ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInputSol(entry: TradeJournalEntry): number {
  const parsed = Number(entry.amountSol ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProceedsSol(entry: TradeJournalEntry): number {
  const parsed = Number(entry.proceedsSol ?? entry.amountSol ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSuccessfulTrade(entry: TradeJournalEntry): boolean {
  return entry.status === "success";
}

function canOpenLot(entry: TradeJournalEntry): boolean {
  return entry.type === "buy" && isSuccessfulTrade(entry) && getTokenAmount(entry) > 0;
}

function canCloseLot(entry: TradeJournalEntry): boolean {
  return entry.type === "sell" && isSuccessfulTrade(entry) && getTokenAmount(entry) > 0;
}

export class PnLRenderer {
  private readonly journal: TradeJournalStore;
  private readonly walletAddress?: string;

  constructor(options: PnLRendererOptions) {
    this.journal = options.journal;
    this.walletAddress = options.walletAddress;
  }

  calculateRealizedPnL(chatId?: number): PnLSnapshot {
    const entries = chatId
      ? this.journal.getEntries(chatId)
      : this.journal.getEntries();

    if (entries.length === 0) {
      return this.createEmptySnapshot();
    }

    const tokenTrades = new Map<string, TradeJournalEntry[]>();
    for (const entry of entries) {
      if (!tokenTrades.has(entry.tokenMint)) {
        tokenTrades.set(entry.tokenMint, []);
      }
      tokenTrades.get(entry.tokenMint)?.push(entry);
    }

    let totalWins = 0;
    let totalLosses = 0;
    let totalPnLSol = 0;
    let totalFeesSol = 0;
    let maxWinSol = 0;
    let maxLossSol = 0;
    let lastTradeAt: string | undefined;
    const realizedTrades: TradePnLCalculation[] = [];

    for (const trades of tokenTrades.values()) {
      trades.sort(
        (left, right) =>
          new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
      );

      const openLots: PositionLot[] = [];

      for (const trade of trades) {
        if (canOpenLot(trade)) {
          openLots.push({
            entryTrade: trade,
            tokenAmount: getTokenAmount(trade),
            remainingTokenAmount: getTokenAmount(trade),
            costBasisSol: getInputSol(trade),
          });
          continue;
        }

        if (!canCloseLot(trade)) {
          continue;
        }

        let remainingSellTokenAmount = getTokenAmount(trade);
        const grossProceedsSol = getProceedsSol(trade);
        const feesSol = getFeesSol(trade);
        const netProceedsSol = Math.max(grossProceedsSol - feesSol, 0);
        const proceedsPerToken =
          remainingSellTokenAmount > 0
            ? netProceedsSol / remainingSellTokenAmount
            : 0;

        while (remainingSellTokenAmount > 0 && openLots.length > 0) {
          const currentLot = openLots[0];
          const matchedTokenAmount = Math.min(
            currentLot.remainingTokenAmount,
            remainingSellTokenAmount,
          );

          if (matchedTokenAmount <= 0) {
            openLots.shift();
            continue;
          }

          const lotCostPerToken =
            currentLot.remainingTokenAmount > 0
              ? currentLot.costBasisSol / currentLot.remainingTokenAmount
              : 0;
          const matchedCostBasisSol = lotCostPerToken * matchedTokenAmount;
          const matchedProceedsSol = proceedsPerToken * matchedTokenAmount;
          const pnlSol = matchedProceedsSol - matchedCostBasisSol;
          const pnlPct =
            matchedCostBasisSol > 0 ? (pnlSol / matchedCostBasisSol) * 100 : 0;

          totalPnLSol += pnlSol;
          totalFeesSol += feesSol * (matchedTokenAmount / getTokenAmount(trade));

          if (pnlSol > 0) {
            totalWins += 1;
            maxWinSol = Math.max(maxWinSol, pnlSol);
          } else {
            totalLosses += 1;
            maxLossSol = Math.min(maxLossSol, pnlSol);
          }

          realizedTrades.push({
            entryTrade: currentLot.entryTrade,
            exitTrade: trade,
            realizedPnLSol: pnlSol,
            realizedPnLPct: pnlPct,
            feesSol: feesSol * (matchedTokenAmount / getTokenAmount(trade)),
          });

          currentLot.remainingTokenAmount -= matchedTokenAmount;
          currentLot.costBasisSol -= matchedCostBasisSol;
          remainingSellTokenAmount -= matchedTokenAmount;

          if (currentLot.remainingTokenAmount <= 1e-12) {
            openLots.shift();
          }
        }
      }
    }

    const allSuccessTrades = entries.filter(isSuccessfulTrade);
    if (allSuccessTrades.length > 0) {
      allSuccessTrades.sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
      );
      lastTradeAt = allSuccessTrades[0].timestamp;
    }

    const totalTrades = allSuccessTrades.length;
    const matchedOutcomes = totalWins + totalLosses;
    const winRate = matchedOutcomes > 0 ? (totalWins / matchedOutcomes) * 100 : 0;
    const grossWins = realizedTrades
      .filter((trade) => trade.realizedPnLSol > 0)
      .reduce((sum, trade) => sum + trade.realizedPnLSol, 0);
    const grossLosses = Math.abs(
      realizedTrades
        .filter((trade) => trade.realizedPnLSol <= 0)
        .reduce((sum, trade) => sum + trade.realizedPnLSol, 0),
    );
    const avgWinSol = totalWins > 0 ? grossWins / totalWins : 0;
    const avgLossSol = totalLosses > 0 ? grossLosses / totalLosses : 0;
    const profitFactor =
      grossLosses > 0
        ? grossWins / grossLosses
        : grossWins > 0
          ? Number.POSITIVE_INFINITY
          : 0;

    const successfulBuys = entries.filter(
      (entry) => entry.type === "buy" && isSuccessfulTrade(entry),
    );
    const estimatedStartingCapital = successfulBuys.reduce(
      (sum, entry) => sum + getInputSol(entry),
      0,
    );
    const realizedPnLPct =
      estimatedStartingCapital > 0
        ? (totalPnLSol / estimatedStartingCapital) * 100
        : 0;

    return {
      walletAddress: this.walletAddress || "Unknown",
      fetchedAt: new Date().toISOString(),
      totalTrades,
      totalWins,
      totalLosses,
      winRate: round(winRate, 2),
      realizedPnLSol: round(totalPnLSol, 4),
      realizedPnLPct: round(realizedPnLPct, 2),
      totalFeesPaidSol: round(totalFeesSol, 4),
      avgWinSol: round(avgWinSol, 4),
      avgLossSol: round(avgLossSol, 4),
      profitFactor: Number.isFinite(profitFactor)
        ? round(profitFactor, 2)
        : Number.POSITIVE_INFINITY,
      maxWinSol: round(maxWinSol, 4),
      maxLossSol: round(maxLossSol, 4),
      lastTradeAt,
    };
  }

  private createEmptySnapshot(): PnLSnapshot {
    return {
      walletAddress: this.walletAddress || "Unknown",
      fetchedAt: new Date().toISOString(),
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      winRate: 0,
      realizedPnLSol: 0,
      realizedPnLPct: 0,
      totalFeesPaidSol: 0,
      avgWinSol: 0,
      avgLossSol: 0,
      profitFactor: 0,
      maxWinSol: 0,
      maxLossSol: 0,
    };
  }

  formatSnapshot(snapshot: PnLSnapshot): string {
    return formatPnLSnapshot(snapshot);
  }
}

export function createPnLRenderer(options: PnLRendererOptions): PnLRenderer {
  return new PnLRenderer(options);
}

export function formatPnLSnapshot(snapshot: PnLSnapshot): string {
  const lines: string[] = [
    "📈 REALIZED PnL REPORT",
    "",
    `• Wallet: ${shortAddress(snapshot.walletAddress, 6)}`,
    `• Last Trade: ${snapshot.lastTradeAt ? new Date(snapshot.lastTradeAt).toLocaleString() : "N/A"}`,
    "",
    "Performance Summary",
    `• Total Trades: ${snapshot.totalTrades}`,
    `• Wins: ${snapshot.totalWins}`,
    `• Losses: ${snapshot.totalLosses}`,
    `• Win Rate: ${snapshot.winRate}%`,
    "",
    "PnL",
    `• Realized PnL: ${snapshot.realizedPnLSol >= 0 ? "+" : ""}${snapshot.realizedPnLSol.toFixed(4)} SOL`,
    `• PnL %: ${snapshot.realizedPnLPct >= 0 ? "+" : ""}${snapshot.realizedPnLPct.toFixed(2)}%`,
    `• Total Fees: ${snapshot.totalFeesPaidSol.toFixed(4)} SOL`,
    "",
    "Risk Metrics",
    `• Avg Win: +${snapshot.avgWinSol.toFixed(4)} SOL`,
    `• Avg Loss: -${Math.abs(snapshot.avgLossSol).toFixed(4)} SOL`,
    `• Max Win: +${snapshot.maxWinSol.toFixed(4)} SOL`,
    `• Max Loss: ${snapshot.maxLossSol.toFixed(4)} SOL`,
    `• Profit Factor: ${Number.isFinite(snapshot.profitFactor) ? snapshot.profitFactor.toFixed(2) : "N/A"}`,
  ];

  return lines.join("\n");
}
