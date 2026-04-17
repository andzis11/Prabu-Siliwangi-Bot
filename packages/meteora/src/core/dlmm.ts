import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import {
  MeteoraPosition,
  MeteoraPoolInfo,
  MeteoraPnL,
  MeteoraPreset
} from "../types";

export class DLMMService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async getPoolInfo(poolAddress: string): Promise<MeteoraPoolInfo> {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    const activeBin = await dlmmPool.getActiveBin();

    return {
      address: poolAddress,
      tokenXSymbol: dlmmPool.lbPair.tokenXMint.toBase58() === "So11111111111111111111111111111111111111112" ? "SOL" : "TOKEN",
      tokenYSymbol: dlmmPool.lbPair.tokenYMint.toBase58() === "So11111111111111111111111111111111111111112" ? "SOL" : "TOKEN",
      activeBin: activeBin.binId,
      binStep: dlmmPool.lbPair.binStep,
      baseFee: 0.01, // Placeholder - dlmmPool.lbPair.parameters.baseFactor,
    };
  }

  async addLiquidity(
    wallet: Keypair,
    poolAddress: string,
    solAmount: number,
    rangePercent: number,
    strategy: StrategyType
  ): Promise<MeteoraPosition> {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    await dlmmPool.refetchStates();

    const activeBin = await dlmmPool.getActiveBin();
    const binStep = dlmmPool.lbPair.binStep;
    const totalBins = Math.ceil((rangePercent / 100) / (binStep / 10000));

    const minBinId = activeBin.binId - totalBins;
    const maxBinId = activeBin.binId;

    const positionKeypair = Keypair.generate();
    const lamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

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

    const cachedBinIds = [];
    for (let i = minBinId; i <= maxBinId; i++) cachedBinIds.push(i);

    return {
      publicKey: positionKeypair.publicKey.toBase58(),
      poolAddress,
      minBinId,
      maxBinId,
      activeBinAtAdd: activeBin.binId,
      solAmount,
      rangePercent,
      strategyStr: StrategyType[strategy],
      addedAt: new Date().toISOString(),
      txHash,
      cachedBinIds,
      walletId: wallet.publicKey.toBase58().slice(0, 8),
    };
  }

  async removeLiquidity(
    wallet: Keypair,
    position: MeteoraPosition
  ): Promise<string[]> {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(position.poolAddress));

    const removeTx = await dlmmPool.removeLiquidity({
      position: new PublicKey(position.publicKey),
      user: wallet.publicKey,
      fromBinId: position.minBinId,
      toBinId: position.maxBinId,
      bps: new BN(10000),
      shouldClaimAndClose: true,
    });

    const txList = Array.isArray(removeTx) ? removeTx : [removeTx];
    return await Promise.all(txList.map(tx =>
      sendAndConfirmTransaction(this.connection, tx, [wallet], {
        skipPreflight: true,
        commitment: "processed"
      })
    ));
  }

  async getPositionStatus(positionKey: string, poolAddress: string) {
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    const activeBin = await dlmmPool.getActiveBin();
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(positionKey));

    const pos = userPositions.find(p => p.publicKey.toBase58() === positionKey);
    if (!pos) return null;

    const binIds = pos.positionData.positionBinData.map(b => b.binId);
    const minBin = Math.min(...binIds);
    const maxBin = Math.max(...binIds);

    return {
      currentBin: activeBin.binId,
      minBin,
      maxBin,
      inRange: activeBin.binId >= minBin && activeBin.binId <= maxBin,
    };
  }

  async rebalanceExtreme(
    wallet: Keypair,
    poolAddress: string,
    oldPositionKey: string,
    solAmount: number
  ): Promise<MeteoraPosition> {
    // 1. Remove old position
    const dlmmPool = await DLMM.create(this.connection, new PublicKey(poolAddress));
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    const oldPos = userPositions.find(p => p.publicKey.toBase58() === oldPositionKey);

    if (oldPos) {
      const binIds = oldPos.positionData.positionBinData.map(b => b.binId);
      if (binIds.length > 0) {
        const removeTx = await dlmmPool.removeLiquidity({
          position: new PublicKey(oldPositionKey),
          user: wallet.publicKey,
          fromBinId: binIds[0],
          toBinId: binIds[binIds.length - 1],
          bps: new BN(10000),
          shouldClaimAndClose: true,
        });
        const txList = Array.isArray(removeTx) ? removeTx : [removeTx];
        await Promise.all(txList.map(tx =>
          sendAndConfirmTransaction(this.connection, tx, [wallet], { skipPreflight: true, commitment: "processed" })
        ));
      }
    }

    // 2. Open new position in current active bin (1 bin strategy)
    return await this.addLiquidity(wallet, poolAddress, solAmount, 0, StrategyType.BidAsk);
  }
  }
