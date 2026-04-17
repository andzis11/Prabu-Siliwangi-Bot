/**
 * Simple Wallet Verification
 * Run from app directory: npm run verify-wallet
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import bs58 from "bs58";

// Load env from parent directory
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

function getEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) throw new Error(`${name} not set in .env`);
  return val;
}

async function main() {
  console.log("🔍 Wallet Verification\n");

  // Check Helius
  const heliusKey = getEnv("HELIUS_API_KEY");
  console.log(`✅ Helius API: ${heliusKey.slice(0, 8)}...`);

  // RPC
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  const conn = new Connection(rpcUrl, { commitment: "confirmed" });

  try {
    const slot = await conn.getSlot();
    console.log(`✅ RPC OK (slot: ${slot})`);
  } catch (e: any) {
    console.error(`❌ RPC FAILED: ${e.message}`);
    process.exit(1);
  }

  // Wallet
  const pk = getEnv("SOLANA_PRIVATE_KEY");
  let wallet: Keypair;
  try {
    wallet = Keypair.fromSecretKey(bs58.decode(pk));
  } catch (e: any) {
    console.error(`❌ Invalid private key: ${e.message}`);
    process.exit(1);
  }

  const addr = wallet.publicKey.toBase58();
  console.log(`✅ Wallet: ${addr.slice(0, 8)}...${addr.slice(-8)}`);

  // Balance
  const bal = await conn.getBalance(wallet.publicKey);
  const sol = bal / LAMPORTS_PER_SOL;
  console.log(`💰 Balance: ${sol.toFixed(4)} SOL`);

  if (sol === 0) {
    console.log("\n⚠️  Wallet has 0 SOL!");
    console.log("   Need SOL for live trading");
  } else if (sol < 0.05) {
    console.log("\n⚠️  Low balance");
    console.log("   Recommended: 0.1+ SOL for testing");
  } else {
    console.log("\n✅ Wallet ready for trading!");
  }

  // Check env wallet address
  const envAddr = process.env.SOLANA_WALLET_ADDRESS?.trim();
  if (envAddr && envAddr !== addr) {
    console.log(`\n⚠️  SOLANA_WALLET_ADDRESS mismatch`);
    console.log(`   Expected: ${envAddr}`);
    console.log(`   Actual:   ${addr}`);
    console.log(`   Fix: Update .env SOLANA_WALLET_ADDRESS=${addr}`);
  } else if (!envAddr) {
    console.log(`\n💡 Add to .env: SOLANA_WALLET_ADDRESS=${addr}`);
  } else {
    console.log(`✅ Wallet address matches .env`);
  }

  // Security
  const chatId = process.env.CHAT_ID?.trim();
  if (!chatId) {
    console.log(`\n⚠️  CHAT_ID not set (bot open to anyone)`);
  } else {
    console.log(`✅ CHAT_ID set (restricted)`);
  }

  console.log("\n📊 SUMMARY");
  console.log("=".repeat(50));
  console.log(`Helius:     ✅`);
  console.log(`RPC:        ✅`);
  console.log(`Wallet:     ✅`);
  console.log(`Address:    ${addr.slice(0, 8)}...${addr.slice(-8)}`);
  console.log(`Balance:    ${sol.toFixed(4)} SOL`);
  console.log("=".repeat(50));

  if (sol > 0) {
    console.log("\n✅ Ready for live trading!");
    console.log("\nNext:");
    console.log("  1. Restart bot: npm run dev");
    console.log("  2. Toggle Paper Mode OFF in Settings");
    console.log("  3. Test buy with 0.01 SOL first");
  } else {
    console.log("\n⚠️  Fund wallet first!");
  }
  console.log();
}

main().catch((e) => {
  console.error(`\n❌ Failed: ${e.message}`);
  process.exit(1);
});
