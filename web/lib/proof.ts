import {
  SEPOLIA_CHAIN_ID,
  SUPPORTED_PROOF_VERSION,
  CONFIGURED_CONTRACT_ADDRESS,
  getConfiguredContractAddress,
} from "./config";
import { isValidBytes32, isValidEthereumAddress, normalizeAddress } from "./crypto";

/**
 * Standard CertTrace Verification Proof schema.
 */
export interface VerificationProof {
  version: 1;
  credentialId: string;
  salt: string;
  chainId: number;
  contractAddress: string;
}

export type ProofValidationResult =
  | { success: true; proof: VerificationProof }
  | { success: false; error: string };

/**
 * Creates a clean verification proof object conforming to the CertTrace schema.
 * Requires a valid deployed contract address.
 */
export function createVerificationProof(
  credentialId: string,
  salt: string,
  chainId: number = SEPOLIA_CHAIN_ID,
  contractAddress?: string
): VerificationProof {
  const targetAddress = contractAddress || getConfiguredContractAddress();

  if (!isValidBytes32(credentialId)) {
    throw new Error("Cannot create proof: invalid credentialId (must be 32-byte non-zero hex)");
  }
  if (!isValidBytes32(salt)) {
    throw new Error("Cannot create proof: invalid salt (must be 32-byte non-zero hex)");
  }
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Cannot create proof: invalid contractAddress "${targetAddress}"`);
  }

  return {
    version: SUPPORTED_PROOF_VERSION,
    credentialId: credentialId.toLowerCase(),
    salt: salt.toLowerCase(),
    chainId,
    contractAddress: normalizeAddress(targetAddress),
  };
}

/**
 * Parses and validates an unknown input as a CertTrace verification proof.
 * Validates version, credentialId, salt, chainId, and contractAddress.
 * Rejects malformed JSON, unsupported versions, invalid bytes32 values, and incorrect network or contract references.
 */
export function validateVerificationProof(
  input: unknown,
  expectedChainId: number = SEPOLIA_CHAIN_ID,
  expectedContractAddress?: string
): ProofValidationResult {
  let parsed: unknown = input;

  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { success: false, error: "Malformed proof: file is not valid JSON" };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { success: false, error: "Invalid proof structure: expected a JSON object" };
  }

  const record = parsed as Record<string, unknown>;

  // Check version
  if (!("version" in record)) {
    return { success: false, error: "Missing required 'version' field in proof" };
  }
  if (record.version !== SUPPORTED_PROOF_VERSION) {
    return {
      success: false,
      error: `Unsupported proof version: received '${record.version}', expected '${SUPPORTED_PROOF_VERSION}'`,
    };
  }

  // Check credentialId
  if (!("credentialId" in record) || typeof record.credentialId !== "string") {
    return { success: false, error: "Missing or invalid 'credentialId' in proof" };
  }
  if (!isValidBytes32(record.credentialId)) {
    return {
      success: false,
      error: "Invalid 'credentialId': must be a non-zero 32-byte hexadecimal string (bytes32)",
    };
  }

  // Check salt
  if (!("salt" in record) || typeof record.salt !== "string") {
    return { success: false, error: "Missing or invalid 'salt' in proof" };
  }
  if (!isValidBytes32(record.salt)) {
    return {
      success: false,
      error: "Invalid 'salt': must be a non-zero 32-byte hexadecimal string (bytes32)",
    };
  }

  // Check chainId
  if (!("chainId" in record) || typeof record.chainId !== "number" || !Number.isInteger(record.chainId)) {
    return { success: false, error: "Missing or invalid integer 'chainId' in proof" };
  }
  if (record.chainId !== expectedChainId) {
    return {
      success: false,
      error: `Incorrect network chain ID: proof specifies ${record.chainId}, but expected ${expectedChainId} (Sepolia)`,
    };
  }

  // Check contractAddress
  if (!("contractAddress" in record) || typeof record.contractAddress !== "string") {
    return { success: false, error: "Missing or invalid 'contractAddress' in proof" };
  }
  if (!isValidEthereumAddress(record.contractAddress)) {
    return { success: false, error: "Invalid 'contractAddress' format in proof: not an Ethereum address" };
  }

  // Compare with expected contract address if specified or configured
  const activeExpectedAddress = expectedContractAddress !== undefined ? expectedContractAddress : CONFIGURED_CONTRACT_ADDRESS;

  if (activeExpectedAddress && isValidEthereumAddress(activeExpectedAddress)) {
    if (normalizeAddress(record.contractAddress) !== normalizeAddress(activeExpectedAddress)) {
      return {
        success: false,
        error: `Incorrect contract address reference: proof specifies ${record.contractAddress}, expected ${activeExpectedAddress}`,
      };
    }
  } else if (!activeExpectedAddress) {
    return {
      success: false,
      error: "Verification Unavailable: CertTrace contract address is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local to verify against the active deployment.",
    };
  }

  // Forbidden fields check (prevent accidental inclusion of sensitive data)
  const forbiddenKeys = ["privateKey", "private_key", "mnemonic", "seed", "secret", "pdf", "studentName", "email"];
  for (const key of forbiddenKeys) {
    if (key in record) {
      return { success: false, error: `Security violation: proof contains forbidden sensitive key '${key}'` };
    }
  }

  return {
    success: true,
    proof: {
      version: SUPPORTED_PROOF_VERSION,
      credentialId: (record.credentialId as string).toLowerCase(),
      salt: (record.salt as string).toLowerCase(),
      chainId: record.chainId,
      contractAddress: normalizeAddress(record.contractAddress as string),
    },
  };
}

/**
 * Triggers a browser download of the verification proof JSON.
 */
export function downloadProofFile(proof: VerificationProof, baseFilename: string = "certtrace-proof"): void {
  if (typeof window === "undefined") {
    return;
  }

  const jsonContent = JSON.stringify(proof, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const sanitizedId = proof.credentialId.slice(2, 10);
  a.download = `${baseFilename}-${sanitizedId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
