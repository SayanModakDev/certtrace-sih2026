// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CertTrace
 * @author BWU SolveArc (SIH 2026 - SIH26194)
 * @notice Blockchain-based academic certificate issuance and integrity verification contract.
 * @dev Stores cryptographic commitments and issuance metadata on-chain.
 *      No personal identifiable information (PII) or raw document files are stored.
 */
contract CertTrace is Ownable {
    /// @notice Struct representing an on-chain academic credential record.
    struct Credential {
        bytes32 credentialId;
        bytes32 commitment;
        address issuer;
        uint256 timestamp;
        bool isRegistered;
    }

    /// @notice Mapping from credential ID to its on-chain Credential record.
    mapping(bytes32 => Credential) private _credentials;

    /// @notice Emitted when a credential is successfully registered on-chain.
    /// @param credentialId The unique identifier of the credential.
    /// @param commitment The cryptographic commitment (e.g., hash of certificate data).
    /// @param issuer The address of the authorized issuer wallet.
    /// @param timestamp The blockchain timestamp when the credential was registered.
    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 indexed commitment,
        address indexed issuer,
        uint256 timestamp
    );

    /// @notice Thrown when an invalid (zero) credential ID is provided.
    error InvalidCredentialId();

    /// @notice Thrown when an invalid (zero) cryptographic commitment is provided.
    error InvalidCommitment();

    /// @notice Thrown when attempting to register a credential ID that is already registered.
    /// @param credentialId The duplicate credential identifier.
    error CredentialAlreadyExists(bytes32 credentialId);

    /**
     * @notice Initializes the CertTrace contract with an authorized issuer wallet.
     * @param initialIssuer Address of the authorized issuer wallet.
     */
    constructor(address initialIssuer) Ownable(initialIssuer) {}

    /**
     * @notice Returns the address of the authorized issuer wallet.
     * @dev Alias for owner() provided by OpenZeppelin Ownable.
     * @return Address of the authorized issuer.
     */
    function issuer() external view returns (address) {
        return owner();
    }

    /**
     * @notice Issues and registers a new academic credential on-chain.
     * @dev Restricted to the authorized issuer wallet only. Existing records cannot be overwritten.
     * @param credentialId Unique identifier for the credential (must not be zero).
     * @param commitment Cryptographic commitment of the credential data (must not be zero).
     */
    function issueCredential(bytes32 credentialId, bytes32 commitment) external onlyOwner {
        if (credentialId == bytes32(0)) {
            revert InvalidCredentialId();
        }
        if (commitment == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (_credentials[credentialId].isRegistered) {
            revert CredentialAlreadyExists(credentialId);
        }

        uint256 issuanceTimestamp = block.timestamp;

        _credentials[credentialId] = Credential({
            credentialId: credentialId,
            commitment: commitment,
            issuer: msg.sender,
            timestamp: issuanceTimestamp,
            isRegistered: true
        });

        emit CredentialIssued(credentialId, commitment, msg.sender, issuanceTimestamp);
    }

    /**
     * @notice Retrieves the credential record associated with the given credential ID.
     * @dev Returns default zero-initialized values with isRegistered = false if the credential is unknown.
     * @param credentialId Unique identifier of the credential to query.
     * @return Credential record containing credentialId, commitment, issuer, timestamp, and isRegistered status.
     */
    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return _credentials[credentialId];
    }

    /**
     * @notice Checks whether a credential ID is registered on-chain.
     * @param credentialId Unique identifier of the credential.
     * @return True if registered, false otherwise.
     */
    function isCredentialRegistered(bytes32 credentialId) external view returns (bool) {
        return _credentials[credentialId].isRegistered;
    }
}
