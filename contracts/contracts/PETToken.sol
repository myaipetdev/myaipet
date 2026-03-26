// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title PETToken
 * @notice $PET — the native token of MY AI PET ecosystem on BSC
 * @dev Mintable by authorized minters, burnable by holders, with supply cap
 *
 * Security fixes applied:
 * - C-1: MAX_SUPPLY cap (100M)
 * - C-1v2: _update override — pause blocks ALL transfers/burns/mints
 * - H-4: Owner removed from onlyMinter — must be explicitly added
 * - M-1: Zero-address checks on addMinter
 * - M-4: Ownable2Step for safer ownership transfer (multisig ready)
 */
contract PETToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable2Step {

    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M cap

    mapping(address => bool) public minters;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    modifier onlyMinter() {
        require(minters[msg.sender], "Not minter");
        _;
    }

    constructor() ERC20("MY AI PET", "PET") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function addMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "Zero address");
        minters[_minter] = true;
        emit MinterAdded(_minter);
    }

    function removeMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "Zero address");
        minters[_minter] = false;
        emit MinterRemoved(_minter);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "Zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Max supply exceeded");
        _mint(to, amount);
    }

    /// @dev Pause blocks ALL token movement: transfers, burns, mints (via ERC20Pausable)
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
