# CertTrace Blockchain Module (`mocha` and `ethers`)

This project implements the `CertTrace` smart contract using Hardhat 3, Mocha, and Ethers.js for blockchain-based academic certificate issuance and integrity verification.

## Project Overview

- `contracts/CertTrace.sol`: Core smart contract implementing credential issuance, access control, and commitment-based integrity verification.
- `contracts/CertTraceV2.sol`: Separate opt-in successor adding permanent issuer-only revocation without modifying or migrating V1.
- `contracts/CertTrace.t.sol`: Foundry/Solidity unit tests and fuzzing for `CertTrace`.
- `test/CertTrace.ts`: Comprehensive Mocha and Ethers.js integration test suite.
- `ignition/modules/CertTrace.ts`: Hardhat Ignition deployment module.

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

The existing V1 deployment does not support revocation. A V2 deployment must be separately approved and uses its own module and address:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/CertTraceV2.ts
```

Deploying V2 does not migrate V1 credentials. Keep both deployment records and addresses distinct.
