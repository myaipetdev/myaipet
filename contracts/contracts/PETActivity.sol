// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PETActivity — On-chain activity recorder for MY AI PET
/// @notice Users call directly (msg.sender only). Events are the primary record; only counters are stored.
contract PETActivity is Ownable2Step, Pausable {
    // ── Events ──────────────────────────────────────────────────────────
    event PetAdopted(address indexed user, string petName, string species, uint256 timestamp);
    event ImageGenerated(address indexed user, uint256 petId, uint8 style, uint256 timestamp);
    event VideoGenerated(address indexed user, uint256 petId, uint8 style, uint8 duration, uint256 timestamp);

    // ── Per-user counters ───────────────────────────────────────────────
    struct UserStats {
        uint64 adoptions;
        uint64 images;
        uint64 videos;
    }
    mapping(address => UserStats) private _userStats;

    // ── Global counters ─────────────────────────────────────────────────
    uint64 public totalAdoptions;
    uint64 public totalImages;
    uint64 public totalVideos;

    // ── Constructor ─────────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {}

    // ── Public functions (anyone, msg.sender only) ──────────────────────

    function recordAdoption(string calldata petName, string calldata species) external whenNotPaused {
        unchecked {
            _userStats[msg.sender].adoptions++;
            totalAdoptions++;
        }
        emit PetAdopted(msg.sender, petName, species, block.timestamp);
    }

    function recordImageGeneration(uint256 petId, uint8 style) external whenNotPaused {
        unchecked {
            _userStats[msg.sender].images++;
            totalImages++;
        }
        emit ImageGenerated(msg.sender, petId, style, block.timestamp);
    }

    function recordVideoGeneration(uint256 petId, uint8 style, uint8 duration) external whenNotPaused {
        unchecked {
            _userStats[msg.sender].videos++;
            totalVideos++;
        }
        emit VideoGenerated(msg.sender, petId, style, duration, block.timestamp);
    }

    // ── View functions ──────────────────────────────────────────────────

    function getUserStats(address user) external view returns (uint256 adoptions, uint256 images, uint256 videos) {
        UserStats storage s = _userStats[user];
        return (s.adoptions, s.images, s.videos);
    }

    function getTotalStats() external view returns (uint256 _totalAdoptions, uint256 _totalImages, uint256 _totalVideos) {
        return (totalAdoptions, totalImages, totalVideos);
    }

    // ── Owner-only ──────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
