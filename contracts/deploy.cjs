// scripts/deploy.cjs
// Full deployment: PETToken → PETShop → PETContent → PetaGenTracker
// npx hardhat run deploy.cjs --network bscTestnet
// npx hardhat run deploy.cjs --network bsc

const hre = require("hardhat");

// BSC USDT address
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
// BSC Testnet USDT (mock) — deploy your own or use a known one
const BSC_TESTNET_USDT = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

// Set to your Gnosis Safe / multisig address after deployment
// M-4: Transfer ownership to multisig after deployment
const MULTISIG_ADDRESS = process.env.MULTISIG_ADDRESS || "";
// Relayer wallet for gas-sponsored transactions
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS || "";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const isTestnet = network === "bscTestnet";
  const usdtAddress = isTestnet ? BSC_TESTNET_USDT : BSC_USDT;

  console.log(`\n🚀 Deploying MY AI PET contracts on ${network}`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   USDT: ${usdtAddress}`);
  console.log("");

  // D-1: Fail if deployer key is the dummy key
  if (deployer.address === "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf") {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set! Using dummy key is not allowed.");
  }

  // ─── 1. Deploy PETToken ───
  console.log("1/4 Deploying PETToken...");
  const PETToken = await hre.ethers.getContractFactory("PETToken");
  const petToken = await PETToken.deploy();
  await petToken.waitForDeployment();
  const petTokenAddr = await petToken.getAddress();
  console.log(`   ✅ PETToken: ${petTokenAddr}`);

  // ─── 2. Deploy PETShop ───
  console.log("2/4 Deploying PETShop...");
  const PETShop = await hre.ethers.getContractFactory("PETShop");
  const petShop = await PETShop.deploy(petTokenAddr, usdtAddress);
  await petShop.waitForDeployment();
  const petShopAddr = await petShop.getAddress();
  console.log(`   ✅ PETShop: ${petShopAddr}`);

  // ─── 3. Deploy PETContent ───
  console.log("3/4 Deploying PETContent...");
  const PETContent = await hre.ethers.getContractFactory("PETContent");
  const petContent = await PETContent.deploy();
  await petContent.waitForDeployment();
  const petContentAddr = await petContent.getAddress();
  console.log(`   ✅ PETContent: ${petContentAddr}`);

  // ─── 4. Deploy PetaGenTracker ───
  console.log("4/4 Deploying PetaGenTracker...");
  const Tracker = await hre.ethers.getContractFactory("PetaGenTracker");
  const tracker = await Tracker.deploy();
  await tracker.waitForDeployment();
  const trackerAddr = await tracker.getAddress();
  console.log(`   ✅ PetaGenTracker: ${trackerAddr}`);

  // ─── Wire up permissions ───
  console.log("\n🔗 Wiring permissions...");

  // C-3: Register PETShop as minter on PETToken
  const tx1 = await petToken.addMinter(petShopAddr);
  await tx1.wait();
  console.log(`   ✅ PETShop registered as PETToken minter`);

  // Register relayer as minter on PETContent (for NFT minting)
  if (RELAYER_ADDRESS) {
    const tx2 = await petContent.addMinter(RELAYER_ADDRESS);
    await tx2.wait();
    console.log(`   ✅ Relayer ${RELAYER_ADDRESS} registered as PETContent minter`);

    const tx3 = await tracker.addRelayer(RELAYER_ADDRESS);
    await tx3.wait();
    console.log(`   ✅ Relayer ${RELAYER_ADDRESS} registered as PetaGenTracker relayer`);
  } else {
    // Deployer is already a relayer by default
    const tx2 = await petContent.addMinter(deployer.address);
    await tx2.wait();
    console.log(`   ✅ Deployer registered as PETContent minter (set RELAYER_ADDRESS for production)`);
  }

  // ─── Transfer ownership to multisig (M-4) ───
  if (MULTISIG_ADDRESS && MULTISIG_ADDRESS !== "") {
    console.log(`\n🔐 Transferring ownership to multisig: ${MULTISIG_ADDRESS}`);

    // Ownable2Step: initiates transfer, multisig must acceptOwnership()
    const tx4 = await petToken.transferOwnership(MULTISIG_ADDRESS);
    await tx4.wait();
    console.log(`   ⏳ PETToken ownership transfer initiated (multisig must accept)`);

    const tx5 = await petShop.transferOwnership(MULTISIG_ADDRESS);
    await tx5.wait();
    console.log(`   ⏳ PETShop ownership transfer initiated`);

    const tx6 = await petContent.transferOwnership(MULTISIG_ADDRESS);
    await tx6.wait();
    console.log(`   ⏳ PETContent ownership transfer initiated`);

    const tx7 = await tracker.transferOwnership(MULTISIG_ADDRESS);
    await tx7.wait();
    console.log(`   ⏳ PetaGenTracker ownership transfer initiated`);

    console.log(`\n⚠️  IMPORTANT: Multisig must call acceptOwnership() on each contract!`);
  } else {
    console.log(`\n⚠️  No MULTISIG_ADDRESS set — ownership remains with deployer`);
    console.log(`   Set MULTISIG_ADDRESS env var for production deployment`);
  }

  // ─── Summary ───
  console.log("\n" + "═".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log(`NEXT_PUBLIC_PET_TOKEN=${petTokenAddr}`);
  console.log(`NEXT_PUBLIC_PET_SHOP=${petShopAddr}`);
  console.log(`NEXT_PUBLIC_PET_CONTENT=${petContentAddr}`);
  console.log(`NEXT_PUBLIC_PET_TRACKER=${trackerAddr}`);
  console.log("═".repeat(60));

  // ─── Verify contracts ───
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n🔍 Verifying contracts on BscScan...");

    const contracts = [
      { name: "PETToken", address: petTokenAddr, args: [] },
      { name: "PETShop", address: petShopAddr, args: [petTokenAddr, usdtAddress] },
      { name: "PETContent", address: petContentAddr, args: [] },
      { name: "PetaGenTracker", address: trackerAddr, args: [] },
    ];

    // Wait for propagation
    console.log("   Waiting for block confirmations...");
    await tracker.deploymentTransaction().wait(5);

    for (const c of contracts) {
      try {
        await hre.run("verify:verify", {
          address: c.address,
          constructorArguments: c.args,
        });
        console.log(`   ✅ ${c.name} verified`);
      } catch (e) {
        console.log(`   ⚠️  ${c.name} verification failed: ${e.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
