import * as fs from "fs";
import * as path from "path";
import logger from "../utils/logger";

export type TradeType = "buy" | "sell";
export type TradeStatus = "pending" | "success" | "failed";

export interface TradeJournalEntry {
  id: string;
  chatId: number;
  type: TradeType;
  tokenMint: string;
  amountSol?: number;
  amountToken?: number;
  proceedsSol?: number;
  amountUsd?: number;
  priceUsd?: number;
  feeMode: string;
  slippageBps: number;
  status: TradeStatus;
  txHash?: string;
  error?: string;
  method?: "jupiter" | "paper" | "none";
  paperPnl?: number;
  timestamp: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface TradeJournalStore {
  addEntry(entry: Omit<TradeJournalEntry, "id" | "timestamp">): TradeJournalEntry;
  updateEntry(
    id: string,
    updates: Partial<Pick<TradeJournalEntry, "status" | "txHash" | "error" | "completedAt">>,
  ): TradeJournalEntry | null;
  getEntries(chatId?: number): TradeJournalEntry[];
  getEntriesByToken(tokenMint: string): TradeJournalEntry[];
  getRecentEntries(limit?: number): TradeJournalEntry[];
  exportJournal(): TradeJournalEntry[];
}

function generateTradeId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `trade_${timestamp}_${random}`;
}

function resolveJournalPath(): string {
  const rootDir = path.resolve(__dirname, "../../../../");
  const journalDir = path.join(rootDir, "data", "journal");
  const journalFile = path.join(journalDir, "trades.json");

  if (!fs.existsSync(journalDir)) {
    fs.mkdirSync(journalDir, { recursive: true });
  }

  return journalFile;
}

function loadJournal(): TradeJournalEntry[] {
  const journalPath = resolveJournalPath();

  if (!fs.existsSync(journalPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(journalPath, "utf-8");
    return JSON.parse(raw) as TradeJournalEntry[];
  } catch (error) {
    logger.error("Failed to load trade journal, starting fresh.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

function saveJournal(entries: TradeJournalEntry[]): void {
  const journalPath = resolveJournalPath();

  try {
    fs.writeFileSync(journalPath, JSON.stringify(entries, null, 2), "utf-8");
  } catch (error) {
    logger.error("Failed to save trade journal.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

class FileBasedTradeJournal implements TradeJournalStore {
  private entries: TradeJournalEntry[];

  constructor() {
    this.entries = loadJournal();
    logger.info("Trade journal loaded.", {
      count: this.entries.length,
    });
  }

  addEntry(
    entry: Omit<TradeJournalEntry, "id" | "timestamp">,
  ): TradeJournalEntry {
    const newEntry: TradeJournalEntry = {
      ...entry,
      id: generateTradeId(),
      timestamp: new Date().toISOString(),
    };

    this.entries.push(newEntry);
    saveJournal(this.entries);

    logger.info("Trade journal entry added.", {
      id: newEntry.id,
      type: newEntry.type,
      token: newEntry.tokenMint,
      status: newEntry.status,
    });

    return newEntry;
  }

  updateEntry(
    id: string,
    updates: Partial<
      Pick<TradeJournalEntry, "status" | "txHash" | "error" | "completedAt">
    >,
  ): TradeJournalEntry | null {
    const index = this.entries.findIndex((entry) => entry.id === id);

    if (index === -1) {
      logger.warn("Trade journal entry not found for update.", { id });
      return null;
    }

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
    };

    saveJournal(this.entries);

    logger.info("Trade journal entry updated.", {
      id,
      status: updates.status,
    });

    return this.entries[index];
  }

  getEntries(chatId?: number): TradeJournalEntry[] {
    if (chatId !== undefined) {
      return this.entries.filter((entry) => entry.chatId === chatId);
    }

    return [...this.entries];
  }

  getEntriesByToken(tokenMint: string): TradeJournalEntry[] {
    return this.entries.filter((entry) => entry.tokenMint === tokenMint);
  }

  getRecentEntries(limit = 20): TradeJournalEntry[] {
    return [...this.entries]
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
      )
      .slice(0, limit);
  }

  exportJournal(): TradeJournalEntry[] {
    return [...this.entries];
  }

  persist(): void {
    saveJournal(this.entries);
    logger.info("Trade journal persisted.", {
      count: this.entries.length,
    });
  }
}

let singleton: TradeJournalStore | null = null;

export function createTradeJournal(): TradeJournalStore {
  if (!singleton) {
    singleton = new FileBasedTradeJournal();
  }

  return singleton;
}

function formatTradeAmount(entry: TradeJournalEntry): string {
  if (entry.type === "sell") {
    if (entry.amountToken !== undefined) {
      return `- Token Amount: ${entry.amountToken.toFixed(6)}`;
    }

    if (entry.amountSol !== undefined) {
      return `- Amount: ${entry.amountSol.toFixed(4)} SOL`;
    }

    return "- Amount: -";
  }

  if (entry.amountSol !== undefined) {
    return `- Input: ${entry.amountSol.toFixed(4)} SOL`;
  }

  if (entry.amountToken !== undefined) {
    return `- Token Amount: ${entry.amountToken.toFixed(6)}`;
  }

  return "- Amount: -";
}

export function formatTradeEntry(entry: TradeJournalEntry): string {
  const statusIcon =
    entry.status === "success"
      ? "[OK]"
      : entry.status === "failed"
        ? "[ERR]"
        : "[...]";

  const lines = [
    `${statusIcon} ${entry.type.toUpperCase()} - ${entry.tokenMint.slice(0, 8)}...`,
    `- ID: ${entry.id}`,
    formatTradeAmount(entry),
    `- Fee Mode: ${entry.feeMode}`,
    `- Slippage: ${entry.slippageBps} bps`,
    `- Status: ${entry.status}`,
    `- Time: ${new Date(entry.timestamp).toLocaleString()}`,
  ];

  if (entry.proceedsSol !== undefined) {
    lines.push(`- Proceeds: ${entry.proceedsSol.toFixed(4)} SOL`);
  }

  if (entry.txHash) {
    lines.push(`- TX: ${entry.txHash}`);
  }

  if (entry.error) {
    lines.push(`- Error: ${entry.error}`);
  }

  if (entry.paperPnl !== undefined) {
    lines.push(
      `- PnL: ${entry.paperPnl >= 0 ? "+" : ""}${entry.paperPnl.toFixed(4)} SOL`,
    );
  }

  if (entry.completedAt) {
    lines.push(`- Completed: ${new Date(entry.completedAt).toLocaleString()}`);
  }

  return lines.join("\n");
}

export function formatRecentTrades(entries: TradeJournalEntry[]): string {
  if (entries.length === 0) {
    return [
      "TRADE JOURNAL",
      "",
      "Belum ada trade yang tercatat.",
      "Mulai trading untuk melihat history di sini.",
    ].join("\n");
  }

  const lines = [
    "TRADE JOURNAL - Recent Trades",
    "",
    `Total entries: ${entries.length}`,
    "",
  ];

  for (const entry of entries.slice(0, 10)) {
    lines.push(formatTradeEntry(entry), "");
  }

  return lines.join("\n").trimEnd();
}
