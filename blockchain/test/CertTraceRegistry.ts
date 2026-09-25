import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("CertTraceRegistry", function () {
  let registry: any;
  let admin: any;
  let issuerA: any;
  let issuerB: any;
  let outsider: any;

  const credentialA = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY-CREDENTIAL-A"));
  const credentialB = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY-CREDENTIAL-B"));
  const commitmentA = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY-COMMITMENT-A"));
  const commitmentB = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY-COMMITMENT-B"));

  beforeEach(async function () {
    [admin, issuerA, issuerB, outsider] = await ethers.getSigners();
    registry = await ethers.deployContract("CertTraceRegistry");
  });

  describe("administration", function () {
    it("sets the deployer as admin and automatically authorizes it", async function () {
      expect(await registry.admin()).to.equal(admin.address);
      expect(await registry.isAuthorizedIssuer(admin.address)).to.equal(true);
      expect(await registry.authorizedIssuers(admin.address)).to.equal(true);
    });

    it("allows the admin to authorize issuer A and issuer B", async function () {
      await expect(registry.authorizeIssuer(issuerA.address))
        .to.emit(registry, "IssuerAuthorized")
        .withArgs(issuerA.address);
      await expect(registry.authorizeIssuer(issuerB.address))
        .to.emit(registry, "IssuerAuthorized")
        .withArgs(issuerB.address);

      expect(await registry.isAuthorizedIssuer(issuerA.address)).to.equal(true);
      expect(await registry.isAuthorizedIssuer(issuerB.address)).to.equal(true);
    });

    it("allows the admin to remove an authorized issuer", async function () {
      await registry.authorizeIssuer(issuerA.address);
      await expect(registry.removeIssuer(issuerA.address))
        .to.emit(registry, "IssuerRemoved")
        .withArgs(issuerA.address);
      expect(await registry.isAuthorizedIssuer(issuerA.address)).to.equal(false);
    });

    it("rejects authorization and removal by a non-admin", async function () {
      await expect(registry.connect(outsider).authorizeIssuer(issuerA.address))
        .to.be.revertedWithCustomError(registry, "AdminOnly")
        .withArgs(outsider.address);
      await registry.authorizeIssuer(issuerA.address);
      await expect(registry.connect(outsider).removeIssuer(issuerA.address))
        .to.be.revertedWithCustomError(registry, "AdminOnly")
        .withArgs(outsider.address);
    });

    it("rejects zero-address issuer transitions", async function () {
      await expect(registry.authorizeIssuer(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "InvalidIssuerAddress");
      await expect(registry.removeIssuer(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "InvalidIssuerAddress");
    });

    it("rejects duplicate or invalid authorization state transitions", async function () {
      await expect(registry.authorizeIssuer(admin.address))
        .to.be.revertedWithCustomError(registry, "IssuerAlreadyAuthorized")
        .withArgs(admin.address);
      await expect(registry.removeIssuer(issuerA.address))
        .to.be.revertedWithCustomError(registry, "IssuerNotAuthorized")
        .withArgs(issuerA.address);
    });
  });

  describe("issuance", function () {
    beforeEach(async function () {
      await registry.authorizeIssuer(issuerA.address);
      await registry.authorizeIssuer(issuerB.address);
    });

    it("allows independent authorized issuers to issue and stores msg.sender", async function () {
      await expect(registry.connect(issuerA).issueCredential(credentialA, commitmentA))
        .to.emit(registry, "CredentialIssued");
      await registry.connect(issuerB).issueCredential(credentialB, commitmentB);

      const recordA = await registry.getCredential(credentialA);
      const recordB = await registry.getCredential(credentialB);
      expect(recordA.commitment).to.equal(commitmentA);
      expect(recordA.issuer).to.equal(issuerA.address);
      expect(recordA.issuedAt).to.be.greaterThan(0n);
      expect(recordA.revoked).to.equal(false);
      expect(recordA.revokedAt).to.equal(0n);
      expect(recordA.exists).to.equal(true);
      expect(recordB.issuer).to.equal(issuerB.address);
    });

    it("rejects issuance by an unauthorized wallet", async function () {
      await expect(registry.connect(outsider).issueCredential(credentialA, commitmentA))
        .to.be.revertedWithCustomError(registry, "IssuerNotAuthorized")
        .withArgs(outsider.address);
    });

    it("rejects zero credential IDs and commitments", async function () {
      await expect(registry.connect(issuerA).issueCredential(ethers.ZeroHash, commitmentA))
        .to.be.revertedWithCustomError(registry, "InvalidCredentialId");
      await expect(registry.connect(issuerA).issueCredential(credentialA, ethers.ZeroHash))
        .to.be.revertedWithCustomError(registry, "InvalidCommitment");
    });

    it("rejects duplicate credential IDs across issuers", async function () {
      await registry.connect(issuerA).issueCredential(credentialA, commitmentA);
      await expect(registry.connect(issuerB).issueCredential(credentialA, commitmentB))
        .to.be.revertedWithCustomError(registry, "CredentialAlreadyExists")
        .withArgs(credentialA);
    });
  });

  describe("revocation", function () {
    beforeEach(async function () {
      await registry.authorizeIssuer(issuerA.address);
      await registry.authorizeIssuer(issuerB.address);
      await registry.connect(issuerA).issueCredential(credentialA, commitmentA);
    });

    it("allows only issuer A to revoke credential A and preserves issuance data", async function () {
      const before = await registry.getCredential(credentialA);
      await expect(registry.connect(issuerA).revokeCredential(credentialA))
        .to.emit(registry, "CredentialRevoked");
      const after = await registry.getCredential(credentialA);

      expect(after.commitment).to.equal(before.commitment);
      expect(after.issuer).to.equal(before.issuer);
      expect(after.issuedAt).to.equal(before.issuedAt);
      expect(after.revoked).to.equal(true);
      expect(after.revokedAt).to.be.greaterThan(0n);
      expect(after.exists).to.equal(true);
      expect(await registry.isCredentialActive(credentialA)).to.equal(false);
    });

    it("rejects cross-issuer and unauthorized revocation", async function () {
      await expect(registry.connect(issuerB).revokeCredential(credentialA))
        .to.be.revertedWithCustomError(registry, "CredentialIssuerOnly")
        .withArgs(issuerB.address, issuerA.address);
      await expect(registry.connect(outsider).revokeCredential(credentialA))
        .to.be.revertedWithCustomError(registry, "CredentialIssuerOnly")
        .withArgs(outsider.address, issuerA.address);
    });

    it("does not grant the admin universal revocation rights", async function () {
      await expect(registry.revokeCredential(credentialA))
        .to.be.revertedWithCustomError(registry, "CredentialIssuerOnly")
        .withArgs(admin.address, issuerA.address);
    });

    it("allows the original issuer to revoke after its authorization is removed", async function () {
      await registry.removeIssuer(issuerA.address);
      await registry.connect(issuerA).revokeCredential(credentialA);
      expect((await registry.getCredential(credentialA)).revoked).to.equal(true);
    });

    it("rejects unknown and repeated revocation", async function () {
      await expect(registry.connect(issuerA).revokeCredential(credentialB))
        .to.be.revertedWithCustomError(registry, "UnknownCredential")
        .withArgs(credentialB);
      await registry.connect(issuerA).revokeCredential(credentialA);
      await expect(registry.connect(issuerA).revokeCredential(credentialA))
        .to.be.revertedWithCustomError(registry, "CredentialAlreadyRevoked")
        .withArgs(credentialA);
    });

    it("reports unknown credentials as inactive", async function () {
      expect(await registry.isCredentialActive(credentialB)).to.equal(false);
    });
  });
});
