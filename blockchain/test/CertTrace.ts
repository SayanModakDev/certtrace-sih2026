import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("CertTrace", function () {
  let certTrace: any;
  let issuer: any;
  let unauthorizedUser: any;
  let studentWallet: any;

  // Sample valid test identifiers
  const sampleCredentialId = ethers.keccak256(
    ethers.toUtf8Bytes("CERT-2026-CSE-0001")
  );
  const sampleCommitment = ethers.keccak256(
    ethers.toUtf8Bytes("SALT:SECRET:HASH:STUDENT_DATA_AND_GRADE")
  );

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    issuer = signers[0];
    unauthorizedUser = signers[1];
    studentWallet = signers[2];

    certTrace = await ethers.deployContract("CertTrace", [issuer.address]);
  });

  describe("Deployment and Configuration", function () {
    it("Should correctly set the authorized issuer wallet upon deployment", async function () {
      expect(await certTrace.issuer()).to.equal(issuer.address);
      expect(await certTrace.owner()).to.equal(issuer.address);
    });

    it("Should reject deployment if initial issuer is the zero address", async function () {
      await expect(
        ethers.deployContract("CertTrace", [ethers.ZeroAddress])
      ).to.be.revertedWithCustomError(certTrace, "OwnableInvalidOwner");
    });
  });

  describe("Credential Issuance", function () {
    it("Should successfully issue a credential by the authorized issuer", async function () {
      const tx = await certTrace
        .connect(issuer)
        .issueCredential(sampleCredentialId, sampleCommitment);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const record = await certTrace.getCredential(sampleCredentialId);
      expect(record.isRegistered).to.be.true;
      expect(record.credentialId).to.equal(sampleCredentialId);
      expect(record.commitment).to.equal(sampleCommitment);
      expect(record.issuer).to.equal(issuer.address);
      expect(record.timestamp).to.equal(BigInt(block!.timestamp));

      expect(
        await certTrace.isCredentialRegistered(sampleCredentialId)
      ).to.be.true;
    });

    it("Should reject issuance by an unauthorized wallet", async function () {
      await expect(
        certTrace
          .connect(unauthorizedUser)
          .issueCredential(sampleCredentialId, sampleCommitment)
      )
        .to.be.revertedWithCustomError(certTrace, "OwnableUnauthorizedAccount")
        .withArgs(unauthorizedUser.address);

      // Verify the credential was not registered
      const record = await certTrace.getCredential(sampleCredentialId);
      expect(record.isRegistered).to.be.false;
      expect(
        await certTrace.isCredentialRegistered(sampleCredentialId)
      ).to.be.false;
    });

    it("Should reject duplicate credential IDs and prevent overwriting", async function () {
      // First issuance succeeds
      await certTrace
        .connect(issuer)
        .issueCredential(sampleCredentialId, sampleCommitment);

      const originalRecord = await certTrace.getCredential(sampleCredentialId);

      // Attempt second issuance with the same credential ID but different commitment
      const alteredCommitment = ethers.keccak256(
        ethers.toUtf8Bytes("TAMPERED_COMMITMENT")
      );

      await expect(
        certTrace
          .connect(issuer)
          .issueCredential(sampleCredentialId, alteredCommitment)
      )
        .to.be.revertedWithCustomError(certTrace, "CredentialAlreadyExists")
        .withArgs(sampleCredentialId);

      // Verify original record is unchanged
      const currentRecord = await certTrace.getCredential(sampleCredentialId);
      expect(currentRecord.commitment).to.equal(originalRecord.commitment);
      expect(currentRecord.timestamp).to.equal(originalRecord.timestamp);
      expect(currentRecord.issuer).to.equal(originalRecord.issuer);
    });

    it("Should reject zero credential ID", async function () {
      await expect(
        certTrace
          .connect(issuer)
          .issueCredential(ethers.ZeroHash, sampleCommitment)
      ).to.be.revertedWithCustomError(certTrace, "InvalidCredentialId");
    });

    it("Should reject zero commitment", async function () {
      await expect(
        certTrace
          .connect(issuer)
          .issueCredential(sampleCredentialId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(certTrace, "InvalidCommitment");
    });

    it("Should reject when both credential ID and commitment are zero", async function () {
      await expect(
        certTrace
          .connect(issuer)
          .issueCredential(ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(certTrace, "InvalidCredentialId");
    });
  });

  describe("Event Emission", function () {
    it("Should emit CredentialIssued event with correct parameters on successful issuance", async function () {
      const tx = await certTrace
        .connect(issuer)
        .issueCredential(sampleCredentialId, sampleCommitment);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(certTrace, "CredentialIssued")
        .withArgs(
          sampleCredentialId,
          sampleCommitment,
          issuer.address,
          BigInt(block!.timestamp)
        );
    });
  });

  describe("Credential Retrieval and Distinctions", function () {
    it("Should correctly retrieve all fields of a registered credential", async function () {
      const tx = await certTrace
        .connect(issuer)
        .issueCredential(sampleCredentialId, sampleCommitment);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const record = await certTrace.getCredential(sampleCredentialId);

      // Verify named field access
      expect(record.credentialId).to.equal(sampleCredentialId);
      expect(record.commitment).to.equal(sampleCommitment);
      expect(record.issuer).to.equal(issuer.address);
      expect(record.timestamp).to.equal(BigInt(block!.timestamp));
      expect(record.isRegistered).to.be.true;

      // Verify tuple index access
      expect(record[0]).to.equal(sampleCredentialId);
      expect(record[1]).to.equal(sampleCommitment);
      expect(record[2]).to.equal(issuer.address);
      expect(record[3]).to.equal(BigInt(block!.timestamp));
      expect(record[4]).to.be.true;
    });

    it("Should correctly handle an unknown credential ID", async function () {
      const unknownId = ethers.keccak256(
        ethers.toUtf8Bytes("NON_EXISTENT_CREDENTIAL")
      );

      const record = await certTrace.getCredential(unknownId);
      expect(record.isRegistered).to.be.false;
      expect(record.credentialId).to.equal(ethers.ZeroHash);
      expect(record.commitment).to.equal(ethers.ZeroHash);
      expect(record.issuer).to.equal(ethers.ZeroAddress);
      expect(record.timestamp).to.equal(0n);

      expect(await certTrace.isCredentialRegistered(unknownId)).to.be.false;
    });

    it("Should clearly distinguish between registered and unknown credential IDs", async function () {
      const registeredId = sampleCredentialId;
      const unregisteredId = ethers.keccak256(
        ethers.toUtf8Bytes("UNREGISTERED_ID")
      );

      await certTrace
        .connect(issuer)
        .issueCredential(registeredId, sampleCommitment);

      const regRecord = await certTrace.getCredential(registeredId);
      const unregRecord = await certTrace.getCredential(unregisteredId);

      expect(regRecord.isRegistered).to.be.true;
      expect(unregRecord.isRegistered).to.be.false;
      expect(await certTrace.isCredentialRegistered(registeredId)).to.be.true;
      expect(await certTrace.isCredentialRegistered(unregisteredId)).to.be.false;
    });
  });

  describe("Consistency and Security", function () {
    it("Should record consistent issuer address and timestamp across multiple issuances", async function () {
      const id1 = ethers.keccak256(ethers.toUtf8Bytes("CREDENTIAL-1"));
      const id2 = ethers.keccak256(ethers.toUtf8Bytes("CREDENTIAL-2"));
      const commit1 = ethers.keccak256(ethers.toUtf8Bytes("COMMITMENT-1"));
      const commit2 = ethers.keccak256(ethers.toUtf8Bytes("COMMITMENT-2"));

      const tx1 = await certTrace.connect(issuer).issueCredential(id1, commit1);
      const receipt1 = await tx1.wait();
      const block1 = await ethers.provider.getBlock(receipt1.blockNumber);

      const tx2 = await certTrace.connect(issuer).issueCredential(id2, commit2);
      const receipt2 = await tx2.wait();
      const block2 = await ethers.provider.getBlock(receipt2.blockNumber);

      const record1 = await certTrace.getCredential(id1);
      const record2 = await certTrace.getCredential(id2);

      expect(record1.issuer).to.equal(issuer.address);
      expect(record2.issuer).to.equal(issuer.address);
      expect(record1.timestamp).to.equal(BigInt(block1!.timestamp));
      expect(record2.timestamp).to.equal(BigInt(block2!.timestamp));
      expect(record2.timestamp).to.be.gte(record1.timestamp);
    });

    it("Should not allow an unauthorized user to register themselves as an authorized issuer", async function () {
      // An unauthorized user cannot claim ownership or issue credentials
      await expect(
        certTrace
          .connect(unauthorizedUser)
          .transferOwnership(unauthorizedUser.address)
      )
        .to.be.revertedWithCustomError(certTrace, "OwnableUnauthorizedAccount")
        .withArgs(unauthorizedUser.address);

      expect(await certTrace.issuer()).to.equal(issuer.address);
    });
  });
});
