import { solidityPackedKeccak256, isAddress, getAddress } from "ethers";
import { COMMITMENT_DOMAIN } from "./config";

/**
 * Calculates the SHA-256 digest over the provided byte array using the Web Crypto API.
 * Returns a 0x-prefixed 32-byte hex string (bytes32).
 */
export async function hashFileBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Cannot calculate hash of empty data");
  }

  const data = (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) as unknown as BufferSource;
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

/**
 * Generates a cryptographically secure random 32-byte value (bytes32)
 * using crypto.getRandomValues().
 */
export function generateRandomBytes32(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/**
 * Validates whether a value is a valid non-zero bytes32 hex string.
 * Must match: ^0x[0-9a-fA-F]{64}$
 */
export function isValidBytes32(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
  if (!bytes32Regex.test(value)) {
    return false;
  }
  // Reject all-zero bytes32 (ethers.ZeroHash)
  const isZero = /^0x0{64}$/.test(value);
  return !isZero;
}

/**
 * Validates whether a value is a valid Ethereum address.
 */
export function isValidEthereumAddress(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  return isAddress(value);
}

/**
 * Normalizes an Ethereum address to checksum format.
 */
export function normalizeAddress(address: string): string {
  return getAddress(address);
}

/**
 * Calculates the cryptographic commitment using ethers.js solidityPackedKeccak256
 * with the versioned domain separator:
 * solidityPackedKeccak256(
 *   ["string", "bytes32", "bytes32", "bytes32"],
 *   ["CERTTRACE_V1", credentialId, fileHash, salt]
 * )
 */
export function calculateCommitment(
  credentialId: string,
  fileHash: string,
  salt: string
): string {
  if (!isValidBytes32(credentialId)) {
    throw new Error("Invalid credentialId: must be a valid non-zero 32-byte hex string (bytes32)");
  }
  if (!isValidBytes32(fileHash)) {
    throw new Error("Invalid fileHash: must be a valid non-zero 32-byte hex string (bytes32)");
  }
  if (!isValidBytes32(salt)) {
    throw new Error("Invalid salt: must be a valid non-zero 32-byte hex string (bytes32)");
  }

  return solidityPackedKeccak256(
    ["string", "bytes32", "bytes32", "bytes32"],
    [COMMITMENT_DOMAIN, credentialId.toLowerCase(), fileHash.toLowerCase(), salt.toLowerCase()]
  );
}
