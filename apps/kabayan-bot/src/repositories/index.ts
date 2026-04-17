/**
 * Repository Layer - Database Access
 *
 * Layer ini bertanggung jawab untuk mengakses data dari database.
 * Mendukung SQLite untuk development dan PostgreSQL untuk production.
 *
 * Struktur:
 * - RepositoryLayer: Interface utama untuk akses data
 * - SQLiteRepository: Implementasi dengan SQLite
 * - Entity repositories: Position, Trade, User, dll
 */

import * as fs from "fs";
import * as path from "path";
import { AppConfig } from "../domain/types";
import { EnvConfig } from "../domain/types";

export interface RepositoryHealth {
  ready: boolean;
  message: string;
  storage: "unconfigured" | "sqlite" | "postgres" | "memory";
  migrationsApplied: boolean;
  databasePath?: string;
}

export interface BaseRepository<TRecord> {
  getById(id: string): Promise<TRecord | null>;
  list(): Promise<TRecord[]>;
  save(record: TRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

// ==================== Entity Types ====================

export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  id: string;
  userId: string;
  poolAddress: string;
  poolName?: string;
  positionKey: string;
  amountSol: number;
  rangeLower?: number;
  rangeUpper?: number;
  strategy: string;
  status: "active" | "closed" | "orphaned";
  entryPrice?: number;
  currentPrice?: number;
  pnlSol?: number;
  pnlPercent?: number;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface Trade {
  id: string;
  userId: string;
  positionId?: string;
  type: "buy" | "sell" | "add_liquidity" | "remove_liquidity";
  tokenMint?: string;
  poolAddress?: string;
  amountSol: number;
  amountToken?: number;
  price?: number;
  fee?: number;
  txHash?: string;
  signature?: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
}

export interface WalletTarget {
  id: string;
  userId: string;
  walletAddress: string;
  label?: string;
  minConfidence: number;
  maxPositionSol: number;
  copySellEnabled: boolean;
  autoStopLoss: boolean;
  status: "active" | "paused" | "removed";
  performance?: {
    totalTrades: number;
    profitableTrades: number;
    totalPnLSol: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface ScreeningCandidate {
  id: string;
  poolAddress: string;
  poolName?: string;
  tvl: number;
  volume24h: number;
  fees24h: number;
  holders: number;
  marketCap: number;
  riskScore: number;
  opportunityScore: number;
  reason?: string;
  suggestedAction?: string;
  status: "new" | "reviewed" | "approved" | "rejected" | "watching";
  screenedAt: number;
}

export interface AIDecision {
  id: string;
  userId?: string;
  positionId?: string;
  task: string;
  model: string;
  inputSummary: string;
  output: string;
  confidence?: number;
  finalAction: string;
  overridden: boolean;
  overrideReason?: string;
  timestamp: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: "info" | "warning" | "error" | "success" | "trade" | "alert";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  sentAt: number;
  readAt?: number;
}

// ==================== Repository Layer Interface ====================

export interface RepositoryLayer {
  // Health check
  health(): Promise<RepositoryHealth>;

  // Initialize database
  initialize(): Promise<void>;

  // User operations
  users: {
    create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User>;
    getById(id: string): Promise<User | null>;
    getByTelegramId(telegramId: string): Promise<User | null>;
    update(id: string, data: Partial<User>): Promise<User | null>;
    list(): Promise<User[]>;
  };

  // Position operations
  positions: {
    create(position: Omit<Position, "id" | "createdAt" | "updatedAt">): Promise<Position>;
    getById(id: string): Promise<Position | null>;
    getByUserId(userId: string): Promise<Position[]>;
    getActiveByUserId(userId: string): Promise<Position[]>;
    update(id: string, data: Partial<Position>): Promise<Position | null>;
    delete(id: string): Promise<void>;
    list(): Promise<Position[]>;
  };

  // Trade operations
  trades: {
    create(trade: Omit<Trade, "id" | "timestamp">): Promise<Trade>;
    getById(id: string): Promise<Trade | null>;
    getByUserId(userId: string, limit?: number): Promise<Trade[]>;
    getByPositionId(positionId: string): Promise<Trade[]>;
    list(limit?: number): Promise<Trade[]>;
  };

  // Wallet target operations (for copy trading)
  walletTargets: {
    create(target: Omit<WalletTarget, "id" | "createdAt" | "updatedAt">): Promise<WalletTarget>;
    getById(id: string): Promise<WalletTarget | null>;
    getByUserId(userId: string): Promise<WalletTarget[]>;
    getActiveByUserId(userId: string): Promise<WalletTarget[]>;
    update(id: string, data: Partial<WalletTarget>): Promise<WalletTarget | null>;
    delete(id: string): Promise<void>;
  };

  // Screening candidates
  screeningCandidates: {
    create(candidate: Omit<ScreeningCandidate, "id" | "screenedAt">): Promise<ScreeningCandidate>;
    getById(id: string): Promise<ScreeningCandidate | null>;
    getByPoolAddress(poolAddress: string): Promise<ScreeningCandidate | null>;
    update(id: string, data: Partial<ScreeningCandidate>): Promise<ScreeningCandidate | null>;
    listByStatus(status: ScreeningCandidate["status"], limit?: number): Promise<ScreeningCandidate[]>;
    list(limit?: number): Promise<ScreeningCandidate[]>;
  };

  // AI decisions log
  aiDecisions: {
    create(decision: Omit<AIDecision, "id" | "timestamp">): Promise<AIDecision>;
    getById(id: string): Promise<AIDecision | null>;
    getByUserId(userId: string, limit?: number): Promise<AIDecision[]>;
    getByPositionId(positionId: string): Promise<AIDecision[]>;
    list(limit?: number): Promise<AIDecision[]>;
  };

  // Notifications
  notifications: {
    create(notification: Omit<Notification, "id" | "sentAt">): Promise<Notification>;
    getById(id: string): Promise<Notification | null>;
    getByUserId(userId: string, limit?: number): Promise<Notification[]>;
    getUnreadByUserId(userId: string): Promise<Notification[]>;
    markAsRead(id: string): Promise<void>;
  };
}

// ==================== SQLite Implementation ====================

class SQLiteRepositoryLayer implements RepositoryLayer {
  private db: any = null;
  private dbPath: string = "";
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Determine database path
    const projectRoot = path.resolve(__dirname, "../../../../");
    const dataDir = path.join(projectRoot, "data");

    // Create data directory if not exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "prabu-siliwangi.db");

    // Use better-sqlite3 if available, otherwise use sql.js
    try {
      const Database = require("better-sqlite3");
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
    } catch {
      // Fallback to sql.js
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();
      const buffer = fs.existsSync(this.dbPath)
        ? fs.readFileSync(this.dbPath)
        : undefined;
      this.db = new SQL.Database(buffer);
    }

    // Run migrations
    this.runMigrations();
    this.initialized = true;
  }

  private runMigrations(): void {
    const migrations = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_id TEXT UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,

      // Positions table
      `CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pool_address TEXT NOT NULL,
        pool_name TEXT,
        position_key TEXT NOT NULL,
        amount_sol REAL NOT NULL,
        range_lower REAL,
        range_upper REAL,
        strategy TEXT,
        status TEXT DEFAULT 'active',
        entry_price REAL,
        current_price REAL,
        pnl_sol REAL,
        pnl_percent REAL,
        opened_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        closed_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // Trades table
      `CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        position_id TEXT,
        type TEXT NOT NULL,
        token_mint TEXT,
        pool_address TEXT,
        amount_sol REAL NOT NULL,
        amount_token REAL,
        price REAL,
        fee REAL,
        tx_hash TEXT,
        signature TEXT,
        status TEXT DEFAULT 'pending',
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (position_id) REFERENCES positions(id)
      )`,

      // Wallet targets table (copy trading)
      `CREATE TABLE IF NOT EXISTS wallet_targets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        label TEXT,
        min_confidence REAL DEFAULT 70,
        max_position_sol REAL DEFAULT 1,
        copy_sell_enabled INTEGER DEFAULT 1,
        auto_stop_loss INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        performance TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // Screening candidates table
      `CREATE TABLE IF NOT EXISTS screening_candidates (
        id TEXT PRIMARY KEY,
        pool_address TEXT NOT NULL,
        pool_name TEXT,
        tvl REAL DEFAULT 0,
        volume_24h REAL DEFAULT 0,
        fees_24h REAL DEFAULT 0,
        holders INTEGER DEFAULT 0,
        market_cap REAL DEFAULT 0,
        risk_score REAL DEFAULT 0,
        opportunity_score REAL DEFAULT 0,
        reason TEXT,
        suggested_action TEXT,
        status TEXT DEFAULT 'new',
        screened_at INTEGER NOT NULL
      )`,

      // AI decisions log
      `CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        position_id TEXT,
        task TEXT NOT NULL,
        model TEXT NOT NULL,
        input_summary TEXT NOT NULL,
        output TEXT NOT NULL,
        confidence REAL,
        final_action TEXT NOT NULL,
        overridden INTEGER DEFAULT 0,
        override_reason TEXT,
        timestamp INTEGER NOT NULL
      )`,

      // Notifications table
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        sent_at INTEGER NOT NULL,
        read_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_wallet_targets_user_id ON wallet_targets(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_screening_candidates_status ON screening_candidates(status)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_decisions_timestamp ON ai_decisions(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
    ];

    for (const sql of migrations) {
      try {
        this.db.exec(sql);
      } catch (error) {
        console.error("Migration error:", error);
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async health(): Promise<RepositoryHealth> {
    if (!this.initialized) {
      return {
        ready: false,
        message: "Database not initialized",
        storage: "unconfigured",
        migrationsApplied: false,
      };
    }

    try {
      // Simple query to check connection
      this.db.exec("SELECT 1");

      return {
        ready: true,
        message: "SQLite database ready",
        storage: "sqlite",
        migrationsApplied: true,
        databasePath: this.dbPath,
      };
    } catch (error) {
      return {
        ready: false,
        message: `Database error: ${error}`,
        storage: "sqlite",
        migrationsApplied: false,
      };
    }
  }

  // ==================== User Repository ====================

  users = {
    create: async (userData: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> => {
      const now = Date.now();
      const user: User = {
        ...userData,
        id: this.generateId(),
        createdAt: now,
        updatedAt: now,
      };

      const stmt = this.db.prepare(`
        INSERT INTO users (id, telegram_id, username, first_name, last_name, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        user.id,
        user.telegramId,
        user.username || null,
        user.firstName || null,
        user.lastName || null,
        JSON.stringify(user.settings),
        user.createdAt,
        user.updatedAt
      );

      return user;
    },

    getById: async (id: string): Promise<User | null> => {
      const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToUser(row) : null;
    },

    getByTelegramId: async (telegramId: string): Promise<User | null> => {
      const stmt = this.db.prepare("SELECT * FROM users WHERE telegram_id = ?");
      const row = stmt.get(telegramId);
      return row ? this.mapRowToUser(row) : null;
    },

    update: async (id: string, data: Partial<User>): Promise<User | null> => {
      const existing = await this.users.getById(id);
      if (!existing) return null;

      const updated: User = {
        ...existing,
        ...data,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };

      const stmt = this.db.prepare(`
        UPDATE users SET
          telegram_id = ?, username = ?, first_name = ?, last_name = ?,
          settings = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.telegramId,
        updated.username || null,
        updated.firstName || null,
        updated.lastName || null,
        JSON.stringify(updated.settings),
        updated.updatedAt,
        id
      );

      return updated;
    },

    list: async (): Promise<User[]> => {
      const stmt = this.db.prepare("SELECT * FROM users ORDER BY created_at DESC");
      return stmt.all().map(this.mapRowToUser);
    },
  };

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      telegramId: row.telegram_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      settings: JSON.parse(row.settings || "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== Position Repository ====================

  positions = {
    create: async (positionData: Omit<Position, "id" | "createdAt" | "updatedAt">): Promise<Position> => {
      const now = Date.now();
      const position: Position = {
        ...positionData,
        id: this.generateId(),
        openedAt: now,
        updatedAt: now,
      };

      const stmt = this.db.prepare(`
        INSERT INTO positions (
          id, user_id, pool_address, pool_name, position_key, amount_sol,
          range_lower, range_upper, strategy, status, entry_price, current_price,
          pnl_sol, pnl_percent, opened_at, updated_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        position.id,
        position.userId,
        position.poolAddress,
        position.poolName || null,
        position.positionKey,
        position.amountSol,
        position.rangeLower || null,
        position.rangeUpper || null,
        position.strategy,
        position.status,
        position.entryPrice || null,
        position.currentPrice || null,
        position.pnlSol || null,
        position.pnlPercent || null,
        position.openedAt,
        position.updatedAt,
        position.closedAt || null
      );

      return position;
    },

    getById: async (id: string): Promise<Position | null> => {
      const stmt = this.db.prepare("SELECT * FROM positions WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToPosition(row) : null;
    },

    getByUserId: async (userId: string): Promise<Position[]> => {
      const stmt = this.db.prepare("SELECT * FROM positions WHERE user_id = ? ORDER BY opened_at DESC");
      return stmt.all(userId).map(this.mapRowToPosition);
    },

    getActiveByUserId: async (userId: string): Promise<Position[]> => {
      const stmt = this.db.prepare("SELECT * FROM positions WHERE user_id = ? AND status = 'active' ORDER BY opened_at DESC");
      return stmt.all(userId).map(this.mapRowToPosition);
    },

    update: async (id: string, data: Partial<Position>): Promise<Position | null> => {
      const existing = await this.positions.getById(id);
      if (!existing) return null;

      const updated: Position = {
        ...existing,
        ...data,
        id: existing.id,
        userId: existing.userId,
        openedAt: existing.openedAt,
        updatedAt: Date.now(),
      };

      const stmt = this.db.prepare(`
        UPDATE positions SET
          pool_address = ?, pool_name = ?, amount_sol = ?, range_lower = ?, range_upper = ?,
          strategy = ?, status = ?, entry_price = ?, current_price = ?, pnl_sol = ?,
          pnl_percent = ?, updated_at = ?, closed_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.poolAddress,
        updated.poolName || null,
        updated.amountSol,
        updated.rangeLower || null,
        updated.rangeUpper || null,
        updated.strategy,
        updated.status,
        updated.entryPrice || null,
        updated.currentPrice || null,
        updated.pnlSol || null,
        updated.pnlPercent || null,
        updated.updatedAt,
        updated.closedAt || null,
        id
      );

      return updated;
    },

    delete: async (id: string): Promise<void> => {
      const stmt = this.db.prepare("DELETE FROM positions WHERE id = ?");
      stmt.run(id);
    },

    list: async (): Promise<Position[]> => {
      const stmt = this.db.prepare("SELECT * FROM positions ORDER BY opened_at DESC");
      return stmt.all().map(this.mapRowToPosition);
    },
  };

  private mapRowToPosition(row: any): Position {
    return {
      id: row.id,
      userId: row.user_id,
      poolAddress: row.pool_address,
      poolName: row.pool_name,
      positionKey: row.position_key,
      amountSol: row.amount_sol,
      rangeLower: row.range_lower,
      rangeUpper: row.range_upper,
      strategy: row.strategy,
      status: row.status,
      entryPrice: row.entry_price,
      currentPrice: row.current_price,
      pnlSol: row.pnl_sol,
      pnlPercent: row.pnl_percent,
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at,
    };
  }

  // ==================== Trade Repository ====================

  trades = {
    create: async (tradeData: Omit<Trade, "id" | "timestamp">): Promise<Trade> => {
      const trade: Trade = {
        ...tradeData,
        id: this.generateId(),
        timestamp: Date.now(),
      };

      const stmt = this.db.prepare(`
        INSERT INTO trades (
          id, user_id, position_id, type, token_mint, pool_address,
          amount_sol, amount_token, price, fee, tx_hash, signature, status, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        trade.id,
        trade.userId,
        trade.positionId || null,
        trade.type,
        trade.tokenMint || null,
        trade.poolAddress || null,
        trade.amountSol,
        trade.amountToken || null,
        trade.price || null,
        trade.fee || null,
        trade.txHash || null,
        trade.signature || null,
        trade.status,
        trade.timestamp
      );

      return trade;
    },

    getById: async (id: string): Promise<Trade | null> => {
      const stmt = this.db.prepare("SELECT * FROM trades WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToTrade(row) : null;
    },

    getByUserId: async (userId: string, limit: number = 50): Promise<Trade[]> => {
      const stmt = this.db.prepare("SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?");
      return stmt.all(userId, limit).map(this.mapRowToTrade);
    },

    getByPositionId: async (positionId: string): Promise<Trade[]> => {
      const stmt = this.db.prepare("SELECT * FROM trades WHERE position_id = ? ORDER BY timestamp DESC");
      return stmt.all(positionId).map(this.mapRowToTrade);
    },

    list: async (limit: number = 100): Promise<Trade[]> => {
      const stmt = this.db.prepare("SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?");
      return stmt.all(limit).map(this.mapRowToTrade);
    },
  };

  private mapRowToTrade(row: any): Trade {
    return {
      id: row.id,
      userId: row.user_id,
      positionId: row.position_id,
      type: row.type,
      tokenMint: row.token_mint,
      poolAddress: row.pool_address,
      amountSol: row.amount_sol,
      amountToken: row.amount_token,
      price: row.price,
      fee: row.fee,
      txHash: row.tx_hash,
      signature: row.signature,
      status: row.status,
      timestamp: row.timestamp,
    };
  }

  // ==================== Wallet Targets Repository ====================

  walletTargets = {
    create: async (targetData: Omit<WalletTarget, "id" | "createdAt" | "updatedAt">): Promise<WalletTarget> => {
      const now = Date.now();
      const target: WalletTarget = {
        ...targetData,
        id: this.generateId(),
        createdAt: now,
        updatedAt: now,
      };

      const stmt = this.db.prepare(`
        INSERT INTO wallet_targets (
          id, user_id, wallet_address, label, min_confidence, max_position_sol,
          copy_sell_enabled, auto_stop_loss, status, performance, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        target.id,
        target.userId,
        target.walletAddress,
        target.label || null,
        target.minConfidence,
        target.maxPositionSol,
        target.copySellEnabled ? 1 : 0,
        target.autoStopLoss ? 1 : 0,
        target.status,
        JSON.stringify(target.performance || {}),
        target.createdAt,
        target.updatedAt
      );

      return target;
    },

    getById: async (id: string): Promise<WalletTarget | null> => {
      const stmt = this.db.prepare("SELECT * FROM wallet_targets WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToWalletTarget(row) : null;
    },

    getByUserId: async (userId: string): Promise<WalletTarget[]> => {
      const stmt = this.db.prepare("SELECT * FROM wallet_targets WHERE user_id = ? ORDER BY created_at DESC");
      return stmt.all(userId).map(this.mapRowToWalletTarget);
    },

    getActiveByUserId: async (userId: string): Promise<WalletTarget[]> => {
      const stmt = this.db.prepare("SELECT * FROM wallet_targets WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC");
      return stmt.all(userId).map(this.mapRowToWalletTarget);
    },

    update: async (id: string, data: Partial<WalletTarget>): Promise<WalletTarget | null> => {
      const existing = await this.walletTargets.getById(id);
      if (!existing) return null;

      const updated: WalletTarget = {
        ...existing,
        ...data,
        id: existing.id,
        userId: existing.userId,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };

      const stmt = this.db.prepare(`
        UPDATE wallet_targets SET
          wallet_address = ?, label = ?, min_confidence = ?, max_position_sol = ?,
          copy_sell_enabled = ?, auto_stop_loss = ?, status = ?, performance = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.walletAddress,
        updated.label || null,
        updated.minConfidence,
        updated.maxPositionSol,
        updated.copySellEnabled ? 1 : 0,
        updated.autoStopLoss ? 1 : 0,
        updated.status,
        JSON.stringify(updated.performance || {}),
        updated.updatedAt,
        id
      );

      return updated;
    },

    delete: async (id: string): Promise<void> => {
      const stmt = this.db.prepare("DELETE FROM wallet_targets WHERE id = ?");
      stmt.run(id);
    },
  };

  private mapRowToWalletTarget(row: any): WalletTarget {
    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      label: row.label,
      minConfidence: row.min_confidence,
      maxPositionSol: row.max_position_sol,
      copySellEnabled: row.copy_sell_enabled === 1,
      autoStopLoss: row.auto_stop_loss === 1,
      status: row.status,
      performance: JSON.parse(row.performance || "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== Screening Candidates Repository ====================

  screeningCandidates = {
    create: async (candidateData: Omit<ScreeningCandidate, "id" | "screenedAt">): Promise<ScreeningCandidate> => {
      const candidate: ScreeningCandidate = {
        ...candidateData,
        id: this.generateId(),
        screenedAt: Date.now(),
      };

      const stmt = this.db.prepare(`
        INSERT INTO screening_candidates (
          id, pool_address, pool_name, tvl, volume_24h, fees_24h, holders,
          market_cap, risk_score, opportunity_score, reason, suggested_action, status, screened_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        candidate.id,
        candidate.poolAddress,
        candidate.poolName || null,
        candidate.tvl,
        candidate.volume24h,
        candidate.fees24h,
        candidate.holders,
        candidate.marketCap,
        candidate.riskScore,
        candidate.opportunityScore,
        candidate.reason || null,
        candidate.suggestedAction || null,
        candidate.status,
        candidate.screenedAt
      );

      return candidate;
    },

    getById: async (id: string): Promise<ScreeningCandidate | null> => {
      const stmt = this.db.prepare("SELECT * FROM screening_candidates WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToScreeningCandidate(row) : null;
    },

    getByPoolAddress: async (poolAddress: string): Promise<ScreeningCandidate | null> => {
      const stmt = this.db.prepare("SELECT * FROM screening_candidates WHERE pool_address = ? ORDER BY screened_at DESC LIMIT 1");
      const row = stmt.get(poolAddress);
      return row ? this.mapRowToScreeningCandidate(row) : null;
    },

    update: async (id: string, data: Partial<ScreeningCandidate>): Promise<ScreeningCandidate | null> => {
      const existing = await this.screeningCandidates.getById(id);
      if (!existing) return null;

      const updated: ScreeningCandidate = {
        ...existing,
        ...data,
        id: existing.id,
        screenedAt: existing.screenedAt,
      };

      const stmt = this.db.prepare(`
        UPDATE screening_candidates SET
          pool_address = ?, pool_name = ?, tvl = ?, volume_24h = ?, fees_24h = ?,
          holders = ?, market_cap = ?, risk_score = ?, opportunity_score = ?,
          reason = ?, suggested_action = ?, status = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.poolAddress,
        updated.poolName || null,
        updated.tvl,
        updated.volume24h,
        updated.fees24h,
        updated.holders,
        updated.marketCap,
        updated.riskScore,
        updated.opportunityScore,
        updated.reason || null,
        updated.suggestedAction || null,
        updated.status,
        id
      );

      return updated;
    },

    listByStatus: async (status: ScreeningCandidate["status"], limit: number = 50): Promise<ScreeningCandidate[]> => {
      const stmt = this.db.prepare("SELECT * FROM screening_candidates WHERE status = ? ORDER BY screened_at DESC LIMIT ?");
      return stmt.all(status, limit).map(this.mapRowToScreeningCandidate);
    },

    list: async (limit: number = 100): Promise<ScreeningCandidate[]> => {
      const stmt = this.db.prepare("SELECT * FROM screening_candidates ORDER BY screened_at DESC LIMIT ?");
      return stmt.all(limit).map(this.mapRowToScreeningCandidate);
    },
  };

  private mapRowToScreeningCandidate(row: any): ScreeningCandidate {
    return {
      id: row.id,
      poolAddress: row.pool_address,
      poolName: row.pool_name,
      tvl: row.tvl,
      volume24h: row.volume_24h,
      fees24h: row.fees_24h,
      holders: row.holders,
      marketCap: row.market_cap,
      riskScore: row.risk_score,
      opportunityScore: row.opportunity_score,
      reason: row.reason,
      suggestedAction: row.suggested_action,
      status: row.status,
      screenedAt: row.screened_at,
    };
  }

  // ==================== AI Decisions Repository ====================

  aiDecisions = {
    create: async (decisionData: Omit<AIDecision, "id" | "timestamp">): Promise<AIDecision> => {
      const decision: AIDecision = {
        ...decisionData,
        id: this.generateId(),
        timestamp: Date.now(),
      };

      const stmt = this.db.prepare(`
        INSERT INTO ai_decisions (
          id, user_id, position_id, task, model, input_summary, output,
          confidence, final_action, overridden, override_reason, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        decision.id,
        decision.userId || null,
        decision.positionId || null,
        decision.task,
        decision.model,
        decision.inputSummary,
        decision.output,
        decision.confidence || null,
        decision.finalAction,
        decision.overridden ? 1 : 0,
        decision.overrideReason || null,
        decision.timestamp
      );

      return decision;
    },

    getById: async (id: string): Promise<AIDecision | null> => {
      const stmt = this.db.prepare("SELECT * FROM ai_decisions WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToAIDecision(row) : null;
    },

    getByUserId: async (userId: string, limit: number = 50): Promise<AIDecision[]> => {
      const stmt = this.db.prepare("SELECT * FROM ai_decisions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?");
      return stmt.all(userId, limit).map(this.mapRowToAIDecision);
    },

    getByPositionId: async (positionId: string): Promise<AIDecision[]> => {
      const stmt = this.db.prepare("SELECT * FROM ai_decisions WHERE position_id = ? ORDER BY timestamp DESC");
      return stmt.all(positionId).map(this.mapRowToAIDecision);
    },

    list: async (limit: number = 100): Promise<AIDecision[]> => {
      const stmt = this.db.prepare("SELECT * FROM ai_decisions ORDER BY timestamp DESC LIMIT ?");
      return stmt.all(limit).map(this.mapRowToAIDecision);
    },
  };

  private mapRowToAIDecision(row: any): AIDecision {
    return {
      id: row.id,
      userId: row.user_id,
      positionId: row.position_id,
      task: row.task,
      model: row.model,
      inputSummary: row.input_summary,
      output: row.output,
      confidence: row.confidence,
      finalAction: row.final_action,
      overridden: row.overridden === 1,
      overrideReason: row.override_reason,
      timestamp: row.timestamp,
    };
  }

  // ==================== Notifications Repository ====================

  notifications = {
    create: async (notificationData: Omit<Notification, "id" | "sentAt">): Promise<Notification> => {
      const notification: Notification = {
        ...notificationData,
        id: this.generateId(),
        sentAt: Date.now(),
      };

      const stmt = this.db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, metadata, sent_at, read_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        notification.id,
        notification.userId,
        notification.type,
        notification.title,
        notification.message,
        JSON.stringify(notification.metadata || {}),
        notification.sentAt,
        notification.readAt || null
      );

      return notification;
    },

    getById: async (id: string): Promise<Notification | null> => {
      const stmt = this.db.prepare("SELECT * FROM notifications WHERE id = ?");
      const row = stmt.get(id);
      return row ? this.mapRowToNotification(row) : null;
    },

    getByUserId: async (userId: string, limit: number = 50): Promise<Notification[]> => {
      const stmt = this.db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?");
      return stmt.all(userId, limit).map(this.mapRowToNotification);
    },

    getUnreadByUserId: async (userId: string): Promise<Notification[]> => {
      const stmt = this.db.prepare("SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY sent_at DESC");
      return stmt.all(userId).map(this.mapRowToNotification);
    },

    markAsRead: async (id: string): Promise<void> => {
      const stmt = this.db.prepare("UPDATE notifications SET read_at = ? WHERE id = ?");
      stmt.run(Date.now(), id);
    },
  };

  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      metadata: JSON.parse(row.metadata || "{}"),
      sentAt: row.sent_at,
      readAt: row.read_at,
    };
  }
}

// ==================== Placeholder for Memory/Postgres ====================

class PlaceholderRepositoryLayer implements RepositoryLayer {
  async health(): Promise<RepositoryHealth> {
    return {
      ready: false,
      message: "Repository layer masih placeholder. Silakan setup database.",
      storage: "unconfigured",
      migrationsApplied: false,
    };
  }

  async initialize(): Promise<void> {
    // No-op for placeholder
  }

  users = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByTelegramId: async () => null,
    update: async () => null,
    list: async () => [],
  };

  positions = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByUserId: async () => [],
    getActiveByUserId: async () => [],
    update: async () => null,
    delete: async () => {},
    list: async () => [],
  };

  trades = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByUserId: async () => [],
    getByPositionId: async () => [],
    list: async () => [],
  };

  walletTargets = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByUserId: async () => [],
    getActiveByUserId: async () => [],
    update: async () => null,
    delete: async () => {},
  };

  screeningCandidates = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByPoolAddress: async () => null,
    update: async () => null,
    listByStatus: async () => [],
    list: async () => [],
  };

  aiDecisions = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByUserId: async () => [],
    getByPositionId: async () => [],
    list: async () => [],
  };

  notifications = {
    create: async () => { throw new Error("Not implemented"); },
    getById: async () => null,
    getByUserId: async () => [],
    getUnreadByUserId: async () => [],
    markAsRead: async () => {},
  };
}

// ==================== Factory Function ====================

let repositoryInstance: RepositoryLayer | null = null;

export async function createRepositoryLayer(config?: {
  type?: "sqlite" | "postgres" | "memory";
  connectionString?: string;
}): Promise<RepositoryLayer> {
  const dbType = config?.type || "sqlite";

  if (repositoryInstance) {
    return repositoryInstance;
  }

  if (dbType === "sqlite") {
    const repo = new SQLiteRepositoryLayer();
    await repo.initialize();
    repositoryInstance = repo;
    return repo;
  }

  // Default to placeholder
  repositoryInstance = new PlaceholderRepositoryLayer();
  return repositoryInstance;
}

export const repositories = {
  getInstance: async () => createRepositoryLayer(),
};

export default repositories;
