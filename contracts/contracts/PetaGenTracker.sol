// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PetaGenTracker
 * @notice Records all MY AI PET platform activity on-chain via Relayer pattern
 *
 * Security fixes applied:
 * - C-2: Ownable2Step instead of hand-rolled owner (safe transfer + multisig ready)
 * - M-1: Zero-address checks
 * - M-2: Pausable emergency stop
 * - M-5: Aligned pragma to ^0.8.28
 * - L-2: Events on addRelayer/removeRelayer
 */
contract PetaGenTracker is Ownable2Step, Pausable {

    // ═══════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════

    event VideoGenerated(
        address indexed user,
        uint8 petType,
        uint8 style,
        bytes32 contentHash,
        uint256 timestamp
    );

    event UserRegistered(address indexed user, uint256 timestamp);
    event TokensBurned(address indexed user, uint256 amount, uint256 timestamp);
    event CreditsPurchased(address indexed user, uint256 credits, uint256 amountPaid, uint256 timestamp);

    // L-2: Relayer management events
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    // ═══════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════

    mapping(address => bool) public relayers;

    uint256 public totalUsers;
    uint256 public totalGenerations;
    uint256 public totalBurned;

    mapping(address => bool) public registeredUsers;
    mapping(address => uint256) public userGenerationCount;

    // ═══════════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════════

    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer");
        _;
    }

    // ═══════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════

    constructor() Ownable(msg.sender) {
        relayers[msg.sender] = true;
        emit RelayerAdded(msg.sender);
    }

    // ═══════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════

    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Zero address");
        relayers[_relayer] = true;
        emit RelayerAdded(_relayer);
    }

    function removeRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Zero address");
        relayers[_relayer] = false;
        emit RelayerRemoved(_relayer);
    }

    // ═══════════════════════════════════════════
    //  Core — Batch Operations (gas efficient)
    // ═══════════════════════════════════════════

    function batchGenerate(
        address[] calldata users,
        uint8[] calldata petTypes,
        uint8[] calldata styles,
        bytes32[] calldata contentHashes
    ) external onlyRelayer whenNotPaused {
        uint256 len = users.length;
        require(len == petTypes.length && len == styles.length && len == contentHashes.length, "Length mismatch");
        require(len <= 50, "Batch too large");

        for (uint256 i = 0; i < len; ) {
            address user = users[i];
            require(user != address(0), "Zero address");
            require(petTypes[i] > 0 && petTypes[i] <= 10, "Invalid gen type");
            require(styles[i] <= 20, "Invalid sub type");

            if (!registeredUsers[user]) {
                registeredUsers[user] = true;
                totalUsers++;
                emit UserRegistered(user, block.timestamp);
            }

            totalGenerations++;
            userGenerationCount[user]++;

            emit VideoGenerated(
                user,
                petTypes[i],
                styles[i],
                contentHashes[i],
                block.timestamp
            );

            unchecked { ++i; }
        }
    }

    function batchBurn(
        address[] calldata users,
        uint256[] calldata amounts
    ) external onlyRelayer whenNotPaused {
        uint256 len = users.length;
        require(len == amounts.length, "Length mismatch");
        require(len <= 50, "Batch too large");

        for (uint256 i = 0; i < len; ) {
            require(users[i] != address(0), "Zero address");
            require(amounts[i] > 0, "Zero amount");
            totalBurned += amounts[i];
            emit TokensBurned(users[i], amounts[i], block.timestamp);
            unchecked { ++i; }
        }
    }

    function recordPurchase(
        address user,
        uint256 credits,
        uint256 amountPaid
    ) external onlyRelayer whenNotPaused {
        require(user != address(0), "Zero address");
        if (!registeredUsers[user]) {
            registeredUsers[user] = true;
            totalUsers++;
            emit UserRegistered(user, block.timestamp);
        }
        emit CreditsPurchased(user, credits, amountPaid, block.timestamp);
    }

    // ═══════════════════════════════════════════
    //  View — Dashboard queries
    // ═══════════════════════════════════════════

    function getStats() external view returns (
        uint256 _totalUsers,
        uint256 _totalGenerations,
        uint256 _totalBurned
    ) {
        return (totalUsers, totalGenerations, totalBurned);
    }

    function getUserStats(address user) external view returns (
        bool registered,
        uint256 generations
    ) {
        return (registeredUsers[user], userGenerationCount[user]);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
