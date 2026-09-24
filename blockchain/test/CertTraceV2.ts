import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("CertTraceV2 revocation", function () {
  let certTrace: any;
  let issuer: any;
  let unauthorizedUser: any;

  const credentialId = ethers.keccak256(ethers.toUtf8Bytes("CERTTRACE-V2-001"));
  const commitment = ethers.keccak256(ethers.toUtf8Bytes("CERTTRACE_V1-COMMITMENT"));

  beforeEach(async function () {
    [issuer, unauthorizedUser] = await ethers.getSigners();
    certTrace = await ethers.deployContract("CertTraceV2", [issuer.address]);
    await certTrace.connect(issuer).issueCredential(credentialId, commitment);
  });

  it("allows the authorized issuer to revoke without overwriting issuance data", async function () {
    const before = await certTrace.getCredential(credentialId);
    await certTrace.connect(issuer).revokeCredential(credentialId);
    const after = await certTrace.getCredential(credentialId);

    expect(after.isRegistered).to.be.true;
    expect(after.isRevoked).to.be.true;
    expect(after.revokedAt).to.be.greaterThan(0n);
    expect(after.credentialId).to.equal(before.credentialId);
    expect(after.commitment).to.equal(before.commitment);
    expect(after.issuer).to.equal(before.issuer);
    expect(after.timestamp).to.equal(before.timestamp);
    expect(await certTrace.isCredentialActive(credentialId)).to.be.false;
  });

  it("rejects revocation by an unauthorized wallet", async function () {
    await expect(certTrace.connect(unauthorizedUser).revokeCredential(credentialId))
      .to.be.revertedWithCustomError(certTrace, "OwnableUnauthorizedAccount")
      .withArgs(unauthorizedUser.address);

    expect((await certTrace.getCredential(credentialId)).isRevoked).to.be.false;
  });

  it("rejects revocation of an unknown credential", async function () {
    const unknownId = ethers.keccak256(ethers.toUtf8Bytes("UNKNOWN"));
    await expect(certTrace.connect(issuer).revokeCredential(unknownId))
      .to.be.revertedWithCustomError(certTrace, "UnknownCredential")
      .withArgs(unknownId);
  });

  it("rejects repeated revocation", async function () {
    await certTrace.connect(issuer).revokeCredential(credentialId);
    await expect(certTrace.connect(issuer).revokeCredential(credentialId))
      .to.be.revertedWithCustomError(certTrace, "CredentialAlreadyRevoked")
      .withArgs(credentialId);
  });

  it("emits CredentialRevoked only after a successful transaction", async function () {
    const tx = await certTrace.connect(issuer).revokeCredential(credentialId);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    await expect(tx)
      .to.emit(certTrace, "CredentialRevoked")
      .withArgs(credentialId, issuer.address, BigInt(block!.timestamp));
  });

  it("keeps a newly issued credential active until it is revoked", async function () {
    const record = await certTrace.getCredential(credentialId);
    expect(record.isRegistered).to.be.true;
    expect(record.isRevoked).to.be.false;
    expect(record.revokedAt).to.equal(0n);
    expect(await certTrace.isCredentialActive(credentialId)).to.be.true;
  });
});
