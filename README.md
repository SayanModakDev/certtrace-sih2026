# CertTrace — SIH 2026

CertTrace is a decentralized academic certificate issuance and integrity verification platform. Developed by **BWU SolveArc** for the **Smart India Hackathon 2026** (Problem Statement: **SIH26194**).

---

## Smart Contract Deployment

The core `CertTrace` smart contract is deployed on the Ethereum Sepolia testnet.

| Parameter | Value |
|---|---|
| **Project** | CertTrace |
| **SIH Problem Statement** | SIH26194 |
| **Network** | Ethereum Sepolia |
| **Chain ID** | `11155111` |
| **Contract Address** | [`0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca`](https://sepolia.etherscan.io/address/0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca) |
| **Deployment Mechanism** | Hardhat Ignition (`ignition/modules/CertTrace.ts`) |

### Deployment & Configuration Details

- **Contract Deployment**: The `CertTrace.sol` contract was compiled with `solc 0.8.34` (optimizer enabled, 200 runs) and deployed to Ethereum Sepolia.
- **Frontend Integration**: The Next.js frontend connects to the contract using the environment variable `NEXT_PUBLIC_CONTRACT_ADDRESS` (configured in `web/.env.local`).
- **Read-Only Verification**: The Verifier Portal queries the Sepolia network using a standard JSON-RPC endpoint (`NEXT_PUBLIC_SEPOLIA_RPC_URL`, defaulting to a public Sepolia node) without requiring users to install MetaMask or connect a wallet.
- **Credential Issuance**: Issuing a credential on-chain requires connecting the authorized issuer wallet via MetaMask and submitting an `issueCredential(bytes32,bytes32)` transaction on Sepolia.

> [!CAUTION]
> **Security Notice**: Never commit wallet private keys, secret recovery phrases (mnemonics), local Hardhat keystore files, or production `.env.local` files to Git. Hardhat configuration variables (`hardhat vars`) and local `.gitignore` rules protect deployment secrets.

---

## Architecture & Cryptographic Scheme

CertTrace implements the `CERTTRACE_V1` cryptographic scheme:
1. **Document Hashing**: SHA-256 computed client-side over the exact raw bytes of the certificate PDF via the browser Web Crypto API.
2. **Entropy**: Cryptographically secure 32-byte `credentialId` and 32-byte `salt` generated using `crypto.getRandomValues()`.
3. **Commitment Reconstruction**: Keccak-256 commitment computed using `solidityPackedKeccak256(["string", "bytes32", "bytes32", "bytes32"], ["CERTTRACE_V1", credentialId, fileHash, salt])`.
4. **On-Chain Storage**: Only the `credentialId` and `commitment` are recorded on Ethereum Sepolia. Private certificate details, student PII, and raw PDFs never leave the client.
5. **Tamper Detection**: Any modification to the certificate PDF produces a different SHA-256 digest, causing a mismatch with the on-chain commitment (`DOCUMENT_MISMATCH`).

---

## Current Testing & Verification Baseline

- **Smart Contract Test Suite**: 22 passing tests in `blockchain/` (8 Foundry/Solidity property and fuzz tests + 14 Mocha/Ethers.js integration tests).
- **Frontend Test Suite**: 24 passing tests in `web/` covering hashing, commitment generation, proof creation/validation, and blockchain verification workflows.
- **Production Build**: Successfully compiled with Next.js 16.3.6 (Turbopack) and zero ESLint errors or warnings.
- **Sepolia Status**: Contract deployed to Sepolia. Automated integration tests validate on-chain contract interfaces; live end-to-end user transactions are ready for Sepolia execution with funded issuer accounts.

---

## Local Development

### 1. Root Workspace
```bash
npm install
npm test      # Runs tests across both web and blockchain
```

### 2. Frontend (`web/`)
```bash
cd web
cp .env.example .env.local
# Set NEXT_PUBLIC_CONTRACT_ADDRESS=0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca
npm run dev   # Starts Next.js app on http://localhost:3000
npm test      # Runs frontend unit & integration tests
npm run lint  # Runs ESLint checks
npm run build # Validates production build
```

### 3. Blockchain (`blockchain/`)
```bash
cd blockchain
npm test      # Runs Hardhat Solidity and Mocha test suites
```
