// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {CertTrace} from "./CertTrace.sol";
import {Test} from "forge-std/Test.sol";

contract CertTraceTest is Test {
    CertTrace certTrace;

    address issuer = address(0x1111);
    address unauthorizedUser = address(0x2222);

    bytes32 sampleId = keccak256("CERT-2026-CSE-0001");
    bytes32 sampleCommitment = keccak256("STUDENT:SALT:COMMITMENT");

    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 indexed commitment,
        address indexed issuer,
        uint256 timestamp
    );

    function setUp() public {
        certTrace = new CertTrace(issuer);
    }

    function test_InitialIssuer() public view {
        assertEq(certTrace.issuer(), issuer);
        assertEq(certTrace.owner(), issuer);
    }

    function test_IssueCredentialSuccess() public {
        vm.prank(issuer);
        vm.expectEmit(true, true, true, true);
        emit CredentialIssued(sampleId, sampleCommitment, issuer, block.timestamp);

        certTrace.issueCredential(sampleId, sampleCommitment);

        CertTrace.Credential memory cred = certTrace.getCredential(sampleId);
        assertEq(cred.credentialId, sampleId);
        assertEq(cred.commitment, sampleCommitment);
        assertEq(cred.issuer, issuer);
        assertEq(cred.timestamp, block.timestamp);
        assertTrue(cred.isRegistered);
        assertTrue(certTrace.isCredentialRegistered(sampleId));
    }

    function test_RejectUnauthorizedIssuance() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        certTrace.issueCredential(sampleId, sampleCommitment);

        assertFalse(certTrace.isCredentialRegistered(sampleId));
    }

    function test_RejectDuplicateCredentialId() public {
        vm.startPrank(issuer);
        certTrace.issueCredential(sampleId, sampleCommitment);

        bytes32 differentCommitment = keccak256("DIFFERENT_DATA");
        vm.expectRevert();
        certTrace.issueCredential(sampleId, differentCommitment);
        vm.stopPrank();

        CertTrace.Credential memory cred = certTrace.getCredential(sampleId);
        assertEq(cred.commitment, sampleCommitment);
    }

    function test_RejectZeroCredentialId() public {
        vm.prank(issuer);
        vm.expectRevert(CertTrace.InvalidCredentialId.selector);
        certTrace.issueCredential(bytes32(0), sampleCommitment);
    }

    function test_RejectZeroCommitment() public {
        vm.prank(issuer);
        vm.expectRevert(CertTrace.InvalidCommitment.selector);
        certTrace.issueCredential(sampleId, bytes32(0));
    }

    function test_UnknownCredentialHandling() public view {
        bytes32 unknownId = keccak256("NON_EXISTENT");
        CertTrace.Credential memory cred = certTrace.getCredential(unknownId);

        assertEq(cred.credentialId, bytes32(0));
        assertEq(cred.commitment, bytes32(0));
        assertEq(cred.issuer, address(0));
        assertEq(cred.timestamp, 0);
        assertFalse(cred.isRegistered);
        assertFalse(certTrace.isCredentialRegistered(unknownId));
    }

    function testFuzz_IssueCredential(bytes32 id, bytes32 commitment) public {
        vm.assume(id != bytes32(0));
        vm.assume(commitment != bytes32(0));

        vm.prank(issuer);
        certTrace.issueCredential(id, commitment);

        CertTrace.Credential memory cred = certTrace.getCredential(id);
        assertEq(cred.credentialId, id);
        assertEq(cred.commitment, commitment);
        assertEq(cred.issuer, issuer);
        assertTrue(cred.isRegistered);
    }
}
