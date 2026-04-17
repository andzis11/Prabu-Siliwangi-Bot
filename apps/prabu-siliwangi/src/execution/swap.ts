declare const Buffer: {
  from(input: string, encoding: string): Uint8Array;
};

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import logger from "../utils/logger";

export interface SwapOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  skipPreflight?: boolean;
  priorityFeeLamports?: "auto" | number;
  inputDecimals?: number;
}

export interface SwapResult {
  success: boolean;
  txHash: string | null;
  method: "jupiter" | "none";
  attempts: number;
  error: string | null;
}

export interface SwapEnvironment {
  connection: Connection;
  secretKeyBase58: string;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_SLIPPAGE_LIMIT = 50; // 50% absolute maximum slippage protection
const JUPITER_QUOTE_URLS = [
  "https://api.jup.ag/swap/v1/quote",
  "https://lite-api.jup.ag/swap/v1/quote",
];
const JUPITER_SWAP_URLS = [
  "https://api.jup.ag/swap/v1/swap",
  "https://lite-api.jup.ag/swap/v1/swap",
];

const DEFAULT_OPTIONS: Required<SwapOptions> = {
  maxRetries: 3,
  retryDelayMs: 1500,
  skipPreflight: false,
  priorityFeeLamports: "auto",
  inputDecimals: 9,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: string): boolean {
  const retryablePatterns = [
    "BlockhashNotFound",
    "BlockhashExpired",
    "TransactionExpired",
    "ECONNRESET",
    "ETIMEDOUT",
    "503",
    "502",
    "500",
    "CONFIRMATION_TIMEOUT",
  ];

  const rateLimitPatterns = [
    "rate limit",
    "too many requests",
    "429",
  ];

  const lower = error.toLowerCase();

  // Check for explicit retryable patterns (more specific)
  for (const pattern of retryablePatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // Check for rate limit patterns (need more specific matching)
  for (const pattern of rateLimitPatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      // Additional check: ensure it's actually a rate limit error, not just the word
      // e.g., avoid matching "timeout" when it's not related to rate limiting
      if (pattern === "rate limit" || pattern === "too many requests" || pattern === "429") {
        // These are specific enough
        return true;
      }
    }
  }

  return false;
}

function resolveMint(mint: string): string {
  return mint === "SOL" ? SOL_MINT : mint;
}

function isValidMintAddress(mint: string): boolean {
  try {
    const resolvedMint = resolveMint(mint);
    new PublicKey(resolvedMint);
    return true;
  } catch {
    return false;
  }
}

function validateSwapRequest(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippagePercent: number,
  inputDecimals: number,
): string | null {
  const resolvedInputMint = resolveMint(inputMint);
  const resolvedOutputMint = resolveMint(outputMint);

  if (!isValidMintAddress(inputMint)) {
    return "Invalid input mint address.";
  }

  if (!isValidMintAddress(outputMint)) {
    return "Invalid output mint address.";
  }

  if (resolvedInputMint === resolvedOutputMint) {
    return "Input mint and output mint cannot be the same.";
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Swap amount must be a positive number.";
  }

  if (!Number.isFinite(slippagePercent) || slippagePercent <= 0) {
    return "Slippage percent must be greater than 0.";
  }

  if (slippagePercent > MAX_SLIPPAGE_LIMIT) {
    return `Slippage percent exceeds hard limit of ${MAX_SLIPPAGE_LIMIT}%.`;
  }

  if (
    !Number.isFinite(inputDecimals) ||
    inputDecimals < 0 ||
    inputDecimals > 12
  ) {
    return "Input token decimals are out of supported range.";
  }

  return null;
}

function decodeWallet(secretKeyBase58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
}

// Circuit breaker state for external API calls
const circuitBreakerState = {
  lastFailure: 0,
  failureCount: 0,
  lastSuccess: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30000;

function isCircuitBreakerOpen(): boolean {
  if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    const elapsed = Date.now() - circuitBreakerState.lastFailure;
    if (elapsed < CIRCUIT_BREAKER_COOLDOWN_MS) {
      return true;
    }
    // Reset after cooldown
    circuitBreakerState.failureCount = 0;
  }
  return false;
}

function recordSuccess(): void {
  circuitBreakerState.lastSuccess = Date.now();
  circuitBreakerState.failureCount = 0;
}

function recordFailure(): void {
  circuitBreakerState.lastFailure = Date.now();
  circuitBreakerState.failureCount += 1;
}

interface JupiterQuoteResponse {
  inputMint?: string;
  outputMint?: string;
  outAmount?: string;
  swapMode?: string;
  slippageBps?: number;
  routePlan?: unknown[];
}

interface JupiterSwapResponse {
  swapTransaction?: string;
}

export interface SwapQuotePreview {
  inputMint: string;
  outputMint: string;
  inAmountRaw: string;
  outAmountRaw: string;
  slippageBps: number;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  // Check circuit breaker before making the request
  if (isCircuitBreakerOpen()) {
    throw new Error("API circuit breaker is open. Request aborted.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      recordFailure(); // Record HTTP error as failure
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
      );
    }

    const data = await response.json() as T;
    recordSuccess(); // Record successful fetch
    return data;
  } catch (error) {
    recordFailure(); // Record any error (including AbortError, network issues)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("HTTP request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSwapQuotePreview(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippagePercent: number,
  inputDecimals = 9,
): Promise<SwapQuotePreview> {
  const resolvedInputMint = resolveMint(inputMint);
  const resolvedOutputMint = resolveMint(outputMint);
  const normalizedInputDecimals =
    resolvedInputMint === SOL_MINT ? 9 : inputDecimals;
  const validationError = validateSwapRequest(
    inputMint,
    outputMint,
    amount,
    slippagePercent,
    normalizedInputDecimals,
  );

  if (validationError) {
    throw new Error(validationError);
  }

  const rawAmount = Math.round(amount * 10 ** normalizedInputDecimals);
  let quote: JupiterQuoteResponse | null = null;
  let lastError = "Failed to fetch Jupiter quote preview.";

  for (const baseUrl of JUPITER_QUOTE_URLS) {
    try {
      quote = await fetchJson<JupiterQuoteResponse>(
        `${baseUrl}?` +
          new URLSearchParams({
            inputMint: resolvedInputMint,
            outputMint: resolvedOutputMint,
            amount: String(rawAmount),
            slippageBps: String(Math.round(slippagePercent * 100)),
          }).toString(),
        {
          method: "GET",
        },
        10_000,
      );
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordFailure(); // Record failure for circuit breaker
    }
  }

  if (!quote) {
    throw new Error(lastError);
  }

  if (!quote.inputMint || !quote.outputMint || !quote.outAmount) {
    throw new Error("Invalid Jupiter quote response.");
  }

  return {
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inAmountRaw: String(rawAmount),
    outAmountRaw: quote.outAmount,
    slippageBps: quote.slippageBps ?? Math.round(slippagePercent * 100),
  };
}

export async function buildSwapTransaction(
  connection: Connection,
  inputMint: string,
  outputMint: string,
  amount: number,
  walletPublicKey: PublicKey,
  slippagePercent: number,
  wallet: Keypair,
  priorityFeeLamports: "auto" | number = "auto",
  inputDecimals = 9,
): Promise<VersionedTransaction | null> {
  const resolvedInputMint = resolveMint(inputMint);
  const resolvedOutputMint = resolveMint(outputMint);
  const normalizedInputDecimals =
    resolvedInputMint === SOL_MINT ? 9 : inputDecimals;
  const validationError = validateSwapRequest(
    inputMint,
    outputMint,
    amount,
    slippagePercent,
    normalizedInputDecimals,
  );
  const rawAmount = Math.round(amount * 10 ** normalizedInputDecimals);

  if (validationError) {
    logger.error("[SWAP] Invalid swap request", {
      error: validationError,
      inputMint,
      outputMint,
      amount,
      slippagePercent,
      inputDecimals: normalizedInputDecimals,
    });
    return null;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    logger.error("[SWAP] Invalid amount", { amount });
    return null;
  }

  if (
    !Number.isFinite(normalizedInputDecimals) ||
    normalizedInputDecimals < 0 ||
    normalizedInputDecimals > 12
  ) {
    logger.error("[SWAP] Invalid input decimals", {
      inputDecimals: normalizedInputDecimals,
    });
    return null;
  }

  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    logger.error("[SWAP] Invalid raw amount", {
      amount,
      inputDecimals: normalizedInputDecimals,
      rawAmount,
    });
    return null;
  }

  try {
    let quote: JupiterQuoteResponse | null = null;
    let quoteError = "Failed to fetch Jupiter quote.";

    for (const baseUrl of JUPITER_QUOTE_URLS) {
      try {
        quote = await fetchJson<JupiterQuoteResponse>(
          `${baseUrl}?` +
            new URLSearchParams({
              inputMint: resolvedInputMint,
              outputMint: resolvedOutputMint,
              amount: String(rawAmount),
              slippageBps: String(Math.round(slippagePercent * 100)),
            }).toString(),
          {
            method: "GET",
          },
          10_000,
        );
        break;
      } catch (error) {
        quoteError = error instanceof Error ? error.message : String(error);
        recordFailure(); // Record failure for circuit breaker
      }
    }

    if (!quote) {
      throw new Error(quoteError);
    }

    if (!quote.inputMint || !quote.outputMint) {
      logger.error("[SWAP] Invalid Jupiter quote response");
      return null;
    }

    let swap: JupiterSwapResponse | null = null;
    let swapError = "Failed to build Jupiter swap transaction.";

    for (const baseUrl of JUPITER_SWAP_URLS) {
      try {
        swap = await fetchJson<JupiterSwapResponse>(
          baseUrl,
          {
            method: "POST",
            body: JSON.stringify({
              quoteResponse: quote,
              userPublicKey: walletPublicKey.toBase58(),
              wrapAndUnwrapSol: true,
              dynamicComputeUnitLimit: true,
              prioritizationFeeLamports: priorityFeeLamports,
            }),
          },
          15_000,
        );
        break;
      } catch (error) {
        swapError = error instanceof Error ? error.message : String(error);
        recordFailure(); // Record failure for circuit breaker
      }
    }

    if (!swap) {
      throw new Error(swapError);
    }

    if (!swap.swapTransaction) {
      logger.error("[SWAP] Missing swap transaction in Jupiter response");
      return null;
    }

    const txBuffer = Buffer.from(swap.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    const latest = await connection.getLatestBlockhash("confirmed");
    tx.sign([wallet]);

    logger.info("[SWAP] Jupiter transaction built", {
      blockhash: latest.blockhash,
    });

    return tx;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown build error";
    logger.error("[SWAP] Build error", { error: message });
    recordFailure(); // Record failure for circuit breaker
    return null;
  }
}

export async function executeSwap(
  env: SwapEnvironment,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippagePercent: number,
  options: SwapOptions = {},
): Promise<SwapResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const validationError = validateSwapRequest(
    inputMint,
    outputMint,
    amount,
    slippagePercent,
    opts.inputDecimals,
  );

  if (validationError) {
    return {
      success: false,
      txHash: null,
      method: "none",
      attempts: 0,
      error: validationError,
    };
  }

  let wallet: Keypair;

  try {
    wallet = decodeWallet(env.secretKeyBase58);
  } catch (error) {
    return {
      success: false,
      txHash: null,
      method: "none",
      attempts: 0,
      error:
        error instanceof Error
          ? error.message
          : "Invalid SOLANA_PRIVATE_KEY.",
    };
  }

  let lastError = "";

  for (let attempt = 1; attempt <= opts.maxRetries; attempt += 1) {
    try {
      // Check circuit breaker before attempting swap
      if (isCircuitBreakerOpen()) {
        throw new Error("API circuit breaker is open. Swap aborted.");
      }

      logger.info("[SWAP] Attempting Jupiter swap", {
        attempt,
        maxRetries: opts.maxRetries,
        inputMint,
        outputMint,
        amount,
        slippagePercent,
      });

      // HARDENED: Cap slippage escalation to prevent excessive slippage
      const maxSlippage = Math.min(slippagePercent * 1.5, MAX_SLIPPAGE_LIMIT);
      const adjustedSlippage = Math.min(
        slippagePercent * (1 + (attempt - 1) * 0.15),
        maxSlippage,
      );

      if (adjustedSlippage > slippagePercent) {
        logger.warn("[SWAP] Slippage escalated (capped)", {
          adjustedSlippage,
          maxSlippage,
          hardLimit: MAX_SLIPPAGE_LIMIT,
        });
      }

      const tx = await buildSwapTransaction(
        env.connection,
        inputMint,
        outputMint,
        amount,
        wallet.publicKey,
        adjustedSlippage,
        wallet,
        opts.priorityFeeLamports,
        opts.inputDecimals ?? 9,
      );

      if (!tx) {
        lastError = "BUILD_FAILED";
        recordFailure(); // Record failure for circuit breaker

        if (attempt === opts.maxRetries) {
          break;
        }

        await sleep(opts.retryDelayMs * attempt);
        continue;
      }

      const { blockhash, lastValidBlockHeight } =
        await env.connection.getLatestBlockhash("confirmed");

      const raw = tx.serialize();
      const signature = await env.connection.sendRawTransaction(raw, {
        skipPreflight: attempt > 1 ? true : opts.skipPreflight,
        maxRetries: 2,
        preflightCommitment: "confirmed",
      });

      logger.info("[SWAP] Transaction sent", { signature });

      // HARDENED: Add proper timeout guard for confirmation
      const confirmationTimeoutMs = 45_000; // 45 second timeout
      const confirmation = await Promise.race([
        env.connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("CONFIRMATION_TIMEOUT")),
            confirmationTimeoutMs,
          ),
        ),
      ]);

      if ((confirmation as { value?: { err?: unknown } }).value?.err) {
        lastError = JSON.stringify(
          (confirmation as { value?: { err?: unknown } }).value?.err,
        );

        logger.warn("[SWAP] Transaction confirmation error", {
          signature,
          error: lastError,
        });

        if (isRetryable(lastError)) {
          recordFailure(); // Record failure for circuit breaker
          await sleep(opts.retryDelayMs * attempt);
          continue;
        }

        // Non-retryable error, return immediately
        return {
          success: false,
          txHash: signature,
          method: "jupiter",
          attempts: attempt,
          error: lastError,
        };
      }

      logger.info("[SWAP] Swap success", { signature });
      recordSuccess(); // Record success for circuit breaker

      return {
        success: true,
        txHash: signature,
        method: "jupiter",
        attempts: attempt,
        error: null,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "UNKNOWN_EXECUTION_ERROR";

      logger.warn("[SWAP] Attempt failed", {
        attempt,
        error: lastError,
      });

      recordFailure(); // Record failure for circuit breaker

      if (isRetryable(lastError) && attempt < opts.maxRetries) {
        await sleep(opts.retryDelayMs * Math.pow(1.5, attempt - 1));
        continue;
      }
    }
  }

  logger.error("[SWAP] All Jupiter swap attempts failed", {
    error: lastError,
  });

  return {
    success: false,
    txHash: null,
    method: "none",
    attempts: opts.maxRetries,
    error: lastError || "SWAP_FAILED",
  };
}
