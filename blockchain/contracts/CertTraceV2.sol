// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CertTraceV2
 * @author BWU SolveArc (SIH 2026 - SIH26194)
 * @notice Opt-in successor to CertTrace with issuer-controlled credential revocation.
 * @dev This is a separate contract version. Deploying it does not migrate records from CertTrace V1.
 *      It preserves the CERTTRACE_V1 commitment payload and stores no PII, PDF bytes, or proof salts.
 */
contract CertTraceV2 is Ownable {
    struct Credential {
        bytes32 credentialId;
        bytes32 commitment;
        address issuer;
        uint256 timestamp;
        bool isRegistered;
        bool isRevoked;
        uint256 revokedAt;
    }

    mapping(bytes32 => Credential) private _credentials;

    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 indexed commitment,
        address indexed issuer,
        uint256 timestamp
    );

    event CredentialRevoked(
        bytes32 indexed credentialId,
        address indexed revokedBy,
        uint256 timestamp
    );

    error InvalidCredentialId();
    error InvalidCommitment();
    error CredentialAlreadyExists(bytes32 credentialId);
    error UnknownCredential(bytes32 credentialId);
    error CredentialAlreadyRevoked(bytes32 credentialId);

    constructor(address initialIssuer) Ownable(initialIssuer) {}

    function issuer() external view returns (address) {
        return owner();
    }

    function issueCredential(bytes32 credentialId, bytes32 commitment) external onlyOwner {
        if (credentialId == bytes32(0)) revert InvalidCredentialId();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (_credentials[credentialId].isRegistered) {
            revert CredentialAlreadyExists(credentialId);
        }

        uint256 issuanceTimestamp = block.timestamp;
        _credentials[credentialId] = Credential({
            credentialId: credentialId,
            commitment: commitment,
            issuer: msg.sender,
            timestamp: issuanceTimestamp,
            isRegistered: true,
            isRevoked: false,
            revokedAt: 0
        });

        emit CredentialIssued(credentialId, commitment, msg.sender, issuanceTimestamp);
    }

    /**
     * @notice Permanently marks a registered credential as revoked without changing its issuance data.
     * @dev Only the contract owner/authorized issuer can revoke. Revocation is intentionally irreversible.
     */
    function revokeCredential(bytes32 credentialId) external onlyOwner {
        if (credentialId == bytes32(0)) revert InvalidCredentialId();

        Credential storage credential = _credentials[credentialId];
        if (!credential.isRegistered) revert UnknownCredential(credentialId);
        if (credential.isRevoked) revert CredentialAlreadyRevoked(credentialId);

        credential.isRevoked = true;
        credential.revokedAt = block.timestamp;

        emit CredentialRevoked(credentialId, msg.sender, block.timestamp);
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return _credentials[credentialId];
    }

    function isCredentialRegistered(bytes32 credentialId) external view returns (bool) {
        return _credentials[credentialId].isRegistered;
    }

    function isCredentialActive(bytes32 credentialId) external view returns (bool) {
        Credential storage credential = _credentials[credentialId];
        return credential.isRegistered && !credential.isRevoked;
    }
}
