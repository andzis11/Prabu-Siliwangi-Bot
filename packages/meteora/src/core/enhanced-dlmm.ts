import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import * as bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

import {
  MeteoraPosition,
  MeteoraPoolInfo,
  MeteoraPnL,
  MeteoraPreset,
  WalletConfig,
  MeteoraConfig,
  RPCEndpoint,
  SolResolveResult,
  PoolScreeningResult,
  PositionStatus,
  SyncResult,
  ExtremeModeConfig,
  DEFAULT_EXTREME_CONFIG,
  SOL_MINT,
  DLMM_PNL_API,
  ExtremeSession,
  BinHealth,
  BinVisualization,
  FeeHarvestResult,
  ILCalculation,
  APRTracking,
  MeteoraPositionHealth,
} from "../types";

export class EnhancedDLMMService {
  private connection: Connection;
  private config: MeteoraConfig;
  private configPath: string;
  private envPath: string;
  private sessions: Map<number, ExtremeSession> = new Map();
  private extremeConfig: ExtremeModeConfig;

  constructor(
    rpcUrl: string,
    configPath?: string,
    envPath?: string,
    extremeConfig?: Partial<ExtremeModeConfig>
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.configPath = configPath || path.join(process.cwd(), "meteora-config.json");
    this.envPath = envPath || path.join(process.cwd(), ".env");
    this.extremeConfig = { ...DEFAULT_EXTREME_CONFIG, ...extremeConfig };
    this.config = this.loadConfig();
  }

  // ===================== Config Management =====================

  private loadConfig(): MeteoraConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const config = JSON.parse(data);
        return {
          wallets: config.wallets || {},
          activeWalletId: config.activeWalletId || null,
          positions: config.positions || {},
          presets: config.presets || {},
          activePresetId: config.activePresetId || null,
        };
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error instanceof Error ? error.message : String(error));
    }

    return {
      wallets: {},
      activeWalletId: null,
      positions: {},
      presets: {},
      activePresetId: null,
    };
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    } catch (error) {
      console.error(`Failed to save config to ${this.configPath}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private loadEnvFile(): void {
    try {
      if (!fs.existsSync(this.envPath)) return;

      const envFile = fs.readFileSync(this.envPath, "utf8");
      envFile.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key) process.env[key] = val;
      });
    } catch (error) {
      console.warn(`Failed to load env file ${this.envPath}:`, error);
    }
  }

  private saveEnvFile(): void {
    try {
      this.loadEnvFile();

      const existingLines: string[] = [];
      if (fs.existsSync(this.envPath)) {
        const content = fs.readFileSync(this.envPath, "utf8");
        existingLines.push(...content.split("\n"));
      }

      const walletLines: string[] = [];
      Object.values(this.config.wallets).forEach(wallet => {
        if (wallet.envKey) {
          const value = process.env[wallet.envKey];
          if (value) {
            walletLines.push(`${wallet.envKey}=${value}`);
          }
        }
      });

      // Filter out existing wallet lines and keep other env vars
      const otherLines = existingLines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return true;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) return true;
        const key = trimmed.slice(0, eqIdx).trim();
        return !key.startsWith("WALLET_");
      });

      const allLines = [...otherLines, ...walletLines];
      fs.writeFileSync(this.envPath, allLines.join("\n"), "utf8");
    } catch (error) {
      console.error(`Failed to save env file ${this.envPath}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to save env file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================== Wallet Management =====================

  private getNextWalletEnvKey(): string {
    let i = 1;
    while (process.env[`WALLET_${i}`]) i++;
    return `WALLET_${i}`;
  }

  getActiveWallet(): Keypair | null {
    if (!this.config.activeWalletId || !this.config.wallets[this.config.activeWalletId]) {
      return null;
    }

    const wallet = this.config.wallets[this.config.activeWalletId];
    const pk = wallet.envKey ? process.env[wallet.envKey] : null;
    if (!pk) {
      throw new Error(`Private key not found. Please set ${wallet.envKey} in .env file`);
    }

    try {
      return Keypair.fromSecretKey(bs58.default.decode(pk));
    } catch (error) {
      throw new Error(`Invalid private key format for wallet ${wallet.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  addWallet(name: string, privateKey: string): WalletConfig {
    let keypair: Keypair;
    try {
      keypair = Keypair.fromSecretKey(bs58.default.decode(privateKey));
    } catch (error) {
      throw new Error(`Invalid private key format: ${error instanceof Error ? error.message : String(error)}`);
    }

    const id = keypair.publicKey.toBase58().slice(0, 8);
    const envKey = this.getNextWalletEnvKey();

    // Store private key in environment variable
    process.env[envKey] = privateKey;
    this.saveEnvFile();

    const wallet: WalletConfig = {
      id,
      name,
      pubkey: keypair.publicKey.toBase58(),
      envKey,
    };

    this.config.wallets[id] = wallet;
    if (!this.config.activeWalletId) {
      this.config.activeWalletId = id;
    }

    this.saveConfig();
    return wallet;
  }

  switchWallet(walletId: string): void {
    if (!this.config.wallets[walletId]) {
      throw new Error(`Wallet ${walletId} not found`);
    }
    this.config.activeWalletId = walletId;
    this.saveConfig();
  }

  deleteWallet(walletId: string): void {
    const wallet = this.config.wallets[walletId];
    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    // Remove from environment
    if (wallet.envKey) {
      delete process.env[wallet.envKey];
    }

    // Remove from config
    delete this.config.wallets[walletId];

    // Update active wallet if needed
    if (this.config.activeWalletId === walletId) {
      this.config.activeWalletId = Object.keys(this.config.wallets)[0] || null;
    }

    this.saveEnvFile();
    this.saveConfig();
  }

  listWallets(): WalletConfig[] {
    return Object.values(this.config.wallets);
  }

  // ===================== Preset Management =====================

  getActivePreset(): MeteoraPreset | null {
    if (!this.config.presets) this.config.presets = {};

    if (this.config.activePresetId && this.config.presets[this.config.activePresetId]) {
      return this.config.presets[this.config.activePresetId];
    }

    const presets = Object.values(this.config.presets);
    return presets.length > 0 ? presets[0] : null;
  }

  addPreset(id: string, name: string, sol: number | "max" | string, range: number, strategy: StrategyType): MeteoraPreset {
    if (!this.config.presets) this.config.presets = {};

    const preset: MeteoraPreset = {
      id,
      name,
      sol,
      range,
      strategy,
    };

    this.config.presets[id] = preset;
    this.saveConfig();
    return preset;
  }

  switchPreset(presetId: string): void {
    if (!this.config.presets[presetId]) {
      throw new Error(`Preset ${presetId} not found`);
    }
    this.config.activePresetId = presetId;
    this.saveConfig();
  }

  deletePreset(presetId: string): void {
    if (!this.config.presets[presetId]) {
      throw new Error(`Preset ${presetId} not found`);
    }

    delete this.config.presets[presetId];
    if (this.config.activePresetId === presetId) {
      this.config.activePresetId = Object.keys(this.config.presets)[0] || null;
    }
    this.saveConfig();
  }

  listPresets(): MeteoraPreset[] {
    return Object.values(this.config.presets || {});
  }

  // ===================== Pool Operations =====================

  async getPoolInfo(poolAddress: string): Promise<MeteoraPoolInfo> {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();
    const activeBin = await dlmmPool.getActiveBin();

    const tokenXMint = dlmmPool.lbPair.tokenXMint.toBase58();
    const tokenYMint = dlmmPool.lbPair.tokenYMint.toBase58();

    return {
      address: poolAddress,
      tokenXSymbol: tokenXMint === SOL_MINT ? "SOL" : "TOKEN-X",
      tokenYSymbol: tokenYMint === SOL_MINT ? "SOL" : "TOKEN-Y",
      activeBin: activeBin.binId,
      binStep: dlmmPool.lbPair.binStep,
      baseFee: 0.01, // Placeholder - actual fee structure may vary
    };
  }

  private solToLamports(sol: number): BN {
    return new BN(Math.floor(sol * LAMPORTS_PER_SOL));
  }

  private async resolveSolAmount(
    solAmount: number | "max" | string,
    pubkey: string
  ): Promise<SolResolveResult> {
    if (solAmount === "max") {
      const bal = await this.connection.getBalance(new PublicKey(pubkey));
      const sol = parseFloat((bal / LAMPORTS_PER_SOL - this.extremeConfig.feeBuffer).toFixed(4));
      return {
        amount: Math.max(sol, 0),
        isPercent: false,
        isMax: true,
      };
    }

    if (typeof solAmount === "string" && solAmount.endsWith("%")) {
      const bal = await this.connection.getBalance(new PublicKey(pubkey));
      const pct = parseFloat(solAmount.slice(0, -1)) / 100;
      const usable = parseFloat((bal * pct / LAMPORTS_PER_SOL).toFixed(4));
      return {
        amount: Math.max(usable - this.extremeConfig.feeBuffer, 0),
        isPercent: true,
        isMax: false,
      };
    }

    const amount = typeof solAmount === "number" ? solAmount : parseFloat(solAmount);
    return {
      amount,
      isPercent: false,
      isMax: false,
    };
  }

  async getSolBalance(pubkey: string): Promise<number> {
    const bal = await this.connection.getBalance(new PublicKey(pubkey));
    return parseFloat((bal / LAMPORTS_PER_SOL).toFixed(4));
  }

  // ===================== Liquidity Management =====================

  async addLiquidity(
    poolAddress: string,
    solAmount: number | "max" | string,
    rangePercent: number,
    strategy: StrategyType
  ): Promise<MeteoraPosition> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const resolved = await this.resolveSolAmount(solAmount, wallet.publicKey.toBase58());
    const finalSol = resolved.amount;

    if (finalSol < this.extremeConfig.minSolAmount) {
      throw new Error(`Insufficient SOL (${finalSol} SOL). Minimum ${this.extremeConfig.minSolAmount} SOL + ${this.extremeConfig.feeBuffer} for fees.`);
    }

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();

    const activeBin = await dlmmPool.getActiveBin();
    const binStep = dlmmPool.lbPair.binStep;
    const totalBins = Math.ceil((rangePercent / 100) / (binStep / 10000));

    const minBinId = activeBin.binId - totalBins;
    const maxBinId = activeBin.binId;

    const positionKeypair = Keypair.generate();
    const lamports = this.solToLamports(finalSol);

    const createTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      user: wallet.publicKey,
      totalXAmount: new BN(0),
      totalYAmount: lamports,
      strategy: { maxBinId, minBinId, strategyType: strategy },
    });

    const txHash = await sendAndConfirmTransaction(
      this.connection,
      Array.isArray(createTx) ? createTx[0] : createTx,
      [wallet, positionKeypair]
    );

    const cachedBinIds: number[] = [];
    for (let i = minBinId; i <= maxBinId; i++) cachedBinIds.push(i);

    const position: MeteoraPosition = {
      publicKey: positionKeypair.publicKey.toBase58(),
      poolAddress,
      minBinId,
      maxBinId,
      activeBinAtAdd: activeBin.binId,
      solAmount: finalSol,
      rangePercent,
      strategyStr: StrategyType[strategy],
      addedAt: new Date().toISOString(),
      txHash,
      cachedBinIds,
      walletId: wallet.publicKey.toBase58().slice(0, 8),
    };

    // Save to config
    this.config.positions[position.publicKey] = position;
    this.saveConfig();

    return position;
  }

  async removeLiquidity(positionKey: string): Promise<string[]> {
    const position = this.config.positions[positionKey];
    if (!position) {
      throw new Error(`Position ${positionKey} not found`);
    }

    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(position.poolAddress));

    const removeTx = await dlmmPool.removeLiquidity({
      position: new PublicKey(positionKey),
      user: wallet.publicKey,
      fromBinId: position.minBinId,
      toBinId: position.maxBinId,
      bps: new BN(10000),
      shouldClaimAndClose: true,
    });

    const txList = Array.isArray(removeTx) ? removeTx : [removeTx];
    const txHashes = await Promise.all(
      txList.map(tx =>
        sendAndConfirmTransaction(this.connection, tx, [wallet], {
          skipPreflight: true,
          commitment: "processed",
        })
      )
    );

    // Remove from config
    delete this.config.positions[positionKey];
    this.saveConfig();

    return txHashes;
  }

  // ===================== Position Monitoring =====================

  async getPositionStatus(positionKey: string): Promise<PositionStatus | null> {
    const position = this.config.positions[positionKey];
    if (!position) return null;

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(position.poolAddress));
    const activeBin = await dlmmPool.getActiveBin();

    const wallet = this.getActiveWallet();
    let pnl: MeteoraPnL | undefined;

    if (wallet) {
      try {
        pnl = await this.fetchPositionPnL(position.poolAddress, wallet.publicKey.toBase58());
      } catch (error) {
        console.warn(`Failed to fetch PnL for position ${positionKey}:`, error);
      }
    }

    return {
      positionKey,
      poolAddress: position.poolAddress,
      currentBin: activeBin.binId,
      minBin: position.minBinId,
      maxBin: position.maxBinId,
      inRange: activeBin.binId >= position.minBinId && activeBin.binId <= position.maxBinId,
      pnl,
      positionData: position,
    };
  }

  async syncPositions(): Promise<SyncResult> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const allPositions = await DLMM.getAllLbPairPositionsByUser(this.connection, wallet.publicKey);
    let added = 0;
    let total = 0;
    const onChainKeys = new Set<string>();

    for (const [poolAddress, poolData] of allPositions) {
      const positions = poolData.lbPairPositionsData || [];
      const poolAddressStr = typeof poolAddress === 'string' ? poolAddress :
                           (poolAddress as any).toBase58 ? (poolAddress as any).toBase58() : String(poolAddress);
      total += positions.length;

      for (const pos of positions) {
        const posKey = pos.publicKey.toBase58();
        onChainKeys.add(posKey);

        if (this.config.positions[posKey]) continue;

        const binData = pos.positionData?.positionBinData || [];
        const binIds = binData.map(b => b.binId);
        const totalYLamports = binData.reduce((sum, b) => sum + (Number(b.positionYAmount) || 0), 0);

        const syncedPosition: MeteoraPosition = {
          publicKey: posKey,
          poolAddress: poolAddressStr,
          minBinId: binIds.length > 0 ? Math.min(...binIds) : 0,
          maxBinId: binIds.length > 0 ? Math.max(...binIds) : 0,
          activeBinAtAdd: 0,
          solAmount: parseFloat((totalYLamports / 1e9).toFixed(4)),
          rangePercent: 0,
          strategyStr: "synced",
          addedAt: new Date().toISOString(),
          txHash: "synced",
          cachedBinIds: binIds,
          walletId: this.config.activeWalletId || "unknown",
          synced: true,
        };

        this.config.positions[posKey] = syncedPosition;
        added++;
      }
    }

    // Remove positions that are no longer on-chain
    let removed = 0;
    for (const posKey of Object.keys(this.config.positions)) {
      if (!onChainKeys.has(posKey)) {
        delete this.config.positions[posKey];
        removed++;
      }
    }

    this.saveConfig();
    return { total, added, removed };
  }

  async fetchPositionPnL(poolAddress: string, owner: string): Promise<MeteoraPnL> {
    const url = `${DLMM_PNL_API}?pool=${poolAddress}&owner=${owner}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PnL: ${response.statusText}`);
    }

    const data = await response.json() as any;

    return {
      pnlUsd: data.pnlUsd || 0,
      pnlSol: data.pnlSol || 0,
      pnlPctChange: data.pnlPctChange || 0,
      unrealizedPnlSol: data.unrealizedPnlSol || 0,
      unclaimedFeeTokenX: data.unclaimedFeeTokenX || {},
      unclaimedFeeTokenY: data.unclaimedFeeTokenY || {},
      allTimeFees: data.allTimeFees || {},
      tokenXSymbol: data.tokenXSymbol || "",
      tokenYSymbol: data.tokenYSymbol || "",
      solPrice: data.solPrice || 0,
    };
  }

  // ===================== Extreme Mode Operations =====================

  async openExtremePosition(poolAddress: string, solAmount: number | "max" | string): Promise<{
    positionKey: string;
    targetBinId: number;
    txHash: string;
    solUsed: number;
  }> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const resolved = await this.resolveSolAmount(solAmount, wallet.publicKey.toBase58());
    const finalSol = resolved.amount;

    if (finalSol < this.extremeConfig.minSolAmount) {
      throw new Error(`Insufficient SOL (${finalSol} SOL). Minimum ${this.extremeConfig.minSolAmount} SOL + ${this.extremeConfig.feeBuffer} for fees.`);
    }

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();
    const activeBin = await dlmmPool.getActiveBin();
    const targetBinId = activeBin.binId;

    const newPosition = Keypair.generate();
    const createTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newPosition.publicKey,
      user: wallet.publicKey,
      totalXAmount: new BN(0),
      totalYAmount: this.solToLamports(finalSol),
      strategy: { minBinId: targetBinId, maxBinId: targetBinId, strategyType: StrategyType.BidAsk },
    });

    const txHash = await sendAndConfirmTransaction(
      this.connection,
      createTx,
      [wallet, newPosition]
    );

    // Save the position
    const position: MeteoraPosition = {
      publicKey: newPosition.publicKey.toBase58(),
      poolAddress,
      minBinId: targetBinId,
      maxBinId: targetBinId,
      activeBinAtAdd: targetBinId,
      solAmount: finalSol,
      rangePercent: 0,
      strategyStr: StrategyType[StrategyType.BidAsk],
      addedAt: new Date().toISOString(),
      txHash,
      cachedBinIds: [targetBinId],
      walletId: wallet.publicKey.toBase58().slice(0, 8),
    };

    this.config.positions[position.publicKey] = position;
    this.saveConfig();

    return {
      positionKey: position.publicKey,
      targetBinId,
      txHash,
      solUsed: finalSol,
    };
  }

  async withdrawAndReaddToTargetBin(
    poolAddress: string,
    positionKey: string,
    targetBinId: number
  ): Promise<string | "no_token"> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();

    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    const userPos = userPositions.find(p => p.publicKey.toBase58() === positionKey);
    if (!userPos) throw new Error("Position not found");

    const binData = userPos.positionData.positionBinData;
    if (!binData || binData.length === 0) return "no_token";

    const tokenXMint = dlmmPool.lbPair.tokenXMint.toBase58();
    const tokenYMint = dlmmPool.lbPair.tokenYMint.toBase58();
    const isTokenX = tokenXMint !== SOL_MINT;
    const tokenMint = isTokenX ? tokenXMint : tokenYMint;
    const binIds = binData.map(b => b.binId);

    const removeTx = await dlmmPool.removeLiquidity({
      position: new PublicKey(positionKey),
      user: wallet.publicKey,
      fromBinId: binIds[0],
      toBinId: binIds[binIds.length - 1],
      bps: new BN(10000),
      shouldClaimAndClose: false,
    });

    const txList = Array.isArray(removeTx) ? removeTx : [removeTx];
    await Promise.all(
      txList.map(tx =>
        sendAndConfirmTransaction(this.connection, tx, [wallet], {
          skipPreflight: true,
          commitment: "processed",
        })
      )
    );

    let tokenBalance = new BN(0);
    const deadline = Date.now() + 10000; // 10 second timeout

    while (Date.now() < deadline) {
      try {
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          wallet.publicKey,
          { mint: new PublicKey(tokenMint) },
          "processed"
        );

        if (tokenAccounts.value.length > 0) {
          const amount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
          tokenBalance = new BN(amount);
          if (tokenBalance.gtn(0)) break;
        }
      } catch (error) {
        // Ignore errors and retry
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (tokenBalance.eqn(0)) {
      console.log("[Extreme] No token balance after withdraw, skipping readd");
      return "no_token";
    }

    await dlmmPool.refetchStates();

    const addTx = await dlmmPool.addLiquidityByStrategy({
      positionPubKey: new PublicKey(positionKey),
      user: wallet.publicKey,
      totalXAmount: isTokenX ? tokenBalance : new BN(0),
      totalYAmount: isTokenX ? new BN(0) : tokenBalance,
      strategy: { minBinId: targetBinId, maxBinId: targetBinId, strategyType: StrategyType.BidAsk },
    });

    const addHash = await sendAndConfirmTransaction(
      this.connection,
      addTx,
      [wallet],
      { skipPreflight: true, commitment: "processed" }
    );

    return addHash;
  }

  async closeExtremePositionOnly(poolAddress: string, positionKey: string): Promise<string[]> {
    const wallet = this.getActiveWallet();
    if (!wallet) throw new Error("No active wallet");

    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();

    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    const userPos = userPositions.find(p => p.publicKey.toBase58() === positionKey);
    if (!userPos) return [];

    const binIds = userPos.positionData.positionBinData.map(b => b.binId);
    if (binIds.length > 0) {
      const removeTx = await dlmmPool.removeLiquidity({
        position: new PublicKey(positionKey),
        user: wallet.publicKey,
        fromBinId: binIds[0],
        toBinId: binIds[binIds.length - 1],
        bps: new BN(10000),
        shouldClaimAndClose: true,
      });

      const txList = Array.isArray(removeTx) ? removeTx : [removeTx];
      return await Promise.all(
        txList.map(tx =>
          sendAndConfirmTransaction(this.connection, tx, [wallet], {
            skipPreflight: true,
            commitment: "processed",
          })
        )
      );
    } else {
      try {
        const closeTx = await dlmmPool.closePosition({
          owner: wallet.publicKey,
          position: userPos,
        });
        const hash = await sendAndConfirmTransaction(
          this.connection,
          closeTx,
          [wallet],
          { skipPreflight: true, commitment: "processed" }
        );
        return [hash];
      } catch (error) {
        console.error("Failed to close position:", error);
        return [];
      }
    }
  }

  // ===================== Session Management =====================

  startExtremeSession(
    sessionId: number,
    poolAddress: string,
    solAmount: number | "max" | string
  ): ExtremeSession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: ExtremeSession = {
      chatId: sessionId,
      poolAddress,
      positionKey: "",
      targetBinId: 0,
      solAmount,
      status: "waiting",
      cycleCount: 0,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  stopExtremeSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.timer) {
      clearTimeout(session.timer);
    }

    session.status = "stopped";
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: number): ExtremeSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): ExtremeSession[] {
    return Array.from(this.sessions.values());
  }

  // ===================== Utility Methods =====================

  static extractPoolAddress(input: string): string | null {
    const match = input.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    return match ? match[0] : null;
  }

  private rangeToBins(rangePercent: number, binStep: number): number {
    return Math.ceil((rangePercent / 100) / (binStep / 10000));
  }

  private parseStrategy(strategy: string): StrategyType {
    switch (strategy.toLowerCase()) {
      case "spot": return StrategyType.Spot;
      case "curve": return StrategyType.Curve;
      case "bidask": return StrategyType.BidAsk;
      default: return StrategyType.BidAsk;
    }
  }

  static isPoolInput(input: string): boolean {
    return this.extractPoolAddress(input) !== null;
  }

  static shortKey(pubkey: string): string {
    return pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
  }

  static solLabel(amount: number): string {
    return amount.toFixed(4) + " SOL";
  }

  // ===================== Active Bin Monitor =====================

  async getBinVisualization(poolAddress: string, positionKey?: string): Promise<BinVisualization> {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();
    const activeBin = await dlmmPool.getActiveBin();

    const poolInfo = await this.getPoolInfo(poolAddress);
    const binStep = poolInfo.binStep;

    let positionBins: number[] = [];
    if (positionKey && this.config.positions[positionKey]) {
      positionBins = this.config.positions[positionKey].cachedBinIds;
    }

    try {
      const binResult = await dlmmPool.getBinsAroundActiveBin(25, 25);
      const allBins = Array.isArray(binResult) ? binResult : binResult.bins || [];

      const bins: BinHealth[] = allBins.map((bin: any) => {
        const price = Math.pow(1 + binStep / 10000, bin.binId);
        const distance = bin.binId - activeBin.binId;

        let status: BinHealth["status"] = "active";
        if (bin.binId === activeBin.binId) {
          status = "active";
        } else if (distance < 0) {
          status = distance < -10 ? "far_below" : "below";
        } else {
          status = distance > 10 ? "far_above" : "above";
        }

        return {
          binId: bin.binId,
          price,
          liquidity: Number(bin.liquidity || 0),
          isActive: bin.binId === activeBin.binId,
          distanceFromCurrent: distance,
          status,
        };
      });

      const position = positionKey ? this.config.positions[positionKey] : null;

      return {
        bins,
        currentBin: activeBin.binId,
        rangeMin: position ? position.minBinId : Math.min(...bins.map(b => b.binId)),
        rangeMax: position ? position.maxBinId : Math.max(...bins.map(b => b.binId)),
        positionBins,
      };
    } catch (error) {
      console.warn("Failed to get bin visualization:", error);
      return {
        bins: [],
        currentBin: activeBin.binId,
        rangeMin: activeBin.binId - 10,
        rangeMax: activeBin.binId + 10,
        positionBins: [],
      };
    }
  }

  formatBinVisualization(vis: BinVisualization): string {
    const lines = [
      `📊 *Bin Visualization*`,
      ``,
      `Current Bin: \`${vis.currentBin}\``,
      `Position Range: \`${vis.rangeMin} - ${vis.rangeMax}\``,
      ``,
      `*Bins:*`,
    ];

    for (const bin of vis.bins) {
      let icon = "  ";
      if (bin.isActive) icon = "🟡";
      else if (vis.positionBins.includes(bin.binId)) icon = "🔵";
      else if (bin.status === "far_below") icon = "⬜";
      else if (bin.status === "far_above") icon = "⬛";
      else if (bin.status === "below") icon = "🔽";
      else if (bin.status === "above") icon = "🔼";

      const priceStr = bin.price.toFixed(6);
      const distStr = bin.distanceFromCurrent >= 0 ? `+${bin.distanceFromCurrent}` : `${bin.distanceFromCurrent}`;

      lines.push(`${icon} Bin \`${bin.binId}\` (\`${distStr}\`) | Price: \`${priceStr}\``);
    }

    return lines.join("\n");
  }

  // ===================== Fee Harvest =====================

  async harvestFees(positionKey: string): Promise<FeeHarvestResult> {
    const position = this.config.positions[positionKey];
    if (!position) {
      return { success: false, feesClaimed: { tokenX: 0, tokenY: 0, tokenXSymbol: "", tokenYSymbol: "" }, error: "Position not found" };
    }

    const wallet = this.getActiveWallet();
    if (!wallet) {
      return { success: false, feesClaimed: { tokenX: 0, tokenY: 0, tokenXSymbol: "", tokenYSymbol: "" }, error: "No active wallet" };
    }

    try {
      const dlmmPool = await DLMM.create(this.connection, new PublicKey(position.poolAddress));
      await dlmmPool.refetchStates();

      const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
      const userPos = userPositions.find(p => p.publicKey.toBase58() === positionKey);
      if (!userPos) {
        return { success: false, feesClaimed: { tokenX: 0, tokenY: 0, tokenXSymbol: "", tokenYSymbol: "" }, error: "Position not found on-chain" };
      }

      const claimTx = await dlmmPool.claimLMReward({
        position: userPos,
        owner: wallet.publicKey,
      });

      const txList = Array.isArray(claimTx) ? claimTx : [claimTx];
      const txHash = await sendAndConfirmTransaction(this.connection, txList[0], [wallet], {
        skipPreflight: true,
        commitment: "processed",
      });

      const poolInfo = await this.getPoolInfo(position.poolAddress);

      return {
        success: true,
        signature: txHash,
        feesClaimed: {
          tokenX: 0,
          tokenY: 0,
          tokenXSymbol: poolInfo.tokenXSymbol,
          tokenYSymbol: poolInfo.tokenYSymbol,
        },
      };
    } catch (error) {
      return {
        success: false,
        feesClaimed: { tokenX: 0, tokenY: 0, tokenXSymbol: "", tokenYSymbol: "" },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================== IL Calculator =====================

  async calculateIL(positionKey: string): Promise<ILCalculation | null> {
    const position = this.config.positions[positionKey];
    if (!position) return null;

    const poolInfo = await this.getPoolInfo(position.poolAddress);
    const currentBin = poolInfo.activeBin;
    const binStep = poolInfo.binStep;

    const entryPrice = Math.pow(1 + binStep / 10000, position.activeBinAtAdd);
    const currentPrice = Math.pow(1 + binStep / 10000, currentBin);

    const priceChangePct = ((currentPrice - entryPrice) / entryPrice) * 100;

    const holdingValueSol = position.solAmount * 2;
    const positionValueSol = position.solAmount * (1 + currentPrice / entryPrice);

    const impermanentLossSol = holdingValueSol - positionValueSol;
    const impermanentLossPct = (impermanentLossSol / holdingValueSol) * 100;

    const lossRatio = Math.abs(impermanentLossSol) / position.solAmount;

    return {
      entryPrice,
      currentPrice,
      priceChangePct,
      impermanentLossSol: Math.abs(impermanentLossSol),
      impermanentLossPct: Math.abs(impermanentLossPct),
      holdingValueSol,
      positionValueSol,
      lossRatio,
    };
  }

  formatIL(il: ILCalculation): string {
    return [
      `📉 *Impermanent Loss Calculation*`,
      ``,
      `*Entry Price:* \`${il.entryPrice.toFixed(8)}\``,
      `*Current Price:* \`${il.currentPrice.toFixed(8)}\``,
      `*Price Change:* ${il.priceChangePct >= 0 ? "+" : ""}${il.priceChangePct.toFixed(2)}%`,
      ``,
      `*Holding Value:* ${il.holdingValueSol.toFixed(4)} SOL`,
      `*Position Value:* ${il.positionValueSol.toFixed(4)} SOL`,
      ``,
      `*IL Amount:* ${il.impermanentLossSol.toFixed(6)} SOL`,
      `*IL %:* ${il.impermanentLossPct.toFixed(4)}%`,
      `*Loss Ratio:* ${il.lossRatio.toFixed(4)}x`,
    ].join("\n");
  }

  // ===================== APR Tracking =====================

  async calculateAPR(poolAddress: string, positionKey?: string): Promise<APRTracking> {
    const poolInfo = await this.getPoolInfo(poolAddress);
    const binStep = poolInfo.binStep;

    const volume24h = poolInfo.volume24h || (poolInfo.tvl || 10000) * 0.1;
    const fees24h = volume24h * (poolInfo.baseFee || 0.01);
    const fees7d = fees24h * 7;
    const fees30d = fees24h * 30;
    const totalFees = fees30d * 3;

    let positionValue = 0;
    if (positionKey && this.config.positions[positionKey]) {
      positionValue = this.config.positions[positionKey].solAmount;
    } else {
      positionValue = volume24h * 0.1;
    }

    const dailyRate = positionValue > 0 ? fees24h / positionValue : 0;
    const feeApr = dailyRate * 365 * 100;
    const feeApy = (Math.pow(1 + dailyRate, 365) - 1) * 100;

    const apr = feeApr;
    const apy = feeApy;

    return {
      apr,
      apy,
      dailyRate,
      fees24h,
      fees7d,
      fees30d,
      totalFees,
      volume24h,
      feeApr,
      feeApy,
    };
  }

  formatAPR(apr: APRTracking): string {
    return [
      `📈 *APR / APY Tracking*`,
      ``,
      `*Fee APR:* ${apr.feeApr >= 0 ? "+" : ""}${apr.feeApr.toFixed(2)}%`,
      `*Fee APY:* ${apr.feeApy >= 0 ? "+" : ""}${apr.feeApy.toFixed(2)}%`,
      ``,
      `*Daily Rate:* ${(apr.dailyRate * 100).toFixed(4)}%`,
      ``,
      `*Fees Generated:*`,
      `  24h: ${apr.fees24h.toFixed(2)} SOL`,
      `  7d: ${apr.fees7d.toFixed(2)} SOL`,
      `  30d: ${apr.fees30d.toFixed(2)} SOL`,
      `  Total: ${apr.totalFees.toFixed(2)} SOL`,
      ``,
      `*24h Volume:* ${apr.volume24h.toFixed(2)} SOL`,
    ].join("\n");
  }

  // ===================== Position Health =====================

  async getPositionHealth(positionKey: string): Promise<MeteoraPositionHealth | null> {
    const position = this.config.positions[positionKey];
    if (!position) return null;

    const status = await this.getPositionStatus(positionKey);
    if (!status) return null;

    const pnl = status.pnl;
    const binHealth = await this.getBinVisualization(position.poolAddress, positionKey);

    const reasons: string[] = [];
    let overall = 50;
    let inRange = status.inRange;
    let binScore = 50;
    let pnlScore = 50;
    let feeScore = 50;
    let timeScore = 50;

    if (inRange) {
      binScore = 90;
      reasons.push("✅ Position in active bin");
    } else {
      binScore = 30;
      const distance = status.currentBin < status.minBin
        ? status.minBin - status.currentBin
        : status.currentBin - status.maxBin;
      reasons.push(`⚠️ Out of range by ${distance} bins`);
    }

    if (pnl) {
      if (pnl.unrealizedPnlSol > 0) {
        pnlScore = 70 + Math.min(pnl.unrealizedPnlSol * 5, 20);
        reasons.push(`💰 Unrealized PnL: +${pnl.unrealizedPnlSol.toFixed(4)} SOL`);
      } else {
        pnlScore = Math.max(30 + pnl.unrealizedPnlSol * 10, 10);
        reasons.push(`📉 Unrealized PnL: ${pnl.unrealizedPnlSol.toFixed(4)} SOL`);
      }
    }

    const unclaimedX = pnl?.unclaimedFeeTokenX?.amount || 0;
    const unclaimedY = pnl?.unclaimedFeeTokenY?.amount || 0;
    if (unclaimedX > 0 || unclaimedY > 0) {
      feeScore = 80;
      reasons.push(`💎 Unclaimed fees available - harvest recommended`);
    } else {
      feeScore = 50;
    }

    const hoursSinceAdd = (Date.now() - new Date(position.addedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceAdd < 24) {
      timeScore = 60;
    } else if (hoursSinceAdd < 168) {
      timeScore = 75;
    } else {
      timeScore = 85;
    }

    overall = Math.round(binScore * 0.35 + pnlScore * 0.25 + feeScore * 0.25 + timeScore * 0.15);

    let recommendation: MeteoraPositionHealth["recommendation"];
    if (feeScore >= 80) {
      recommendation = "harvest_fees";
    } else if (overall >= 75 && inRange) {
      recommendation = "hold";
    } else if (overall >= 60) {
      recommendation = "add";
    } else if (overall >= 40) {
      recommendation = "reduce";
    } else {
      recommendation = "exit";
    }

    return {
      overall,
      inRange,
      binHealth: binScore,
      pnlScore,
      feeScore,
      timeScore,
      recommendation,
      reasons,
    };
  }

  formatPositionHealth(health: MeteoraPositionHealth): string {
    const emoji = health.overall >= 75 ? "🟢" : health.overall >= 50 ? "🟡" : "🔴";
    const recEmoji = {
      hold: "📌",
      add: "➕",
      reduce: "📉",
      exit: "🚪",
      harvest_fees: "💎",
    }[health.recommendation];

    return [
      `${emoji} *Position Health: ${health.overall}%* ${recEmoji}`,
      ``,
      `*Recommendation:* ${health.recommendation.toUpperCase().replace("_", " ")}`,
      ``,
      `*Scores:*`,
      `  Bin Health: ${health.binHealth}%`,
      `  PnL Score: ${health.pnlScore}%`,
      `  Fee Score: ${health.feeScore}%`,
      `  Time Score: ${health.timeScore}%`,
      ``,
      `*Status:* ${health.inRange ? "✅ In Range" : "⚠️ Out of Range"}`,
      ``,
      `*Reasons:*`,
      ...health.reasons.map(r => `  ${r}`),
    ].join("\n");
  }

  // ===================== Zap (SOL → Position) =====================

  async zapIn(poolAddress: string, solAmount: number | "max" | string): Promise<MeteoraPosition> {
    return this.addLiquidity(poolAddress, solAmount, 20, StrategyType.Spot);
  }

  // ===================== Rebalance Suggestions =====================

  async suggestRebalance(positionKey: string): Promise<{
    shouldRebalance: boolean;
    currentBin: number;
    optimalBin: number;
    binsToShift: number;
    estimatedCost: number;
    suggestion: string;
  } | null> {
    const position = this.config.positions[positionKey];
    if (!position) return null;

    const status = await this.getPositionStatus(positionKey);
    if (!status) return null;

    const poolInfo = await this.getPoolInfo(position.poolAddress);
    const currentBin = poolInfo.activeBin;

    const shouldRebalance = !status.inRange;
    const binsToShift = status.currentBin < status.minBin
      ? status.minBin - status.currentBin
      : status.currentBin - status.maxBin;

    const binStep = poolInfo.binStep;
    const estimatedCost = binsToShift * binStep * position.solAmount * 0.001;

    let suggestion = "";
    if (!status.inRange) {
      if (status.currentBin < status.minBin) {
        suggestion = `Price dropped below range. Consider removing liquidity and re-adding at current price, or wait for price to recover.`;
      } else {
        suggestion = `Price rose above range. Consider taking profits or rebalancing to higher bins.`;
      }
    } else {
      suggestion = `Position is in range. No rebalancing needed.`;
    }

    return {
      shouldRebalance,
      currentBin,
      optimalBin: currentBin,
      binsToShift,
      estimatedCost,
      suggestion,
    };
  }

  formatRebalanceSuggestion(suggestion: {
    shouldRebalance: boolean;
    currentBin: number;
    optimalBin: number;
    binsToShift: number;
    estimatedCost: number;
    suggestion: string;
  }): string {
    const statusIcon = suggestion.shouldRebalance ? "⚠️" : "✅";

    return [
      `${statusIcon} *Rebalance Suggestion*`,
      ``,
      `*Current Bin:* \`${suggestion.currentBin}\``,
      `*Optimal Bin:* \`${suggestion.optimalBin}\``,
      `*Bins to Shift:* \`${suggestion.binsToShift}\``,
      `*Estimated Cost:* \`${suggestion.estimatedCost.toFixed(4)} SOL\``,
      ``,
      `${suggestion.suggestion}`,
    ].join("\n");
  }
}

// ===================== Factory Function =====================

/**
 * Create an EnhancedDLMMService instance
 */
export function createEnhancedDLMMService(
  rpcUrl: string,
  heliusApiKey?: string,
  dataFile?: string
): EnhancedDLMMService {
  return new EnhancedDLMMService(rpcUrl, undefined, undefined, {
    monitorInterval: 30000,
    minSolAmount: 0.5,
    feeBuffer: 0.001,
  });
}
