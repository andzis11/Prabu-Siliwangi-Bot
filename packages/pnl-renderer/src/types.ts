export interface PnLCardData {
  pairName: string;
  pnlUsd: number;
  pnlPct?: number;
  depositedUsd?: number;
  binStep?: number;
  baseFeePct?: number;
  openedAt?: number; // timestamp in seconds
  closedAt?: number; // timestamp in seconds
}

export type PnLTheme = "dark" | "orange" | "green" | "purple";

export interface PnLRendererOptions {
  theme?: PnLTheme;
  currency?: "USD" | "IDR";
  rate?: number; // USD to IDR rate
  bgPath?: string;
  user?: {
    avatarUrl?: string;
    displayName?: string;
  };
  hiddenFields?: Set<string>;
}

export interface PnLRenderer {
  generateCard(data: PnLCardData, options?: PnLRendererOptions): Promise<Buffer>;
  describe(): string;
}
