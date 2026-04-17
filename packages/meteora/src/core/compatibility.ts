/**
 * Backward Compatibility Wrapper
 *
 * This module provides backward compatibility with the original DLMMService
 * while exposing the enhanced functionality through a unified interface.
 */

import { EnhancedDLMMService } from './enhanced-dlmm';
import { DLMMService as OriginalDLMMService } from './dlmm';
import { StrategyType } from '@meteora-ag/dlmm';
import {
  MeteoraPosition,
  MeteoraPoolInfo,
  MeteoraPnL,
  MeteoraPreset,
  WalletConfig,
  RPCEndpoint,
  PositionStatus,
  SyncResult,
  ExtremeSession,
  ExtremeModeConfig,
  DEFAULT_EXTREME_CONFIG,
} from '../types';

/**
 * Unified DLMM Service that provides backward compatibility
 * while exposing enhanced features.
 */
export class UnifiedDLMMService {
  private enhancedService: EnhancedDLMMService;
  private originalService: OriginalDLMMService;
  private useEnhanced: boolean = true;

  constructor(
    rpcUrl: string,
    configPath?: string,
    envPath?: string,
    extremeConfig?: Partial<ExtremeModeConfig>
  ) {
    this.enhancedService = new EnhancedDLMMService(
      rpcUrl,
      configPath,
      envPath,
      extremeConfig
    );
    this.originalService = new OriginalDLMMService(rpcUrl);
  }

  /**
   * Switch between enhanced and original service modes
   */
  setUseEnhanced(useEnhanced: boolean): void {
    this.useEnhanced = useEnhanced;
  }

  /**
   * ===================== Backward Compatible Methods =====================
   * These methods match the original DLMMService interface
   */

  async getPoolInfo(poolAddress: string): Promise<MeteoraPoolInfo> {
    if (this.useEnhanced) {
      return this.enhancedService.getPoolInfo(poolAddress);
    }
    return this.originalService.getPoolInfo(poolAddress);
  }

  async addLiquidity(
    wallet: any, // Keypair - kept for compatibility
    poolAddress: string,
    solAmount: number,
    rangePercent: number,
    strategy: StrategyType
  ): Promise<MeteoraPosition> {
    // For enhanced service, we use the active wallet
    if (this.useEnhanced) {
      // Convert parameters to enhanced service format
      return this.enhancedService.addLiquidity(
        poolAddress,
        solAmount,
        rangePercent,
        strategy
      );
    }

    // For original service, use the provided wallet
    return this.originalService.addLiquidity(
      wallet,
      poolAddress,
      solAmount,
      rangePercent,
      strategy
    );
  }

  async removeLiquidity(
    wallet: any, // Keypair - kept for compatibility
    position: MeteoraPosition
  ): Promise<string[]> {
    if (this.useEnhanced) {
      return this.enhancedService.removeLiquidity(position.publicKey);
    }
    return this.originalService.removeLiquidity(wallet, position);
  }

  async getPositionStatus(
    positionKey: string,
    poolAddress: string
  ): Promise<{ currentBin: number; minBin: number; maxBin: number; inRange: boolean } | null> {
    if (this.useEnhanced) {
      const status = await this.enhancedService.getPositionStatus(positionKey);
      if (!status) return null;

      return {
        currentBin: status.currentBin,
        minBin: status.minBin,
        maxBin: status.maxBin,
        inRange: status.inRange,
      };
    }

    return this.originalService.getPositionStatus(positionKey, poolAddress);
  }

  async rebalanceExtreme(
    wallet: any, // Keypair - kept for compatibility
    poolAddress: string,
    oldPositionKey: string,
    solAmount: number
  ): Promise<MeteoraPosition> {
    if (this.useEnhanced) {
      // For enhanced service, use the extreme mode operations
      // First close the old position
      await this.enhancedService.closeExtremePositionOnly(poolAddress, oldPositionKey);

      // Then open a new extreme position
      const result = await this.enhancedService.openExtremePosition(poolAddress, solAmount);

      // Convert to MeteoraPosition format
      return {
        publicKey: result.positionKey,
        poolAddress,
        minBinId: result.targetBinId,
        maxBinId: result.targetBinId,
        activeBinAtAdd: result.targetBinId,
        solAmount: result.solUsed,
        rangePercent: 0,
        strategyStr: 'BidAsk',
        addedAt: new Date().toISOString(),
        txHash: result.txHash,
        cachedBinIds: [result.targetBinId],
        walletId: this.enhancedService.getActiveWallet()?.publicKey.toBase58().slice(0, 8) || 'unknown',
      };
    }

    return this.originalService.rebalanceExtreme(
      wallet,
      poolAddress,
      oldPositionKey,
      solAmount
    );
  }

  /**
   * ===================== Enhanced Methods =====================
   * These methods are only available in enhanced mode
   */

  // Wallet Management
  addWallet(name: string, privateKey: string): WalletConfig {
    this.ensureEnhancedMode();
    return this.enhancedService.addWallet(name, privateKey);
  }

  getActiveWallet(): any | null { // Keypair | null
    this.ensureEnhancedMode();
    return this.enhancedService.getActiveWallet();
  }

  switchWallet(walletId: string): void {
    this.ensureEnhancedMode();
    this.enhancedService.switchWallet(walletId);
  }

  deleteWallet(walletId: string): void {
    this.ensureEnhancedMode();
    this.enhancedService.deleteWallet(walletId);
  }

  listWallets(): WalletConfig[] {
    this.ensureEnhancedMode();
    return this.enhancedService.listWallets();
  }

  // Preset Management
  getActivePreset(): MeteoraPreset | null {
    this.ensureEnhancedMode();
    return this.enhancedService.getActivePreset();
  }

  addPreset(
    id: string,
    name: string,
    sol: number | "max" | string,
    range: number,
    strategy: StrategyType
  ): MeteoraPreset {
    this.ensureEnhancedMode();
    return this.enhancedService.addPreset(id, name, sol, range, strategy);
  }

  switchPreset(presetId: string): void {
    this.ensureEnhancedMode();
    this.enhancedService.switchPreset(presetId);
  }

  deletePreset(presetId: string): void {
    this.ensureEnhancedMode();
    this.enhancedService.deletePreset(presetId);
  }

  listPresets(): MeteoraPreset[] {
    this.ensureEnhancedMode();
    return this.enhancedService.listPresets();
  }

  // Enhanced Liquidity Operations
  async addLiquidityEnhanced(
    poolAddress: string,
    solAmount: number | "max" | string,
    rangePercent: number,
    strategy: StrategyType
  ): Promise<MeteoraPosition> {
    this.ensureEnhancedMode();
    return this.enhancedService.addLiquidity(
      poolAddress,
      solAmount,
      rangePercent,
      strategy
    );
  }

  // Extreme Mode Operations
  async openExtremePosition(
    poolAddress: string,
    solAmount: number | "max" | string
  ): Promise<{ positionKey: string; targetBinId: number; txHash: string; solUsed: number }> {
    this.ensureEnhancedMode();
    return this.enhancedService.openExtremePosition(poolAddress, solAmount);
  }

  async withdrawAndReaddToTargetBin(
    poolAddress: string,
    positionKey: string,
    targetBinId: number
  ): Promise<string | "no_token"> {
    this.ensureEnhancedMode();
    return this.enhancedService.withdrawAndReaddToTargetBin(
      poolAddress,
      positionKey,
      targetBinId
    );
  }

  async closeExtremePositionOnly(
    poolAddress: string,
    positionKey: string
  ): Promise<string[]> {
    this.ensureEnhancedMode();
    return this.enhancedService.closeExtremePositionOnly(poolAddress, positionKey);
  }

  // Session Management
  startExtremeSession(
    sessionId: number,
    poolAddress: string,
    solAmount: number | "max" | string
  ): ExtremeSession {
    this.ensureEnhancedMode();
    return this.enhancedService.startExtremeSession(sessionId, poolAddress, solAmount);
  }

  stopExtremeSession(sessionId: number): void {
    this.ensureEnhancedMode();
    this.enhancedService.stopExtremeSession(sessionId);
  }

  getSession(sessionId: number): ExtremeSession | undefined {
    this.ensureEnhancedMode();
    return this.enhancedService.getSession(sessionId);
  }

  listSessions(): ExtremeSession[] {
    this.ensureEnhancedMode();
    return this.enhancedService.listSessions();
  }

  // Monitoring & Sync
  async getPositionStatusEnhanced(positionKey: string): Promise<PositionStatus | null> {
    this.ensureEnhancedMode();
    return this.enhancedService.getPositionStatus(positionKey);
  }

  async syncPositions(): Promise<SyncResult> {
    this.ensureEnhancedMode();
    return this.enhancedService.syncPositions();
  }

  async fetchPositionPnL(poolAddress: string, owner: string): Promise<MeteoraPnL> {
    this.ensureEnhancedMode();
    return this.enhancedService.fetchPositionPnL(poolAddress, owner);
  }

  // Utility Methods
  async getSolBalance(pubkey: string): Promise<number> {
    this.ensureEnhancedMode();
    return this.enhancedService.getSolBalance(pubkey);
  }

  // Static Utility Methods (delegated to EnhancedDLMMService)
  static extractPoolAddress(input: string): string | null {
    return EnhancedDLMMService.extractPoolAddress(input);
  }

  static isPoolInput(input: string): boolean {
    return EnhancedDLMMService.isPoolInput(input);
  }

  static shortKey(pubkey: string): string {
    return EnhancedDLMMService.shortKey(pubkey);
  }

  static solLabel(amount: number): string {
    return EnhancedDLMMService.solLabel(amount);
  }

  /**
   * ===================== Private Helpers =====================
   */

  private ensureEnhancedMode(): void {
    if (!this.useEnhanced) {
      throw new Error(
        'This method requires enhanced mode. ' +
        'Call setUseEnhanced(true) or use the backward compatible methods.'
      );
    }
  }

  /**
   * Get the underlying enhanced service for advanced operations
   */
  getEnhancedService(): EnhancedDLMMService {
    return this.enhancedService;
  }

  /**
   * Get the underlying original service for legacy operations
   */
  getOriginalService(): OriginalDLMMService {
    return this.originalService;
  }
}

/**
 * Factory function to create the appropriate service based on configuration
 */
export function createDLMMService(
  rpcUrl: string,
  options?: {
    useEnhanced?: boolean;
    configPath?: string;
    envPath?: string;
    extremeConfig?: Partial<ExtremeModeConfig>;
  }
): UnifiedDLMMService | OriginalDLMMService {
  const useEnhanced = options?.useEnhanced ?? true;

  if (useEnhanced) {
    return new UnifiedDLMMService(
      rpcUrl,
      options?.configPath,
      options?.envPath,
      options?.extremeConfig
    );
  } else {
    return new OriginalDLMMService(rpcUrl);
  }
}

/**
 * Type guard to check if a service supports enhanced features
 */
export function supportsEnhancedFeatures(
  service: any
): service is UnifiedDLMMService {
  return service instanceof UnifiedDLMMService ||
         service instanceof EnhancedDLMMService ||
         (service && typeof service.addWallet === 'function');
}

/**
 * Migration helper to transition from original to enhanced service
 */
export function migrateToEnhancedService(
  originalService: OriginalDLMMService,
  rpcUrl: string,
  configPath?: string,
  envPath?: string
): UnifiedDLMMService {
  const enhancedService = new UnifiedDLMMService(
    rpcUrl,
    configPath,
    envPath
  );

  // Note: Wallet migration would need to be done manually
  // as private keys should not be stored in the original service

  console.log(`
Migration to EnhancedDLMMService complete.

Next steps:
1. Add wallets using addWallet() method
2. Configure strategy presets using addPreset()
3. Use enhanced features like extreme mode and position sync

Note: Original positions will need to be recreated or synced
using the syncPositions() method.
  `);

  return enhancedService;
}

// Export everything for convenience
export { EnhancedDLMMService } from './enhanced-dlmm';
export { DLMMService } from './dlmm';
export { StrategyType } from '@meteora-ag/dlmm';
export * from '../types';
