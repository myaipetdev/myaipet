// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PETContent
 * @notice NFT collection for AI-generated pet content + adoption certificates on BSC
 *
 * Security fixes applied:
 * - H-2: ReentrancyGuard + _mint instead of _safeMint
 * - H-3v2: contentHash deduplication
 * - H-5: Owner removed from onlyMinter
 * - M-1: Zero-address checks
 * - M-2: Pausable emergency stop
 * - M-4: Ownable2Step for multisig ownership
 * - M-6: Token ID starts at 1 (not 0)
 * - L-1: Events on addMinter/removeMinter
 */
contract PETContent is ERC721, ERC721URIStorage, Ownable2Step, Pausable, ReentrancyGuard {

    uint256 private _nextTokenId = 1; // M-6: Start at 1

    mapping(address => bool) public minters;
    mapping(bytes32 => bool) public contentHashUsed; // H-3v2: prevent duplicates

    struct ContentMeta {
        address creator;
        uint8 petType;
        uint8 style;
        string genType;    // "image", "video", or "adoption"
        bytes32 contentHash;
        uint256 timestamp;
    }

    mapping(uint256 => ContentMeta) public contentMeta;

    event ContentMinted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 contentHash,
        string genType,
        uint256 timestamp
    );

    // L-1: Events for minter management
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    modifier onlyMinter() {
        require(minters[msg.sender], "Not minter");
        _;
    }

    constructor() ERC721("MY AI PET Content", "PETC") Ownable(msg.sender) {}

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

    /**
     * @notice Mint content NFT to creator
     * @param to The content creator's wallet
     * @param uri The metadata URI
     * @param petType Species index
     * @param style Style index
     * @param genType "image", "video", or "adoption"
     * @param contentHash keccak256 hash of the content for on-chain verification
     */
    function mintContent(
        address to,
        string calldata uri,
        uint8 petType,
        uint8 style,
        string calldata genType,
        bytes32 contentHash
    ) external onlyMinter nonReentrant whenNotPaused returns (uint256) {
        require(to != address(0), "Zero address");
        require(contentHash != bytes32(0), "Empty hash");
        require(!contentHashUsed[contentHash], "Duplicate content");
        contentHashUsed[contentHash] = true;
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId); // H-2: _mint instead of _safeMint to prevent reentrancy
        _setTokenURI(tokenId, uri);

        contentMeta[tokenId] = ContentMeta({
            creator: to,
            petType: petType,
            style: style,
            genType: genType,
            contentHash: contentHash,
            timestamp: block.timestamp
        });

        emit ContentMinted(tokenId, to, contentHash, genType, block.timestamp);
        return tokenId;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1; // Adjusted for starting at 1
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Required overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
