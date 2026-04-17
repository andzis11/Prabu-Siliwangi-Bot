import { logger } from "../utils/logger";

export interface TradeRecord {
  id: string;
  timestamp: string;
  chatId: number;
  side: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol?: string;
  amount: number;
  amountUnit: 'SOL' | 'token';
  price?: number;
  priceUnit?: 'USD' | 'SOL';
  txHash?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  mode: 'paper' | 'live';
  slippageBps: number;
  feeMode: 'SAFE' | 'NORMAL' | 'AGGRESSIVE';
  feeAmount?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface TradeJournal {
  add(record: Omit<TradeRecord, 'id' | 'timestamp'>): Promise<TradeRecord>;
  get(id: string): Promise<TradeRecord | null>;
  findByChat(chatId: number, limit?: number): Promise<TradeRecord[]>;
  findByToken(tokenMint: string, limit?: number): Promise<TradeRecord[]>;
  findByStatus(status: TradeRecord['status']): Promise<TradeRecord[]>;
  updateStatus(id: string, status: TradeRecord['status'], txHash?: string): Promise<void>;
  updatePrice(id: string, price: number, priceUnit: TradeRecord['priceUnit']): Promise<void>;
  getStats(chatId?: number): Promise<TradeStats>;
  getAll(limit?: number): Promise<TradeRecord[]>;
}

export interface TradeStats {
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  totalVolume: number;
  successfulTrades: number;
  failedTrades: number;
  averageSlippage: number;
  mostTradedToken?: string;
  lastTradeAt?: string;
}

export function generateTradeId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function validateTradeRecord(record: Omit<TradeRecord, 'id' | 'timestamp'>): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(record.chatId) || record.chatId <= 0) {
    errors.push('Invalid chat ID');
  }

  if (!['buy', 'sell'].includes(record.side)) {
    errors.push('Invalid trade side');
  }

  if (!record.tokenMint || record.tokenMint.trim().length < 32) {
    errors.push('Invalid token mint address');
  }

  if (!Number.isFinite(record.amount) || record.amount <= 0) {
    errors.push('Invalid amount');
  }

  if (!['SOL', 'token'].includes(record.amountUnit)) {
    errors.push('Invalid amount unit');
  }

  if (!['paper', 'live'].includes(record.mode)) {
    errors.push('Invalid trade mode');
  }

  if (!Number.isFinite(record.slippageBps) || record.slippageBps < 0 || record.slippageBps > 5000) {
    errors.push('Invalid slippage (must be between 0-5000 bps)');
  }

  if (!['SAFE', 'NORMAL', 'AGGRESSIVE'].includes(record.feeMode)) {
    errors.push('Invalid fee mode');
  }

  if (!['pending', 'executing', 'completed', 'failed'].includes(record.status)) {
    errors.push('Invalid status');
  }

  return errors;
}

export function formatTradeForLog(record: TradeRecord): string {
  return `Trade ${record.id} | ${record.side.toUpperCase()} ${record.tokenSymbol || record.tokenMint.slice(0, 8)}... | ${record.amount} ${record.amountUnit} | ${record.mode} | ${record.status}`;
}

// In-memory implementation (bisa diganti dengan database nanti)
export class InMemoryTradeJournal implements TradeJournal {
  private records = new Map<string, TradeRecord>();
  private chatIndex = new Map<number, Set<string>>();
  private tokenIndex = new Map<string, Set<string>>();
  private statusIndex = new Map<TradeRecord['status'], Set<string>>();

  async add(recordData: Omit<TradeRecord, 'id' | 'timestamp'>): Promise<TradeRecord> {
    const errors = validateTradeRecord(recordData);
    if (errors.length > 0) {
      throw new Error(`Invalid trade record: ${errors.join(', ')}`);
    }

    const id = generateTradeId();
    const timestamp = new Date().toISOString();
    const record: TradeRecord = { 
      ...recordData, 
      id, 
      timestamp 
    };

    // Simpan record
    this.records.set(id, record);
    
    // Update indexes
    this.addToIndex(this.chatIndex, record.chatId, id);
    this.addToIndex(this.tokenIndex, record.tokenMint, id);
    this.addToIndex(this.statusIndex, record.status, id);

    logger.info('Trade record added', { 
      id, 
      chatId: record.chatId, 
      side: record.side, 
      tokenMint: record.tokenMint.slice(0, 8) + '...', 
      mode: record.mode 
    });

    return record;
  }

  async get(id: string): Promise<TradeRecord | null> {
    return this.records.get(id) || null;
  }

  async findByChat(chatId: number, limit: number = 50): Promise<TradeRecord[]> {
    const ids = this.chatIndex.get(chatId) || new Set<string>();
    const records = Array.from(ids)
      .map(id => this.records.get(id))
      .filter((record): record is TradeRecord => record !== undefined)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return records;
  }

  async findByToken(tokenMint: string, limit: number = 50): Promise<TradeRecord[]> {
    const ids = this.tokenIndex.get(tokenMint) || new Set<string>();
    const records = Array.from(ids)
      .map(id => this.records.get(id))
      .filter((record): record is TradeRecord => record !== undefined)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return records;
  }

  async findByStatus(status: TradeRecord['status']): Promise<TradeRecord[]> {
    const ids = this.statusIndex.get(status) || new Set<string>();
    const records = Array.from(ids)
      .map(id => this.records.get(id))
      .filter((record): record is TradeRecord => record !== undefined);

    return records;
  }

  async updateStatus(id: string, status: TradeRecord['status'], txHash?: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Trade record not found: ${id}`);
    }

    // Remove from old status index
    this.removeFromIndex(this.statusIndex, record.status, id);
    
    // Update record
    const updatedRecord: TradeRecord = {
      ...record,
      status,
      ...(txHash ? { txHash } : {})
    };
    
    this.records.set(id, updatedRecord);
    
    // Add to new status index
    this.addToIndex(this.statusIndex, status, id);

    logger.info('Trade status updated', { id, status, txHash });
  }

  async updatePrice(id: string, price: number, priceUnit: TradeRecord['priceUnit']): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Trade record not found: ${id}`);
    }

    const updatedRecord: TradeRecord = {
      ...record,
      price,
      priceUnit
    };
    
    this.records.set(id, updatedRecord);
    
    logger.info('Trade price updated', { id, price, priceUnit });
  }

  async getStats(chatId?: number): Promise<TradeStats> {
    let records: TradeRecord[];
    
    if (chatId) {
      records = await this.findByChat(chatId, 1000); // Get all trades for this chat
    } else {
      records = Array.from(this.records.values());
    }

    if (records.length === 0) {
      return {
        totalTrades: 0,
        totalBuys: 0,
        totalSells: 0,
        totalVolume: 0,
        successfulTrades: 0,
        failedTrades: 0,
        averageSlippage: 0
      };
    }

    const successfulTrades = records.filter(r => r.status === 'completed').length;
    const failedTrades = records.filter(r => r.status === 'failed').length;
    
    // Hitung token yang paling sering ditrading
    const tokenCounts = new Map<string, number>();
    records.forEach(r => {
      const count = tokenCounts.get(r.tokenMint) || 0;
      tokenCounts.set(r.tokenMint, count + 1);
    });
    
    let mostTradedToken: string | undefined;
    let maxCount = 0;
    tokenCounts.forEach((count, token) => {
      if (count > maxCount) {
        maxCount = count;
        mostTradedToken = token;
      }
    });

    return {
      totalTrades: records.length,
      totalBuys: records.filter(r => r.side === 'buy').length,
      totalSells: records.filter(r => r.side === 'sell').length,
      totalVolume: records.reduce((sum, r) => sum + r.amount, 0),
      successfulTrades,
      failedTrades,
      averageSlippage: records.reduce((sum, r) => sum + r.slippageBps, 0) / records.length,
      mostTradedToken,
      lastTradeAt: records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.timestamp
    };
  }

  async getAll(limit: number = 100): Promise<TradeRecord[]> {
    return Array.from(this.records.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  private addToIndex<T>(index: Map<T, Set<string>>, key: T, id: string): void {
    if (!index.has(key)) {
      index.set(key, new Set<string>());
    }
    index.get(key)!.add(id);
  }

  private removeFromIndex<T>(index: Map<T, Set<string>>, key: T, id: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }
}

export function createTradeJournal(): TradeJournal {
  return new InMemoryTradeJournal();
}