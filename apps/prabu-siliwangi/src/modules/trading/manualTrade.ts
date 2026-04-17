export type ManualTradeSide = "buy" | "sell";
export type FeeMode = "SAFE" | "NORMAL" | "AGGRESSIVE";

export interface FeeSchedule {
  jitoTip: number;
  priorityFee: number;
  slippageBuy: number;
  slippageSell: number;
  buyFee: number;
  sellFee: number;
}

export interface ManualTradeDraft {
  side: ManualTradeSide;
  tokenMint?: string;
  amountSol?: number;
  sellPercent?: number;
  feeMode: FeeMode;
  createdAt: string;
  updatedAt: string;
}

export interface ManualTradeValidationResult {
  ok: boolean;
  errors: string[];
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

function formatOptional(value: string | number | undefined, fallback = "-"): string {
  if (value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

export function getFeeSchedule(mode: FeeMode | string): FeeSchedule {
  if (mode === "SAFE") return FEE_SCHEDULES.SAFE;
  if (mode === "AGGRESSIVE") return FEE_SCHEDULES.AGGRESSIVE;
  return FEE_SCHEDULES.NORMAL; // Default fallback
}

// Type guard to safely get fee schedule
export function isValidFeeMode(mode: string): mode is FeeMode {
  return mode === "SAFE" || mode === "NORMAL" || mode === "AGGRESSIVE";
}

export function createManualTradeDraft(
  side: ManualTradeSide,
  feeMode: FeeMode = "NORMAL",
): ManualTradeDraft {
  const timestamp = nowIso();

  return {
    side,
    feeMode,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function cloneManualTradeDraft(
  draft: ManualTradeDraft,
): ManualTradeDraft {
  return {
    ...draft,
  };
}

export function setDraftTokenMint(
  draft: ManualTradeDraft,
  tokenMint: string,
): ManualTradeDraft {
  return {
    ...draft,
    tokenMint: tokenMint.trim(),
    updatedAt: nowIso(),
  };
}

export function setDraftAmountSol(
  draft: ManualTradeDraft,
  amountSol: number,
): ManualTradeDraft {
  return {
    ...draft,
    amountSol,
    updatedAt: nowIso(),
  };
}

export function setDraftSellPercent(
  draft: ManualTradeDraft,
  sellPercent: number,
): ManualTradeDraft {
  return {
    ...draft,
    sellPercent,
    updatedAt: nowIso(),
  };
}

export function setDraftFeeMode(
  draft: ManualTradeDraft,
  feeMode: FeeMode,
): ManualTradeDraft {
  return {
    ...draft,
    feeMode,
    updatedAt: nowIso(),
  };
}

export function clearDraftTokenMint(
  draft: ManualTradeDraft,
): ManualTradeDraft {
  const next = cloneManualTradeDraft(draft);
  delete next.tokenMint;
  next.updatedAt = nowIso();
  return next;
}

export function clearDraftAmount(
  draft: ManualTradeDraft,
): ManualTradeDraft {
  const next = cloneManualTradeDraft(draft);
  delete next.amountSol;
  next.updatedAt = nowIso();
  return next;
}

export function clearDraftSellPercent(
  draft: ManualTradeDraft,
): ManualTradeDraft {
  const next = cloneManualTradeDraft(draft);
  delete next.sellPercent;
  next.updatedAt = nowIso();
  return next;
}

export function estimateTotalCost(
  tradeSizeSol: number,
  mode: FeeMode,
): number {
  const schedule = getFeeSchedule(mode);
  const fixedCost = schedule.jitoTip + schedule.priorityFee;
  const variableCost = tradeSizeSol * (schedule.buyFee + schedule.sellFee);
  return fixedCost + variableCost;
}

export function calcFeeRatio(
  tradeSizeSol: number,
  mode: FeeMode,
): number {
  if (tradeSizeSol <= 0) {
    return 999;
  }

  return (estimateTotalCost(tradeSizeSol, mode) / tradeSizeSol) * 100;
}

export function validateManualTradeDraft(
  draft: ManualTradeDraft,
): ManualTradeValidationResult {
  const errors: string[] = [];

  if (!draft.tokenMint || draft.tokenMint.trim() === "") {
    errors.push("Token mint belum diisi.");
  }

  if (draft.side === "buy") {
    if (draft.amountSol === undefined || Number.isNaN(draft.amountSol)) {
      errors.push("Jumlah SOL buy belum diisi.");
    } else if (draft.amountSol <= 0) {
      errors.push("Jumlah SOL buy harus lebih besar dari 0.");
    }
  }

  if (draft.side === "sell") {
    if (draft.sellPercent === undefined || Number.isNaN(draft.sellPercent)) {
      errors.push("Persentase sell belum diisi.");
    } else if (draft.sellPercent <= 0 || draft.sellPercent > 100) {
      errors.push("Persentase sell harus antara 1 sampai 100.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function getDraftPrimaryValueLabel(
  draft: ManualTradeDraft,
): string {
  if (draft.side === "buy") {
    return draft.amountSol !== undefined
      ? `${draft.amountSol.toFixed(4)} SOL`
      : "-";
  }

  return draft.sellPercent !== undefined
    ? `${draft.sellPercent}%`
    : "-";
}

export function formatDraftSummary(
  draft: ManualTradeDraft,
): string {
  const fee = getFeeSchedule(draft.feeMode);
  const validation = validateManualTradeDraft(draft);
  const tradeSize =
    draft.side === "buy" ? draft.amountSol || 0 : 1;
  const feeRatio = calcFeeRatio(tradeSize, draft.feeMode);

  const lines = [
    `🧾 MANUAL ${draft.side.toUpperCase()} DRAFT`,
    "",
    `• Side: ${draft.side.toUpperCase()}`,
    `• Token Mint: ${formatOptional(draft.tokenMint, "Belum diisi")}`,
    `• ${draft.side === "buy" ? "Amount SOL" : "Sell %"}: ${getDraftPrimaryValueLabel(draft)}`,
    `• Fee Mode: ${draft.feeMode}`,
    `• Slippage Buy: ${fee.slippageBuy}%`,
    `• Slippage Sell: ${fee.slippageSell}%`,
    `• Jito Tip: ${fee.jitoTip} SOL`,
    `• Priority Fee: ${fee.priorityFee} SOL`,
    `• Fee Ratio Est.: ${Number.isFinite(feeRatio) ? feeRatio.toFixed(2) : "999.00"}%`,
    `• Updated At: ${draft.updatedAt}`,
    "",
  ];

  if (validation.ok) {
    lines.push("✅ Draft siap untuk confirm.");
  } else {
    lines.push("⚠️ Draft belum lengkap.");
    lines.push("");
    lines.push("Yang perlu dilengkapi:");
    for (const error of validation.errors) {
      lines.push(`• ${error}`);
    }
  }

  return lines.join("\n");
}

export function formatDraftCompactLabel(
  draft: ManualTradeDraft,
): string {
  return [
    draft.side.toUpperCase(),
    formatOptional(draft.tokenMint, "NO_TOKEN"),
    getDraftPrimaryValueLabel(draft),
    draft.feeMode,
  ].join(" | ");
}
