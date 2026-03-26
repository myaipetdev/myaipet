require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.warn("\n⚠️  WARNING: DEPLOYER_PRIVATE_KEY not set. Only local networks available.\n");
}

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    bsc: {
      type: "http",
      url: "https://bsc-dataseed1.binance.org",
      chainId: 56,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bscTestnet: {
      type: "http",
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || "",
  },
};
