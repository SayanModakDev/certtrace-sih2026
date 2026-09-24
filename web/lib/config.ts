/**
 * CertTrace Protocol Configuration
 * Defines constant parameters for cryptographic hashing, proof schemas, and network targets.
 */

// Sepolia Ethereum Testnet Chain ID (decimal: 11155111, hex: 0xaa36a7)
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";

// Public Read-Only Sepolia RPC Endpoint (configurable via NEXT_PUBLIC_SEPOLIA_RPC_URL)
export const DEFAULT_SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

// Active Deployed Contract Address
// Set via NEXT_PUBLIC_CONTRACT_ADDRESS environment variable after deployment to Sepolia.
// Unsafe local development defaults (e.g. 0x5FbDB2315678afecb367f032d93F642f64180aa3) are strictly removed.
export const CONFIGURED_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();

// V1 is intentionally the default for compatibility with the existing Sepolia deployment.
// Set this to "v2" only after separately deploying and explicitly configuring CertTraceV2.
export type ContractVersion = "v1" | "v2";
export const CONFIGURED_CONTRACT_VERSION: ContractVersion =
  process.env.NEXT_PUBLIC_CONTRACT_VERSION === "v2" ? "v2" : "v1";

// Optional canonical public origin used in generated verification QR links.
// Browser generation safely falls back to the current deployed origin (window.location.origin).
export const CONFIGURED_PUBLIC_APP_ORIGIN =
  (process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim();

// Sepolia Block Explorer URL
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";

// Supported proof version
export const SUPPORTED_PROOF_VERSION = 1;

// Domain separator for versioned commitment calculation
export const COMMITMENT_DOMAIN = "CERTTRACE_V1";

// Maximum acceptable PDF size in bytes (25 MB)
export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;

// Minimum acceptable PDF size in bytes
export const MIN_PDF_SIZE_BYTES = 10;

/**
 * Checks if a valid CertTrace contract address is configured in the environment.
 */
export function isContractConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(CONFIGURED_CONTRACT_ADDRESS);
}

export function contractSupportsRevocation(
  version: ContractVersion = CONFIGURED_CONTRACT_VERSION
): boolean {
  return version === "v2";
}

/**
 * Returns the configured contract address.
 * Throws a descriptive error if the address is not configured.
 */
export function getConfiguredContractAddress(): string {
  if (!isContractConfigured()) {
    throw new Error(
      "CertTrace smart contract address is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local with a verified deployed Sepolia address."
    );
  }
  return CONFIGURED_CONTRACT_ADDRESS;
}

/**
 * Generates an Etherscan transaction link for Sepolia.
 */
export function getExplorerTxUrl(txHash: string): string {
  return `${SEPOLIA_EXPLORER_URL}/tx/${txHash}`;
}

/**
 * Generates an Etherscan contract/address link for Sepolia.
 */
export function getExplorerAddressUrl(address: string): string {
  return `${SEPOLIA_EXPLORER_URL}/address/${address}`;
}
