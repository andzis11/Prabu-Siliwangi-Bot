export interface FundingSource {
  funder: string;
  funderName?: string;
  funderType?: string;
  amount?: number;
  timestamp?: number;
  signature?: string;
}

export interface IdentityInfo {
  name?: string;
  category?: string;
  type?: string;
}

export interface TokenTransfer {
  mint?: string;
  direction?: "in" | "out" | string;
  counterparty?: string;
  timestamp: number;
  signature?: string;
}

export interface TokenBundleAnalysis {
  isBundled: boolean;
  distributor?: string;
  recipientCount?: number;
}

export interface WalletIntelAnalysis {
  walletAddress: string;
  funding: FundingSource | null;
  identity: IdentityInfo | null;
  bundledFunding: boolean;
  tokenCa?: string;
  tokenTransfers: TokenTransfer[];
  tokenBundleAnalysis?: TokenBundleAnalysis;
  generatedAt: string;
}

export interface WalletIntelAnalyzerOptions {
  heliusApiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  requestDelayMs?: number;
}

interface WalletHistoryResponse {
  data?: Array<{
    timestamp?: number;
  }>;
}

interface WalletTransfersResponse {
  data?: TokenTransfer[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || "https://api.helius.xyz/v1").replace(/\/+$/, "");
}

function isLikelyWalletAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 32 && trimmed.length <= 44;
}

function requireWalletAddress(walletAddress: string): string {
  const normalized = walletAddress.trim();
  if (!isLikelyWalletAddress(normalized)) {
    throw new Error("Invalid Solana wallet address.");
  }
  return normalized;
}

function buildUrl(
  baseUrl: string,
  path: string,
  apiKey: string,
  query: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("api-key", apiKey);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function fetchJson<T>(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { status: 404, data: null };
    }

    if (!response.ok) {
      throw new Error(`Helius request failed with status ${response.status}`);
    }

    const data = (await response.json()) as T;
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Helius request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export class WalletIntelAnalyzer {
  private readonly heliusApiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly requestDelayMs: number;

  constructor(options: WalletIntelAnalyzerOptions = {}) {
    this.heliusApiKey = options.heliusApiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.requestDelayMs = options.requestDelayMs ?? 350;
  }

  isConfigured(): boolean {
    return Boolean(this.heliusApiKey && this.heliusApiKey.trim() !== "");
  }

  async getFundingSource(walletAddress: string): Promise<FundingSource | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const wallet = requireWalletAddress(walletAddress);
    const url = buildUrl(
      this.baseUrl,
      `/wallet/${wallet}/funded-by`,
      this.heliusApiKey as string,
    );

    try {
      const response = await fetchJson<FundingSource>(url, this.timeoutMs);
      return response.data;
    } catch {
      return null;
    }
  }

  async getIdentity(walletAddress: string): Promise<IdentityInfo | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const wallet = requireWalletAddress(walletAddress);
    const url = buildUrl(
      this.baseUrl,
      `/wallet/${wallet}/identity`,
      this.heliusApiKey as string,
    );

    try {
      const response = await fetchJson<IdentityInfo>(url, this.timeoutMs);
      return response.data;
    } catch {
      return null;
    }
  }

  async getTokenTransfers(
    walletAddress: string,
    mint?: string,
  ): Promise<TokenTransfer[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const wallet = requireWalletAddress(walletAddress);
    const url = buildUrl(
      this.baseUrl,
      `/wallet/${wallet}/transfers`,
      this.heliusApiKey as string,
      { limit: 100 },
    );

    try {
      const response = await fetchJson<WalletTransfersResponse>(
        url,
        this.timeoutMs,
      );
      const transfers = response.data?.data || [];

      if (!mint) {
        return transfers;
      }

      const normalizedMint = mint.trim();
      return transfers.filter((transfer) => transfer.mint === normalizedMint);
    } catch {
      return [];
    }
  }

  async checkBundled(fundingData: FundingSource | null): Promise<boolean> {
    if (!this.isConfigured() || !fundingData) {
      return false;
    }

    const funderAddress = fundingData.funder;
    const fundingTimestamp = fundingData.timestamp;

    if (!funderAddress || !fundingTimestamp) {
      return false;
    }

    if (fundingData.funderType === "exchange" || fundingData.funderName) {
      return false;
    }

    const url = buildUrl(
      this.baseUrl,
      `/wallet/${funderAddress}/history`,
      this.heliusApiKey as string,
      { limit: 100 },
    );

    try {
      const response = await fetchJson<WalletHistoryResponse>(
        url,
        this.timeoutMs,
      );
      const transactions = response.data?.data || [];
      const timeWindow = 600;

      const relevantTxs = transactions.filter((tx) => {
        if (!tx.timestamp) {
          return false;
        }
        return Math.abs(tx.timestamp - fundingTimestamp) <= timeWindow;
      });

      return relevantTxs.length > 5;
    } catch {
      return false;
    }
  }

  async checkTokenBundled(
    transfers: TokenTransfer[],
    walletAddress: string,
    mint: string,
  ): Promise<TokenBundleAnalysis> {
    if (!this.isConfigured() || transfers.length === 0) {
      return { isBundled: false };
    }

    const incomingTransfers = transfers.filter(
      (transfer) =>
        transfer.direction === "in" &&
        transfer.mint === mint &&
        transfer.counterparty,
    );

    const transfersToAnalyze = incomingTransfers.slice(0, 5);

    for (const transfer of transfersToAnalyze) {
      const counterparty = transfer.counterparty;
      if (!counterparty) {
        continue;
      }

      await sleep(this.requestDelayMs);

      const identity = await this.getIdentity(counterparty);
      if (
        identity &&
        (identity.type === "exchange" ||
          Boolean(
            identity.category &&
              (identity.category.includes("DeFi") ||
                identity.category.includes("Swap")),
          ))
      ) {
        continue;
      }

      await sleep(this.requestDelayMs);

      const senderTransfers = await this.getTokenTransfers(counterparty, mint);
      const senderOutgoing = senderTransfers.filter(
        (item) => item.direction === "out" && item.mint === mint,
      );

      const timeWindow = 600;
      const relevantSenderTxs = senderOutgoing.filter(
        (item) => Math.abs(item.timestamp - transfer.timestamp) <= timeWindow,
      );

      const recipients = new Set(
        relevantSenderTxs
          .map((item) => item.counterparty)
          .filter((value): value is string => Boolean(value)),
      );

      if (recipients.size > 5) {
        return {
          isBundled: true,
          distributor: counterparty,
          recipientCount: recipients.size,
        };
      }
    }

    return { isBundled: false };
  }

  async analyzeWallet(
    walletAddress: string,
    tokenCa?: string,
  ): Promise<WalletIntelAnalysis> {
    const wallet = requireWalletAddress(walletAddress);
    const mint = tokenCa?.trim() || undefined;

    const funding = await this.getFundingSource(wallet);
    const identity = await this.getIdentity(wallet);
    const bundledFunding = await this.checkBundled(funding);

    let tokenTransfers: TokenTransfer[] = [];
    let tokenBundleAnalysis: TokenBundleAnalysis | undefined;

    if (mint) {
      tokenTransfers = await this.getTokenTransfers(wallet, mint);
      tokenBundleAnalysis = await this.checkTokenBundled(
        tokenTransfers,
        wallet,
        mint,
      );
    }

    return {
      walletAddress: wallet,
      funding,
      identity,
      bundledFunding,
      tokenCa: mint,
      tokenTransfers,
      tokenBundleAnalysis,
      generatedAt: new Date().toISOString(),
    };
  }
}

function shortAddress(address?: string): string {
  if (!address) {
    return "-";
  }

  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatFundingSource(funding: FundingSource | null): string[] {
  if (!funding) {
    return [
      "❓ Funding Source: Not found",
      "Wallet mungkin sangat lama atau sumber funding tidak tersedia di hasil Helius.",
    ];
  }

  const lines = [
    "💰 Funding Source",
    `• Funder: ${funding.funderName || "Unknown Wallet"} ${funding.funderType ? `(${funding.funderType})` : ""}`.trim(),
    `• Address: ${shortAddress(funding.funder)}`,
  ];

  if (funding.amount !== undefined) {
    lines.push(`• Amount: ${funding.amount} SOL`);
  }

  if (funding.timestamp) {
    lines.push(
      `• Date: ${new Date(funding.timestamp * 1000).toLocaleString()}`,
    );
  }

  if (funding.signature) {
    lines.push(`• Tx: ${funding.signature}`);
  }

  return lines;
}

function formatIdentity(identity: IdentityInfo | null): string[] {
  if (!identity || (!identity.name && !identity.category && !identity.type)) {
    return ["🪪 Identity", "• Not found"];
  }

  return [
    "🪪 Identity",
    `• Name: ${identity.name || "-"}`,
    `• Category: ${identity.category || "-"}`,
    `• Type: ${identity.type || "-"}`,
  ];
}

function formatTokenTransfers(
  transfers: TokenTransfer[],
  tokenBundleAnalysis?: TokenBundleAnalysis,
): string[] {
  const lines: string[] = ["🪙 Token Analysis"];

  if (transfers.length === 0) {
    lines.push("• No token transfers found.");
    return lines;
  }

  lines.push(`• Found ${transfers.length} transfer(s).`);

  for (const [index, transfer] of transfers.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${transfer.direction === "in" ? "⬅️ In" : "➡️ Out"} ${shortAddress(transfer.counterparty)} @ ${new Date(
        transfer.timestamp * 1000,
      ).toLocaleString()}`,
    );
  }

  if (tokenBundleAnalysis?.isBundled) {
    lines.push(
      `⚠️ Suspicious token bundle detected from ${shortAddress(tokenBundleAnalysis.distributor)} to ${tokenBundleAnalysis.recipientCount || 0} recipients.`,
    );
  } else if (tokenBundleAnalysis) {
    lines.push("✅ No suspicious token bundling detected.");
  }

  return lines;
}

export function formatWalletIntelAnalysis(
  analysis: WalletIntelAnalysis,
): string {
  const lines: string[] = [
    `🕵️ Wallet Intel — ${shortAddress(analysis.walletAddress)}`,
    "",
    ...formatFundingSource(analysis.funding),
    "",
    ...formatIdentity(analysis.identity),
    "",
    `⚠️ Bundled Funding: ${analysis.bundledFunding ? "YES" : "NO"}`,
  ];

  if (analysis.tokenCa) {
    lines.push("", `Token CA: ${analysis.tokenCa}`, "");
    lines.push(
      ...formatTokenTransfers(
        analysis.tokenTransfers,
        analysis.tokenBundleAnalysis,
      ),
    );
  }

  lines.push("", `Generated At: ${analysis.generatedAt}`);

  return lines.join("\n");
}
