import test from "node:test";
import assert from "node:assert/strict";

import {
  createVerificationUrl,
  credentialIdMatchesQrEntry,
  generateVerificationQrDataUrl,
  parseVerificationCredentialId,
} from "../lib/qr";
import { createVerificationProof } from "../lib/proof";
import { generateRandomBytes32 } from "../lib/crypto";
import { verifyCertificateWithBlockchain } from "../lib/verification";
import { SEPOLIA_CHAIN_ID } from "../lib/config";
import { parseContractError } from "../lib/contract";

const TEST_CONTRACT = "0x1234567890123456789012345678901234567890";

function createMockPdf(content: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${content}`);
}

test("25. QR link is exactly /verify?id=<credentialId> on the public origin", () => {
  const credentialId = generateRandomBytes32();
  const url = createVerificationUrl(credentialId, "https://certtrace.example/app");
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://certtrace.example");
  assert.equal(parsed.pathname, "/verify");
  assert.deepEqual([...parsed.searchParams.keys()], ["id"]);
  assert.equal(parsed.searchParams.get("id"), credentialId.toLowerCase());
  assert.equal(parseVerificationCredentialId(parsed.searchParams.get("id")), credentialId.toLowerCase());
});

test("26. QR payload contains no proof, PDF, salt, contract address, version, or PII", async () => {
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const url = createVerificationUrl(credentialId, "https://certtrace-sih2026.vercel.app");
  for (const forbidden of [salt, "%PDF", "studentName", "contractAddress", "version", "proof"]) {
    assert.equal(url.includes(forbidden), false);
  }
  assert.deepEqual([...new URL(url).searchParams.keys()], ["id"]);
  assert.match(await generateVerificationQrDataUrl(url), /^data:image\/png;base64,/);
});

test("27. malformed QR credential IDs and non-verification URLs are rejected", async () => {
  assert.equal(parseVerificationCredentialId("not-a-credential"), null);
  assert.throws(
    () => createVerificationUrl("not-a-credential", "https://certtrace.example"),
    /invalid credential ID/i
  );
  await assert.rejects(
    () => generateVerificationQrDataUrl("https://certtrace.example/not-verify?id=" + generateRandomBytes32()),
    /verification route/i
  );
});

test("28. QR entry alone cannot establish authenticity", async () => {
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

test("29. QR credential ID must match the uploaded proof", async () => {
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

test("30. registry revocation errors remain explicit", () => {
  assert.match(parseContractError({ message: "UnknownCredential" }), /not registered/i);
  assert.match(parseContractError({ message: "CredentialAlreadyRevoked" }), /already been revoked/i);
  assert.match(parseContractError({ message: "CredentialIssuerOnly" }), /originally issued/i);
});
