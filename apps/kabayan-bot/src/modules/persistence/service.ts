/**
 * Database Persistence
 *
 * SQLite-based persistence for trades, positions, and history.
 */

import * as fs from "fs";
import * as path from "path";

export interface DatabaseConfig {
  path: string;
  autoSave: boolean;
  saveIntervalMs: number;
}

export interface TradeRecord {
  id: string;
  signature: string;
  timestamp: string;
  direction: "buy" | "sell";
  tokenMint: string;
  tokenSymbol: string;
  amountSol: number;
  amountTokens: number;
  price: number;
  feeSol: number;
  pnlSol: number;
  pnlPct: number;
  status: "success" | "failed" | "pending";
  source: "manual" | "screening" | "copytrade" | "management";
  poolAddress: string;
  chatId?: number;
}

export interface PositionRecord {
  id: string;
  poolAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  entryTime: string;
  entryPrice: number;
  entrySignature: string;
  amountSol: number;
  amountTokens: number;
  status: "open" | "closed" | "liquidated";
  closeTime?: string;
  closePrice?: number;
  closeSignature?: string;
  exitReason?: "manual" | "sl" | "tp" | "oor" | "time";
  pnlSol: number;
  pnlPct: number;
  chatId?: number;
}

export interface ScreeningRecord {
  id: string;
  poolAddress: string;
  tokenSymbol: string;
  timestamp: string;
  source: "manual" | "scheduled";
  score: number;
  confidence: number;
  recommendation: "buy" | "watch" | "avoid" | "skip";
  reason: string;
  poolData: Record<string, any>;
  executed: boolean;
  executedAt?: string;
  executionSignature?: string;
}

export interface WalletRecord {
  address: string;
  name: string;
  addedAt: string;
  lastActivity: string;
  totalTrades: number;
  totalVolumeSol: number;
  totalPnlSol: number;
  winRate: number;
}

export interface Database {
  trades: TradeRecord[];
  positions: PositionRecord[];
  screenings: ScreeningRecord[];
  wallets: WalletRecord[];
  settings: Record<string, any>;
  autoPositions: any[];
  lastSaved: string;
}

export class PersistenceService {
  private config: DatabaseConfig;
  private data: Database;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: config.path || "./data/prabu-siliwangi.json",
      autoSave: config.autoSave ?? true,
      saveIntervalMs: config.saveIntervalMs ?? 60000,
    };

    this.data = this.load();
    this.startAutoSave();
  }

  private load(): Database {
    try {
      if (fs.existsSync(this.config.path)) {
        const content = fs.readFileSync(this.config.path, "utf-8");
        const parsed = JSON.parse(content);
        return {
          trades: parsed.trades || [],
          positions: parsed.positions || [],
          screenings: parsed.screenings || [],
          wallets: parsed.wallets || [],
          settings: parsed.settings || {},
          autoPositions: parsed.autoPositions || [],
          lastSaved: parsed.lastSaved || new Date().toISOString(),
        };
      }
    } catch (error) {
      console.warn("Failed to load database, starting fresh:", error);
    }

    return this.createEmptyDatabase();
  }

  private createEmptyDatabase(): Database {
    return {
      trades: [],
      positions: [],
      screenings: [],
      wallets: [],
      settings: {},
      autoPositions: [],
      lastSaved: new Date().toISOString(),
    };
  }

  save(): void {
    try {
      const dir = path.dirname(this.config.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.data.lastSaved = new Date().toISOString();
      fs.writeFileSync(this.config.path, JSON.stringify(this.data, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.error("Failed to save database:", error);
    }
  }

  private startAutoSave(): void {
    if (!this.config.autoSave) return;

    this.saveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, this.config.saveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  addTrade(trade: Omit<TradeRecord, "id">): TradeRecord {
    const record: TradeRecord = {
      ...trade,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.data.trades.push(record);
    this.markDirty();

    if (this.data.trades.length > 10000) {
      this.data.trades = this.data.trades.slice(-5000);
    }

    return record;
  }

  getTrades(limit?: number, filters?: {
    tokenMint?: string;
    direction?: "buy" | "sell";
    status?: "success" | "failed" | "pending";
    from?: string;
    to?: string;
  }): TradeRecord[] {
    let trades = [...this.data.trades];

    if (filters?.tokenMint) {
      trades = trades.filter(t => t.tokenMint === filters.tokenMint);
    }
    if (filters?.direction) {
      trades = trades.filter(t => t.direction === filters.direction);
    }
    if (filters?.status) {
      trades = trades.filter(t => t.status === filters.status);
    }
    if (filters?.from) {
      trades = trades.filter(t => t.timestamp >= filters.from!);
    }
    if (filters?.to) {
      trades = trades.filter(t => t.timestamp <= filters.to!);
    }

    trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return limit ? trades.slice(0, limit) : trades;
  }

  addPosition(position: Omit<PositionRecord, "id">): PositionRecord {
    const record: PositionRecord = {
      ...position,
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.data.positions.push(record);
    this.markDirty();

    return record;
  }

  updatePosition(id: string, updates: Partial<PositionRecord>): PositionRecord | null {
    const index = this.data.positions.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.data.positions[index] = { ...this.data.positions[index], ...updates };
    this.markDirty();

    return this.data.positions[index];
  }

  getPosition(id: string): PositionRecord | undefined {
    return this.data.positions.find(p => p.id === id);
  }

  getOpenPositions(): PositionRecord[] {
    return this.data.positions.filter(p => p.status === "open");
  }

  getPositions(limit?: number, filters?: {
    status?: "open" | "closed" | "liquidated";
    tokenMint?: string;
  }): PositionRecord[] {
    let positions = [...this.data.positions];

    if (filters?.status) {
      positions = positions.filter(p => p.status === filters.status);
    }
    if (filters?.tokenMint) {
      positions = positions.filter(p => p.tokenMint === filters.tokenMint);
    }

    positions.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

    return limit ? positions.slice(0, limit) : positions;
  }

  addScreening(screening: Omit<ScreeningRecord, "id">): ScreeningRecord {
    const record: ScreeningRecord = {
      ...screening,
      id: `screen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.data.screenings.push(record);
    this.markDirty();

    if (this.data.screenings.length > 5000) {
      this.data.screenings = this.data.screenings.slice(-2000);
    }

    return record;
  }

  getScreenings(limit?: number, filters?: {
    recommendation?: "buy" | "watch" | "avoid" | "skip";
    source?: "manual" | "scheduled";
    from?: string;
    to?: string;
  }): ScreeningRecord[] {
    let screenings = [...this.data.screenings];

    if (filters?.recommendation) {
      screenings = screenings.filter(s => s.recommendation === filters.recommendation);
    }
    if (filters?.source) {
      screenings = screenings.filter(s => s.source === filters.source);
    }
    if (filters?.from) {
      screenings = screenings.filter(s => s.timestamp >= filters.from!);
    }
    if (filters?.to) {
      screenings = screenings.filter(s => s.timestamp <= filters.to!);
    }

    screenings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return limit ? screenings.slice(0, limit) : screenings;
  }

  addWallet(wallet: Omit<WalletRecord, "addedAt" | "lastActivity" | "totalTrades" | "totalVolumeSol" | "totalPnlSol" | "winRate">): WalletRecord {
    const existing = this.data.wallets.find(w => w.address === wallet.address);
    if (existing) return existing;

    const record: WalletRecord = {
      ...wallet,
      addedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      totalTrades: 0,
      totalVolumeSol: 0,
      totalPnlSol: 0,
      winRate: 0,
    };

    this.data.wallets.push(record);
    this.markDirty();

    return record;
  }

  getWallets(): WalletRecord[] {
    return [...this.data.wallets];
  }

  updateWallet(address: string, updates: Partial<WalletRecord>): WalletRecord | null {
    const index = this.data.wallets.findIndex(w => w.address === address);
    if (index === -1) return null;

    this.data.wallets[index] = { ...this.data.wallets[index], ...updates };
    this.markDirty();

    return this.data.wallets[index];
  }

  getSetting<T>(key: string, defaultValue: T): T {
    return (this.data.settings[key] as T) ?? defaultValue;
  }

  setSetting<T>(key: string, value: T): void {
    this.data.settings[key] = value;
    this.markDirty();
  }

  getStats(): {
    totalTrades: number;
    totalPositions: number;
    openPositions: number;
    totalScreenings: number;
    walletsTracked: number;
    lastSaved: string;
  } {
    return {
      totalTrades: this.data.trades.length,
      totalPositions: this.data.positions.length,
      openPositions: this.data.positions.filter(p => p.status === "open").length,
      totalScreenings: this.data.screenings.length,
      walletsTracked: this.data.wallets.length,
      lastSaved: this.data.lastSaved,
    };
  }

  clearOldData(daysToKeep: number = 30): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffStr = cutoff.toISOString();

    const beforeTrades = this.data.trades.length;
    this.data.trades = this.data.trades.filter(t => t.timestamp >= cutoffStr);
    const afterTrades = this.data.trades.length;

    const beforeScreenings = this.data.screenings.length;
    this.data.screenings = this.data.screenings.filter(s => s.timestamp >= cutoffStr);
    const afterScreenings = this.data.screenings.length;

    this.markDirty();

    console.log(`Cleared old data: ${beforeTrades - afterTrades} trades, ${beforeScreenings - afterScreenings} screenings`);
  }

  exportData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importData(jsonString: string): boolean {
    try {
      const imported = JSON.parse(jsonString) as Database;
      
      if (imported.trades) this.data.trades = imported.trades;
      if (imported.positions) this.data.positions = imported.positions;
      if (imported.screenings) this.data.screenings = imported.screenings;
      if (imported.wallets) this.data.wallets = imported.wallets;
      if (imported.settings) this.data.settings = imported.settings;
      if (imported.autoPositions) this.data.autoPositions = imported.autoPositions;
      
      this.markDirty();
      return true;
    } catch {
      return false;
    }
  }

  saveAutoPositions(positions: any[]): void {
    this.data.autoPositions = positions;
    this.markDirty();
  }

  getAutoPositions(): any[] {
    return this.data.autoPositions || [];
  }

  close(): void {
    this.stopAutoSave();
    if (this.isDirty) {
      this.save();
    }
  }
}

let instance: PersistenceService | null = null;

export function createPersistenceService(config?: Partial<DatabaseConfig>): PersistenceService {
  if (instance) {
    return instance;
  }
  instance = new PersistenceService(config);
  return instance;
}

export function getPersistenceService(): PersistenceService {
  if (!instance) {
    instance = createPersistenceService();
  }
  return instance;
}
