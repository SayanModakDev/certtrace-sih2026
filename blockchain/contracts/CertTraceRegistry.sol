// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title CertTraceRegistry
 * @author BWU SolveArc (SIH 2026 - SIH26194)
 * @notice Multi-issuer registry for academic certificate commitments.
 * @dev The deployer is the immutable initial administrator and is automatically
 *      authorized as the first issuer. No PDF bytes, salts, or personal data are stored.
 */
contract CertTraceRegistry {
    address public admin;

    mapping(address => bool) public authorizedIssuers;

    struct Credential {
        bytes32 commitment;
        address issuer;
        uint64 issuedAt;
        bool revoked;
        uint64 revokedAt;
        bool exists;
    }

    mapping(bytes32 => Credential) private credentials;

    event IssuerAuthorized(address indexed issuer);
    event IssuerRemoved(address indexed issuer);
    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 indexed commitment,
        address indexed issuer,
        uint64 issuedAt
    );
    event CredentialRevoked(
        bytes32 indexed credentialId,
        address indexed issuer,
        uint64 revokedAt
    );

    error AdminOnly(address account);
    error InvalidIssuerAddress();
    error IssuerAlreadyAuthorized(address issuer);
    error IssuerNotAuthorized(address issuer);
    error InvalidCredentialId();
    error InvalidCommitment();
    error CredentialAlreadyExists(bytes32 credentialId);
    error UnknownCredential(bytes32 credentialId);
    error CredentialAlreadyRevoked(bytes32 credentialId);
    error CredentialIssuerOnly(address account, address credentialIssuer);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert AdminOnly(msg.sender);
        _;
    }

    modifier onlyAuthorizedIssuer() {
        if (!authorizedIssuers[msg.sender]) revert IssuerNotAuthorized(msg.sender);
        _;
    }

    constructor() {
        admin = msg.sender;
        authorizedIssuers[msg.sender] = true;
        emit IssuerAuthorized(msg.sender);
    }

    function authorizeIssuer(address issuer) external onlyAdmin {
        if (issuer == address(0)) revert InvalidIssuerAddress();
        if (authorizedIssuers[issuer]) revert IssuerAlreadyAuthorized(issuer);

        authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer);
    }

    function removeIssuer(address issuer) external onlyAdmin {
        if (issuer == address(0)) revert InvalidIssuerAddress();
        if (!authorizedIssuers[issuer]) revert IssuerNotAuthorized(issuer);

        authorizedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    function isAuthorizedIssuer(address account) external view returns (bool) {
        return authorizedIssuers[account];
    }

    function issueCredential(bytes32 credentialId, bytes32 commitment) external onlyAuthorizedIssuer {
        if (credentialId == bytes32(0)) revert InvalidCredentialId();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (credentials[credentialId].exists) revert CredentialAlreadyExists(credentialId);

        uint64 issuedAt = uint64(block.timestamp);
        credentials[credentialId] = Credential({
            commitment: commitment,
            issuer: msg.sender,
            issuedAt: issuedAt,
            revoked: false,
            revokedAt: 0,
            exists: true
        });

        emit CredentialIssued(credentialId, commitment, msg.sender, issuedAt);
    }

    function revokeCredential(bytes32 credentialId) external {
        Credential storage credential = credentials[credentialId];
        if (!credential.exists) revert UnknownCredential(credentialId);
        if (credential.revoked) revert CredentialAlreadyRevoked(credentialId);
        if (msg.sender != credential.issuer) {
            revert CredentialIssuerOnly(msg.sender, credential.issuer);
        }

        credential.revoked = true;
        credential.revokedAt = uint64(block.timestamp);

        emit CredentialRevoked(credentialId, msg.sender, credential.revokedAt);
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return credentials[credentialId];
    }

    function isCredentialActive(bytes32 credentialId) external view returns (bool) {
        Credential storage credential = credentials[credentialId];
        return credential.exists && !credential.revoked;
    }
}
