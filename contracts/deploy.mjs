// deploy.mjs — Hardhat 3 + ethers 6 direct deployment
// npx hardhat --config hardhat.config.cjs run deploy.mjs --network bsc

import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

const MULTISIG_ADDRESS = process.env.MULTISIG_ADDRESS || "";
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS || "";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// PETShop's stablecoin arg = USDT on BSC, USDC on Base (both ERC-20, 6/18 dp differ
// but the contract just transfers the token, so the canonical address is enough).
const NETWORKS = {
  bsc:         { rpc: "https://bsc-dataseed1.binance.org",              chainId: 56,    usdt: "0x55d398326f99059fF775485246999027B3197955", sym: "BNB" },
  bscTestnet:  { rpc: "https://data-seed-prebsc-1-s1.binance.org:8545", chainId: 97,    usdt: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", sym: "tBNB" },
  base:        { rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org", chainId: 8453,  usdt: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", sym: "ETH" },
  baseSepolia: { rpc: process.env.BASE_RPC_URL || "https://sepolia.base.org", chainId: 84532, usdt: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", sym: "ETH" },
};

const networkName = hre.globalOptions.network || "bsc";
const net = NETWORKS[networkName] || NETWORKS.bsc;
const rpcUrl = net.rpc;
const usdtAddress = net.usdt;
const chainId = net.chainId;

function loadArtifact(name) {
  const p = path.join("artifacts", "contracts", `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deployContract(wallet, name, args = []) {
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  return { contract, address: addr };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n🚀 Deploying MY AI PET contracts on ${networkName}`);
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ${net.sym}`);
  console.log(`   USDT: ${usdtAddress}\n`);

  if (wallet.address === "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf") {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set!");
  }

  // 1. PETToken
  console.log("1/4 Deploying PETToken...");
  const petToken = await deployContract(wallet, "PETToken");
  console.log(`   ✅ PETToken: ${petToken.address}`);

  // 2. PETShop
  console.log("2/4 Deploying PETShop...");
  const petShop = await deployContract(wallet, "PETShop", [petToken.address, usdtAddress]);
  console.log(`   ✅ PETShop: ${petShop.address}`);

  // 3. PETContent
  console.log("3/4 Deploying PETContent...");
  const petContent = await deployContract(wallet, "PETContent");
  console.log(`   ✅ PETContent: ${petContent.address}`);

  // 4. PetaGenTracker
  console.log("4/4 Deploying PetaGenTracker...");
  const tracker = await deployContract(wallet, "PetaGenTracker");
  console.log(`   ✅ PetaGenTracker: ${tracker.address}`);

  // Wire permissions
  console.log("\n🔗 Wiring permissions...");

  let tx = await petToken.contract.addMinter(petShop.address);
  await tx.wait();
  console.log(`   ✅ PETShop registered as PETToken minter`);

  if (RELAYER_ADDRESS) {
    tx = await petContent.contract.addMinter(RELAYER_ADDRESS);
    await tx.wait();
    console.log(`   ✅ Relayer ${RELAYER_ADDRESS} registered as PETContent minter`);

    tx = await tracker.contract.addRelayer(RELAYER_ADDRESS);
    await tx.wait();
    console.log(`   ✅ Relayer ${RELAYER_ADDRESS} registered as PetaGenTracker relayer`);
  } else {
    tx = await petContent.contract.addMinter(wallet.address);
    await tx.wait();
    console.log(`   ✅ Deployer registered as PETContent minter`);
  }

  // Multisig
  if (MULTISIG_ADDRESS) {
    console.log(`\n🔐 Transferring ownership to multisig: ${MULTISIG_ADDRESS}`);
    for (const [name, c] of [["PETToken", petToken], ["PETShop", petShop], ["PETContent", petContent], ["PetaGenTracker", tracker]]) {
      tx = await c.contract.transferOwnership(MULTISIG_ADDRESS);
      await tx.wait();
      console.log(`   ⏳ ${name} ownership transfer initiated`);
    }
    console.log(`\n⚠️  Multisig must call acceptOwnership() on each contract!`);
  } else {
    console.log(`\n⚠️  No MULTISIG_ADDRESS — ownership remains with deployer`);
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log(`NEXT_PUBLIC_PET_TOKEN=${petToken.address}`);
  console.log(`NEXT_PUBLIC_PET_SHOP=${petShop.address}`);
  console.log(`NEXT_PUBLIC_PET_CONTENT=${petContent.address}`);
  console.log(`NEXT_PUBLIC_PET_TRACKER=${tracker.address}`);
  console.log("═".repeat(60));

  // Save addresses
  const config = {
    chainId,
    network: networkName,
    petToken: petToken.address,
    petShop: petShop.address,
    petContent: petContent.address,
    tracker: tracker.address,
    usdt: usdtAddress,
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("deployed-addresses.json", JSON.stringify(config, null, 2));
  console.log("\nSaved to deployed-addresses.json");

  // Remaining balance
  console.log(`\n💰 Remaining: ${ethers.formatEther(await provider.getBalance(wallet.address))} ${net.sym}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
