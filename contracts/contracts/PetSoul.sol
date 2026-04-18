// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PetSoul
 * @notice Web4.0 sovereignty contract for MY AI PET — one contract that handles:
 *         1. Soulbound pet NFT (non-transferable, tokenId < 1_000_000)
 *         2. Persona checkpoints (version history via events)
 *         3. Memory NFTs (transferable collectibles, tokenId >= 1_000_000)
 *         4. Inheritance protocol (successor wallets triggered by inactivity)
 *
 * @dev Security patterns applied (mirrors PETContent / PetaGenTracker):
 *      - Ownable2Step for safe ownership transfer (multisig ready)
 *      - Pausable emergency stop
 *      - ReentrancyGuard on external mint/claim paths
 *      - Relayer role pattern (offchain service dispatches on-chain writes)
 *      - Content hash deduplication for Memory NFTs
 *      - Batch ops for gas efficiency
 *      - Zero-address checks
 */
contract PetSoul is ERC721, Ownable2Step, Pausable, ReentrancyGuard {

    // ═══════════════════════════════════════════════
    //  Constants
    // ═══════════════════════════════════════════════

    /// @notice Token IDs below this threshold are soulbound pets. At or above this are Memory NFTs.
    uint256 public constant MEMORY_ID_OFFSET = 1_000_000;

    /// @notice Max batch size to prevent DoS via large arrays
    uint256 public constant MAX_BATCH = 100;

    // ═══════════════════════════════════════════════
    //  Structs
    // ═══════════════════════════════════════════════

    struct Soul {
        address owner;          // current owner (changes only via inheritance)
        uint256 petId;          // DB pet_id
        bytes32 genesisHash;    // initial persona hash at adoption
        bytes32 currentHash;    // latest persona hash
        uint32  version;        // current checkpoint version
        uint64  birthAt;        // mint timestamp
        uint64  lastActiveAt;   // last heartbeat timestamp (for inheritance detection)
        address successor;      // designated inheritor (set by owner)
        bool    isDeceased;     // set once inheritance has been claimed
    }

    struct Memory {
        uint256 soulTokenId;    // parent soul tokenId
        bytes32 contentHash;    // keccak256 of memory content
        uint8   memoryType;     // 0=conversation, 1=milestone, 2=dream, 3=achievement
        uint8   importance;     // 1–5
        uint64  createdAt;
    }

    // ═══════════════════════════════════════════════
    //  State — Souls
    // ═══════════════════════════════════════════════

    /// @notice soul token id counter (soulbound). Starts at 1, capped below MEMORY_ID_OFFSET.
    uint256 public nextSoulId = 1;

    /// @notice tokenId => Soul
    mapping(uint256 => Soul) public souls;

    /// @notice petId => tokenId (inverse lookup)
    mapping(uint256 => uint256) public petIdToTokenId;

    /// @notice inactivity threshold before a successor can claim (default 180 days)
    uint64 public inactivityPeriod = 180 days;

    /// @dev re-entrant flag that authorises an internal _transfer of a soulbound token.
    ///      Set only inside claimInheritance, unset immediately after.
    bool private _inheritanceInProgress;

    // ═══════════════════════════════════════════════
    //  State — Memories
    // ═══════════════════════════════════════════════

    /// @notice memory token id counter (transferable). Starts at MEMORY_ID_OFFSET.
    uint256 public nextMemoryId = MEMORY_ID_OFFSET;

    /// @notice memoryTokenId => Memory
    mapping(uint256 => Memory) public memories;

    /// @notice dedup content hash for memories
    mapping(bytes32 => bool) public memoryHashUsed;

    // ═══════════════════════════════════════════════
    //  State — Access control
    // ═══════════════════════════════════════════════

    mapping(address => bool) public relayers;

    // ═══════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════

    event SoulMinted(uint256 indexed tokenId, address indexed owner, uint256 indexed petId, bytes32 genesisHash);
    event SoulUpdated(uint256 indexed tokenId, bytes32 newHash, uint32 version);
    event HeartbeatRecorded(uint256 indexed tokenId, uint64 timestamp);
    event SuccessorSet(uint256 indexed tokenId, address indexed successor);
    event InheritanceClaimed(uint256 indexed tokenId, address indexed from, address indexed to);
    event InactivityPeriodUpdated(uint64 oldPeriod, uint64 newPeriod);

    event MemoryMinted(
        uint256 indexed memoryTokenId,
        uint256 indexed soulTokenId,
        bytes32 contentHash,
        uint8 memoryType,
        uint8 importance
    );

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    // ═══════════════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════════════

    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer");
        _;
    }

    // ═══════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════

    constructor() ERC721("MY AI PET Soul", "PSOUL") Ownable(msg.sender) {
        relayers[msg.sender] = true;
        emit RelayerAdded(msg.sender);
    }

    // ═══════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════

    /// @notice Grant relayer role
    function addRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Zero address");
        relayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /// @notice Revoke relayer role
    function removeRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Zero address");
        relayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /// @notice Update inactivity period used by inheritance claim
    function setInactivityPeriod(uint64 period) external onlyOwner {
        require(period >= 1 days && period <= 3650 days, "Out of range");
        uint64 oldPeriod = inactivityPeriod;
        inactivityPeriod = period;
        emit InactivityPeriodUpdated(oldPeriod, period);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ═══════════════════════════════════════════════
    //  Soul — mint & update
    // ═══════════════════════════════════════════════

    /**
     * @notice Mint a new soulbound pet NFT. Called by the relayer on adoption.
     * @param to Owner wallet
     * @param petId Off-chain pet id (from DB)
     * @param genesisHash Initial persona hash
     * @return tokenId Newly minted soul token id
     */
    function mintSoul(
        address to,
        uint256 petId,
        bytes32 genesisHash
    ) external onlyRelayer nonReentrant whenNotPaused returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(petId != 0, "Invalid petId");
        require(genesisHash != bytes32(0), "Empty hash");
        require(petIdToTokenId[petId] == 0, "Pet already minted");

        tokenId = nextSoulId++;
        require(tokenId < MEMORY_ID_OFFSET, "Soul id overflow");

        _mint(to, tokenId);

        souls[tokenId] = Soul({
            owner: to,
            petId: petId,
            genesisHash: genesisHash,
            currentHash: genesisHash,
            version: 1,
            birthAt: uint64(block.timestamp),
            lastActiveAt: uint64(block.timestamp),
            successor: address(0),
            isDeceased: false
        });
        petIdToTokenId[petId] = tokenId;

        emit SoulMinted(tokenId, to, petId, genesisHash);
        emit SoulUpdated(tokenId, genesisHash, 1);
    }

    /**
     * @notice Record a new persona checkpoint. Increments on-chain version.
     * @param tokenId Soul token id
     * @param newHash New persona content hash
     */
    function recordCheckpoint(
        uint256 tokenId,
        bytes32 newHash
    ) external onlyRelayer whenNotPaused {
        _recordCheckpoint(tokenId, newHash);
    }

    /**
     * @notice Batch checkpoint for gas efficiency
     */
    function batchCheckpoint(
        uint256[] calldata tokenIds,
        bytes32[] calldata newHashes
    ) external onlyRelayer whenNotPaused {
        uint256 len = tokenIds.length;
        require(len == newHashes.length, "Length mismatch");
        require(len > 0 && len <= MAX_BATCH, "Invalid batch size");
        for (uint256 i = 0; i < len; ) {
            _recordCheckpoint(tokenIds[i], newHashes[i]);
            unchecked { ++i; }
        }
    }

    function _recordCheckpoint(uint256 tokenId, bytes32 newHash) internal {
        Soul storage s = souls[tokenId];
        require(s.petId != 0, "Soul not found");
        require(!s.isDeceased, "Soul deceased");
        require(newHash != bytes32(0), "Empty hash");
        require(newHash != s.currentHash, "Unchanged hash");

        s.currentHash = newHash;
        unchecked { s.version += 1; }
        s.lastActiveAt = uint64(block.timestamp);

        emit SoulUpdated(tokenId, newHash, s.version);
    }

    // ═══════════════════════════════════════════════
    //  Heartbeat
    // ═══════════════════════════════════════════════

    /// @notice Record activity timestamp — resets inheritance timer
    function heartbeat(uint256 tokenId) external onlyRelayer whenNotPaused {
        _heartbeat(tokenId);
    }

    /// @notice Batch heartbeat
    function batchHeartbeat(uint256[] calldata tokenIds) external onlyRelayer whenNotPaused {
        uint256 len = tokenIds.length;
        require(len > 0 && len <= MAX_BATCH, "Invalid batch size");
        for (uint256 i = 0; i < len; ) {
            _heartbeat(tokenIds[i]);
            unchecked { ++i; }
        }
    }

    function _heartbeat(uint256 tokenId) internal {
        Soul storage s = souls[tokenId];
        require(s.petId != 0, "Soul not found");
        require(!s.isDeceased, "Soul deceased");
        uint64 nowTs = uint64(block.timestamp);
        s.lastActiveAt = nowTs;
        emit HeartbeatRecorded(tokenId, nowTs);
    }

    // ═══════════════════════════════════════════════
    //  Inheritance
    // ═══════════════════════════════════════════════

    /**
     * @notice Owner designates a successor wallet that may claim the soul after inactivity.
     *         Only the current on-chain owner of the soul can call this.
     */
    function setSuccessor(uint256 tokenId, address successor) external whenNotPaused {
        require(tokenId < MEMORY_ID_OFFSET, "Not a soul");
        Soul storage s = souls[tokenId];
        require(s.petId != 0, "Soul not found");
        require(!s.isDeceased, "Soul deceased");
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(successor != msg.sender, "Self successor");
        // successor == address(0) clears the designation
        s.successor = successor;
        emit SuccessorSet(tokenId, successor);
    }

    /**
     * @notice Successor claims the soul if the owner has been inactive beyond inactivityPeriod.
     *         Triggers a one-shot authorised transfer past the soulbound guard.
     */
    function claimInheritance(uint256 tokenId) external nonReentrant whenNotPaused {
        require(tokenId < MEMORY_ID_OFFSET, "Not a soul");
        Soul storage s = souls[tokenId];
        require(s.petId != 0, "Soul not found");
        require(!s.isDeceased, "Soul deceased");
        require(s.successor != address(0), "No successor");
        require(msg.sender == s.successor, "Not successor");
        require(
            block.timestamp >= uint256(s.lastActiveAt) + uint256(inactivityPeriod),
            "Owner still active"
        );

        address previousOwner = ownerOf(tokenId);
        address newOwner = s.successor;
        require(newOwner != previousOwner, "Already owner");

        // Update state BEFORE transfer (checks-effects-interactions)
        s.owner = newOwner;
        s.isDeceased = true;
        s.successor = address(0);
        s.lastActiveAt = uint64(block.timestamp);

        // One-shot bypass of soulbound guard
        _inheritanceInProgress = true;
        _transfer(previousOwner, newOwner, tokenId);
        _inheritanceInProgress = false;

        emit InheritanceClaimed(tokenId, previousOwner, newOwner);
    }

    // ═══════════════════════════════════════════════
    //  Memory NFTs (transferable)
    // ═══════════════════════════════════════════════

    /**
     * @notice Mint a memory NFT tied to a soul. Memory NFTs are freely transferable.
     * @param to Recipient
     * @param soulTokenId Parent soul
     * @param contentHash Memory content hash (keccak256, unique)
     * @param memoryType 0=conversation, 1=milestone, 2=dream, 3=achievement
     * @param importance 1–5
     */
    function mintMemory(
        address to,
        uint256 soulTokenId,
        bytes32 contentHash,
        uint8 memoryType,
        uint8 importance
    ) external onlyRelayer nonReentrant whenNotPaused returns (uint256 memoryTokenId) {
        require(to != address(0), "Zero address");
        require(soulTokenId > 0 && soulTokenId < MEMORY_ID_OFFSET, "Invalid soul id");
        require(souls[soulTokenId].petId != 0, "Soul not found");
        require(contentHash != bytes32(0), "Empty hash");
        require(!memoryHashUsed[contentHash], "Duplicate memory");
        require(memoryType <= 3, "Invalid memoryType");
        require(importance >= 1 && importance <= 5, "Invalid importance");

        memoryHashUsed[contentHash] = true;
        memoryTokenId = nextMemoryId++;

        _mint(to, memoryTokenId);

        memories[memoryTokenId] = Memory({
            soulTokenId: soulTokenId,
            contentHash: contentHash,
            memoryType: memoryType,
            importance: importance,
            createdAt: uint64(block.timestamp)
        });

        emit MemoryMinted(memoryTokenId, soulTokenId, contentHash, memoryType, importance);
    }

    // ═══════════════════════════════════════════════
    //  Soulbound enforcement
    // ═══════════════════════════════════════════════

    /**
     * @dev Override of ERC721 _update to enforce the soulbound property.
     *      - Mints (from == 0) and burns (to == 0) are allowed.
     *      - Transfers of tokenIds >= MEMORY_ID_OFFSET (Memory NFTs) are allowed.
     *      - Transfers of soul tokenIds are blocked unless _inheritanceInProgress is set.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (
            from != address(0) &&
            to != address(0) &&
            tokenId < MEMORY_ID_OFFSET &&
            !_inheritanceInProgress
        ) {
            revert("Soul NFT is soulbound");
        }
        return super._update(to, tokenId, auth);
    }

    // ═══════════════════════════════════════════════
    //  View helpers
    // ═══════════════════════════════════════════════

    function getSoul(uint256 tokenId) external view returns (Soul memory) {
        require(souls[tokenId].petId != 0, "Soul not found");
        return souls[tokenId];
    }

    function getSoulByPetId(uint256 petId) external view returns (Soul memory) {
        uint256 tokenId = petIdToTokenId[petId];
        require(tokenId != 0, "Pet not minted");
        return souls[tokenId];
    }

    function getMemory(uint256 memoryTokenId) external view returns (Memory memory) {
        require(memoryTokenId >= MEMORY_ID_OFFSET, "Not a memory");
        require(memories[memoryTokenId].contentHash != bytes32(0), "Memory not found");
        return memories[memoryTokenId];
    }

    /// @notice Whether the inheritance inactivity window has elapsed
    function isInactive(uint256 tokenId) external view returns (bool) {
        Soul memory s = souls[tokenId];
        if (s.petId == 0 || s.isDeceased) return false;
        return block.timestamp >= uint256(s.lastActiveAt) + uint256(inactivityPeriod);
    }

    /// @notice Seconds remaining until inheritance can be claimed (0 if already claimable)
    function timeUntilInheritance(uint256 tokenId) external view returns (uint64) {
        Soul memory s = souls[tokenId];
        if (s.petId == 0 || s.isDeceased) return 0;
        uint256 unlockAt = uint256(s.lastActiveAt) + uint256(inactivityPeriod);
        if (block.timestamp >= unlockAt) return 0;
        return uint64(unlockAt - block.timestamp);
    }

    /// @notice Total number of souls minted (excludes memories)
    function totalSouls() external view returns (uint256) {
        return nextSoulId - 1;
    }

    /// @notice Total number of memories minted
    function totalMemories() external view returns (uint256) {
        return nextMemoryId - MEMORY_ID_OFFSET;
    }

    // ═══════════════════════════════════════════════
    //  Metadata
    // ═══════════════════════════════════════════════

    /// @dev Metadata is served off-chain via the application DB; return empty string on-chain.
    function tokenURI(uint256 /*tokenId*/) public pure override returns (string memory) {
        return "";
    }
}
