/**
 * Minimal CertTraceV2 ABI used for the trusted V2 address and V2 issuance/revocation.
 * V1 remains the default so the existing Sepolia deployment is never reinterpreted as V2.
 */
export const CERTTRACE_V2_ABI = [
  "error CredentialAlreadyExists(bytes32 credentialId)",
  "error CredentialAlreadyRevoked(bytes32 credentialId)",
  "error InvalidCommitment()",
  "error InvalidCredentialId()",
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error UnknownCredential(bytes32 credentialId)",
  "event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed commitment, address indexed issuer, uint256 timestamp)",
  "event CredentialRevoked(bytes32 indexed credentialId, address indexed revokedBy, uint256 timestamp)",
  "function getCredential(bytes32 credentialId) view returns ((bytes32 credentialId, bytes32 commitment, address issuer, uint256 timestamp, bool isRegistered, bool isRevoked, uint256 revokedAt))",
  "function isCredentialActive(bytes32 credentialId) view returns (bool)",
  "function isCredentialRegistered(bytes32 credentialId) view returns (bool)",
  "function issueCredential(bytes32 credentialId, bytes32 commitment)",
  "function issuer() view returns (address)",
  "function owner() view returns (address)",
  "function revokeCredential(bytes32 credentialId)",
] as const;
