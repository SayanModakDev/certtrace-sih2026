import type { Provider } from "ethers";
import { hashFileBytes, calculateCommitment, normalizeAddress } from "./crypto";
import { validateVerificationProof, VerificationProof, ProofValidationResult } from "./proof";
import { validatePdfMagicBytes, validatePdfMetadata } from "./validation";
import {
  SEPOLIA_CHAIN_ID,
  CONFIGURED_CONTRACT_ADDRESS,
  CONFIGURED_CONTRACT_VERSION,
  ContractVersion,
} from "./config";
import { fetchOnChainCredential, getAuthorizedIssuer, OnChainCredentialRecord, parseContractError } from "./contract";
import { credentialIdMatchesQrEntry, parseVerificationCredentialId } from "./qr";

export type VerificationOutcome =
  | "MATCHES_REGISTERED_DOCUMENT"
  | "REVOKED_REGISTERED_DOCUMENT"
  | "DOCUMENT_MISMATCH"
  | "UNKNOWN_CREDENTIAL"
  | "VERIFICATION_UNAVAILABLE";

export interface VerificationResult {
  outcome: VerificationOutcome;
  headline: string;
  details: string;
  fileHash?: string;
  reconstructedCommitment?: string;
  proof?: VerificationProof;
  onChainRecord?: OnChainCredentialRecord;
  authorizedIssuer?: string;
  isIssuerAuthorized?: boolean;
  contractAddress?: string;
  chainId?: number;
  rpcError?: string;
}

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
  provider?: Provider;
  contractVersion?: ContractVersion;
  expectedCredentialId?: string | null;
}

/**
 * Prepares the local cryptographic commitment from the PDF and proof.
 * This is a local-only cryptographic calculation before blockchain lookup.
 */
export async function prepareCertificateVerification({
  pdfFile,
  pdfBuffer,
  proofInput,
  expectedChainId = SEPOLIA_CHAIN_ID,
  expectedContractAddress = CONFIGURED_CONTRACT_ADDRESS,
  expectedCredentialId,
}: VerifyCertificateParams): Promise<VerificationPreparationResult> {
  const metaValidation = validatePdfMetadata(pdfFile);
  if (!metaValidation.valid) {
    return {
      success: false,
      error: metaValidation.error || "Invalid PDF file metadata",
      stage: "PDF_VALIDATION",
    };
  }

  const magicValidation = validatePdfMagicBytes(pdfBuffer);
  if (!magicValidation.valid) {
    return {
      success: false,
      error: magicValidation.error || "File is not a valid PDF document",
      stage: "PDF_VALIDATION",
    };
  }

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

  const qrCredentialId = expectedCredentialId
    ? parseVerificationCredentialId(expectedCredentialId)
    : null;
  if (expectedCredentialId && !qrCredentialId) {
    return {
      success: false,
      error: "Invalid credential ID in the verification link.",
      stage: "PROOF_VALIDATION",
    };
  }
  if (!credentialIdMatchesQrEntry(qrCredentialId, proof.credentialId)) {
    return {
      success: false,
      error: "The selected proof file belongs to a different credential ID than the QR link.",
      stage: "PROOF_VALIDATION",
    };
  }

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

/**
 * Performs end-to-end verification of an academic certificate using client-side hashing
 * and a read-only smart contract lookup against the configured CertTrace contract on Sepolia.
 *
 * Verification does NOT require MetaMask.
 */
export async function verifyCertificateWithBlockchain({
  pdfFile,
  pdfBuffer,
  proofInput,
  expectedChainId = SEPOLIA_CHAIN_ID,
  expectedContractAddress = CONFIGURED_CONTRACT_ADDRESS,
  provider,
  contractVersion = CONFIGURED_CONTRACT_VERSION,
  expectedCredentialId,
}: VerifyCertificateParams): Promise<VerificationResult> {
  const activeContractAddress = expectedContractAddress || CONFIGURED_CONTRACT_ADDRESS;

  // 1. Verify contract address configuration
  if (!activeContractAddress || !/^0x[0-9a-fA-F]{40}$/.test(activeContractAddress)) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Blockchain Not Configured",
      details:
        "The selected trusted CertTrace contract address is not configured for on-chain verification.",
      contractAddress: activeContractAddress || undefined,
      chainId: expectedChainId,
    };
  }

  // 2. Validate PDF file metadata
  const metaValidation = validatePdfMetadata(pdfFile);
  if (!metaValidation.valid) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Invalid Certificate File",
      details: metaValidation.error || "The selected file is not a valid PDF.",
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // 3. Validate PDF magic bytes
  const magicValidation = validatePdfMagicBytes(pdfBuffer);
  if (!magicValidation.valid) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Corrupt or Invalid PDF",
      details: magicValidation.error || "The file header does not match the PDF standard (%PDF-).",
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // 4. Validate proof schema and parameters
  const proofResult: ProofValidationResult = validateVerificationProof(
    proofInput,
    expectedChainId,
    activeContractAddress
  );

  if (!proofResult.success) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Proof Validation Failed",
      details: proofResult.error,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  const { proof } = proofResult;

  const qrCredentialId = expectedCredentialId
    ? parseVerificationCredentialId(expectedCredentialId)
    : null;
  if (expectedCredentialId && !qrCredentialId) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Invalid Verification Link",
      details: "The QR link does not contain a valid CertTrace credential ID.",
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }
  if (!credentialIdMatchesQrEntry(qrCredentialId, proof.credentialId)) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Credential ID Mismatch",
      details: "The proof file belongs to a different credential ID than the QR verification link.",
      proof,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // 5. Calculate local SHA-256 over exact PDF bytes
  let fileHash: string;
  try {
    fileHash = await hashFileBytes(pdfBuffer);
  } catch (err: unknown) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Hashing Failure",
      details: `Failed to compute document hash: ${err instanceof Error ? err.message : String(err)}`,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // 6. Reconstruct cryptographic commitment
  let reconstructedCommitment: string;
  try {
    reconstructedCommitment = calculateCommitment(proof.credentialId, fileHash, proof.salt);
  } catch (err: unknown) {
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Commitment Calculation Error",
      details: `Failed to reconstruct cryptographic commitment: ${err instanceof Error ? err.message : String(err)}`,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // 7. Query live blockchain via read-only provider
  let onChainRecord: OnChainCredentialRecord;
  let authorizedIssuer: string | undefined;

  try {
    onChainRecord = await fetchOnChainCredential(
      proof.credentialId,
      activeContractAddress,
      provider,
      contractVersion
    );
  } catch (err: unknown) {
    const errorMsg = parseContractError(err);
    return {
      outcome: "VERIFICATION_UNAVAILABLE",
      headline: "Blockchain Query Failed",
      details: `Could not read credential from CertTrace contract: ${errorMsg}`,
      fileHash,
      reconstructedCommitment,
      proof,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
      rpcError: errorMsg,
    };
  }

  // Fetch contract's authorized issuer for verification display
  try {
    authorizedIssuer = await getAuthorizedIssuer(activeContractAddress, provider, contractVersion);
  } catch {
    // Non-fatal if issuer query fails
  }

  const isIssuerAuthorized = Boolean(
    authorizedIssuer &&
    onChainRecord.issuer &&
    normalizeAddress(authorizedIssuer) === normalizeAddress(onChainRecord.issuer)
  );

  // 8. Distinguish verification outcomes
  if (!onChainRecord.isRegistered || onChainRecord.timestamp === 0) {
    return {
      outcome: "UNKNOWN_CREDENTIAL",
      headline: "Unknown Credential",
      details:
        "This credential ID has not been registered on the configured CertTrace smart contract. The record does not exist on-chain.",
      fileHash,
      reconstructedCommitment,
      proof,
      onChainRecord,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  // Record exists on-chain: Compare cryptographic commitments
  const matches =
    onChainRecord.commitment.toLowerCase() === reconstructedCommitment.toLowerCase();

  if (matches && onChainRecord.isRevoked) {
    return {
      outcome: "REVOKED_REGISTERED_DOCUMENT",
      headline: "Revoked — Registered Document",
      details:
        "The PDF matches the registered on-chain document, but the authorized issuer has revoked this credential. It must not be treated as active or valid.",
      fileHash,
      reconstructedCommitment,
      proof,
      onChainRecord,
      authorizedIssuer,
      isIssuerAuthorized,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }

  if (matches) {
    return {
      outcome: "MATCHES_REGISTERED_DOCUMENT",
      headline: "Matches Registered Document",
      details:
        "The cryptographic commitment calculated from the certificate PDF strictly matches the on-chain issuance record registered on Sepolia.",
      fileHash,
      reconstructedCommitment,
      proof,
      onChainRecord,
      authorizedIssuer,
      isIssuerAuthorized,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  } else {
    return {
      outcome: "DOCUMENT_MISMATCH",
      headline: "Document Mismatch",
      details:
        "The credential ID exists on the blockchain, but the cryptographic commitment of this PDF does not match the registered on-chain commitment. The document contents or proof salt differ from the original.",
      fileHash,
      reconstructedCommitment,
      proof,
      onChainRecord,
      authorizedIssuer,
      isIssuerAuthorized,
      contractAddress: activeContractAddress,
      chainId: expectedChainId,
    };
  }
}
