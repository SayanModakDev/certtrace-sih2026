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

export type ContractVersion = "v1" | "v2";

const LEGACY_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();
const LEGACY_CONTRACT_VERSION: ContractVersion =
  process.env.NEXT_PUBLIC_CONTRACT_VERSION === "v2" ? "v2" : "v1";

// Explicit trusted allowlist. The legacy variable remains a backwards-compatible V1 fallback.
// No proof file or URL is allowed to introduce another contract address.
export const TRUSTED_V1_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_V1_CONTRACT_ADDRESS ||
    (LEGACY_CONTRACT_VERSION === "v1" ? LEGACY_CONTRACT_ADDRESS : "")).trim();
export const TRUSTED_V2_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_V2_CONTRACT_ADDRESS ||
    (LEGACY_CONTRACT_VERSION === "v2" ? LEGACY_CONTRACT_ADDRESS : "")).trim();

// Controls new issuance only. Legacy verification chooses an explicit trusted version separately.
export const CONFIGURED_CONTRACT_VERSION: ContractVersion =
  process.env.NEXT_PUBLIC_ISSUANCE_CONTRACT_VERSION === "v2" ||
  (!process.env.NEXT_PUBLIC_ISSUANCE_CONTRACT_VERSION && LEGACY_CONTRACT_VERSION === "v2")
    ? "v2"
    : "v1";

export const CONFIGURED_CONTRACT_ADDRESS =
  CONFIGURED_CONTRACT_VERSION === "v2"
    ? TRUSTED_V2_CONTRACT_ADDRESS
    : TRUSTED_V1_CONTRACT_ADDRESS;

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
export function getTrustedContractAddress(version: ContractVersion): string {
  return version === "v2" ? TRUSTED_V2_CONTRACT_ADDRESS : TRUSTED_V1_CONTRACT_ADDRESS;
}

export function isContractConfigured(
  version: ContractVersion = CONFIGURED_CONTRACT_VERSION
): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(getTrustedContractAddress(version));
}

export function isTrustedContractAddress(address: string, version?: ContractVersion): boolean {
  const versions: ContractVersion[] = version ? [version] : ["v1", "v2"];
  return isAddressInTrustedAllowlist(
    address,
    versions.map((candidate) => getTrustedContractAddress(candidate))
  );
}

export function isAddressInTrustedAllowlist(
  address: string,
  trustedAddresses: readonly string[]
): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const normalized = address.toLowerCase();
  return trustedAddresses.some(
    (trusted) => /^0x[0-9a-fA-F]{40}$/.test(trusted) && trusted.toLowerCase() === normalized
  );
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
export function getConfiguredContractAddress(
  version: ContractVersion = CONFIGURED_CONTRACT_VERSION
): string {
  if (!isContractConfigured(version)) {
    throw new Error(
      `CertTrace ${version.toUpperCase()} contract address is not configured in the trusted application allowlist.`
    );
  }
  return getTrustedContractAddress(version);
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
