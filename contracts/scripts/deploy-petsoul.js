/* eslint-disable no-console */
const hre = require("hardhat");

/**
 * Deploy PetSoul — the Web4.0 sovereignty contract for MY AI PET.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... \
 *   RELAYER_ADDRESS=0x... \
 *   BSCSCAN_API_KEY=... \
 *   npx hardhat --config hardhat.config.cjs run scripts/deploy-petsoul.js --network bsc
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("  PetSoul deployment");
  console.log("=================================================");
  console.log("Network :", hre.network.name);
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance :", hre.ethers.formatEther(balance), "BNB");

  const relayer = process.env.RELAYER_ADDRESS;
  if (!relayer || !hre.ethers.isAddress(relayer)) {
    throw new Error("RELAYER_ADDRESS env var must be a valid address");
  }
  console.log("Relayer :", relayer);
  console.log("-------------------------------------------------");

  // 1. Deploy
  const PetSoul = await hre.ethers.getContractFactory("PetSoul");
  const contract = await PetSoul.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("PetSoul deployed to:", address);

  const deployTx = contract.deploymentTransaction();
  if (deployTx) {
    console.log("Deploy tx:", deployTx.hash);
    console.log("Waiting for confirmations...");
    await deployTx.wait(5);
  }

  // 2. Add relayer (skip if relayer == deployer — constructor already adds deployer)
  if (relayer.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("Adding relayer:", relayer);
    const tx = await contract.addRelayer(relayer);
    await tx.wait(2);
    console.log("Relayer added. tx:", tx.hash);
  } else {
    console.log("Deployer is the relayer — already granted in constructor.");
  }

  // 3. Verify on BscScan (best-effort)
  if (
    hre.network.name === "bsc" ||
    hre.network.name === "bscTestnet"
  ) {
    console.log("-------------------------------------------------");
    console.log("Verifying on BscScan...");
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [],
      });
      console.log("Verified.");
    } catch (err) {
      console.warn("Verification failed (non-fatal):", err.message || err);
      console.warn(
        `You can retry manually:\n  npx hardhat verify --network ${hre.network.name} ${address}`
      );
    }
  }

  console.log("=================================================");
  console.log("  DONE");
  console.log("=================================================");
  console.log("Address :", address);
  console.log("Network :", hre.network.name);
  console.log("Relayer :", relayer);
  console.log("Add to .env:");
  console.log(`  PETSOUL_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
