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

- **Smart Contract Test Suite**: 28 passing tests in `blockchain/` (8 Foundry/Solidity property and fuzz tests + 20 Mocha/Ethers.js integration tests).
- **Frontend Test Suite**: 31 passing tests in `web/` covering hashing, commitment generation, proof creation/validation, blockchain verification, QR entry, and revocation-aware V2 verification.
- **Production Build**: Successfully compiled with Next.js 16.3.6 (Turbopack) and zero ESLint errors or warnings.
- **Sepolia Status**: Contract deployed to Sepolia. Automated integration tests validate on-chain contract interfaces; live end-to-end user transactions are ready for Sepolia execution with funded issuer accounts.

---

## QR Verification Entry

After an issuance transaction is confirmed and read back from Sepolia, the Issuer Portal generates a QR image locally in the browser. Its only payload is:

```text
https://<public-app-origin>/verify?id=<public-credential-id>
```

The QR does not contain PDF bytes, the proof JSON, salt, personal information, or wallet secrets. Opening it pre-populates the public credential ID, but never produces a successful result by itself. The verifier must still upload both the original PDF and the matching V1 proof file; CertTrace then hashes the exact PDF bytes, reconstructs the commitment, enforces that the proof credential ID matches the QR entry, and queries the configured contract.

For production/Vercel, set `NEXT_PUBLIC_APP_ORIGIN` to the canonical HTTPS deployment origin. If omitted, browser-side generation uses the current page origin, so a production browser never substitutes `localhost`.

---

## Revocation Compatibility and V2 Plan

The existing Sepolia deployment at `0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca` is **CertTrace V1**. Its stored credential has no revocation field, and its deployed bytecode has no `revokeCredential(bytes32)` or `isCredentialActive(bytes32)` selector. Revocation cannot be added to that non-upgradeable deployed instance, and the frontend does not simulate it.

`blockchain/contracts/CertTraceV2.sol` is a separate, locally tested successor which adds permanent issuer-only revocation, explicit unknown/already-revoked errors, a `CredentialRevoked` event, and readable `isRevoked`/`revokedAt` state without overwriting original issuance data. The existing `CertTrace.sol`, deployment module, Sepolia address, and deployment records remain unchanged.

### Deployment and compatibility steps (not yet performed)

1. Obtain explicit deployment approval and deploy the separate module:

   ```bash
   cd blockchain
   npx hardhat ignition deploy --network sepolia ignition/modules/CertTraceV2.ts
   ```

2. Verify the new source/ABI and record the new Sepolia address. Do not replace or delete the V1 record.
3. In the Vercel environment for a deliberate V2 application deployment, set:

   ```text
   NEXT_PUBLIC_CONTRACT_ADDRESS=<new-v2-address>
   NEXT_PUBLIC_CONTRACT_VERSION=v2
   NEXT_PUBLIC_APP_ORIGIN=https://<production-domain>
   ```

4. Rebuild/redeploy the frontend, then perform the real-world checks below with fictional data.

V1 certificates are not migrated into V2. Existing V1 proof files remain valid when the app is configured for the V1 address/version. Newly issued V2 certificates use the same proof schema and `CERTTRACE_V1` commitment algorithm, but their proof files reference the new V2 address. A proof-provided address never overrides the application’s configured trusted address.

---

## Real-World Verification Checklist

Use only the existing fictional certificate fixtures or another fictional academic certificate.

### QR workflow on the current V1 deployment

- Register or select a fictional certificate that is registered at the configured V1 address.
- After transaction confirmation, download the generated QR PNG.
- Open the QR URL in a separate browser/session and confirm the credential ID is populated.
- Confirm the QR alone shows no successful verification result.
- Upload the original PDF and matching proof, then confirm the live Sepolia result is `MATCHES REGISTERED DOCUMENT`.
- Upload a modified PDF with the original proof and confirm `DOCUMENT MISMATCH`.
- Try a proof for another credential and confirm `Credential ID Mismatch`.
- Temporarily use an unavailable RPC endpoint and confirm `VERIFICATION UNAVAILABLE`, never success.

### Revocation workflow after an explicitly approved V2 deployment

- Register a fictional certificate on the new V2 address and confirm it is active.
- Connect the authorized issuer on Sepolia and submit `revokeCredential()`.
- Confirm the UI remains pending after wallet acceptance and reports success only after a successful receipt and status read-back.
- Verify the same original PDF/proof and confirm `REVOKED — REGISTERED DOCUMENT`.
- Confirm a modified PDF is still reported as a document mismatch.
- Confirm unauthorized, unknown-ID, and repeated revocation attempts revert and never display success.
- Confirm the corresponding V1 certificate population remains unchanged and is not described as migrated.

These browser/MetaMask checks have not been claimed as completed by the automated test suite.

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
# Keep NEXT_PUBLIC_CONTRACT_VERSION=v1 for the existing deployment
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
