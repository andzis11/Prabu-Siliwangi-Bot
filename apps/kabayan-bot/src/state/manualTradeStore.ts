export type ManualTradeSide = "buy" | "sell";
export type FeeMode = "SAFE" | "NORMAL" | "AGGRESSIVE";
export type PendingInputKind = "buy_token" | null;

export interface FeeSchedule {
  jitoTip: number;
  priorityFee: number;
  slippageBuy: number;
  slippageSell: number;
  buyFee: number;
  sellFee: number;
}

export interface ManualBuyDraft {
  side: "buy";
  tokenMint?: string;
  amountSol?: number;
  feeMode: FeeMode;
  slippageBps: number;
  updatedAt: string;
}

export interface ManualSellDraft {
  side: "sell";
  tokenMint?: string;
  sellPercent?: number;
  feeMode: FeeMode;
  slippageBps: number;
  updatedAt: string;
}

export type ManualTradeDraft = ManualBuyDraft | ManualSellDraft;

export interface SellableAsset {
  tokenMint: string;
  symbol?: string;
  amountLabel?: string;
  amountUi?: number;
  decimals?: number;
}

export interface PendingInputState {
  kind: PendingInputKind;
  updatedAt: string;
}

export interface ChatManualTradeState {
  buy: ManualBuyDraft;
  sell: ManualSellDraft;
  sellableAssets: SellableAsset[];
  pendingInput: PendingInputState;
}

export interface ManualTradeStore {
  getState(chatId: number): ChatManualTradeState;
  getBuyDraft(chatId: number): ManualBuyDraft;
  getSellDraft(chatId: number): ManualSellDraft;
  getSellableAssets(chatId: number): SellableAsset[];

  resetBuyDraft(chatId: number): ChatManualTradeState;
  resetSellDraft(chatId: number): ChatManualTradeState;

  setBuyToken(chatId: number, tokenMint: string): ChatManualTradeState;
  setBuyAmount(chatId: number, amountSol: number): ChatManualTradeState;
  setBuyFeeMode(chatId: number, feeMode: FeeMode): ChatManualTradeState;

  setSellToken(chatId: number, tokenMint: string): ChatManualTradeState;
  setSellPercent(chatId: number, sellPercent: number): ChatManualTradeState;
  setSellFeeMode(chatId: number, feeMode: FeeMode): ChatManualTradeState;
  setSellableAssets(
    chatId: number,
    assets: SellableAsset[],
  ): ChatManualTradeState;

  setPendingInput(chatId: number, kind: PendingInputKind): ChatManualTradeState;
  clearPendingInput(chatId: number): ChatManualTradeState;

  clearChat(chatId: number): void;
}

// Safe getFeeSchedule with validation - prevents undefined errors
export function getFeeSchedule(mode: FeeMode | string): FeeSchedule {
  if (mode === "SAFE") return FEE_SCHEDULES.SAFE;
  if (mode === "AGGRESSIVE") return FEE_SCHEDULES.AGGRESSIVE;
  return FEE_SCHEDULES.NORMAL; // Default fallback
}

// Type guard to validate fee mode
export function isValidFeeMode(mode: string): mode is FeeMode {
  return mode === "SAFE" || mode === "NORMAL" || mode === "AGGRESSIVE";
}

export const FEE_SCHEDULES: Record<FeeMode, FeeSchedule> = {
  SAFE: {
    jitoTip: 0.0001,
    priorityFee: 0.001,
    slippageBuy: 10,
    slippageSell: 10,
    buyFee: 0.003,
    sellFee: 0.003,
  },
  NORMAL: {
    jitoTip: 0.005,
    priorityFee: 0.005,
    slippageBuy: 15,
    slippageSell: 15,
    buyFee: 0.005,
    sellFee: 0.005,
  },
  AGGRESSIVE: {
    jitoTip: 0.01,
    priorityFee: 0.01,
    slippageBuy: 25,
    slippageSell: 30,
    buyFee: 0.008,
    sellFee: 0.008,
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function createBuyDraft(): ManualBuyDraft {
  return {
    side: "buy",
    feeMode: "NORMAL",
    slippageBps: FEE_SCHEDULES.NORMAL.slippageBuy,
    updatedAt: nowIso(),
  };
}

function createSellDraft(): ManualSellDraft {
  return {
    side: "sell",
    feeMode: "NORMAL",
    slippageBps: FEE_SCHEDULES.NORMAL.slippageSell,
    updatedAt: nowIso(),
  };
}

function createPendingInput(kind: PendingInputKind = null): PendingInputState {
  return {
    kind,
    updatedAt: nowIso(),
  };
}

function createChatState(): ChatManualTradeState {
  return {
    buy: createBuyDraft(),
    sell: createSellDraft(),
    sellableAssets: [],
    pendingInput: createPendingInput(),
  };
}

function cloneState(state: ChatManualTradeState): ChatManualTradeState {
  return {
    buy: { ...state.buy },
    sell: { ...state.sell },
    sellableAssets: state.sellableAssets.map((asset) => ({ ...asset })),
    pendingInput: { ...state.pendingInput },
  };
}

function normalizeTokenMint(tokenMint: string): string {
  return tokenMint.trim();
}

function validateAmountSol(amountSol: number): void {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Manual buy amount must be a positive number.");
  }
}

function validateSellPercent(sellPercent: number): void {
  if (!Number.isFinite(sellPercent) || sellPercent <= 0 || sellPercent > 100) {
    throw new Error("Manual sell percent must be between 0 and 100.");
  }
}

class InMemoryManualTradeStore implements ManualTradeStore {
  private readonly chats = new Map<number, ChatManualTradeState>();

  getState(chatId: number): ChatManualTradeState {
    return cloneState(this.getOrCreate(chatId));
  }

  getBuyDraft(chatId: number): ManualBuyDraft {
    return { ...this.getOrCreate(chatId).buy };
  }

  getSellDraft(chatId: number): ManualSellDraft {
    return { ...this.getOrCreate(chatId).sell };
  }

  getSellableAssets(chatId: number): SellableAsset[] {
    return this.getOrCreate(chatId).sellableAssets.map((asset) => ({ ...asset }));
  }

  resetBuyDraft(chatId: number): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.buy = createBuyDraft();
    state.pendingInput = createPendingInput(
      state.pendingInput.kind === "buy_token" ? null : state.pendingInput.kind,
    );
    return this.getState(chatId);
  }

  resetSellDraft(chatId: number): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.sell = createSellDraft();
    return this.getState(chatId);
  }

  setBuyToken(chatId: number, tokenMint: string): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.buy = {
      ...state.buy,
      tokenMint: normalizeTokenMint(tokenMint),
      updatedAt: nowIso(),
    };
    state.pendingInput = createPendingInput(null);
    return this.getState(chatId);
  }

  setBuyAmount(chatId: number, amountSol: number): ChatManualTradeState {
    validateAmountSol(amountSol);

    const state = this.getOrCreate(chatId);
    state.buy = {
      ...state.buy,
      amountSol,
      updatedAt: nowIso(),
    };
    return this.getState(chatId);
  }

  setBuyFeeMode(chatId: number, feeMode: FeeMode): ChatManualTradeState {
    const schedule = getFeeSchedule(feeMode);
    const state = this.getOrCreate(chatId);

    state.buy = {
      ...state.buy,
      feeMode,
      slippageBps: schedule.slippageBuy,
      updatedAt: nowIso(),
    };

    return this.getState(chatId);
  }

  setSellToken(chatId: number, tokenMint: string): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.sell = {
      ...state.sell,
      tokenMint: normalizeTokenMint(tokenMint),
      updatedAt: nowIso(),
    };
    state.pendingInput = createPendingInput(null);
    return this.getState(chatId);
  }

  setSellPercent(chatId: number, sellPercent: number): ChatManualTradeState {
    validateSellPercent(sellPercent);

    const state = this.getOrCreate(chatId);
    state.sell = {
      ...state.sell,
      sellPercent,
      updatedAt: nowIso(),
    };
    return this.getState(chatId);
  }

  setSellFeeMode(chatId: number, feeMode: FeeMode): ChatManualTradeState {
    const schedule = getFeeSchedule(feeMode);
    const state = this.getOrCreate(chatId);

    state.sell = {
      ...state.sell,
      feeMode,
      slippageBps: schedule.slippageSell,
      updatedAt: nowIso(),
    };

    return this.getState(chatId);
  }

  setSellableAssets(
    chatId: number,
    assets: SellableAsset[],
  ): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.sellableAssets = assets.map((asset) => ({
      ...asset,
      tokenMint: normalizeTokenMint(asset.tokenMint),
      decimals:
        asset.decimals !== undefined && Number.isFinite(asset.decimals)
          ? asset.decimals
          : undefined,
    }));
    return this.getState(chatId);
  }

  setPendingInput(chatId: number, kind: PendingInputKind): ChatManualTradeState {
    const state = this.getOrCreate(chatId);
    state.pendingInput = createPendingInput(kind);
    return this.getState(chatId);
  }

  clearPendingInput(chatId: number): ChatManualTradeState {
    return this.setPendingInput(chatId, null);
  }

  clearChat(chatId: number): void {
    this.chats.delete(chatId);
  }

  private getOrCreate(chatId: number): ChatManualTradeState {
    const existing = this.chats.get(chatId);
    if (existing) {
      return existing;
    }

    const created = createChatState();
    this.chats.set(chatId, created);
    return created;
  }
}

export function createManualTradeStore(): ManualTradeStore {
  return new InMemoryManualTradeStore();
}

export function formatBuyDraft(draft: ManualBuyDraft): string {
  return [
    "📥 MANUAL BUY DRAFT",
    "",
    `• Token: ${draft.tokenMint || "-"}`,
    `• Amount: ${draft.amountSol !== undefined ? `${draft.amountSol.toFixed(4)} SOL` : "-"}`,
    `• Fee Mode: ${draft.feeMode}`,
    `• Slippage Buy: ${draft.slippageBps} bps`,
    `• Updated At: ${draft.updatedAt}`,
  ].join("\n");
}

export function formatSellDraft(draft: ManualSellDraft): string {
  return [
    "📤 MANUAL SELL DRAFT",
    "",
    `• Token: ${draft.tokenMint || "-"}`,
    `• Sell Percent: ${draft.sellPercent !== undefined ? `${draft.sellPercent}%` : "-"}`,
    `• Fee Mode: ${draft.feeMode}`,
    `• Slippage Sell: ${draft.slippageBps} bps`,
    `• Updated At: ${draft.updatedAt}`,
  ].join("\n");
}

export function formatSellableAssets(assets: SellableAsset[]): string {
  if (assets.length === 0) {
    return [
      "📤 SELLABLE ASSETS",
      "",
      "Belum ada token yang tersedia untuk dijual.",
      "Hubungkan inventory wallet atau posisi aktif terlebih dahulu.",
    ].join("\n");
  }

  const lines = [
    "📤 SELLABLE ASSETS",
    "",
    "Pilih token yang ingin dijual:",
    "",
  ];

  for (const asset of assets) {
    const label =
      asset.symbol && asset.symbol.trim() !== ""
        ? `${asset.symbol} (${asset.tokenMint.slice(0, 8)}...)`
        : `${asset.tokenMint.slice(0, 8)}...`;

    const amountPart = asset.amountLabel
      ? asset.amountLabel
      : asset.amountUi !== undefined
        ? `${asset.amountUi.toFixed(4)}`
        : "-";

    const decimalsPart =
      asset.decimals !== undefined ? ` | Decimals: ${asset.decimals}` : "";

    lines.push(`• ${label} — ${amountPart}${decimalsPart}`);
  }

  return lines.join("\n");
}

export function isBuyDraftReady(draft: ManualBuyDraft): boolean {
  return Boolean(draft.tokenMint && draft.amountSol && draft.amountSol > 0);
}

export function isSellDraftReady(draft: ManualSellDraft): boolean {
  return Boolean(
    draft.tokenMint &&
      draft.sellPercent !== undefined &&
      draft.sellPercent > 0 &&
      draft.sellPercent <= 100,
  );
}
