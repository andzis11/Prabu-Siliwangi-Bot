export interface WalletHolding {
  tokenMint: string;
  symbol?: string;
  amountRaw: string;
  amountUi: number;
  amountLabel: string;
  decimals: number;
}

export interface WalletHoldingsFetchResult {
  walletAddress: string;
  fetchedAt: string;
  rpcUrl: string;
  holdings: WalletHolding[];
}

interface ParsedTokenAmount {
  amount?: string;
  uiAmount?: number | null;
  uiAmountString?: string;
  decimals?: number;
}

interface ParsedTokenInfo {
  mint?: string;
  tokenAmount?: ParsedTokenAmount;
}

interface ParsedAccountData {
  parsed?: {
    info?: ParsedTokenInfo;
  };
}

interface TokenAccountEntry {
  account?: {
    data?: ParsedAccountData;
  };
}

interface GetTokenAccountsByOwnerResponse {
  result?: {
    value?: TokenAccountEntry[];
  };
}

export interface WalletHoldingsFetchOptions {
  rpcUrl?: string;
  heliusApiKey?: string;
  timeoutMs?: number;
  includeZeroBalances?: boolean;
}

function ensureWalletAddress(walletAddress: string): string {
  const value = walletAddress.trim();

  if (value.length < 32 || value.length > 44) {
    throw new Error("Invalid Solana wallet address length.");
  }

  return value;
}

function buildHeliusRpcUrl(options: WalletHoldingsFetchOptions): string {
  if (options.rpcUrl && options.rpcUrl.trim() !== "") {
    return options.rpcUrl.trim();
  }

  if (options.heliusApiKey && options.heliusApiKey.trim() !== "") {
    return `https://mainnet.helius-rpc.com/?api-key=${options.heliusApiKey.trim()}`;
  }

  throw new Error(
    "Missing RPC configuration. Provide rpcUrl or heliusApiKey.",
  );
}

function parseHolding(entry: TokenAccountEntry): WalletHolding | null {
  const info = entry.account?.data?.parsed?.info;
  const mint = info?.mint?.trim();
  const tokenAmount = info?.tokenAmount;

  if (!mint || !tokenAmount) {
    return null;
  }

  const amountRaw = tokenAmount.amount || "0";
  const decimals = tokenAmount.decimals ?? 0;

  const amountUi =
    typeof tokenAmount.uiAmount === "number"
      ? tokenAmount.uiAmount
      : Number(tokenAmount.uiAmountString || "0");

  const amountLabel =
    tokenAmount.uiAmountString ||
    (Number.isFinite(amountUi) ? amountUi.toString() : "0");

  return {
    tokenMint: mint,
    amountRaw,
    amountUi: Number.isFinite(amountUi) ? amountUi : 0,
    amountLabel,
    decimals,
  };
}

function compareHoldings(a: WalletHolding, b: WalletHolding): number {
  return b.amountUi - a.amountUi;
}

export async function fetchWalletHoldings(
  walletAddress: string,
  options: WalletHoldingsFetchOptions = {},
): Promise<WalletHoldingsFetchResult> {
  const owner = ensureWalletAddress(walletAddress);
  const rpcUrl = buildHeliusRpcUrl(options);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const includeZeroBalances = options.includeZeroBalances ?? false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          owner,
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          },
          {
            encoding: "jsonParsed",
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius RPC request failed with status ${response.status}`);
    }

    const payload =
      (await response.json()) as GetTokenAccountsByOwnerResponse;

    const rawEntries = payload.result?.value || [];
    const holdings = rawEntries
      .map(parseHolding)
      .filter((item): item is WalletHolding => item !== null)
      .filter((item) => includeZeroBalances || item.amountUi > 0)
      .sort(compareHoldings);

    return {
      walletAddress: owner,
      fetchedAt: new Date().toISOString(),
      rpcUrl,
      holdings,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Wallet holdings request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function formatWalletHoldings(
  result: WalletHoldingsFetchResult,
): string {
  if (result.holdings.length === 0) {
    return [
      "📤 SELLABLE ASSETS",
      "",
      `Wallet: ${result.walletAddress}`,
      "",
      "Tidak ada token SPL dengan saldo > 0 yang ditemukan.",
    ].join("\n");
  }

  const lines = [
    "📤 SELLABLE ASSETS",
    "",
    `Wallet: ${result.walletAddress}`,
    `Fetched At: ${result.fetchedAt}`,
    "",
    "Token yang bisa dijual:",
    "",
  ];

  for (const holding of result.holdings) {
    lines.push(
      `• ${holding.tokenMint.slice(0, 8)}...`,
      `  Amount: ${holding.amountLabel}`,
      `  Decimals: ${holding.decimals}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}
