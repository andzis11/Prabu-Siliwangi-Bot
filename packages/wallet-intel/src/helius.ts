// Enhanced Helius client for wallet intelligence
// Converted from Combine/walletanalyzer-main/src/helius.js
// With additional features and TypeScript support

import axios, { AxiosInstance } from 'axios';

export interface FundingSource {
  funder: string;
  funderName?: string;
  funderType?: string;
  amount: number;
  timestamp: number;
  signature: string;
}

export interface WalletIdentity {
  name?: string;
  category?: string;
  type?: string;
}

export interface TokenTransfer {
  mint: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  signature: string;
  timestamp: number;
}

export interface BundleAnalysis {
  isBundled: boolean;
  distributor?: string;
  recipientCount?: number;
}

export interface HeliusConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  rateLimitDelayMs?: number;
}

export class HeliusClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly client: AxiosInstance;
  private readonly rateLimitDelayMs: number;

  constructor(config: HeliusConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.helius.xyz/v1';
    this.rateLimitDelayMs = config.rateLimitDelayMs || 500;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeoutMs || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get funding source information for a wallet
   */
  async getFundingSource(walletAddress: string): Promise<FundingSource | null> {
    try {
      const response = await this.client.get(
        `/wallet/${walletAddress}/funded-by?api-key=${this.apiKey}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No funding found
      }
      console.error('Error fetching funding source:', error.message);
      return null;
    }
  }

  /**
   * Get identity/label information for a wallet
   */
  async getIdentity(walletAddress: string): Promise<WalletIdentity | null> {
    try {
      const response = await this.client.get(
        `/wallet/${walletAddress}/identity?api-key=${this.apiKey}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching identity:', error.message);
      return null;
    }
  }

  /**
   * Check if funding source shows bundling patterns
   */
  async checkBundled(fundingData: FundingSource | null): Promise<boolean> {
    if (!fundingData) return false;

    const funderAddress = fundingData.funder;

    // Skip check for known exchanges
    if (fundingData.funderType === 'exchange' || fundingData.funderName) {
      return false;
    }

    const fundingTimestamp = fundingData.timestamp;

    if (!funderAddress || !fundingTimestamp) return false;

    try {
      // Fetch funder's transaction history
      const response = await this.client.get(
        `/wallet/${funderAddress}/history?api-key=${this.apiKey}&limit=100`
      );

      const transactions = response.data?.data || [];
      if (transactions.length === 0) return false;

      // Filter transactions around the funding timestamp (+/- 10 minutes)
      const timeWindow = 600; // 10 minutes in seconds
      const relevantTxs = transactions.filter((tx: any) =>
        Math.abs(tx.timestamp - fundingTimestamp) <= timeWindow
      );

      // If funder has > 5 transactions in that window, likely a bot
      return relevantTxs.length > 5;

    } catch (error: any) {
      console.error('Error checking bundled status:', error.message);
      return false;
    }
  }

  /**
   * Get token transfers for a wallet
   */
  async getTokenTransfers(walletAddress: string, mint?: string): Promise<TokenTransfer[]> {
    try {
      const response = await this.client.get(
        `/wallet/${walletAddress}/transfers?api-key=${this.apiKey}&limit=100`
      );

      const allTransfers: TokenTransfer[] = response.data?.data || [];

      if (mint) {
        return allTransfers.filter(t => t.mint === mint);
      }

      return allTransfers;
    } catch (error: any) {
      console.error('Error fetching token transfers:', error.message);
      return [];
    }
  }

  /**
   * Check if token transfers show bundling patterns
   */
  async checkTokenBundled(
    transfers: TokenTransfer[],
    currentWallet: string,
    mint: string
  ): Promise<BundleAnalysis> {
    if (!transfers || transfers.length === 0) {
      return { isBundled: false };
    }

    // Filter for INCOMING transfers of the token
    const incomingTransfers = transfers.filter(
      t => t.direction === 'in' && t.mint === mint
    );

    // Limit analysis to avoid rate limits
    const transfersToAnalyze = incomingTransfers.slice(0, 5);

    for (const transfer of transfersToAnalyze) {
      const counterparty = transfer.counterparty;

      // Delay to avoid rate limits
      await this.delay();

      // Skip known exchanges or DEXs
      const identity = await this.getIdentity(counterparty);
      if (identity && this.isKnownInstitution(identity)) {
        continue;
      }

      // Another delay
      await this.delay();

      // Analyze counterparty's behavior for this token
      const senderTransfers = await this.getTokenTransfers(counterparty, mint);
      const senderOutgoing = senderTransfers.filter(
        t => t.direction === 'out' && t.mint === mint
      );

      // Filter around the time of the original transfer
      const timeWindow = 600;
      const relevantSenderTxs = senderOutgoing.filter(t =>
        Math.abs(t.timestamp - transfer.timestamp) <= timeWindow
      );

      // Count unique recipients
      const recipients = new Set(relevantSenderTxs.map(t => t.counterparty));

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

  /**
   * Enhanced wallet analysis - all-in-one method
   */
  async analyzeWalletComprehensive(
    walletAddress: string,
    tokenMint?: string
  ): Promise<{
    funding: FundingSource | null;
    identity: WalletIdentity | null;
    isFundingBundled: boolean;
    tokenTransfers: TokenTransfer[];
    isTokenBundled: BundleAnalysis;
  }> {
    const funding = await this.getFundingSource(walletAddress);
    const identity = await this.getIdentity(walletAddress);
    const isFundingBundled = await this.checkBundled(funding);

    let tokenTransfers: TokenTransfer[] = [];
    let isTokenBundled: BundleAnalysis = { isBundled: false };

    if (tokenMint) {
      tokenTransfers = await this.getTokenTransfers(walletAddress, tokenMint);
      isTokenBundled = await this.checkTokenBundled(
        tokenTransfers,
        walletAddress,
        tokenMint
      );
    }

    return {
      funding,
      identity,
      isFundingBundled,
      tokenTransfers,
      isTokenBundled,
    };
  }

  /**
   * Health check for Helius API
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple check using a known wallet (Solana Labs)
      const testWallet = 'So11111111111111111111111111111111111111112';
      await this.client.get(`/wallet/${testWallet}/identity?api-key=${this.apiKey}`);
      return true;
    } catch {
      return false;
    }
  }

  private async delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.rateLimitDelayMs));
  }

  private isKnownInstitution(identity: WalletIdentity): boolean {
    const institutionTypes = ['exchange', 'defi', 'swap', 'bridge'];
    const type = identity.type?.toLowerCase() || '';
    const category = identity.category?.toLowerCase() || '';

    return institutionTypes.some(institution =>
      type.includes(institution) || category.includes(institution)
    );
  }
}

/**
 * Factory function to create HeliusClient instance
 */
export function createHeliusClient(config: HeliusConfig): HeliusClient {
  return new HeliusClient(config);
}
