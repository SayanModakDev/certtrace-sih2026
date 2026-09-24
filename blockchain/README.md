# CertTrace Blockchain Module (`mocha` and `ethers`)

This project implements the `CertTrace` smart contract using Hardhat 3, Mocha, and Ethers.js for blockchain-based academic certificate issuance and integrity verification.

## Project Overview

- `contracts/CertTrace.sol`: Core smart contract implementing credential issuance, access control, and commitment-based integrity verification.
- `contracts/CertTraceV2.sol`: Separate opt-in successor adding permanent issuer-only revocation without modifying or migrating V1.
- `contracts/CertTrace.t.sol`: Foundry/Solidity unit tests and fuzzing for `CertTrace`.
- `test/CertTrace.ts`: Comprehensive Mocha and Ethers.js integration test suite.
- `ignition/modules/CertTrace.ts`: Hardhat Ignition deployment module.
- `ignition/modules/CertTraceV2.ts`: Separate V2 deployment module.
- `scripts/show-sepolia-deployer.ts`: Safe public deployer/chain preflight (never prints private material).
- `scripts/sepolia-v2-e2e.ts`: Fictional-certificate Sepolia issuance, tamper, unauthorized-revocation simulation, and revocation check.

## Usage

### Running Tests

To run all tests in the project:

```shell
npx hardhat test
```

You can also selectively run Solidity or Mocha tests:

```shell
npx hardhat test solidity
npx hardhat test mocha
```

### Deployment to Sepolia

When ready for Sepolia deployment:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/CertTrace.ts
```

The existing V1 deployment does not support revocation. V2 was separately approved and deployed with:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/CertTraceV2.ts
```

V1: `0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca`

V2: `0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a`

Authorized issuer: `0x89CA83fB6Ed701549D6D40c404445fB4F06FB542`

Deploying V2 did not migrate V1 credentials. Keep both deployment records and addresses distinct.
