import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import { CERTTRACE_REGISTRY_ABI } from "../lib/abi";
import {
  assertIssuanceReadBack,
  checkIssuerAuthorization,
  fetchOnChainCredential,
  getRegistryAdmin,
  isMetaMaskInstalled,
  isRegistryAdmin,
  parseContractError,
  requestConnectWallet,
  submitAuthorizeIssuer,
  submitIssueCredential,
  submitRemoveIssuer,
  submitRevokeCredential,
  switchToSepolia,
  type OnChainCredentialRecord,
} from "../lib/contract";
import { verifyCertificateWithBlockchain } from "../lib/verification";
import { SEPOLIA_CHAIN_ID, SEPOLIA_HEX_CHAIN_ID, isContractConfigured } from "../lib/config";
import { createVerificationProof } from "../lib/proof";
import { calculateCommitment, generateRandomBytes32, hashFileBytes } from "../lib/crypto";

const TEST_CONTRACT = "0x1234567890123456789012345678901234567890";
const ADMIN = "0x9999999999999999999999999999999999999999";
const AUTHORIZED_ISSUER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UNAUTHORIZED_USER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TX_HASH = `0x${"ab".repeat(32)}`;
const iface = new ethers.Interface(CERTTRACE_REGISTRY_ABI);

function createMockPdf(content = "Sample Academic Diploma"): Uint8Array {
  const encoder = new TextEncoder();
  const header = encoder.encode("%PDF-1.7\n");
  const body = encoder.encode(content);
  const full = new Uint8Array(header.length + body.length);
  full.set(header);
  full.set(body, header.length);
  return full;
}

function mockRegistryProvider(
  record: OnChainCredentialRecord,
  authorized = true
): ethers.Provider {
  return {
    call: async (tx: { data: string }) => {
      const parsed = iface.parseTransaction({ data: tx.data });
      if (parsed?.name === "getCredential") {
        return iface.encodeFunctionResult("getCredential", [[
          record.commitment,
          record.issuer,
          BigInt(record.issuedAt),
          record.revoked,
          BigInt(record.revokedAt),
          record.exists,
        ]]);
      }
      if (parsed?.name === "isAuthorizedIssuer") {
        return iface.encodeFunctionResult("isAuthorizedIssuer", [authorized]);
      }
      if (parsed?.name === "admin") {
        return iface.encodeFunctionResult("admin", [ADMIN]);
      }
      throw new Error(`Unexpected contract call: ${parsed?.name}`);
    },
  } as unknown as ethers.Provider;
}

function mockSigner() {
  const transactions: ethers.TransactionRequest[] = [];
  const signer = {
    provider: null,
    sendTransaction: async (tx: ethers.TransactionRequest) => {
      transactions.push(tx);
      return {
        hash: TX_HASH,
        wait: async () => ({ status: 1, blockNumber: 1234, hash: TX_HASH }),
      };
    },
  } as unknown as ethers.Signer;
  return { signer, transactions };
}

test("1. MetaMask absence produces actionable guidance", async () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: { ethereum?: unknown } }).window = {};
  try {
    assert.equal(isMetaMaskInstalled(), false);
    await assert.rejects(() => requestConnectWallet(), /MetaMask extension not detected/);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  }
});

test("2. Any wallet, including an unauthorized wallet, can connect normally", async () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  const ethereum = {
    request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [UNAUTHORIZED_USER];
      if (method === "eth_chainId") return SEPOLIA_HEX_CHAIN_ID;
      return null;
    },
  };
  (globalThis as unknown as { window: { ethereum: unknown } }).window = { ethereum };
  try {
    const connected = await requestConnectWallet();
    assert.equal(connected.address.toLowerCase(), UNAUTHORIZED_USER);
    assert.equal(connected.chainId, SEPOLIA_CHAIN_ID);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  }
});

test("3. Wrong-network wallet receives the Sepolia switch request", async () => {
  let requested: string | null = null;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  const ethereum = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "wallet_switchEthereumChain") {
        requested = (params?.[0] as { chainId: string }).chainId;
      }
      return null;
    },
  };
  (globalThis as unknown as { window: { ethereum: unknown } }).window = { ethereum };
  try {
    await switchToSepolia();
    assert.equal(requested, SEPOLIA_HEX_CHAIN_ID);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  }
});

test("4. Registry admin and issuer authorization are read independently", async () => {
  const record = {
    commitment: ethers.ZeroHash,
    issuer: ethers.ZeroAddress,
    issuedAt: 0,
    revoked: false,
    revokedAt: 0,
    exists: false,
  };
  const provider = mockRegistryProvider(record, true);
  assert.equal(await getRegistryAdmin(TEST_CONTRACT, provider), ethers.getAddress(ADMIN));
  assert.equal(await checkIssuerAuthorization(AUTHORIZED_ISSUER, TEST_CONTRACT, provider), true);
  assert.equal(isRegistryAdmin(ADMIN, ADMIN), true);
  assert.equal(isRegistryAdmin(AUTHORIZED_ISSUER, ADMIN), false);
  assert.equal(isRegistryAdmin(null, ADMIN), false);
});

test("5. Admin authorization and removal helpers submit only validated addresses", async () => {
  const { signer, transactions } = mockSigner();
  await assert.rejects(() => submitAuthorizeIssuer(signer, "bad", TEST_CONTRACT), /valid Ethereum/);
  await submitAuthorizeIssuer(signer, AUTHORIZED_ISSUER, TEST_CONTRACT);
  await submitRemoveIssuer(signer, AUTHORIZED_ISSUER, TEST_CONTRACT);
  assert.equal(transactions.length, 2);
  assert.equal(iface.parseTransaction({ data: transactions[0].data as string })?.name, "authorizeIssuer");
  assert.equal(iface.parseTransaction({ data: transactions[1].data as string })?.name, "removeIssuer");
});

test("6. Issuance and revocation helpers target the unified registry ABI", async () => {
  const { signer, transactions } = mockSigner();
  const credentialId = generateRandomBytes32();
  const commitment = generateRandomBytes32();
  await submitIssueCredential(signer, credentialId, commitment, TEST_CONTRACT);
  await submitRevokeCredential(signer, credentialId, TEST_CONTRACT);
  assert.equal(iface.parseTransaction({ data: transactions[0].data as string })?.name, "issueCredential");
  assert.equal(iface.parseTransaction({ data: transactions[1].data as string })?.name, "revokeCredential");
  await assert.rejects(
    () => submitIssueCredential(signer, "invalid", commitment, TEST_CONTRACT),
    /Invalid credentialId/
  );
});

test("7. Strict issuance confirmation requires the full state read-back", () => {
  const commitment = generateRandomBytes32();
  const valid: OnChainCredentialRecord = {
    commitment,
    issuer: AUTHORIZED_ISSUER,
    issuedAt: 1774438800,
    revoked: false,
    revokedAt: 0,
    exists: true,
  };
  assert.doesNotThrow(() => assertIssuanceReadBack(valid, commitment, AUTHORIZED_ISSUER));
  assert.throws(() => assertIssuanceReadBack({ ...valid, exists: false }, commitment, AUTHORIZED_ISSUER), /does not exist/);
  assert.throws(() => assertIssuanceReadBack({ ...valid, commitment: generateRandomBytes32() }, commitment, AUTHORIZED_ISSUER), /commitment/);
  assert.throws(() => assertIssuanceReadBack({ ...valid, issuer: UNAUTHORIZED_USER }, commitment, AUTHORIZED_ISSUER), /issuer/);
  assert.throws(() => assertIssuanceReadBack({ ...valid, revoked: true }, commitment, AUTHORIZED_ISSUER), /revoked/);
});

test("8. Friendly errors cover authorization, admin, duplicates, and cross-revocation", () => {
  assert.match(parseContractError({ message: "IssuerNotAuthorized" }), /not an authorized/);
  assert.match(parseContractError({ message: "AdminOnly" }), /Only the CertTrace registry admin/);
  assert.match(parseContractError({ message: "CredentialAlreadyExists" }), /already registered/);
  assert.match(parseContractError({ message: "CredentialIssuerOnly" }), /originally issued/);
  assert.match(parseContractError({ code: 4001, message: "user rejected" }), /rejected/);
});

test("9. Original PDF verifies without MetaMask against the current registry", async () => {
  const pdf = createMockPdf("Authentic Bachelor Degree");
  const fileHash = await hashFileBytes(pdf);
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, fileHash, salt);
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const provider = mockRegistryProvider({
    commitment,
    issuer: AUTHORIZED_ISSUER,
    issuedAt: 1774438800,
    revoked: false,
    revokedAt: 0,
    exists: true,
  });

  const record = await fetchOnChainCredential(credentialId, TEST_CONTRACT, provider);
  assert.equal(record.exists, true);
  assert.equal(record.issuer.toLowerCase(), AUTHORIZED_ISSUER);

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "degree.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider,
  });
  assert.equal(result.outcome, "MATCHES_REGISTERED_DOCUMENT");
  assert.equal(result.isIssuerAuthorized, true);
});

test("10. Modified PDF produces DOCUMENT_MISMATCH", async () => {
  const original = createMockPdf("Original Academic Credential");
  const modified = createMockPdf("Modified Academic Credential");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, await hashFileBytes(original), salt);
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const provider = mockRegistryProvider({
    commitment,
    issuer: AUTHORIZED_ISSUER,
    issuedAt: 1774438800,
    revoked: false,
    revokedAt: 0,
    exists: true,
  });
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "modified.pdf", size: modified.byteLength, type: "application/pdf" },
    pdfBuffer: modified,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider,
  });
  assert.equal(result.outcome, "DOCUMENT_MISMATCH");
});

test("11. Revoked matching credential reports REVOKED — REGISTERED DOCUMENT", async () => {
  const pdf = createMockPdf("Revoked Degree");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, await hashFileBytes(pdf), salt);
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const provider = mockRegistryProvider({
    commitment,
    issuer: AUTHORIZED_ISSUER,
    issuedAt: 1774438800,
    revoked: true,
    revokedAt: 1774439900,
    exists: true,
  });
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "revoked.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider,
  });
  assert.equal(result.outcome, "REVOKED_REGISTERED_DOCUMENT");
});

test("12. Unknown credential reports UNKNOWN_CREDENTIAL", async () => {
  const pdf = createMockPdf("Unknown Degree");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const provider = mockRegistryProvider({
    commitment: ethers.ZeroHash,
    issuer: ethers.ZeroAddress,
    issuedAt: 0,
    revoked: false,
    revokedAt: 0,
    exists: false,
  }, false);
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "unknown.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider,
  });
  assert.equal(result.outcome, "UNKNOWN_CREDENTIAL");
});

test("13. RPC failure produces VERIFICATION_UNAVAILABLE", async () => {
  const pdf = createMockPdf("Network Test");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);
  const provider = {
    call: async () => {
      const error = new Error("Failed to fetch Sepolia RPC");
      (error as Error & { code: string }).code = "NETWORK_ERROR";
      throw error;
    },
  } as unknown as ethers.Provider;
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "network.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
    provider,
  });
  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
});

test("14. Arbitrary proof contract addresses are rejected", async () => {
  const pdf = createMockPdf("Foreign Contract Test");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const proof = createVerificationProof(
    credentialId,
    salt,
    SEPOLIA_CHAIN_ID,
    "0x8888888888888888888888888888888888888888"
  );
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "foreign.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: proof,
    expectedContractAddress: TEST_CONTRACT,
  });
  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.match(result.details, /Incorrect contract address reference/);
});

test("15. Missing registry configuration is unavailable", async () => {
  assert.equal(typeof isContractConfigured(), "boolean");
  const pdf = createMockPdf("No Registry");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "none.pdf", size: pdf.byteLength, type: "application/pdf" },
    pdfBuffer: pdf,
    proofInput: { version: 1, credentialId, salt, chainId: SEPOLIA_CHAIN_ID, contractAddress: TEST_CONTRACT },
    expectedContractAddress: "",
  });
  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Blockchain Not Configured");
});
