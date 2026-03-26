// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPETToken {
    function mint(address to, uint256 amount) external;
    function decimals() external view returns (uint8);
}

/**
 * @title PETShop
 * @notice Buy $PET tokens with USDT on BSC
 *
 * Security fixes applied:
 * - H-1: withdrawUSDT only to owner (no arbitrary address)
 * - H-4: Fixed tierKeys duplicate insertion
 * - C-2v2: setTier min price/amount validation
 * - H-2v2: purchase() slippage protection (expectedPrice/expectedAmount)
 * - M-1: Zero-address checks in constructor
 * - M-2: Pausable emergency stop + setTier petAmount>0 validation
 * - M-3: Per-user purchase rate limit (10 per day)
 * - M-4: Ownable2Step for multisig ownership
 * - L-7: ReentrancyGuard on purchase
 */
contract PETShop is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPETToken public immutable petToken;
    IERC20 public immutable usdt;

    struct Tier {
        uint256 usdtPrice;
        uint256 petAmount;
        bool active;
        bool exists;
    }

    mapping(string => Tier) public tiers;
    string[] public tierKeys;

    uint256 public totalSold;
    uint256 public totalRevenue;

    // M-3: Rate limiting
    uint256 public constant MAX_PURCHASES_PER_DAY = 10;
    mapping(address => uint256) public userDailyPurchases;
    mapping(address => uint256) public userLastPurchaseDay;

    event Purchase(
        address indexed buyer,
        string tier,
        uint256 usdtPaid,
        uint256 petReceived,
        uint256 timestamp
    );
    event TierUpdated(string key, uint256 usdtPrice, uint256 petAmount, bool active);
    event USDTWithdrawn(address indexed to, uint256 amount);

    constructor(address _petToken, address _usdt) Ownable(msg.sender) {
        require(_petToken != address(0), "Zero petToken");
        require(_usdt != address(0), "Zero usdt");
        petToken = IPETToken(_petToken);
        usdt = IERC20(_usdt);

        _setTier("starter",  5 * 1e18,    500 * 1e18,   true);
        _setTier("creator",  20 * 1e18,   2500 * 1e18,  true);
        _setTier("pro",      50 * 1e18,   10000 * 1e18, true);
    }

    uint256 public constant MIN_TIER_PRICE = 1 * 1e18; // Minimum 1 USDT
    uint256 public constant MIN_TIER_AMOUNT = 1 * 1e18; // Minimum 1 PET

    function _setTier(string memory key, uint256 usdtPrice, uint256 petAmount, bool active) internal {
        if (active) {
            require(usdtPrice >= MIN_TIER_PRICE, "Price too low");
            require(petAmount >= MIN_TIER_AMOUNT, "Amount too low");
        }
        if (!tiers[key].exists) {
            tierKeys.push(key);
        }
        tiers[key] = Tier(usdtPrice, petAmount, active, true);
        emit TierUpdated(key, usdtPrice, petAmount, active);
    }

    function setTier(string calldata key, uint256 usdtPrice, uint256 petAmount, bool active) external onlyOwner {
        _setTier(key, usdtPrice, petAmount, active);
    }

    /// @param expectedPrice The USDT price the user expects (slippage protection)
    /// @param expectedAmount The PET amount the user expects (slippage protection)
    function purchase(string calldata tierKey, uint256 expectedPrice, uint256 expectedAmount) external nonReentrant whenNotPaused {
        Tier memory t = tiers[tierKey];
        require(t.active, "Tier not active");
        require(t.usdtPrice > 0, "Invalid tier");
        require(t.usdtPrice == expectedPrice, "Price changed");
        require(t.petAmount == expectedAmount, "Amount changed");

        // M-3: Rate limit
        uint256 today = block.timestamp / 1 days;
        if (userLastPurchaseDay[msg.sender] != today) {
            userDailyPurchases[msg.sender] = 0;
            userLastPurchaseDay[msg.sender] = today;
        }
        require(userDailyPurchases[msg.sender] < MAX_PURCHASES_PER_DAY, "Daily limit reached");
        userDailyPurchases[msg.sender]++;

        require(usdt.allowance(msg.sender, address(this)) >= t.usdtPrice, "Insufficient USDT allowance");
        usdt.safeTransferFrom(msg.sender, address(this), t.usdtPrice);
        petToken.mint(msg.sender, t.petAmount);

        totalSold += t.petAmount;
        totalRevenue += t.usdtPrice;

        emit Purchase(msg.sender, tierKey, t.usdtPrice, t.petAmount, block.timestamp);
    }

    // H-1: Only withdraw to owner, no arbitrary address
    function withdrawUSDT() external onlyOwner {
        uint256 balance = usdt.balanceOf(address(this));
        require(balance > 0, "No USDT");
        usdt.safeTransfer(msg.sender, balance);
        emit USDTWithdrawn(msg.sender, balance);
    }

    function getTier(string calldata key) external view returns (uint256 usdtPrice, uint256 petAmount, bool active) {
        Tier memory t = tiers[key];
        return (t.usdtPrice, t.petAmount, t.active);
    }

    function getTierCount() external view returns (uint256) {
        return tierKeys.length;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
