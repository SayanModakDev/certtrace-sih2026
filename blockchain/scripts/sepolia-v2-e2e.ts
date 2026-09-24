import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { network } from "hardhat";

const V1_ADDRESS = "0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca";
const V2_ADDRESS = "0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a";
const EXPECTED_CHAIN_ID = 11155111n;
const COMMITMENT_DOMAIN = "CERTTRACE_V1";

const { ethers } = await network.create();
const [issuer] = await ethers.getSigners();
const activeNetwork = await ethers.provider.getNetwork();

if (activeNetwork.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Refusing E2E transaction on chain ${activeNetwork.chainId}`);
}

const v2 = await ethers.getContractAt("CertTraceV2", V2_ADDRESS, issuer);
const configuredIssuer = await v2.issuer();
if (configuredIssuer.toLowerCase() !== issuer.address.toLowerCase()) {
  throw new Error("Configured signer is not the deployed V2 authorized issuer");
}

const credentialId = ethers.hexlify(ethers.randomBytes(32));
const salt = ethers.hexlify(ethers.randomBytes(32));
const originalPdf = new TextEncoder().encode(
  "%PDF-1.4\n% CertTrace fictional academic certificate\n1 0 obj<</Type/Catalog>>endobj\n" +
    "Certificate: FICTIONAL STUDENT 2026 | Programme: TEST ENGINEERING | Result: PASS\n%%EOF\n"
);
const modifiedPdf = new TextEncoder().encode(
  "%PDF-1.4\n% CertTrace fictional academic certificate\n1 0 obj<</Type/Catalog>>endobj\n" +
    "Certificate: FICTIONAL STUDENT 2026 | Programme: TEST ENGINEERING | Result: DISTINCTION\n%%EOF\n"
);

const originalFileHash = ethers.sha256(originalPdf);
const modifiedFileHash = ethers.sha256(modifiedPdf);
const commitment = ethers.solidityPackedKeccak256(
  ["string", "bytes32", "bytes32", "bytes32"],
  [COMMITMENT_DOMAIN, credentialId, originalFileHash, salt]
);
const modifiedCommitment = ethers.solidityPackedKeccak256(
  ["string", "bytes32", "bytes32", "bytes32"],
  [COMMITMENT_DOMAIN, credentialId, modifiedFileHash, salt]
);

const outputDirectory = join(tmpdir(), `certtrace-v2-e2e-${credentialId.slice(2, 10)}`);
await mkdir(outputDirectory, { recursive: true });
const originalPdfPath = join(outputDirectory, "fictional-certificate-original.pdf");
const modifiedPdfPath = join(outputDirectory, "fictional-certificate-modified.pdf");
const proofPath = join(outputDirectory, "certtrace-v2-proof.json");
await writeFile(originalPdfPath, originalPdf);
await writeFile(modifiedPdfPath, modifiedPdf);
await writeFile(
  proofPath,
  JSON.stringify(
    {
      version: 1,
      credentialId,
      salt,
      chainId: Number(EXPECTED_CHAIN_ID),
      contractAddress: V2_ADDRESS,
    },
    null,
    2
  )
);

console.log("Submitting fictional V2 issuance; waiting for confirmation...");
const issuanceTx = await v2.issueCredential(credentialId, commitment);
const issuanceReceipt = await issuanceTx.wait();
if (!issuanceReceipt || issuanceReceipt.status !== 1) {
  throw new Error("V2 issuance transaction was not confirmed successfully");
}

const issuedRecord = await v2.getCredential(credentialId);
const originalMatches = issuedRecord.commitment.toLowerCase() === commitment.toLowerCase();
const modifiedDetected = issuedRecord.commitment.toLowerCase() !== modifiedCommitment.toLowerCase();
if (!issuedRecord.isRegistered || issuedRecord.isRevoked || !originalMatches || !modifiedDetected) {
  throw new Error("V2 issuance or document-integrity checks failed");
}

const unauthorizedAddress = "0x000000000000000000000000000000000000dEaD";
const revokeData = v2.interface.encodeFunctionData("revokeCredential", [credentialId]);
let unauthorizedRejected = false;
try {
  await ethers.provider.call({ to: V2_ADDRESS, from: unauthorizedAddress, data: revokeData });
} catch {
  unauthorizedRejected = true;
}
if (!unauthorizedRejected) throw new Error("Unauthorized V2 revocation simulation did not revert");

console.log("Submitting fictional V2 revocation; waiting for confirmation...");
const revocationTx = await v2.revokeCredential(credentialId);
const revocationReceipt = await revocationTx.wait();
if (!revocationReceipt || revocationReceipt.status !== 1) {
  throw new Error("V2 revocation transaction was not confirmed successfully");
}

const revokedRecord = await v2.getCredential(credentialId);
const activeAfterRevocation = await v2.isCredentialActive(credentialId);
const originalStillMatches = revokedRecord.commitment.toLowerCase() === commitment.toLowerCase();
if (!revokedRecord.isRegistered || !revokedRecord.isRevoked || activeAfterRevocation || !originalStillMatches) {
  throw new Error("Confirmed V2 revocation state is inconsistent");
}

console.log(
  JSON.stringify(
    {
      chainId: Number(activeNetwork.chainId),
      issuer: issuer.address,
      v1Address: V1_ADDRESS,
      v2Address: V2_ADDRESS,
      credentialId,
      issuanceTransactionHash: issuanceTx.hash,
      issuanceBlockNumber: issuanceReceipt.blockNumber,
      originalVerification: "MATCHES_REGISTERED_DOCUMENT",
      modifiedVerification: "DOCUMENT_MISMATCH",
      unauthorizedRevocationSimulation: "REJECTED",
      revocationTransactionHash: revocationTx.hash,
      revocationBlockNumber: revocationReceipt.blockNumber,
      finalVerification: "REVOKED_REGISTERED_DOCUMENT",
      activeAfterRevocation,
      savedFiles: {
        originalPdfPath,
        modifiedPdfPath,
        proofPath,
      },
    },
    null,
    2
  )
);
