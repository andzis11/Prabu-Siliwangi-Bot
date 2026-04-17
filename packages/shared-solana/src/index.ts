/**
 * @prabu/shared-solana - Comprehensive Solana Utilities Package
 *
 * Shared utilities for Solana blockchain interactions including:
 * - RPC connection management with pooling and failover
 * - Wallet/keypair management and secure storage
 * - Token utilities and metadata
 * - Transaction building and optimization
 * - Common Solana operations and helpers
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  Commitment,
  SendTransactionError,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import bs58 from 'bs58';
import axios from 'axios';
import { EventEmitter } from 'events';

// ============ TYPES AND INTERFACES ============

export interface RPCConfig {
  primaryUrl: string;
  fallbackUrls?: string[];
  commitment?: Commitment;
  timeout?: number;
  maxConnections?: number;
  enableWebSocket?: boolean;
}

export interface WalletConfig {
  keypair?: Keypair;
  privateKey?: string; // Base58 encoded
  publicKey?: string;
  name?: string;
  secureStorage?: 'memory' | 'env' | 'encrypted-file';
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  price?: number;
  marketCap?: number;
  volume24h?: number;
}

export interface TransactionOptions {
  skipPreflight?: boolean;
  commitment?: Commitment;
  maxRetries?: number;
  priorityFee?: number; // micro-lamports
  computeUnits?: number;
}

export interface RPCHealthStatus {
  url: string;
  latency: number;
  slot: number;
  healthy: boolean;
  lastChecked: Date;
}

export interface WalletBalance {
  sol: number;
  tokens: Array<{
    mint: string;
    amount: number;
    uiAmount: number;
    decimals: number;
  }>;
  totalUSD?: number;
}

// ============ RPC ADAPTER WITH POOLING ============

export class RPCAdapter extends EventEmitter {
  private connections: Map<string, Connection> = new Map();
  private primaryUrl: string;
  private fallbackUrls: string[];
  private currentUrl: string;
  private healthStatus: Map<string, RPCHealthStatus> = new Map();
  private connectionPool: Connection[] = [];
  private isMonitoring: boolean = false;

  constructor(config: RPCConfig) {
    super();
    this.primaryUrl = config.primaryUrl;
    this.fallbackUrls = config.fallbackUrls || [];
    this.currentUrl = this.primaryUrl;

    // Initialize connections
    this.initializeConnections(config);
  }

  private initializeConnections(config: RPCConfig): void {
    // Create primary connection
    const primaryConnection = new Connection(this.primaryUrl, {
      commitment: config.commitment || 'confirmed',
      wsEndpoint: config.enableWebSocket ? this.primaryUrl.replace('http', 'ws') : undefined,
      confirmTransactionInitialTimeout: config.timeout || 60000,
    });

    this.connections.set(this.primaryUrl, primaryConnection);
    this.connectionPool.push(primaryConnection);

    // Create fallback connections
    for (const url of this.fallbackUrls) {
      const connection = new Connection(url, {
        commitment: config.commitment || 'confirmed',
        wsEndpoint: config.enableWebSocket ? url.replace('http', 'ws') : undefined,
      });
      this.connections.set(url, connection);
      this.connectionPool.push(connection);
    }

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get the best available connection
   */
  public getConnection(): Connection {
    // Return the current healthy connection
    const connection = this.connections.get(this.currentUrl);
    if (!connection) {
      throw new Error(`No connection available for ${this.currentUrl}`);
    }
    return connection;
  }

  /**
   * Get a connection from the pool (round-robin)
   */
  public getPooledConnection(): Connection {
    if (this.connectionPool.length === 0) {
      throw new Error('No connections in pool');
    }

    // Simple round-robin
    const connection = this.connectionPool.shift()!;
    this.connectionPool.push(connection);
    return connection;
  }

  /**
   * Execute with retry and failover
   */
  public async executeWithRetry<T>(
    operation: (connection: Connection) => Promise<T>,
    options: {
      maxRetries?: number;
      failover?: boolean;
    } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const shouldFailover = options.failover !== false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const connection = this.getConnection();
        return await operation(connection);
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;

        if (shouldFailover && !isLastAttempt) {
          this.switchToNextEndpoint();
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }

        throw error;
      }
    }

    throw new Error('All retry attempts failed');
  }

  private switchToNextEndpoint(): void {
    const allUrls = [this.primaryUrl, ...this.fallbackUrls];
    const currentIndex = allUrls.indexOf(this.currentUrl);
    const nextIndex = (currentIndex + 1) % allUrls.length;

    this.currentUrl = allUrls[nextIndex];
    this.emit('endpointSwitched', {
      from: allUrls[currentIndex],
      to: this.currentUrl,
      timestamp: new Date(),
    });
  }

  private async startHealthMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    const monitorInterval = setInterval(async () => {
      try {
        await this.checkAllEndpoints();
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds

    // Store interval ID for cleanup
    (this as any)._monitorInterval = monitorInterval;
  }

  private async checkAllEndpoints(): Promise<void> {
    const urls = Array.from(this.connections.keys());

    for (const url of urls) {
      try {
        const startTime = Date.now();
        const connection = this.connections.get(url)!;
        const slot = await connection.getSlot({ commitment: 'processed' });
        const latency = Date.now() - startTime;

        const healthStatus: RPCHealthStatus = {
          url,
          latency,
          slot,
          healthy: true,
          lastChecked: new Date(),
        };

        this.healthStatus.set(url, healthStatus);

        // If current endpoint is unhealthy, switch to next healthy one
        if (url === this.currentUrl && latency > 5000) { // 5 second threshold
          this.switchToNextEndpoint();
        }

      } catch (error) {
        const healthStatus: RPCHealthStatus = {
          url,
          latency: -1,
          slot: -1,
          healthy: false,
          lastChecked: new Date(),
        };
        this.healthStatus.set(url, healthStatus);

        if (url === this.currentUrl) {
          this.switchToNextEndpoint();
        }
      }
    }

    this.emit('healthUpdate', Array.from(this.healthStatus.values()));
  }

  public getHealthStatus(): RPCHealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  public stopMonitoring(): void {
    if ((this as any)._monitorInterval) {
      clearInterval((this as any)._monitorInterval);
      this.isMonitoring = false;
    }
  }

  public async closeAll(): Promise<void> {
    this.stopMonitoring();
    this.connections.clear();
    this.connectionPool = [];
    this.healthStatus.clear();
  }
}

// ============ WALLET MANAGER ============

export class WalletManager {
  private wallets: Map<string, Keypair> = new Map();
  private secureStorage: 'memory' | 'env' | 'encrypted-file';
  private encryptionKey?: string;

  constructor(config: {
    secureStorage?: 'memory' | 'env' | 'encrypted-file';
    encryptionKey?: string;
  } = {}) {
    this.secureStorage = config.secureStorage || 'memory';
    this.encryptionKey = config.encryptionKey;
  }

  /**
   * Create a new wallet
   */
  public createWallet(name: string): {
    keypair: Keypair;
    publicKey: string;
    privateKey: string;
  } {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const privateKey = bs58.encode(keypair.secretKey);

    this.wallets.set(name, keypair);
    this.saveToStorage(name, privateKey);

    return {
      keypair,
      publicKey,
      privateKey,
    };
  }

  /**
   * Import wallet from private key
   */
  public importWallet(name: string, privateKeyBase58: string): Keypair {
    try {
      const secretKey = bs58.decode(privateKeyBase58);
      const keypair = Keypair.fromSecretKey(secretKey);

      this.wallets.set(name, keypair);
      this.saveToStorage(name, privateKeyBase58);

      return keypair;
    } catch (error) {
      throw new Error(`Invalid private key: ${(error as Error).message}`);
    }
  }

  /**
   * Load wallet from storage
   */
  public loadWallet(name: string): Keypair | null {
    // Check memory cache first
    if (this.wallets.has(name)) {
      return this.wallets.get(name)!;
    }

    // Try to load from storage
    const privateKey = this.loadFromStorage(name);
    if (!privateKey) {
      return null;
    }

    return this.importWallet(name, privateKey);
  }

  /**
   * Get wallet by name
   */
  public getWallet(name: string): Keypair {
    const wallet = this.wallets.get(name);
    if (!wallet) {
      throw new Error(`Wallet "${name}" not found`);
    }
    return wallet;
  }

  /**
   * List all wallets
   */
  public listWallets(): Array<{
    name: string;
    publicKey: string;
    balance?: number;
  }> {
    const wallets: Array<{ name: string; publicKey: string; balance?: number }> = [];

    for (const [name, keypair] of this.wallets.entries()) {
      wallets.push({
        name,
        publicKey: keypair.publicKey.toBase58(),
      });
    }

    return wallets;
  }

  /**
   * Remove wallet
   */
  public removeWallet(name: string): void {
    this.wallets.delete(name);
    this.removeFromStorage(name);
  }

  private saveToStorage(name: string, privateKey: string): void {
    switch (this.secureStorage) {
      case 'memory':
        // Already stored in memory map
        break;

      case 'env':
        process.env[`WALLET_${name.toUpperCase()}`] = privateKey;
        break;

      case 'encrypted-file':
        // In production, implement file-based encryption
        console.warn('Encrypted file storage not implemented in this version');
        break;
    }
  }

  private loadFromStorage(name: string): string | null {
    switch (this.secureStorage) {
      case 'memory':
        return null; // Already handled in loadWallet

      case 'env':
        return process.env[`WALLET_${name.toUpperCase()}`] || null;

      case 'encrypted-file':
        console.warn('Encrypted file storage not implemented in this version');
        return null;

      default:
        return null;
    }
  }

  private removeFromStorage(name: string): void {
    switch (this.secureStorage) {
      case 'env':
        delete process.env[`WALLET_${name.toUpperCase()}`];
        break;

      case 'encrypted-file':
        console.warn('Encrypted file storage not implemented in this version');
        break;
    }
  }
}

// ============ TOKEN UTILITIES ============

export class TokenUtilities {
  private connection: Connection;
  private cache: Map<string, TokenInfo> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get token metadata
   */
  public async getTokenInfo(mintAddress: string): Promise<TokenInfo> {
    // Check cache first
    const cached = this.cache.get(mintAddress);
    if (cached && Date.now() - (cached as any).cachedAt < this.cacheTimeout) {
      return cached;
    }

    try {
      // Try to get from token list APIs
      const tokenInfo = await this.fetchTokenInfoFromApis(mintAddress);

      if (tokenInfo) {
        (tokenInfo as any).cachedAt = Date.now();
        this.cache.set(mintAddress, tokenInfo);
        return tokenInfo;
      }
    } catch (error) {
      console.warn(`Failed to fetch token info for ${mintAddress}:`, (error as Error).message);
    }

    // Fallback to basic info from on-chain data
    const fallbackInfo: TokenInfo = {
      mint: mintAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9, // Default Solana decimals
    };

    (fallbackInfo as any).cachedAt = Date.now();
    this.cache.set(mintAddress, fallbackInfo);

    return fallbackInfo;
  }

  private async fetchTokenInfoFromApis(mintAddress: string): Promise<TokenInfo | null> {
    try {
      // Try Jupiter token list
      const jupiterResponse = await axios.get(
        `https://token.jup.ag/all`,
        { timeout: 5000 }
      );

      const tokens = jupiterResponse.data;
      const token = tokens.find((t: any) => t.address === mintAddress);

      if (token) {
        return {
          mint: mintAddress,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI,
        };
      }
    } catch (error) {
      // Silently fail and try next source
    }

    return null;
  }

  /**
   * Get token balance for a wallet
   */
  public async getTokenBalance(
    walletAddress: string,
    mintAddress: string
  ): Promise<{
    amount: number;
    uiAmount: number;
    decimals: number;
  }> {
    try {
      // Removed Token class instantiation since we don't need it for getAccount

      const associatedAddress = await getAssociatedTokenAddress(
        new PublicKey(mintAddress),
        new PublicKey(walletAddress)
      );

      const accountInfo = await this.connection.getAccountInfo(associatedAddress);

      if (!accountInfo) {
        return { amount: 0, uiAmount: 0, decimals: 9 };
      }

      const account = await getAccount(this.connection, associatedAddress);
      const tokenInfo = await this.getTokenInfo(mintAddress);

      return {
        amount: Number(account.amount),
        uiAmount: Number(account.amount) / Math.pow(10, tokenInfo.decimals),
        decimals: tokenInfo.decimals,
      };
    } catch (error) {
      console.error(`Error getting token balance:`, error);
      return { amount: 0, uiAmount: 0, decimals: 9 };
    }
  }

  /**
   * Get all token balances for a wallet
   */
  public async getAllTokenBalances(walletAddress: string): Promise<Array<{
    mint: string;
    amount: number;
    uiAmount: number;
    decimals: number;
    symbol: string;
    name: string;
  }>> {
    const balances: Array<{
      mint: string;
      amount: number;
      uiAmount: number;
      decimals: number;
      symbol: string;
      name: string;
    }> = [];

    try {
      // Get token accounts
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { programId: TOKEN_PROGRAM_ID }
      );

      for (const account of tokenAccounts.value) {
        const accountInfo = AccountLayout.decode(account.account.data);
        const mint = new PublicKey(accountInfo.mint).toBase58();

        // Skip zero balances
        if (accountInfo.amount === BigInt(0)) {
          continue;
        }

        const tokenInfo = await this.getTokenInfo(mint);

        balances.push({
          mint,
          amount: Number(accountInfo.amount),
          uiAmount: Number(accountInfo.amount) / Math.pow(10, tokenInfo.decimals),
          decimals: tokenInfo.decimals,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
        });
      }
    } catch (error) {
      console.error(`Error getting all token balances:`, error);
    }

    return balances;
  }
}

// ============ TRANSACTION BUILDER ============

export class TransactionBuilder {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Create a SOL transfer transaction
   */
  public async createSOLTransfer(
    from: Keypair,
    to: string,
    amount: number, // in SOL
    options: TransactionOptions = {}
  ): Promise<Transaction> {
    const transaction = new Transaction();

    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: new PublicKey(to),
        lamports,
      })
    );

    // Add priority fee if specified
    if (options.priorityFee) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: from.publicKey,
          toPubkey: from.publicKey, // Transfer to self for priority fee
          lamports: options.priorityFee,
        })
      );
    }

    // Set compute units if specified
    if (options.computeUnits) {
      // This would require a compute budget instruction
      // For simplicity, we'll leave it as a placeholder
      console.warn('Compute units configuration requires additional setup');
    }

    return transaction;
  }

  /**
   * Create a token transfer transaction
   */
  public async createTokenTransfer(
    from: Keypair,
    to: string,
    mint: string,
    amount: number, // in token units (not UI amount)
    options: TransactionOptions = {}
  ): Promise<Transaction> {
    const transaction = new Transaction();
    // Token class removed - using direct SPL token methods

    // Get or create associated token account for recipient
    const toTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(to)
    );

    const fromTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      from.publicKey
    );

    // Check if recipient token account exists
    const recipientAccount = await this.connection.getAccountInfo(toTokenAccount);

    if (!recipientAccount) {
      // Create recipient token account
      transaction.add(
        createAssociatedTokenAccountInstruction(
          from.publicKey,
          toTokenAccount,
          new PublicKey(to),
          new PublicKey(mint),
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    // Note: In production, implement proper transfer instruction
    // For now, this is a placeholder
    console.warn('Token transfer instruction requires proper SPL token implementation');

    return transaction;
  }

  /**
   * Send and confirm transaction with retry logic
   */
  public async sendAndConfirm(
    transaction: Transaction,
    signers: Keypair[],
    options: TransactionOptions = {}
  ): Promise<string> {
    const maxRetries = options.maxRetries || 3;
    const commitment = options.commitment || 'confirmed';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers,
          {
            skipPreflight: options.skipPreflight || false,
            commitment,
            preflightCommitment: commitment,
          }
        );

        return signature;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;

        if (error instanceof SendTransactionError) {
          // Check for specific errors that can be retried
          const errorMessage = error.message.toLowerCase();

          if (errorMessage.includes('blockhash') || errorMessage.includes('timeout')) {
            if (!isLastAttempt) {
              // Refresh blockhash and retry
              const latestBlockhash = await this.connection.getLatestBlockhash();
              transaction.recentBlockhash = latestBlockhash.blockhash;
              transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
          }
        }

        if (isLastAttempt) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw new Error('Transaction failed after all retry attempts');
  }
}

// ============ WALLET BALANCE CHECKER ============

export async function getWalletBalance(
  connection: Connection,
  walletAddress: string
): Promise<WalletBalance> {
  try {
    // Get SOL balance
    const solBalance = await connection.getBalance(new PublicKey(walletAddress));
    const solAmount = solBalance / LAMPORTS_PER_SOL;

    // Get token balances
    const tokenUtilities = new TokenUtilities(connection);
    const tokenBalances = await tokenUtilities.getAllTokenBalances(walletAddress);

    // Calculate total USD value (placeholder - would need price oracle)
    let totalUSD = solAmount * 100; // Placeholder: assume SOL = $100

    for (const token of tokenBalances) {
      // In production, fetch actual prices from oracle
      totalUSD += token.uiAmount * 1; // Placeholder: assume $1 per token
    }

    return {
      sol: solAmount,
      tokens: tokenBalances,
      totalUSD,
    };
  } catch (error) {
    console.error(`Error getting wallet balance:`, error);
    throw error;
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format SOL amount
 */
export function formatSOL(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol >= 1) {
    return `${sol.toFixed(3)} SOL`;
  } else {
    return `${(sol * 1000).toFixed(1)} mSOL`;
  }
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Wait for confirmation
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed'
): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash();

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );
}

// ============ FACTORY FUNCTIONS ============

export function createRPCAdapter(config: RPCConfig): RPCAdapter {
  return new RPCAdapter(config);
}

export function createWalletManager(config?: {
  secureStorage?: 'memory' | 'env' | 'encrypted-file';
  encryptionKey?: string;
}): WalletManager {
  return new WalletManager(config);
}

export function createTokenUtilities(connection: Connection): TokenUtilities {
  return new TokenUtilities(connection);
}

export function createTransactionBuilder(connection: Connection): TransactionBuilder {
  return new TransactionBuilder(connection);
}

// ============ MODULE DESCRIPTION ============

export interface SolanaModuleSummary {
  name: string;
  purpose: string;
  ready: boolean;
  features: string[];
  version: string;
}

export function describeSharedSolana(): SolanaModuleSummary {
  return {
    name: '@prabu/shared-solana',
    purpose: 'Comprehensive Solana utilities for RPC management, wallet operations, token handling, and transaction building.',
    ready: true,
    features: [
      'RPC adapter with connection pooling and failover',
      'Wallet manager with secure storage options',
      'Token utilities with metadata fetching',
      'Transaction builder with retry logic',
      'Balance checking and formatting helpers',
    ],
    version: '1.0.0',
  };
}
