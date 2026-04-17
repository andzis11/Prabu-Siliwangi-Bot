export interface PaperTrade {
  tokenMint: string;
  entryPrice: number;
  tokenAmount: number;
  costBasisSol: number;
  timestamp: number;
}

export interface PaperPosition {
  tokenMint: string;
  tokenAmount: number;
  costBasisSol: number;
  averageEntryPrice: number;
}

interface PaperChatState {
  trades: PaperTrade[];
  balance: number;
}

const DEFAULT_STARTING_BALANCE = 10;
const paperStates = new Map<number, PaperChatState>();

function normalizeMint(mint: string): string {
  return mint.trim();
}

function getChatState(chatId: number): PaperChatState {
  const existing = paperStates.get(chatId);
  if (existing) {
    return existing;
  }

  const created: PaperChatState = {
    trades: [],
    balance: DEFAULT_STARTING_BALANCE,
  };
  paperStates.set(chatId, created);
  return created;
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function paperBuy(
  chatId: number,
  mint: string,
  price: number,
  sol: number,
): { success: boolean; purchasedTokenAmount: number; spentSol: number; error?: string } {
  const state = getChatState(chatId);
  const tokenMint = normalizeMint(mint);

  if (!tokenMint) {
    return {
      success: false,
      purchasedTokenAmount: 0,
      spentSol: 0,
      error: "Token mint is required.",
    };
  }

  if (!isPositiveNumber(price)) {
    return {
      success: false,
      purchasedTokenAmount: 0,
      spentSol: 0,
      error: "Price must be a positive number.",
    };
  }

  if (!isPositiveNumber(sol)) {
    return {
      success: false,
      purchasedTokenAmount: 0,
      spentSol: 0,
      error: "SOL amount must be a positive number.",
    };
  }

  if (sol > state.balance) {
    return {
      success: false,
      purchasedTokenAmount: 0,
      spentSol: 0,
      error: `Insufficient paper balance. Available: ${state.balance.toFixed(4)} SOL`,
    };
  }

  const purchasedTokenAmount = sol / price;

  state.trades.push({
    tokenMint,
    entryPrice: price,
    tokenAmount: purchasedTokenAmount,
    costBasisSol: sol,
    timestamp: Date.now(),
  });

  state.balance -= sol;

  return {
    success: true,
    purchasedTokenAmount,
    spentSol: sol,
  };
}

export function paperSell(
  chatId: number,
  mint: string,
  price: number,
  pct: number = 1,
): {
  success: boolean;
  pnl: number;
  soldTokenAmount: number;
  receivedSol: number;
  error?: string;
} {
  const state = getChatState(chatId);
  const tokenMint = normalizeMint(mint);

  if (!tokenMint) {
    return {
      success: false,
      pnl: 0,
      soldTokenAmount: 0,
      receivedSol: 0,
      error: "Token mint is required.",
    };
  }

  if (!isPositiveNumber(price)) {
    return {
      success: false,
      pnl: 0,
      soldTokenAmount: 0,
      receivedSol: 0,
      error: "Price must be a positive number.",
    };
  }

  if (!Number.isFinite(pct) || pct <= 0) {
    return {
      success: false,
      pnl: 0,
      soldTokenAmount: 0,
      receivedSol: 0,
      error: "Sell percentage must be greater than 0.",
    };
  }

  const sellRatio = pct > 1 ? pct / 100 : pct;

  if (sellRatio <= 0 || sellRatio > 1) {
    return {
      success: false,
      pnl: 0,
      soldTokenAmount: 0,
      receivedSol: 0,
      error: "Sell percentage must be between 0 and 100.",
    };
  }

  const matchingTrades = state.trades.filter((trade) => trade.tokenMint === tokenMint);
  const totalTokenAmount = matchingTrades.reduce(
    (sum, trade) => sum + trade.tokenAmount,
    0,
  );

  if (totalTokenAmount <= 0) {
    return {
      success: false,
      pnl: 0,
      soldTokenAmount: 0,
      receivedSol: 0,
      error: "No paper position found for this token.",
    };
  }

  const soldTokenAmount = totalTokenAmount * sellRatio;
  const receivedSol = soldTokenAmount * price;
  let remainingToSell = soldTokenAmount;
  let realizedCostBasis = 0;

  for (let index = 0; index < state.trades.length && remainingToSell > 0; ) {
    const trade = state.trades[index];
    if (trade.tokenMint !== tokenMint) {
      index += 1;
      continue;
    }

    const lotSellAmount = Math.min(trade.tokenAmount, remainingToSell);
    const lotRatio = lotSellAmount / trade.tokenAmount;
    realizedCostBasis += trade.costBasisSol * lotRatio;
    trade.tokenAmount -= lotSellAmount;
    trade.costBasisSol -= trade.costBasisSol * lotRatio;
    remainingToSell -= lotSellAmount;

    if (trade.tokenAmount <= 1e-12) {
      state.trades.splice(index, 1);
      continue;
    }

    index += 1;
  }

  const pnl = receivedSol - realizedCostBasis;
  state.balance += receivedSol;

  return {
    success: true,
    pnl,
    soldTokenAmount,
    receivedSol,
  };
}

export function getPaperBalance(chatId: number): number {
  return getChatState(chatId).balance;
}

export function getPaperTrades(chatId: number): PaperTrade[] {
  return getChatState(chatId).trades.map((trade) => ({ ...trade }));
}

export function getPaperPositions(chatId: number): PaperPosition[] {
  const aggregated = new Map<string, PaperPosition>();

  for (const trade of getPaperTrades(chatId)) {
    const current = aggregated.get(trade.tokenMint);
    const nextTokenAmount = (current?.tokenAmount || 0) + trade.tokenAmount;
    const nextCostBasisSol = (current?.costBasisSol || 0) + trade.costBasisSol;

    aggregated.set(trade.tokenMint, {
      tokenMint: trade.tokenMint,
      tokenAmount: nextTokenAmount,
      costBasisSol: nextCostBasisSol,
      averageEntryPrice:
        nextTokenAmount > 0 ? nextCostBasisSol / nextTokenAmount : 0,
    });
  }

  return [...aggregated.values()].sort(
    (left, right) => right.costBasisSol - left.costBasisSol,
  );
}

export function resetPaper(
  chatId: number,
  startingBalance = DEFAULT_STARTING_BALANCE,
): void {
  paperStates.set(chatId, {
    trades: [],
    balance: isPositiveNumber(startingBalance)
      ? startingBalance
      : DEFAULT_STARTING_BALANCE,
  });
}
