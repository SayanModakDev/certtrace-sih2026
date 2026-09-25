/** CertTrace production protocol and network configuration. */

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";

export const DEFAULT_SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

// The application has exactly one trusted registry target. Proofs and URLs cannot override it.
export const CONFIGURED_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();

export const CONFIGURED_PUBLIC_APP_ORIGIN =
  (process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim();

export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
export const SUPPORTED_PROOF_VERSION = 1;

// Cryptographic domain version; intentionally independent of contract deployment history.
export const COMMITMENT_DOMAIN = "CERTTRACE_V1";

export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;
export const MIN_PDF_SIZE_BYTES = 10;

export function isContractConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(CONFIGURED_CONTRACT_ADDRESS);
}

export function isTrustedContractAddress(address: string): boolean {
  return (
    isContractConfigured() &&
    /^0x[0-9a-fA-F]{40}$/.test(address) &&
    address.toLowerCase() === CONFIGURED_CONTRACT_ADDRESS.toLowerCase()
  );
}

export function getConfiguredContractAddress(): string {
  if (!isContractConfigured()) {
    throw new Error(
      "CertTraceRegistry address is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS."
    );
  }
  return CONFIGURED_CONTRACT_ADDRESS;
}

export function getExplorerTxUrl(txHash: string): string {
  return `${SEPOLIA_EXPLORER_URL}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${SEPOLIA_EXPLORER_URL}/address/${address}`;
}
