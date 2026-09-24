import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import {
  createVerificationUrl,
  credentialIdMatchesQrEntry,
  generateVerificationQrDataUrl,
  parseVerificationCredentialId,
} from "../lib/qr";
import { createVerificationProof } from "../lib/proof";
import { calculateCommitment, generateRandomBytes32, hashFileBytes } from "../lib/crypto";
import { verifyCertificateWithBlockchain } from "../lib/verification";
import { isAddressInTrustedAllowlist, SEPOLIA_CHAIN_ID } from "../lib/config";
import { parseContractError, submitRevokeCredential } from "../lib/contract";

const TEST_CONTRACT = "0x1234567890123456789012345678901234567890";
const ISSUER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createMockPdf(content: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${content}`);
}

test("25. QR link uses the configured public verification origin and preserves the credential ID", () => {
  const credentialId = generateRandomBytes32();
  const url = createVerificationUrl(credentialId, "https://certtrace.example/app");
  const parsed = new URL(url);

  assert.equal(parsed.origin, "https://certtrace.example");
  assert.equal(parsed.pathname, "/verify");
  assert.equal(parsed.searchParams.get("id"), credentialId.toLowerCase());
  assert.equal(parsed.searchParams.has("version"), false, "legacy QR links must continue to route to V1");
  assert.equal(parseVerificationCredentialId(parsed.searchParams.get("id")), credentialId.toLowerCase());
});

test("26. V2 QR links carry an explicit non-secret routing hint", () => {
  const credentialId = generateRandomBytes32();
  const url = createVerificationUrl(credentialId, "https://certtrace.example", "v2");
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("id"), credentialId.toLowerCase());
  assert.equal(parsed.searchParams.get("version"), "v2");
  assert.deepEqual([...parsed.searchParams.keys()], ["id", "version"]);
});

test("27. QR payload includes no salt, PDF data, proof JSON, or personal information", async () => {
  const credentialId = generateRandomBytes32();
  const secretSalt = generateRandomBytes32();
  const url = createVerificationUrl(credentialId, "https://verify.certtrace.example");

  assert.equal(url.includes(secretSalt), false);
  assert.equal(url.includes("%PDF"), false);
  assert.equal(url.includes("studentName"), false);
  assert.equal(url.includes("contractAddress"), false);
  assert.deepEqual([...new URL(url).searchParams.keys()], ["id"]);

  const qrDataUrl = await generateVerificationQrDataUrl(url);
  assert.match(qrDataUrl, /^data:image\/png;base64,/);
});

test("28. malformed QR credential IDs are rejected", () => {
  assert.equal(parseVerificationCredentialId("not-a-credential"), null);
  assert.throws(
    () => createVerificationUrl("not-a-credential", "https://certtrace.example"),
    /invalid credential ID/i
  );
});

test("29. QR entry alone cannot produce successful verification", async () => {
  const credentialId = generateRandomBytes32();
  const pdf = createMockPdf("QR entry is not proof");

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "certificate.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: undefined,
    expectedContractAddress: TEST_CONTRACT,
    expectedCredentialId: credentialId,
  });

  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Proof Validation Failed");
});

test("30. QR credential ID must match the uploaded proof", async () => {
  const qrCredentialId = generateRandomBytes32();
  const proofCredentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const pdf = createMockPdf("Credential binding test");
  const proof = createVerificationProof(proofCredentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  assert.equal(credentialIdMatchesQrEntry(qrCredentialId, proofCredentialId), false);
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "certificate.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    expectedCredentialId: qrCredentialId,
  });

  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Credential ID Mismatch");
});

test("31. V2 verification reports a matching revoked document as revoked, never active", async () => {
  const pdf = createMockPdf("Revoked fictional degree");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, await hashFileBytes(pdf), salt);
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  const mockProvider = {
    call: async (tx: { data: string }) => {
      const coder = ethers.AbiCoder.defaultAbiCoder();
      if (tx.data.startsWith("0xd1be4883")) {
        return coder.encode(
          ["bytes32", "bytes32", "address", "uint256", "bool", "bool", "uint256"],
          [credentialId, commitment, ISSUER, BigInt(1774438800), true, true, BigInt(1774439900)]
        );
      }
      if (tx.data.startsWith("0x1d143848")) return coder.encode(["address"], [ISSUER]);
      return "0x";
    },
  } as unknown as ethers.Provider;

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "revoked.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
    contractVersion: "v2",
  });

  assert.equal(result.outcome, "REVOKED_REGISTERED_DOCUMENT");
  assert.equal(result.onChainRecord?.isRegistered, true);
  assert.equal(result.onChainRecord?.isRevoked, true);
  assert.notEqual(result.outcome, "MATCHES_REGISTERED_DOCUMENT");
});

test("32. V2 active verification preserves original-versus-modified PDF detection", async () => {
  const originalPdf = createMockPdf("Active fictional V2 degree");
  const modifiedPdf = createMockPdf("Modified fictional V2 degree");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, await hashFileBytes(originalPdf), salt);
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const mockProvider = {
    call: async (tx: { data: string }) => {
      if (tx.data.startsWith("0xd1be4883")) {
        return coder.encode(
          ["bytes32", "bytes32", "address", "uint256", "bool", "bool", "uint256"],
          [credentialId, commitment, ISSUER, BigInt(1774438800), true, false, BigInt(0)]
        );
      }
      if (tx.data.startsWith("0x1d143848")) return coder.encode(["address"], [ISSUER]);
      return "0x";
    },
  } as unknown as ethers.Provider;

  const common = {
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
    contractVersion: "v2" as const,
  };
  const originalResult = await verifyCertificateWithBlockchain({
    ...common,
    pdfFile: { name: "original.pdf", size: originalPdf.byteLength, type: "application/pdf" },
    pdfBuffer: originalPdf,
  });
  const modifiedResult = await verifyCertificateWithBlockchain({
    ...common,
    pdfFile: { name: "modified.pdf", size: modifiedPdf.byteLength, type: "application/pdf" },
    pdfBuffer: modifiedPdf,
  });

  assert.equal(originalResult.outcome, "MATCHES_REGISTERED_DOCUMENT");
  assert.equal(originalResult.onChainRecord?.isRevoked, false);
  assert.equal(modifiedResult.outcome, "DOCUMENT_MISMATCH");
});

test("33. contract routing rejects addresses outside the explicit trusted allowlist", () => {
  const trustedV1 = "0x1111111111111111111111111111111111111111";
  const trustedV2 = "0x2222222222222222222222222222222222222222";
  const arbitrary = "0x9999999999999999999999999999999999999999";

  assert.equal(isAddressInTrustedAllowlist(trustedV1, [trustedV1, trustedV2]), true);
  assert.equal(isAddressInTrustedAllowlist(trustedV2, [trustedV1, trustedV2]), true);
  assert.equal(isAddressInTrustedAllowlist(arbitrary, [trustedV1, trustedV2]), false);
  assert.equal(isAddressInTrustedAllowlist("not-an-address", [trustedV1, trustedV2]), false);
});

test("34. V1 cannot submit a fake revocation and V2 errors remain explicit", async () => {
  const signer = { getAddress: async () => ISSUER } as unknown as ethers.Signer;
  await assert.rejects(
    submitRevokeCredential(signer, generateRandomBytes32(), TEST_CONTRACT, "v1"),
    /unavailable on the configured CertTrace V1/i
  );

  assert.match(parseContractError({ message: "execution reverted: UnknownCredential" }), /not registered/i);
  assert.match(parseContractError({ message: "execution reverted: CredentialAlreadyRevoked" }), /already been revoked/i);
});
