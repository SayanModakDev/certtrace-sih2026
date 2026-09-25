# CertTrace blockchain

The production contract is `contracts/CertTraceRegistry.sol`, a multi-issuer registry for certificate commitments on Ethereum Sepolia.

- Registry: `0xd754993064d4bb81ff456b0EA6791CFa63569E7b`
- Deployment transaction: `0xa66350459240e883604bff8bfad46e84b5b34a7641f085b0c4d5edfb80436e15`
- Deployment block: `11778118`
- Admin / initial issuer: `0x89CA83fB6Ed701549D6D40c404445fB4F06FB542`

## Registry authorization model

- The deployment wallet becomes `admin` and is automatically authorized as the first issuer.
- Only the admin can authorize or remove issuer wallets.
- Only currently authorized issuers can issue new credentials.
- Only the wallet recorded as a credential's original issuer can revoke it. Admin status and authorization for another issuer do not grant revocation rights.
- Removing an issuer blocks new issuance but does not prevent that original wallet from revoking credentials it already issued.

The registry stores only a credential ID, cryptographic commitment, issuer address, issuance timestamp, and revocation state. PDFs, salts, proof JSON, personal data, and wallet secrets stay off-chain.

## Commands

```shell
npm test
npm run compile
npx tsc --noEmit
```

The deployment module is `ignition/modules/CertTraceRegistry.ts`. Any future deployment must not be broadcast without explicit approval after checking the chain ID, deployer/admin public address, and balance:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/CertTraceRegistry.ts
```

## Historical development contracts

These earlier Sepolia deployments and their local sources/tests/records are retained for history only. The production frontend does not query them.

- Historical V1: `0x0F89d0a4311a3EEbB6C04F664A590DB73006Ceca`
- Historical V2: `0xF8bd01c81124c0a9008463b40dD0a1aFf7D9256a`

Do not modify, overwrite, migrate, or delete their deployment records.
