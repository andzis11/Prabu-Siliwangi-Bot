import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { loadEnv } from "./env";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface WalletConfig {
  connection: Connection;
  wallet: Keypair;
  walletPublicKey: PublicKey;
  walletAddress: string;
  rpcUrl: string;
}

export interface WalletBalance {
  lamports: number;
  sol: number;
}

function validateDerivedWalletAddress(
  walletAddressFromKey: string,
  configuredWalletAddress: string | undefined,
): void {
  const normalizedConfigured = configuredWalletAddress?.trim();

  if (
    normalizedConfigured &&
    normalizedConfigured !== walletAddressFromKey
  ) {
    throw new Error(
      "SOLANA_WALLET_ADDRESS does not match the wallet derived from SOLANA_PRIVATE_KEY.",
    );
  }
}

function ensureEnvValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required for wallet initialization.`);
  }
  return normalized;
}

function buildRpcUrl(): string {
  const env = loadEnv();

  if (env.heliusApiKey && env.heliusApiKey.trim() !== "") {
    return `https://mainnet.helius-rpc.com/?api-key=${env.heliusApiKey.trim()}`;
  }

  throw new Error(
    "HELIUS_API_KEY is required to build the Solana RPC connection.",
  );
}

function decodeSecretKey(secretKey: string): Uint8Array {
  try {
    return bs58.decode(secretKey);
  } catch {
    throw new Error(
      "SOLANA_PRIVATE_KEY must be a valid base58-encoded secret key.",
    );
  }
}

function createWalletKeypair(): Keypair {
  const env = loadEnv();
  const secretKey = ensureEnvValue(
    env.solanaPrivateKey,
    "SOLANA_PRIVATE_KEY",
  );
  const decoded = decodeSecretKey(secretKey);

  try {
    return Keypair.fromSecretKey(decoded);
  } catch {
    throw new Error(
      "Failed to create wallet keypair from SOLANA_PRIVATE_KEY.",
    );
  }
}

export function createWalletConfig(): WalletConfig {
  const wallet = createWalletKeypair();
  const env = loadEnv();
  const rpcUrl = buildRpcUrl();
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 30_000,
  });
  const walletAddress = wallet.publicKey.toBase58();

  validateDerivedWalletAddress(walletAddress, env.solanaWalletAddress);

  return {
    connection,
    wallet,
    walletPublicKey: wallet.publicKey,
    walletAddress,
    rpcUrl,
  };
}

export async function getWalletBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
): Promise<WalletBalance> {
  const lamports = await connection.getBalance(walletPublicKey, "confirmed");

  return {
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
  };
}

export async function getWalletAddress(): Promise<string> {
  const { walletAddress } = createWalletConfig();
  return walletAddress;
}

export function getSolMint(): string {
  return SOL_MINT;
}
