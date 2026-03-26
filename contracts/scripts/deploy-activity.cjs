const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying PETActivity with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "BNB");

  const PETActivity = await hre.ethers.getContractFactory("PETActivity");
  const contract = await PETActivity.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("PETActivity deployed to:", address);
  console.log("\nVerify with:");
  console.log(`npx hardhat --config hardhat.config.cjs verify --network bsc ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
