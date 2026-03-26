// deploy.mjs — Hardhat 3 + ethers 6 direct deployment
// npx hardhat --config hardhat.config.cjs run deploy.mjs --network bsc

import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_TESTNET_USDT = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const MULTISIG_ADDRESS = process.env.MULTISIG_ADDRESS || "";
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS || "";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const networkName = hre.globalOptions.network || "bsc";
const isTestnet = networkName === "bscTestnet";
const rpcUrl = isTestnet
  ? "https://data-seed-prebsc-1-s1.binance.org:8545"
  : "https://bsc-dataseed1.binance.org";
const usdtAddress = isTestnet ? BSC_TESTNET_USDT : BSC_USDT;

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
  const provider = new ethers.JsonRpcProvider(rpcUrl, isTestnet ? 97 : 56);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n🚀 Deploying MY AI PET contracts on ${networkName}`);
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} BNB`);
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
    chainId: isTestnet ? 97 : 56,
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
  console.log(`\n💰 Remaining: ${ethers.formatEther(await provider.getBalance(wallet.address))} BNB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
