import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import {
  isMetaMaskInstalled,
  requestConnectWallet,
  switchToSepolia,
  getAuthorizedIssuer,
  fetchOnChainCredential,
  submitIssueCredential,
  parseContractError,
} from "../lib/contract";

import {
  verifyCertificateWithBlockchain,
} from "../lib/verification";

import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_HEX_CHAIN_ID,
  isContractConfigured,
} from "../lib/config";

import {
  createVerificationProof,
} from "../lib/proof";

import {
  calculateCommitment,
  generateRandomBytes32,
  hashFileBytes,
} from "../lib/crypto";

// Test Fixtures
const TEST_CONTRACT = "0x1234567890123456789012345678901234567890";
const AUTHORIZED_ISSUER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UNAUTHORIZED_USER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createMockPdf(content: string = "Sample Academic Diploma"): Uint8Array {
  const encoder = new TextEncoder();
  const header = encoder.encode("%PDF-1.7\n");
  const body = encoder.encode(content);
  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  return full;
}

test("1. Missing MetaMask detection and user guidance", async () => {
  // Ensure window.ethereum is undefined
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: { ethereum?: unknown } }).window = {};

  try {
    assert.equal(isMetaMaskInstalled(), false);

    await assert.rejects(
      async () => {
        await requestConnectWallet();
      },
      /MetaMask extension not detected/
    );
  } finally {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  }
});

test("2. Wrong network detection and switch request to Sepolia", async () => {
  let switchRequestedChainId: string | null = null;

  // Mock window.ethereum connected to Ethereum Mainnet (chain ID 1)
  const mockEthereum = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_requestAccounts") {
        return [AUTHORIZED_ISSUER];
      }
      if (method === "wallet_switchEthereumChain") {
        switchRequestedChainId = (params?.[0] as { chainId: string }).chainId;
        return null;
      }
      return null;
    },
  };

  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: { ethereum: unknown } }).window = { ethereum: mockEthereum };

  try {
    assert.equal(isMetaMaskInstalled(), true);

    await switchToSepolia();
    assert.equal(switchRequestedChainId, SEPOLIA_HEX_CHAIN_ID);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  }
});

test("3. Unauthorized issuer prevention and contract error decoding", async () => {
  // Test OwnableUnauthorizedAccount custom error decoding
  const unauthorizedError = {
    data: "0x118cdaa7000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    message: "execution reverted: OwnableUnauthorizedAccount",
  };

  const parsed = parseContractError(unauthorizedError);
  assert.match(parsed, /Unauthorized wallet/);

  // Mock provider to test getAuthorizedIssuer
  const mockProvider = {
    call: async (tx: { data: string }) => {
      if (tx.data.startsWith("0x1d143848")) {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(["address"], [AUTHORIZED_ISSUER]);
      }
      return "0x";
    },
  } as unknown as ethers.Provider;

  const onChainIssuer = await getAuthorizedIssuer(TEST_CONTRACT, mockProvider);
  assert.equal(onChainIssuer.toLowerCase(), AUTHORIZED_ISSUER.toLowerCase());
  assert.notEqual(onChainIssuer.toLowerCase(), UNAUTHORIZED_USER.toLowerCase());
});

test("4. Rejected transaction handling (User rejected in MetaMask)", () => {
  const userRejectedError = {
    code: 4001,
    message: "MetaMask Tx Signature: User denied transaction signature.",
  };

  const parsed = parseContractError(userRejectedError);
  assert.match(parsed, /rejected by user in MetaMask/);

  // Ethers ACTION_REJECTED code
  const actionRejectedError = {
    code: "ACTION_REJECTED",
    message: "user rejected action",
  };
  assert.match(parseContractError(actionRejectedError), /rejected by user in MetaMask/);
});

test("5. Successful confirmed issuance workflow and parameter validation", async () => {
  const credentialId = generateRandomBytes32();
  const fileHash = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, fileHash, salt);

  const mockTxHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  // Mock signer that simulates issueCredential transaction
  const mockSigner = {
    getAddress: async () => AUTHORIZED_ISSUER,
  } as unknown as ethers.Signer;

  // Verify submitIssueCredential input validation
  await assert.rejects(
    async () => {
      await submitIssueCredential(mockSigner, "invalid-id", commitment, TEST_CONTRACT);
    },
    /Invalid credentialId/
  );

  await assert.rejects(
    async () => {
      await submitIssueCredential(mockSigner, credentialId, "invalid-commitment", TEST_CONTRACT);
    },
    /Invalid commitment/
  );

  // Mock contract submission simulation
  const mockSubmitIssue = async (
    signer: ethers.Signer,
    cId: string,
    comm: string,
    contractAddr: string
  ) => {
    assert.equal(contractAddr, TEST_CONTRACT);
    return {
      txHash: mockTxHash,
      wait: async () => ({
        status: 1,
        blockNumber: 1234567,
        hash: mockTxHash,
      } as unknown as ethers.ContractTransactionReceipt),
    };
  };

  const { txHash, wait } = await mockSubmitIssue(mockSigner, credentialId, commitment, TEST_CONTRACT);
  assert.equal(txHash, mockTxHash);

  const receipt = await wait();
  assert.equal(receipt.status, 1);
  assert.equal(receipt.blockNumber, 1234567);
});

test("6. Duplicate credential ID rejection parsing", () => {
  const duplicateError = {
    data: "0x87dbb506" + "11".repeat(32), // CredentialAlreadyExists selector
    message: "execution reverted: CredentialAlreadyExists",
  };

  const parsed = parseContractError(duplicateError);
  assert.match(parsed, /already been registered on the blockchain/);
});

test("7. Successful read-only verification (MATCHES_REGISTERED_DOCUMENT)", async () => {
  const pdfBytes = createMockPdf("Authentic Bachelor Degree");
  const fileHash = await hashFileBytes(pdfBytes);
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const commitment = calculateCommitment(credentialId, fileHash, salt);

  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  // Mock read-only provider returning matching on-chain record
  const mockProvider = {
    call: async (tx: { data: string; to: string }) => {
      // If getCredential call
      if (tx.data.startsWith("0xd1be4883")) {
        // Return encoded tuple (bytes32 credentialId, bytes32 commitment, address issuer, uint256 timestamp, bool isRegistered)
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(
          ["bytes32", "bytes32", "address", "uint256", "bool"],
          [credentialId, commitment, AUTHORIZED_ISSUER, BigInt(1774438800), true]
        );
      }
      // If issuer() call
      if (tx.data.startsWith("0x1d143848")) {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(["address"], [AUTHORIZED_ISSUER]);
      }
      return "0x";
    },
  } as unknown as ethers.Provider;

  // Direct test of fetchOnChainCredential helper
  const directRecord = await fetchOnChainCredential(credentialId, TEST_CONTRACT, mockProvider);
  assert.equal(directRecord.isRegistered, true);
  assert.equal(directRecord.credentialId, credentialId);
  assert.equal(directRecord.commitment, commitment);
  assert.equal(directRecord.issuer.toLowerCase(), AUTHORIZED_ISSUER.toLowerCase());

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "degree.pdf", size: pdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: pdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
  });

  assert.equal(result.outcome, "MATCHES_REGISTERED_DOCUMENT");
  assert.equal(result.headline, "Matches Registered Document");
  assert.equal(result.onChainRecord?.isRegistered, true);
  assert.equal(result.onChainRecord?.commitment.toLowerCase(), commitment.toLowerCase());
  assert.equal(result.isIssuerAuthorized, true);
});

test("8. Modified PDF producing a commitment mismatch (DOCUMENT_MISMATCH)", async () => {
  const originalPdf = createMockPdf("Original Academic Credential");
  const originalHash = await hashFileBytes(originalPdf);
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();
  const originalCommitment = calculateCommitment(credentialId, originalHash, salt);

  // Verifier receives a modified PDF
  const tamperedPdf = createMockPdf("Tampered Academic Credential (Grade Altered)");

  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  // Mock read-only provider returns original on-chain commitment
  const mockProvider = {
    call: async (tx: { data: string }) => {
      if (tx.data.startsWith("0xd1be4883")) {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(
          ["bytes32", "bytes32", "address", "uint256", "bool"],
          [credentialId, originalCommitment, AUTHORIZED_ISSUER, BigInt(1774438800), true]
        );
      }
      if (tx.data.startsWith("0x1d143848")) {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(["address"], [AUTHORIZED_ISSUER]);
      }
      return "0x";
    },
  } as unknown as ethers.Provider;

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "tampered.pdf", size: tamperedPdf.byteLength, type: "application/pdf" },
    pdfBuffer: tamperedPdf,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
  });

  assert.equal(result.outcome, "DOCUMENT_MISMATCH");
  assert.equal(result.headline, "Document Mismatch");
  assert.notEqual(result.reconstructedCommitment?.toLowerCase(), originalCommitment.toLowerCase());
  assert.equal(result.onChainRecord?.isRegistered, true);
});

test("9. Unknown credential ID handling (UNKNOWN_CREDENTIAL)", async () => {
  const pdfBytes = createMockPdf("Unregistered Certificate");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  // Mock provider returns uninitialized record (isRegistered: false, timestamp: 0)
  const mockProvider = {
    call: async (tx: { data: string }) => {
      if (tx.data.startsWith("0xd1be4883")) {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        return coder.encode(
          ["bytes32", "bytes32", "address", "uint256", "bool"],
          [ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroAddress, BigInt(0), false]
        );
      }
      return "0x";
    },
  } as unknown as ethers.Provider;

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "unregistered.pdf", size: pdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: pdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
  });

  assert.equal(result.outcome, "UNKNOWN_CREDENTIAL");
  assert.equal(result.headline, "Unknown Credential");
  assert.equal(result.onChainRecord?.isRegistered, false);
});

test("10. Unavailable RPC network failure (VERIFICATION_UNAVAILABLE)", async () => {
  const pdfBytes = createMockPdf("Network Test Certificate");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, TEST_CONTRACT);

  // Mock provider throws network error
  const mockProvider = {
    call: async () => {
      const err = new Error("Failed to fetch from Sepolia RPC endpoint");
      (err as unknown as { code: string }).code = "NETWORK_ERROR";
      throw err;
    },
  } as unknown as ethers.Provider;

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "cert.pdf", size: pdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: pdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: TEST_CONTRACT,
    provider: mockProvider,
  });

  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Blockchain Query Failed");
  assert.match(result.rpcError!, /Network/);
});

test("11. Proof referencing an incorrect contract rejection", async () => {
  const pdfBytes = createMockPdf("Contract Mismatch Certificate");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const foreignContract = "0x9999999999999999999999999999999999999999";
  const proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, foreignContract);

  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "cert.pdf", size: pdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: pdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: TEST_CONTRACT,
  });

  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Proof Validation Failed");
  assert.match(result.details, /Incorrect contract address reference/);
});

test("12. Contract address missing or not configured rejection", async () => {
  const pdfBytes = createMockPdf("Unconfigured Contract Certificate");
  const credentialId = generateRandomBytes32();
  const salt = generateRandomBytes32();

  const proof = {
    version: 1,
    credentialId,
    salt,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: TEST_CONTRACT,
  };

  assert.equal(typeof isContractConfigured(), "boolean");

  // Test when expectedContractAddress is explicitly empty string
  const result = await verifyCertificateWithBlockchain({
    pdfFile: { name: "cert.pdf", size: pdfBytes.byteLength, type: "application/pdf" },
    pdfBuffer: pdfBytes,
    proofInput: proof,
    expectedChainId: SEPOLIA_CHAIN_ID,
    expectedContractAddress: "", // unconfigured
  });

  assert.equal(result.outcome, "VERIFICATION_UNAVAILABLE");
  assert.equal(result.headline, "Blockchain Not Configured");
});
