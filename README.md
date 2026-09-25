# CertTrace — SIH 2026

CertTrace is a decentralized academic certificate issuance and integrity-verification platform developed by **BWU SolveArc** for Smart India Hackathon 2026 (SIH26194).

## Current architecture

CertTrace uses one production contract: `blockchain/contracts/CertTraceRegistry.sol`.

- The deployer becomes the registry admin and is automatically authorized as its first issuer.
- The admin manages a set of authorized issuer wallets.
- Only authorized wallets can issue credentials.
- Only the original issuing wallet can revoke its own credential; the admin has no universal revocation power.
- Anyone can verify through a read-only Sepolia RPC endpoint without MetaMask.

Current Sepolia registry: [`0xd754993064d4bb81ff456b0EA6791CFa63569E7b`](https://sepolia.etherscan.io/address/0xd754993064d4bb81ff456b0EA6791CFa63569E7b)

Deployment transaction: [`0xa66350459240e883604bff8bfad46e84b5b34a7641f085b0c4d5edfb80436e15`](https://sepolia.etherscan.io/tx/0xa66350459240e883604bff8bfad46e84b5b34a7641f085b0c4d5edfb80436e15), block `11778118`.

The production Vercel application must not be switched to this registry until the complete live multi-issuer acceptance workflow passes.

Historical development deployments remain preserved but are not used by the production frontend:

- Old V1: `0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca`
- Old V2: `0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a`

## Cryptographic model

1. `fileHash = SHA-256(exact PDF bytes)` in the browser.
2. `credentialId` and `salt` are independent cryptographically random `bytes32` values.
3. `commitment = keccak256(solidityPacked("CERTTRACE_V1", credentialId, fileHash, salt))`.
4. Only the credential ID, commitment, issuer, timestamps, and revocation state are stored on-chain.

`CERTTRACE_V1` is the stable cryptographic domain version, not a contract-version label. PDF bytes, student data, grades, email addresses, salts, proof JSON, private keys, recovery phrases, and passwords are never placed on-chain.

## Proof and QR model

The only proof format is:

```json
{
  "version": 1,
  "credentialId": "0x...",
  "salt": "0x...",
  "chainId": 11155111,
  "contractAddress": "<CURRENT_CERTTRACE_REGISTRY>"
}
```

The verifier accepts only the configured registry address. A QR contains only the public URL `/verify?id=<credentialId>` and never establishes authenticity by itself; verification still requires the PDF and proof JSON.

## Environment

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0xd754993064d4bb81ff456b0EA6791CFa63569E7b
NEXT_PUBLIC_APP_ORIGIN=https://certtrace-sih2026.vercel.app
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

## Local validation

```shell
cd web
npm test
npm run lint
npx tsc --noEmit
npm run build

cd ../blockchain
npx hardhat compile
npx tsc --noEmit
npx hardhat test
```

## Deployment gate

Do not broadcast automatically. Before running the following command, report the network (`sepolia`), chain ID (`11155111`), deployer/admin public address, and deployer balance, then obtain explicit approval:

```shell
cd blockchain
npx hardhat ignition deploy --network sepolia ignition/modules/CertTraceRegistry.ts
```

Never commit `.env.local`, private keys, recovery phrases, keystores, passwords, real student documents, generated secrets, or local Ignition deployment state.
