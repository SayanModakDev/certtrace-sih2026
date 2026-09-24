/**
 * CertTrace Protocol Configuration
 * Defines constant parameters for cryptographic hashing, proof schemas, and network targets.
 */

// Sepolia Ethereum Testnet Chain ID
export const SEPOLIA_CHAIN_ID = 11155111;

// Default / Configured CertTrace Contract Address (can be overridden via NEXT_PUBLIC_CONTRACT_ADDRESS)
export const DEFAULT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Supported proof version
export const SUPPORTED_PROOF_VERSION = 1;

// Domain separator for versioned commitment calculation
export const COMMITMENT_DOMAIN = "CERTTRACE_V1";

// Maximum acceptable PDF size in bytes (25 MB)
export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;

// Minimum acceptable PDF size in bytes
export const MIN_PDF_SIZE_BYTES = 10;
