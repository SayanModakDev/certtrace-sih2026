# CertTrace web application

This Next.js application provides one issuer workflow and one public verifier workflow for the current `CertTraceRegistry` deployment on Ethereum Sepolia.

## Configuration

Copy `.env.example` to `.env.local` and set the deployed registry address:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0xd754993064d4bb81ff456b0EA6791CFa63569E7b
NEXT_PUBLIC_APP_ORIGIN=https://certtrace-sih2026.vercel.app
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

There are no contract-version selectors or legacy routing variables. Proof files are accepted only when their `chainId` is Sepolia and their `contractAddress` exactly matches `NEXT_PUBLIC_CONTRACT_ADDRESS`.

## Workflows

- Any wallet can connect. The issuer portal displays a neutral `Not Authorized` state until the registry approves the wallet.
- Authorized issuers hash exact PDF bytes locally, create a random credential ID and salt, download the proof, issue on-chain, and receive confirmation only after strict state read-back.
- The admin wallet sees a small issuer-management panel for authorization and removal.
- Original issuer wallets can permanently revoke their own credentials.
- Public verification needs no MetaMask. It requires the PDF and proof JSON; a QR link only preloads the public credential ID.
- QR URLs use only `/verify?id=<credentialId>` and contain no salt, proof, PDF, personal data, or contract-version hint.

The `CERTTRACE_V1` string remains the cryptographic commitment domain and is unrelated to historical contract product versions.

## Commands

```shell
npm test
npm run lint
npx tsc --noEmit
npm run build
```
