export type WalletIntelPendingInputKind = "wallet_address" | "token_address" | null;

export interface WalletIntelTarget {
  walletAddress?: string;
  tokenAddress?: string;
  updatedAt: string;
}

export interface WalletIntelPendingInput {
  kind: WalletIntelPendingInputKind;
  updatedAt: string;
}

export interface WalletIntelSessionState {
  target: WalletIntelTarget;
  pendingInput: WalletIntelPendingInput;
}

export interface WalletIntelStore {
  getState(chatId: number): WalletIntelSessionState;
  getTarget(chatId: number): WalletIntelTarget;
  getPendingInput(chatId: number): WalletIntelPendingInput;

  setWalletAddress(chatId: number, walletAddress: string): WalletIntelSessionState;
  clearWalletAddress(chatId: number): WalletIntelSessionState;

  setTokenAddress(chatId: number, tokenAddress: string): WalletIntelSessionState;
  clearTokenAddress(chatId: number): WalletIntelSessionState;

  setPendingInput(
    chatId: number,
    kind: WalletIntelPendingInputKind,
  ): WalletIntelSessionState;
  clearPendingInput(chatId: number): WalletIntelSessionState;

  resetTarget(chatId: number): WalletIntelSessionState;
  clearChat(chatId: number): void;

  // Race condition protection
  isAnalyzing(chatId: number): boolean;
  setAnalyzing(chatId: number, analyzing: boolean): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAddress(value: string): string {
  return value.trim();
}

function createTarget(): WalletIntelTarget {
  return {
    updatedAt: nowIso(),
  };
}

function createPendingInput(
  kind: WalletIntelPendingInputKind = null,
): WalletIntelPendingInput {
  return {
    kind,
    updatedAt: nowIso(),
  };
}

function createSessionState(): WalletIntelSessionState {
  return {
    target: createTarget(),
    pendingInput: createPendingInput(),
  };
}

function cloneState(state: WalletIntelSessionState): WalletIntelSessionState {
  return {
    target: { ...state.target },
    pendingInput: { ...state.pendingInput },
  };
}

class InMemoryWalletIntelStore implements WalletIntelStore {
  private readonly chats = new Map<number, WalletIntelSessionState>();
  private readonly analyzingMap = new Map<number, boolean>();

  getState(chatId: number): WalletIntelSessionState {
    return cloneState(this.getOrCreate(chatId));
  }

  getTarget(chatId: number): WalletIntelTarget {
    return { ...this.getOrCreate(chatId).target };
  }

  getPendingInput(chatId: number): WalletIntelPendingInput {
    return { ...this.getOrCreate(chatId).pendingInput };
  }

  setWalletAddress(
    chatId: number,
    walletAddress: string,
  ): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    state.target = {
      ...state.target,
      walletAddress: normalizeAddress(walletAddress),
      updatedAt: nowIso(),
    };

    if (state.pendingInput.kind === "wallet_address") {
      state.pendingInput = createPendingInput(null);
    }

    return this.getState(chatId);
  }

  clearWalletAddress(chatId: number): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    const nextTarget = { ...state.target };
    delete nextTarget.walletAddress;
    nextTarget.updatedAt = nowIso();
    state.target = nextTarget;
    return this.getState(chatId);
  }

  setTokenAddress(chatId: number, tokenAddress: string): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    state.target = {
      ...state.target,
      tokenAddress: normalizeAddress(tokenAddress),
      updatedAt: nowIso(),
    };

    if (state.pendingInput.kind === "token_address") {
      state.pendingInput = createPendingInput(null);
    }

    return this.getState(chatId);
  }

  clearTokenAddress(chatId: number): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    const nextTarget = { ...state.target };
    delete nextTarget.tokenAddress;
    nextTarget.updatedAt = nowIso();
    state.target = nextTarget;
    return this.getState(chatId);
  }

  setPendingInput(
    chatId: number,
    kind: WalletIntelPendingInputKind,
  ): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    state.pendingInput = createPendingInput(kind);
    return this.getState(chatId);
  }

  clearPendingInput(chatId: number): WalletIntelSessionState {
    return this.setPendingInput(chatId, null);
  }

  resetTarget(chatId: number): WalletIntelSessionState {
    const state = this.getOrCreate(chatId);
    state.target = createTarget();
    state.pendingInput = createPendingInput(null);
    return this.getState(chatId);
  }

  clearChat(chatId: number): void {
    this.chats.delete(chatId);
    this.analyzingMap.delete(chatId);
  }

  isAnalyzing(chatId: number): boolean {
    return this.analyzingMap.get(chatId) ?? false;
  }

  setAnalyzing(chatId: number, analyzing: boolean): void {
    this.analyzingMap.set(chatId, analyzing);
  }

  private getOrCreate(chatId: number): WalletIntelSessionState {
    const existing = this.chats.get(chatId);
    if (existing) {
      return existing;
    }

    const created = createSessionState();
    this.chats.set(chatId, created);
    return created;
  }
}

export function createWalletIntelStore(): WalletIntelStore {
  return new InMemoryWalletIntelStore();
}

export function formatWalletIntelTarget(target: WalletIntelTarget): string {
  return [
    "🕵️ WALLET INTEL TARGET",
    "",
    `• Wallet Address: ${target.walletAddress || "-"}`,
    `• Token Address: ${target.tokenAddress || "-"}`,
    `• Updated At: ${target.updatedAt}`,
  ].join("\n");
}
