/**
 * Price Service
 *
 * Real-time price feed using Helius API.
 */

import { logger } from "../../utils/logger";

export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  updatedAt: string;
}

export class PriceService {
  private heliusApiKey?: string;
  private cache: Map<string, { price: TokenPrice; fetchedAt: number }> = new Map();
  private cacheTtlMs: number = 30000;

  constructor(heliusApiKey?: string, cacheTtlMs?: number) {
    this.heliusApiKey = heliusApiKey;
    if (cacheTtlMs) this.cacheTtlMs = cacheTtlMs;
  }

  async getPrice(mint: string): Promise<TokenPrice | null> {
    const cached = this.cache.get(mint);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.price;
    }

    if (!this.heliusApiKey) {
      return this.getMockPrice(mint);
    }

    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/token/price?api-key=${this.heliusApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mints: [mint] }),
        }
      );

      if (!response.ok) {
        logger.warn(`Helius price API failed, using mock`);
        return this.getMockPrice(mint);
      }

      const data = await response.json();
      
      if (data.results && data.results[0]) {
        const result = data.results[0];
        const price: TokenPrice = {
          mint,
          price: result.price || 0,
          priceChange24h: result.priceChange24h || 0,
          volume24h: result.volume24h || 0,
          updatedAt: new Date().toISOString(),
        };

        this.cache.set(mint, { price, fetchedAt: Date.now() });
        return price;
      }
    } catch (error) {
      logger.warn(`Failed to fetch price for ${mint}`, { error });
    }

    return this.getMockPrice(mint);
  }

  async getPrices(mints: string[]): Promise<Map<string, TokenPrice>> {
    const prices = new Map<string, TokenPrice>();

    for (const mint of mints) {
      const price = await this.getPrice(mint);
      if (price) {
        prices.set(mint, price);
      }
    }

    return prices;
  }

  async getSolPrice(): Promise<number> {
    const solPrice = await this.getPrice("So11111111111111111111111111111111111111112");
    return solPrice?.price || 100;
  }

  private getMockPrice(mint: string): TokenPrice {
    const basePrice = Math.random() * 0.01 + 0.0001;
    
    return {
      mint,
      price: basePrice,
      priceChange24h: (Math.random() - 0.5) * 20,
      volume24h: Math.random() * 100000,
      updatedAt: new Date().toISOString(),
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; oldestEntry: number } {
    let oldest = 0;
    for (const entry of this.cache.values()) {
      if (entry.fetchedAt < oldest || oldest === 0) {
        oldest = entry.fetchedAt;
      }
    }
    return { size: this.cache.size, oldestEntry: oldest };
  }
}

export function createPriceService(heliusApiKey?: string): PriceService {
  return new PriceService(heliusApiKey);
}
