import { hashFileBytes } from "./crypto";
import { calculateCommitment } from "./crypto";
import { validateVerificationProof, VerificationProof, ProofValidationResult } from "./proof";
import { validatePdfMagicBytes, validatePdfMetadata } from "./validation";
import { DEFAULT_CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from "./config";

export interface VerificationPreparationSuccess {
  success: true;
  status: "COMMITMENT_COMPUTED_PENDING_CHAIN";
  fileHash: string;
  reconstructedCommitment: string;
  proof: VerificationProof;
  notice: string;
}

export interface VerificationPreparationFailure {
  success: false;
  error: string;
  stage: "PDF_VALIDATION" | "PROOF_VALIDATION" | "HASHING" | "COMMITMENT_CALCULATION";
}

export type VerificationPreparationResult =
  | VerificationPreparationSuccess
  | VerificationPreparationFailure;

export interface VerifyCertificateParams {
  pdfFile: { name: string; size: number; type?: string };
  pdfBuffer: ArrayBuffer | Uint8Array;
  proofInput: unknown;
  expectedChainId?: number;
  expectedContractAddress?: string;
}

/**
 * Validates the certificate PDF and proof, calculates the local SHA-256 digest,
 * and reconstructs the cryptographic commitment.
 *
 * NOTE: This prepares the cryptographic proof and reconstructed commitment.
 * It does NOT fabricate on-chain verification results. Full verification
 * requires a live lookup against the CertTrace smart contract.
 */
export async function prepareCertificateVerification({
  pdfFile,
  pdfBuffer,
  proofInput,
  expectedChainId = SEPOLIA_CHAIN_ID,
  expectedContractAddress = DEFAULT_CONTRACT_ADDRESS,
}: VerifyCertificateParams): Promise<VerificationPreparationResult> {
  // 1. Validate PDF file metadata
  const metaValidation = validatePdfMetadata(pdfFile);
  if (!metaValidation.valid) {
    return {
      success: false,
      error: metaValidation.error || "Invalid PDF file metadata",
      stage: "PDF_VALIDATION",
    };
  }

  // 2. Validate PDF magic bytes
  const magicValidation = validatePdfMagicBytes(pdfBuffer);
  if (!magicValidation.valid) {
    return {
      success: false,
      error: magicValidation.error || "File is not a valid PDF document",
      stage: "PDF_VALIDATION",
    };
  }

  // 3. Validate proof schema and parameters
  const proofResult: ProofValidationResult = validateVerificationProof(
    proofInput,
    expectedChainId,
    expectedContractAddress
  );

  if (!proofResult.success) {
    return {
      success: false,
      error: proofResult.error,
      stage: "PROOF_VALIDATION",
    };
  }

  const { proof } = proofResult;

  // 4. Calculate local SHA-256 over exact PDF bytes
  let fileHash: string;
  try {
    fileHash = await hashFileBytes(pdfBuffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error during hashing";
    return {
      success: false,
      error: `Failed to calculate PDF file hash: ${message}`,
      stage: "HASHING",
    };
  }

  // 5. Reconstruct commitment
  let reconstructedCommitment: string;
  try {
    reconstructedCommitment = calculateCommitment(proof.credentialId, fileHash, proof.salt);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error during commitment reconstruction";
    return {
      success: false,
      error: `Failed to reconstruct commitment: ${message}`,
      stage: "COMMITMENT_CALCULATION",
    };
  }

  return {
    success: true,
    status: "COMMITMENT_COMPUTED_PENDING_CHAIN",
    fileHash,
    reconstructedCommitment,
    proof,
    notice:
      "Cryptographic commitment reconstructed successfully from local PDF bytes and proof. Smart contract verification on Sepolia is pending integration.",
  };
}
