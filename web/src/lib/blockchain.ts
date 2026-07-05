/**
 * Blockchain utilities for BSC on-chain recording and NFT minting.
 * Used by Next.js API routes (not the FastAPI backend).
 */

import { ethers } from "ethers";
import PETContentABI from "@/lib/contracts/PETContent.abi.json";
import PetaGenTrackerABI from "@/lib/contracts/PetaGenTracker.abi.json";
import { ONCHAIN } from "@/lib/onchain";

// Addresses / RPC / chain come from the central on-chain config so they can be
// swapped (re-deploy, chain migration) via env without editing this file.
const PET_CONTENT_ADDRESS = ONCHAIN.contracts.petContent;
const PET_TRACKER_ADDRESS = ONCHAIN.contracts.petaGenTracker;

async function getRelayerWallet() {
  // ON-CHAIN HOLD: server-side recording + NFT minting paused.
  // Re-enable by setting BLOCKCHAIN_ENABLED=true once relayer wallet is funded
  // and PETActivity is deployed.
  if (process.env.BLOCKCHAIN_ENABLED !== "true") {
    return null;
  }
  const key = process.env.BACKEND_RELAYER_KEY;
  if (!key) {
    console.warn("[blockchain] BACKEND_RELAYER_KEY not set, on-chain calls disabled");
    return null;
  }
  const provider = new ethers.JsonRpcProvider(ONCHAIN.rpcUrl);
  // audit L12: verify we're on the expected chain before the relayer signs/mints,
  // so a misconfigured RPC can't push relayer txs onto the wrong network.
  try {
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== ONCHAIN.chainId) {
      console.error(`[blockchain] chainId mismatch: RPC=${net.chainId}, expected=${ONCHAIN.chainId} — aborting`);
      return null;
    }
  } catch (e) {
    console.error("[blockchain] failed to read network chainId:", e);
    return null;
  }
  return new ethers.Wallet(key, provider);
}

/**
 * Record a generation event on the PetaGenTracker contract (batchGenerate with single entry).
 * Returns tx hash and chain, or null on failure.
 */
export async function recordGenerationOnChain(
  userAddress: string,
  petType: number,
  style: number,
  contentHash: string
): Promise<{ txHash: string; chain: string } | null> {
  try {
    const wallet = await getRelayerWallet();
    if (!wallet) return null;

    const tracker = new ethers.Contract(PET_TRACKER_ADDRESS, PetaGenTrackerABI, wallet);

    // contentHash should be bytes32; pad if it's a hex string shorter than 32 bytes
    const hashBytes32 = ethers.zeroPadValue(
      ethers.isHexString(contentHash) ? contentHash : ethers.id(contentHash),
      32
    );

    const tx = await tracker.batchGenerate(
      [userAddress],
      [petType],
      [style],
      [hashBytes32]
    );

    console.log(`[blockchain] PetaGenTracker tx sent: ${tx.hash}`);

    // Don't await confirmation to keep it non-blocking for the caller
    tx.wait().then(() => {
      console.log(`[blockchain] PetaGenTracker tx confirmed: ${tx.hash}`);
    }).catch((err: unknown) => {
      console.error(`[blockchain] PetaGenTracker tx failed:`, err);
    });

    return { txHash: tx.hash, chain: "BSC" };
  } catch (err) {
    console.error("[blockchain] recordGenerationOnChain error:", err);
    return null;
  }
}

/**
 * Mint a PETContent NFT for the user.
 * Returns tx hash and token ID, or null on failure.
 */
export async function mintContentNFT(
  toAddress: string,
  petType: number,
  style: number,
  genType: string,
  contentHash: string
): Promise<{ txHash: string; tokenId: number } | null> {
  try {
    const wallet = await getRelayerWallet();
    if (!wallet) return null;

    const petContent = new ethers.Contract(PET_CONTENT_ADDRESS, PETContentABI, wallet);

    // Build bytes32 content hash
    const hashBytes32 = ethers.zeroPadValue(
      ethers.isHexString(contentHash) ? contentHash : ethers.id(contentHash),
      32
    );

    // mintContent(to, uri, petType, style, genType, contentHash)
    // Use empty string for URI since metadata can be set later
    const tx = await petContent.mintContent(
      toAddress,
      "",         // uri
      petType,
      style,
      genType,
      hashBytes32
    );

    console.log(`[blockchain] PETContent mint tx sent: ${tx.hash}`);

    // Wait for receipt to extract tokenId from events
    let tokenId = 0;
    tx.wait().then((receipt: ethers.TransactionReceipt) => {
      // Parse ContentMinted event to get tokenId
      for (const log of receipt.logs) {
        try {
          const parsed = petContent.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === "ContentMinted") {
            console.log(`[blockchain] PETContent minted tokenId: ${parsed.args.tokenId}`);
          }
        } catch {
          // skip logs from other contracts
        }
      }
    }).catch((err: unknown) => {
      console.error(`[blockchain] PETContent mint tx failed:`, err);
    });

    return { txHash: tx.hash, tokenId };
  } catch (err) {
    console.error("[blockchain] mintContentNFT error:", err);
    return null;
  }
}

// NOTE: There is intentionally NO season-points on-chain recorder. Season points
// are a purely off-chain, non-financial recognition score — no token, no cash
// value, no claim — so nothing about them is ever anchored on-chain. (A prior
// `recordSeasonActivity` PETActivity path was removed for compliance; on-chain
// anchoring here is reserved for provenance of the user's OWN assets — memory /
// persona / content NFTs — never for points.)
