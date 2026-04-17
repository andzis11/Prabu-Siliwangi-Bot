import { fetchWalletHoldings, type WalletHolding } from "./walletHoldings";

export interface PortfolioPosition extends WalletHolding {
  symbol: string;
  priceUsd: number;
  valueUsd: number;
}

export interface PortfolioSnapshot {
  walletAddress: string;
  fetchedAt: string;
  rpcUrl: string;
  positions: PortfolioPosition[];
  totalEstimatedUsd: number;
  totalTokens: number;
  pricedTokens: number;
  unpricedTokens: number;
}

export interface PortfolioFetchOptions {
  heliusApiKey?: string;
  rpcUrl?: string;
  timeoutMs?: number;
}

interface JupiterPriceEntry {
  price?: number;
}

interface JupiterPriceResponse {
  data?: Record<string, JupiterPriceEntry | undefined>;
}

const SYMBOL_MAP = new Map<string, string>([
  ["So11111111111111111111111111111111111111112", "SOL"],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC"],
  ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT"],
  ["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "JUP"],
  ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6Qf4r7YaB1pPB263", "BONK"],
]);

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function resolveSymbol(mint: string): string {
  return SYMBOL_MAP.get(mint) || mint.slice(0, 4).toUpperCase();
}

function formatUsd(value: number): string {
  return `$${safeNumber(value).toFixed(2)}`;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  if (value >= 1) {
    return value.toFixed(4);
  }

  return value.toFixed(8);
}

async function fetchJupiterPrices(
  mints: string[],
  timeoutMs = 15_000,
): Promise<Record<string, number>> {
  const uniqueMints = [...new Set(mints.map((mint) => mint.trim()).filter(Boolean))];
  if (uniqueMints.length === 0) {
    return {};
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ids = encodeURIComponent(uniqueMints.join(","));
    const urls = [
      `https://api.jup.ag/price/v3?ids=${ids}`,
      `https://lite-api.jup.ag/price/v3?ids=${ids}`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as JupiterPriceResponse;
        const data = payload.data || {};
        const prices: Record<string, number> = {};

        for (const mint of uniqueMints) {
          const price = safeNumber(data[mint]?.price);
          if (price > 0) {
            prices[mint] = price;
          }
        }

        if (Object.keys(prices).length > 0) {
          return prices;
        }
      } catch {
        continue;
      }
    }

    return {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Jupiter price request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildPortfolioPositions(
  holdings: WalletHolding[],
  prices: Record<string, number>,
): PortfolioPosition[] {
  return holdings
    .map((holding) => {
      const priceUsd = safeNumber(prices[holding.tokenMint]);
      const valueUsd = round(holding.amountUi * priceUsd, 6);

      return {
        ...holding,
        symbol: resolveSymbol(holding.tokenMint),
        priceUsd,
        valueUsd,
      };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd || b.amountUi - a.amountUi);
}

export async function fetchPortfolioSnapshot(
  walletAddress: string,
  options: PortfolioFetchOptions = {},
): Promise<PortfolioSnapshot> {
  const holdingsResult = await fetchWalletHoldings(walletAddress, {
    heliusApiKey: options.heliusApiKey,
    rpcUrl: options.rpcUrl,
    timeoutMs: options.timeoutMs,
  });

  const prices = await fetchJupiterPrices(
    holdingsResult.holdings.map((holding) => holding.tokenMint),
    options.timeoutMs,
  );

  const positions = buildPortfolioPositions(holdingsResult.holdings, prices);
  const totalEstimatedUsd = round(
    positions.reduce((sum, position) => sum + position.valueUsd, 0),
    6,
  );
  const pricedTokens = positions.filter((position) => position.priceUsd > 0).length;
  const unpricedTokens = positions.length - pricedTokens;

  return {
    walletAddress: holdingsResult.walletAddress,
    fetchedAt: holdingsResult.fetchedAt,
    rpcUrl: holdingsResult.rpcUrl,
    positions,
    totalEstimatedUsd,
    totalTokens: positions.length,
    pricedTokens,
    unpricedTokens,
  };
}

export function formatPortfolioSnapshot(snapshot: PortfolioSnapshot): string {
  const lines: string[] = [
    "💼 PORTFOLIO SNAPSHOT",
    "",
    `• Wallet: ${shortAddress(snapshot.walletAddress, 6)}`,
    `• Fetched At: ${snapshot.fetchedAt}`,
    `• Total Tokens: ${snapshot.totalTokens}`,
    `• Priced Tokens: ${snapshot.pricedTokens}`,
    `• Unpriced Tokens: ${snapshot.unpricedTokens}`,
    `• Est. Portfolio Value: ${formatUsd(snapshot.totalEstimatedUsd)}`,
    "",
  ];

  if (snapshot.positions.length === 0) {
    lines.push("Tidak ada token SPL dengan saldo > 0 yang ditemukan.");
    return lines.join("\n");
  }

  lines.push("Top Positions", "");

  for (const [index, position] of snapshot.positions.slice(0, 10).entries()) {
    lines.push(
      `${index + 1}. ${position.symbol} (${shortAddress(position.tokenMint, 4)})`,
      `   Amount: ${formatAmount(position.amountUi)}`,
      `   Price: ${position.priceUsd > 0 ? formatUsd(position.priceUsd) : "N/A"}`,
      `   Value: ${position.valueUsd > 0 ? formatUsd(position.valueUsd) : "N/A"}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

export function formatPnlStatusFromPortfolio(snapshot: PortfolioSnapshot): string {
  return [
    "📈 PNL STATUS",
    "",
    "PnL realized penuh belum tersedia karena trade journal dan cost basis belum terhubung.",
    "",
    `• Wallet: ${shortAddress(snapshot.walletAddress, 6)}`,
    `• Est. Current Portfolio Value: ${formatUsd(snapshot.totalEstimatedUsd)}`,
    `• Tokens In Portfolio: ${snapshot.totalTokens}`,
    `• Tokens With Price Data: ${snapshot.pricedTokens}`,
    `• Tokens Without Price Data: ${snapshot.unpricedTokens}`,
    "",
    "Status ini menunjukkan valuasi portfolio saat ini, bukan realized PnL.",
    "Untuk realized PnL yang akurat, execution history dan entry cost masih perlu diintegrasikan.",
  ].join("\n");
}
