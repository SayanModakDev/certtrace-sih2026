# CertTrace — SIH 2026

CertTrace is a decentralized academic certificate issuance and integrity verification platform. Developed by **BWU SolveArc** for the **Smart India Hackathon 2026** (Problem Statement: **SIH26194**).

---

## Smart Contract Deployments

CertTrace uses two explicitly allowlisted Ethereum Sepolia deployments. V1 remains available for legacy verification; new issuance and revocation use V2.

| Parameter | Value |
|---|---|
| **Project** | CertTrace |
| **SIH Problem Statement** | SIH26194 |
| **Network** | Ethereum Sepolia |
| **Chain ID** | `11155111` |
| **V1 Contract** | [`0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca`](https://sepolia.etherscan.io/address/0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca) |
| **V2 Contract** | [`0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a`](https://sepolia.etherscan.io/address/0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a) |
| **Authorized Issuer** | `0x89CA83fB6Ed701549D6D40c404445fB4F06FB542` |
| **V2 Deployment Transaction** | [`0xc7d440…ca7eb`](https://sepolia.etherscan.io/tx/0xc7d440198643fd35bf3c01e450ad79476f980387ad0b775a10da2cb0983ca7eb) |
| **Deployment Mechanism** | Hardhat Ignition (`CertTrace.ts` and `CertTraceV2.ts`) |

### Deployment & Configuration Details

- **Contract Deployment**: The `CertTrace.sol` contract was compiled with `solc 0.8.34` (optimizer enabled, 200 runs) and deployed to Ethereum Sepolia.
- **Frontend Integration**: The application uses `NEXT_PUBLIC_V1_CONTRACT_ADDRESS` and `NEXT_PUBLIC_V2_CONTRACT_ADDRESS` as a trusted allowlist. Proof files and QR URLs cannot introduce arbitrary contract or RPC targets.
- **Read-Only Verification**: The Verifier Portal queries the Sepolia network using a standard JSON-RPC endpoint (`NEXT_PUBLIC_SEPOLIA_RPC_URL`, defaulting to a public Sepolia node) without requiring users to install MetaMask or connect a wallet.
- **Credential Issuance and Revocation**: New V2 issuance and revocation require the authorized issuer wallet via MetaMask. The UI waits for a successful receipt and on-chain status read-back.

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

- **Smart Contract Test Suite**: 28 passing tests in `blockchain/` (8 Foundry/Solidity property and fuzz tests + 20 Mocha/Ethers.js integration tests).
- **Frontend Test Suite**: 34 passing tests in `web/` covering hashing, commitment generation, proof creation/validation, trusted V1/V2 routing, QR entry, tamper detection, and revocation-aware V2 verification.
- **Production Build**: Successfully compiled with Next.js 16.3.6 (Turbopack) and zero ESLint errors or warnings.
- **Sepolia Status**: V2 deployment, fictional issuance, original/modified document checks, authorized revocation, revoked-status verification, and legacy V1 verification have been exercised against real Sepolia.

---

## QR Verification Entry

After an issuance transaction is confirmed and read back from Sepolia, the Issuer Portal generates a QR image locally in the browser. Its only payload is:

```text
https://<public-app-origin>/verify?id=<public-credential-id>
https://<public-app-origin>/verify?id=<public-credential-id>&version=v2
```

The first form is retained for legacy V1 links; V2 adds the explicit `version=v2` routing hint. The QR does not contain PDF bytes, the proof JSON, salt, personal information, or wallet secrets. Opening it pre-populates the public credential ID, but never produces a successful result by itself. The verifier must still upload both the original PDF and matching proof file; CertTrace then hashes the exact PDF bytes, reconstructs the commitment, enforces that the proof credential ID matches the QR entry, and queries only the selected allowlisted contract.

For production/Vercel, set `NEXT_PUBLIC_APP_ORIGIN` to the canonical HTTPS deployment origin. If omitted, browser-side generation uses the current page origin, so a production browser never substitutes `localhost`.

---

## Revocation and V1 Compatibility

The existing Sepolia deployment at `0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca` is **CertTrace V1**. Its stored credential has no revocation field, and its deployed bytecode has no `revokeCredential(bytes32)` or `isCredentialActive(bytes32)` selector. Revocation cannot be added to that non-upgradeable deployed instance, and the frontend does not simulate it.

`CertTraceV2` is deployed separately at `0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a`. It adds permanent issuer-only revocation, explicit unknown/already-revoked errors, a `CredentialRevoked` event, and readable `isRevoked`/`revokedAt` state without overwriting original issuance data. The existing `CertTrace.sol`, V1 address, and V1 deployment history remain unchanged.

V1 certificates were not migrated into V2 and are not described as revocable. Existing V1 proof files remain valid against the allowlisted V1 address. Newly issued V2 certificates use the same proof schema and `CERTTRACE_V1` commitment algorithm, but reference the allowlisted V2 address. A proof-provided address or URL version hint never overrides the application allowlist.

### Required production environment

```text
NEXT_PUBLIC_V1_CONTRACT_ADDRESS=0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca
NEXT_PUBLIC_V2_CONTRACT_ADDRESS=0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a
NEXT_PUBLIC_ISSUANCE_CONTRACT_VERSION=v2
NEXT_PUBLIC_APP_ORIGIN=https://<existing-production-domain>
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

---

## Real-World Verification Results

Use only the existing fictional certificate fixtures or another fictional academic certificate.

- V2 fictional issuance: [`0xce6700…940be`](https://sepolia.etherscan.io/tx/0xce6700cdca8fccb76fb53dd6c83b1ebbefdf4bd00018af4f08e03137829940be), block `11775417`.
- Historical issuance-block status: registered, not revoked, active.
- Original V2 PDF/proof before revocation: commitment matched the registered document.
- Modified V2 PDF with the original proof: `DOCUMENT_MISMATCH`.
- Unauthorized revocation simulation against the live contract: rejected.
- V2 revocation: [`0x15db86…fb50d`](https://sepolia.etherscan.io/tx/0x15db8639a27f1caafce38b7c4e9d7ef322a3cae9cbb1bc0de717aea23e6fb50d), block `11775419`.
- Current V2 state: registered, revoked, inactive.
- Frontend verifier after revocation: original PDF `REVOKED — REGISTERED DOCUMENT`; modified PDF `DOCUMENT_MISMATCH`.
- Two existing fictional V1 proofs still return `MATCHES_REGISTERED_DOCUMENT` for the original PDF and `DOCUMENT_MISMATCH` for the modified PDF.

Public Vercel browser/QR checks are tracked separately from these completed Sepolia and frontend-library checks.

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
# Keep both trusted V1 and V2 addresses from .env.example
# Set NEXT_PUBLIC_ISSUANCE_CONTRACT_VERSION=v2 for new certificates
# Set NEXT_PUBLIC_APP_ORIGIN=https://your-certtrace-deployment.vercel.app for QR links
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
