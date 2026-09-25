import { ethers } from "ethers";
import { CERTTRACE_REGISTRY_ABI } from "./abi";
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_HEX_CHAIN_ID,
  DEFAULT_SEPOLIA_RPC_URL,
  getConfiguredContractAddress,
} from "./config";
import { isValidBytes32, isValidEthereumAddress, normalizeAddress } from "./crypto";

export interface OnChainCredentialRecord {
  commitment: string;
  issuer: string;
  issuedAt: number;
  revoked: boolean;
  revokedAt: number;
  exists: boolean;
}

export interface SubmittedTransaction {
  txHash: string;
  wait: () => Promise<ethers.ContractTransactionReceipt>;
}

export function isRegistryAdmin(walletAddress: string | null, adminAddress: string | null): boolean {
  if (!walletAddress || !adminAddress) return false;
  if (!isValidEthereumAddress(walletAddress) || !isValidEthereumAddress(adminAddress)) return false;
  return normalizeAddress(walletAddress) === normalizeAddress(adminAddress);
}

export function getReadOnlyProvider(
  rpcUrl: string = DEFAULT_SEPOLIA_RPC_URL
): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl, {
    chainId: SEPOLIA_CHAIN_ID,
    name: "sepolia",
  });
}

export function getReadOnlyContract(
  contractAddress?: string,
  provider?: ethers.Provider
): ethers.Contract {
  const targetAddress = contractAddress || getConfiguredContractAddress();
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Invalid contract address: "${targetAddress}"`);
  }
  return new ethers.Contract(
    targetAddress,
    CERTTRACE_REGISTRY_ABI,
    provider || getReadOnlyProvider()
  );
}

export function isMetaMaskInstalled(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { ethereum?: unknown }).ethereum !== "undefined"
  );
}

export function getBrowserProvider(): ethers.BrowserProvider | null {
  if (!isMetaMaskInstalled()) return null;
  const ethereum = (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum;
  return new ethers.BrowserProvider(ethereum);
}

export async function requestConnectWallet(): Promise<{ address: string; chainId: number }> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask extension not detected. Please install MetaMask to issue credentials.");
  }

  const ethereum = (window as unknown as {
    ethereum: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }).ethereum;
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) {
    throw new Error("No accounts found or connection was rejected by the user.");
  }

  const provider = getBrowserProvider()!;
  const network = await provider.getNetwork();
  return { address: normalizeAddress(accounts[0]), chainId: Number(network.chainId) };
}

export async function switchToSepolia(): Promise<void> {
  if (!isMetaMaskInstalled()) throw new Error("MetaMask is not installed.");

  const ethereum = (window as unknown as {
    ethereum: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }).ethereum;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_HEX_CHAIN_ID,
          chainName: "Sepolia Test Network",
          nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
          rpcUrls: [DEFAULT_SEPOLIA_RPC_URL],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}

export async function getRegistryAdmin(
  contractAddress?: string,
  provider?: ethers.Provider
): Promise<string> {
  return normalizeAddress(await getReadOnlyContract(contractAddress, provider).admin());
}

export async function checkIssuerAuthorization(
  account: string,
  contractAddress?: string,
  provider?: ethers.Provider
): Promise<boolean> {
  if (!isValidEthereumAddress(account)) throw new Error("Invalid issuer address");
  return Boolean(
    await getReadOnlyContract(contractAddress, provider).isAuthorizedIssuer(account)
  );
}

export async function fetchOnChainCredential(
  credentialId: string,
  contractAddress?: string,
  provider?: ethers.Provider
): Promise<OnChainCredentialRecord> {
  if (!isValidBytes32(credentialId)) {
    throw new Error(`Invalid credentialId for contract lookup: ${credentialId}`);
  }
  const raw = await getReadOnlyContract(contractAddress, provider).getCredential(credentialId);
  return {
    commitment: raw.commitment ?? raw[0],
    issuer: raw.issuer ?? raw[1],
    issuedAt: Number(raw.issuedAt ?? raw[2]),
    revoked: Boolean(raw.revoked ?? raw[3]),
    revokedAt: Number(raw.revokedAt ?? raw[4]),
    exists: Boolean(raw.exists ?? raw[5]),
  };
}

function transactionResult(tx: ethers.ContractTransactionResponse): SubmittedTransaction {
  return {
    txHash: tx.hash,
    wait: async () => {
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        throw new Error(`Transaction failed or reverted on-chain (tx: ${tx.hash})`);
      }
      return receipt;
    },
  };
}

function getWriteContract(
  signer: ethers.Signer,
  contractAddress?: string
): ethers.Contract {
  const targetAddress = contractAddress || getConfiguredContractAddress();
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Invalid contract address: "${targetAddress}"`);
  }
  return new ethers.Contract(targetAddress, CERTTRACE_REGISTRY_ABI, signer);
}

export async function submitIssueCredential(
  signer: ethers.Signer,
  credentialId: string,
  commitment: string,
  contractAddress?: string
): Promise<SubmittedTransaction> {
  if (!isValidBytes32(credentialId)) {
    throw new Error("Invalid credentialId: must be a valid non-zero bytes32 value");
  }
  if (!isValidBytes32(commitment)) {
    throw new Error("Invalid commitment: must be a valid non-zero bytes32 value");
  }
  const tx = await getWriteContract(signer, contractAddress).issueCredential(
    credentialId,
    commitment
  );
  return transactionResult(tx);
}

export async function submitRevokeCredential(
  signer: ethers.Signer,
  credentialId: string,
  contractAddress?: string
): Promise<SubmittedTransaction> {
  if (!isValidBytes32(credentialId)) {
    throw new Error("Invalid credentialId: must be a valid non-zero bytes32 value");
  }
  const tx = await getWriteContract(signer, contractAddress).revokeCredential(credentialId);
  return transactionResult(tx);
}

export async function submitAuthorizeIssuer(
  signer: ethers.Signer,
  issuer: string,
  contractAddress?: string
): Promise<SubmittedTransaction> {
  if (!isValidEthereumAddress(issuer)) throw new Error("Enter a valid Ethereum address.");
  const tx = await getWriteContract(signer, contractAddress).authorizeIssuer(issuer);
  return transactionResult(tx);
}

export async function submitRemoveIssuer(
  signer: ethers.Signer,
  issuer: string,
  contractAddress?: string
): Promise<SubmittedTransaction> {
  if (!isValidEthereumAddress(issuer)) throw new Error("Enter a valid Ethereum address.");
  const tx = await getWriteContract(signer, contractAddress).removeIssuer(issuer);
  return transactionResult(tx);
}

export function assertIssuanceReadBack(
  record: OnChainCredentialRecord,
  submittedCommitment: string,
  connectedWallet: string
): void {
  if (!record.exists) throw new Error("Issuance read-back failed: credential does not exist.");
  if (record.commitment.toLowerCase() !== submittedCommitment.toLowerCase()) {
    throw new Error("Issuance read-back failed: stored commitment does not match.");
  }
  if (normalizeAddress(record.issuer) !== normalizeAddress(connectedWallet)) {
    throw new Error("Issuance read-back failed: stored issuer does not match the connected wallet.");
  }
  if (record.revoked) throw new Error("Issuance read-back failed: credential is already revoked.");
}

export function parseContractError(error: unknown): string {
  if (!error) return "An unknown error occurred";
  const err = error as {
    code?: string | number;
    message?: string;
    data?: string;
    reason?: string;
    info?: { error?: { data?: string; message?: string } };
  };

  if (
    err.code === 4001 ||
    err.code === "ACTION_REJECTED" ||
    /user rejected/i.test(err.message || "")
  ) {
    return "Transaction was rejected by the user in MetaMask.";
  }
  if (
    err.code === "NETWORK_ERROR" ||
    /failed to fetch|network error|could not detect network/i.test(err.message || "")
  ) {
    return "Network connectivity failure. Unable to reach the Sepolia RPC endpoint.";
  }

  const data = err.data || err.info?.error?.data;
  if (data) {
    try {
      const parsed = new ethers.Interface(CERTTRACE_REGISTRY_ABI).parseError(data);
      if (parsed) return friendlyContractError(parsed.name);
    } catch {
      // Fall through to message inspection.
    }
  }

  const message = err.reason || err.info?.error?.message || err.message || String(error);
  const names = [
    "AdminOnly",
    "CredentialAlreadyExists",
    "CredentialAlreadyRevoked",
    "CredentialIssuerOnly",
    "InvalidCommitment",
    "InvalidCredentialId",
    "InvalidIssuerAddress",
    "IssuerAlreadyAuthorized",
    "IssuerNotAuthorized",
    "UnknownCredential",
  ];
  const matched = names.find((name) => message.includes(name));
  return matched ? friendlyContractError(matched) : message;
}

function friendlyContractError(name: string): string {
  switch (name) {
    case "AdminOnly":
      return "Only the CertTrace registry admin can manage issuer authorization.";
    case "IssuerNotAuthorized":
      return "The connected wallet is not an authorized CertTrace issuer.";
    case "IssuerAlreadyAuthorized":
      return "This wallet is already an authorized issuer.";
    case "InvalidIssuerAddress":
      return "The zero address cannot be used as an issuer.";
    case "CredentialAlreadyExists":
      return "This credential ID is already registered.";
    case "InvalidCredentialId":
      return "Credential ID cannot be zero.";
    case "InvalidCommitment":
      return "Cryptographic commitment cannot be zero.";
    case "UnknownCredential":
      return "This credential ID is not registered in CertTrace.";
    case "CredentialAlreadyRevoked":
      return "This credential has already been revoked.";
    case "CredentialIssuerOnly":
      return "Only the wallet that originally issued this credential can revoke it.";
    default:
      return `Contract reverted with custom error: ${name}`;
  }
}
