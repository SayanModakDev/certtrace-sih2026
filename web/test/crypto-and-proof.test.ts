import test from "node:test";
import assert from "node:assert/strict";

import {
  hashFileBytes,
  generateRandomBytes32,
  calculateCommitment,
  isValidBytes32,
  isValidEthereumAddress,
} from "../lib/crypto";

import {
  createVerificationProof,
  validateVerificationProof,
} from "../lib/proof";

import {
  validatePdfMetadata,
  validatePdfMagicBytes,
} from "../lib/validation";

import {
  prepareCertificateVerification,
} from "../lib/verification";

import {
  SEPOLIA_CHAIN_ID,
  DEFAULT_CONTRACT_ADDRESS,
  SUPPORTED_PROOF_VERSION,
  MAX_PDF_SIZE_BYTES,
  MIN_PDF_SIZE_BYTES,
} from "../lib/config";

// Helper to create valid mock PDF bytes
function createMockPdf(content: string = "Sample Academic Certificate Content"): Uint8Array {
  const encoder = new TextEncoder();
  const body = encoder.encode(content);
  const header = encoder.encode("%PDF-1.7\n");
  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  return full;
}

test("1. Deterministic hashing of identical PDF bytes", async () => {
  const pdfBytes1 = createMockPdf("Student: Alice | Degree: Computer Science | Date: 2026-05-15");
  const pdfBytes2 = createMockPdf("Student: Alice | Degree: Computer Science | Date: 2026-05-15");

  const hash1 = await hashFileBytes(pdfBytes1);
  const hash2 = await hashFileBytes(pdfBytes2);

  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 66); // 0x + 64 hex characters
  assert.equal(hash1, hash2, "Identical PDF bytes must produce identical SHA-256 hashes");
});

test("2. Different PDF contents produce different hashes", async () => {
  const pdfBytes1 = createMockPdf("Certificate A: Degree with Honours");
  const pdfBytes2 = createMockPdf("Certificate B: Degree with Distinction (Tampered)");

  const hash1 = await hashFileBytes(pdfBytes1);
  const hash2 = await hashFileBytes(pdfBytes2);

  assert.notEqual(hash1, hash2, "Different PDF contents must produce different hashes");
});

test("3. Secure random generation of bytes32 values", () => {
  const val1 = generateRandomBytes32();
  const val2 = generateRandomBytes32();

  assert.match(val1, /^0x[0-9a-fA-F]{64}$/);
  assert.match(val2, /^0x[0-9a-fA-F]{64}$/);
  assert.notEqual(val1, val2, "Sequential random values must not collide");
  assert.equal(isValidBytes32(val1), true);
  assert.equal(isValidBytes32(val2), true);
});

test("4. Different salts produce different commitments for the same credential and PDF", async () => {
  const pdfBytes = createMockPdf("Diploma of Engineering");
  const fileHash = await hashFileBytes(pdfBytes);
  const credentialId = generateRandomBytes32();

  const salt1 = generateRandomBytes32();
  const salt2 = generateRandomBytes32();

  const commitment1 = calculateCommitment(credentialId, fileHash, salt1);
  const commitment2 = calculateCommitment(credentialId, fileHash, salt2);

  assert.match(commitment1, /^0x[0-9a-fA-F]{64}$/);
  assert.match(commitment2, /^0x[0-9a-fA-F]{64}$/);
  assert.notEqual(commitment1, commitment2, "Different salts must produce different cryptographic commitments");
});

test("5. Issuance and verification calculate identical commitments", async () => {
  // Issuer step: generate random IDs, hash PDF, and compute commitment
  const originalPdf = createMockPdf("Official University Transcript 2026");
  const issuerFileHash = await hashFileBytes(originalPdf);
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const issuerCommitment = calculateCommitment(credentialId, issuerFileHash, salt);

  // Generate proof file to give to student
  const proof = createVerificationProof(credentialId, salt);

  // Verifier step: receives original PDF and proof file, reconstructs commitment
  const verifierFileHash = await hashFileBytes(originalPdf);
  const verifierCommitment = calculateCommitment(proof.credentialId, verifierFileHash, proof.salt);

  assert.equal(
    issuerCommitment,
    verifierCommitment,
    "Commitment calculated during issuance must strictly match commitment reconstructed during verification"
  );

  // Tampered PDF should mismatch
  const tamperedPdf = createMockPdf("Tampered Transcript 2026");
  const tamperedFileHash = await hashFileBytes(tamperedPdf);
  const tamperedCommitment = calculateCommitment(proof.credentialId, tamperedFileHash, proof.salt);

  assert.notEqual(
    issuerCommitment,
    tamperedCommitment,
    "Tampered PDF must produce a non-matching commitment"
  );
});

test("6. Proof creation and validation - valid proof", () => {
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);

  assert.equal(proof.version, SUPPORTED_PROOF_VERSION);
  assert.equal(proof.credentialId, credentialId.toLowerCase());
  assert.equal(proof.salt, salt.toLowerCase());
  assert.equal(proof.chainId, SEPOLIA_CHAIN_ID);
  assert.equal(proof.contractAddress.toLowerCase(), DEFAULT_CONTRACT_ADDRESS.toLowerCase());
  assert.equal(isValidEthereumAddress(proof.contractAddress), true);
  assert.equal(isValidEthereumAddress("invalid-address"), false);

  // Does NOT contain sensitive information
  assert.equal("privateKey" in proof, false);
  assert.equal("studentName" in proof, false);
  assert.equal("pdf" in proof, false);

  const validation = validateVerificationProof(proof, SEPOLIA_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
  assert.equal(validation.success, true);
  if (validation.success) {
    assert.equal(validation.proof.credentialId, credentialId.toLowerCase());
  }
});

test("7. Malformed proof rejection", () => {
  // Not valid JSON string
  const invalidJson = "{ this is not json }";
  const res1 = validateVerificationProof(invalidJson);
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Malformed proof/);

  // Non-object
  const nonObject = JSON.stringify([1, 2, 3]);
  const res2 = validateVerificationProof(nonObject);
  assert.equal(res2.success, false);
  assert.match(res2.error!, /expected a JSON object/);

  // Null input
  const res3 = validateVerificationProof(null);
  assert.equal(res3.success, false);

  // Missing credentialId
  const missingCred = {
    version: 1,
    salt: generateRandomBytes32(),
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const res4 = validateVerificationProof(missingCred);
  assert.equal(res4.success, false);
  assert.match(res4.error!, /credentialId/);

  // Missing salt
  const missingSalt = {
    version: 1,
    credentialId: generateRandomBytes32(),
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const res5 = validateVerificationProof(missingSalt);
  assert.equal(res5.success, false);
  assert.match(res5.error!, /salt/);

  // Invalid bytes32 (too short)
  const invalidBytes32 = {
    version: 1,
    credentialId: "0x1234",
    salt: generateRandomBytes32(),
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const res6 = validateVerificationProof(invalidBytes32);
  assert.equal(res6.success, false);
  assert.match(res6.error!, /credentialId/);

  // All-zero bytes32 rejection
  const zeroBytes32 = {
    version: 1,
    credentialId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    salt: generateRandomBytes32(),
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const res7 = validateVerificationProof(zeroBytes32);
  assert.equal(res7.success, false);
  assert.match(res7.error!, /non-zero/);
});

test("8. Incorrect chain ID and contract address rejection", () => {
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  // Wrong chain ID (e.g. Ethereum Mainnet 1 instead of Sepolia 11155111)
  const wrongChainProof = {
    version: 1,
    credentialId,
    salt,
    chainId: 1,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const chainRes = validateVerificationProof(wrongChainProof, SEPOLIA_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
  assert.equal(chainRes.success, false);
  assert.match(chainRes.error!, /chain ID/i);

  // Wrong contract address
  const wrongContractProof = {
    version: 1,
    credentialId,
    salt,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: "0x1111111111111111111111111111111111111111",
  };
  const contractRes = validateVerificationProof(
    wrongContractProof,
    SEPOLIA_CHAIN_ID,
    DEFAULT_CONTRACT_ADDRESS
  );
  assert.equal(contractRes.success, false);
  assert.match(contractRes.error!, /contract address reference/i);

  // Invalid address syntax
  const invalidAddrProof = {
    version: 1,
    credentialId,
    salt,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: "not-an-address",
  };
  const invalidAddrRes = validateVerificationProof(invalidAddrProof);
  assert.equal(invalidAddrRes.success, false);
  assert.match(invalidAddrRes.error!, /not an Ethereum address/i);
});

test("9. Unsupported proof version rejection", () => {
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const wrongVersionProof = {
    version: 2,
    credentialId,
    salt,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
  };
  const res = validateVerificationProof(wrongVersionProof);
  assert.equal(res.success, false);
  assert.match(res.error!, /Unsupported proof version/i);
});

test("10. Forbidden sensitive fields in proof rejection", () => {
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const taintedProof = {
    version: 1,
    credentialId,
    salt,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
    privateKey: "0xabcdef...",
  };
  const res = validateVerificationProof(taintedProof);
  assert.equal(res.success, false);
  assert.match(res.error!, /Security violation: proof contains forbidden sensitive key 'privateKey'/);
});

test("11. File validation and error handling", async () => {
  // Rejection of non-PDF extension
  const nonPdfMeta = validatePdfMetadata({ name: "diploma.docx", size: 1024, type: "application/msword" });
  assert.equal(nonPdfMeta.valid, false);
  assert.match(nonPdfMeta.error!, /Only PDF files/);

  // Rejection of empty file
  const emptyMeta = validatePdfMetadata({ name: "empty.pdf", size: 0, type: "application/pdf" });
  assert.equal(emptyMeta.valid, false);
  assert.match(emptyMeta.error!, /empty/);

  // Rejection of tiny file under minimum size
  const tinyMeta = validatePdfMetadata({ name: "tiny.pdf", size: MIN_PDF_SIZE_BYTES - 1, type: "application/pdf" });
  assert.equal(tinyMeta.valid, false);
  assert.match(tinyMeta.error!, /too small/);

  // Rejection of file exceeding max limit
  const oversizedMeta = validatePdfMetadata({
    name: "huge.pdf",
    size: MAX_PDF_SIZE_BYTES + 1024,
    type: "application/pdf",
  });
  assert.equal(oversizedMeta.valid, false);
  assert.match(oversizedMeta.error!, /exceeds maximum allowed size/);

  // Rejection of non-PDF magic bytes
  const invalidBuffer = new TextEncoder().encode("This is not a PDF at all");
  const magicRes = validatePdfMagicBytes(invalidBuffer);
  assert.equal(magicRes.valid, false);
  assert.match(magicRes.error!, /missing %PDF- header/);

  // Acceptance of valid PDF buffer
  const validBuffer = createMockPdf("Valid Certificate");
  const validMagicRes = validatePdfMagicBytes(validBuffer);
  assert.equal(validMagicRes.valid, true);

  // Rejection of empty buffer in hashing
  await assert.rejects(
    async () => {
      await hashFileBytes(new Uint8Array(0));
    },
    /Cannot calculate hash of empty data/
  );
});

test("12. Complete verification preparation workflow (End-to-End)", async () => {
  const validPdfBytes = createMockPdf("Student Graduation Certificate 2026");
  const fileHash = await hashFileBytes(validPdfBytes);
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);

  // Run verification preparation
  const result = await prepareCertificateVerification({
    pdfFile: { name: "certificate.pdf", size: validPdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: validPdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: DEFAULT_CONTRACT_ADDRESS,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.status, "COMMITMENT_COMPUTED_PENDING_CHAIN");
    assert.equal(result.fileHash, fileHash);
    const expectedCommitment = calculateCommitment(credentialId, fileHash, salt);
    assert.equal(result.reconstructedCommitment, expectedCommitment);
    assert.match(result.notice, /Sepolia is pending integration/);
  }
});
