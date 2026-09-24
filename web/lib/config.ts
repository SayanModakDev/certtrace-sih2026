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
