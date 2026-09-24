import { ethers } from "ethers";
import { CERTTRACE_ABI } from "./abi";
import { CERTTRACE_V2_ABI } from "./abi-v2";
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_HEX_CHAIN_ID,
  DEFAULT_SEPOLIA_RPC_URL,
  getConfiguredContractAddress,
  CONFIGURED_CONTRACT_VERSION,
  ContractVersion,
} from "./config";
import { isValidBytes32, isValidEthereumAddress, normalizeAddress } from "./crypto";

export interface OnChainCredentialRecord {
  credentialId: string;
  commitment: string;
  issuer: string;
  timestamp: number;
  isRegistered: boolean;
  isRevoked: boolean;
  revokedAt: number;
}

function getAbi(version: ContractVersion) {
  return version === "v2" ? CERTTRACE_V2_ABI : CERTTRACE_ABI;
}

/**
 * Creates an ethers JsonRpcProvider configured for the Sepolia testnet.
 */
export function getReadOnlyProvider(rpcUrl: string = DEFAULT_SEPOLIA_RPC_URL): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl, {
    chainId: SEPOLIA_CHAIN_ID,
    name: "sepolia",
  });
}

/**
 * Returns a read-only instance of the CertTrace contract.
 */
export function getReadOnlyContract(
  contractAddress?: string,
  provider?: ethers.Provider,
  contractVersion: ContractVersion = CONFIGURED_CONTRACT_VERSION
): ethers.Contract {
  const targetAddress = contractAddress || getConfiguredContractAddress(contractVersion);
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Invalid contract address: "${targetAddress}"`);
  }
  const activeProvider = provider || getReadOnlyProvider();
  return new ethers.Contract(targetAddress, getAbi(contractVersion), activeProvider);
}

/**
 * Detects whether MetaMask (or an EIP-1193 compatible wallet) is installed in the browser.
 */
export function isMetaMaskInstalled(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { ethereum?: unknown }).ethereum !== "undefined"
  );
}

/**
 * Returns a BrowserProvider using window.ethereum if available.
 */
export function getBrowserProvider(): ethers.BrowserProvider | null {
  if (!isMetaMaskInstalled()) return null;
  const ethereum = (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum;
  return new ethers.BrowserProvider(ethereum);
}

/**
 * Requests wallet connection via MetaMask.
 * Returns the active account address and current chain ID.
 */
export async function requestConnectWallet(): Promise<{ address: string; chainId: number }> {
  if (!isMetaMaskInstalled()) {
    throw new Error(
      "MetaMask extension not detected. Please install MetaMask to interact with the blockchain."
    );
  }

  const ethereum = (window as unknown as { ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found or connection was rejected by the user.");
  }

  const provider = getBrowserProvider()!;
  const network = await provider.getNetwork();

  return {
    address: normalizeAddress(accounts[0]),
    chainId: Number(network.chainId),
  };
}

/**
 * Requests MetaMask to switch to the Sepolia testnet (chain ID 11155111 / 0xaa36a7).
 * Adds the Sepolia network configuration if not already configured in MetaMask.
 */
export async function switchToSepolia(): Promise<void> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed.");
  }

  const ethereum = (window as unknown as { ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    // Code 4902 indicates chain has not been added to MetaMask
    if (err.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_HEX_CHAIN_ID,
            chainName: "Sepolia Test Network",
            nativeCurrency: {
              name: "SepoliaETH",
              symbol: "SEP",
              decimals: 18,
            },
            rpcUrls: [DEFAULT_SEPOLIA_RPC_URL],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

/**
 * Fetches the authorized issuer wallet address configured on the CertTrace contract.
 */
export async function getAuthorizedIssuer(
  contractAddress?: string,
  provider?: ethers.Provider,
  contractVersion: ContractVersion = CONFIGURED_CONTRACT_VERSION
): Promise<string> {
  const contract = getReadOnlyContract(contractAddress, provider, contractVersion);
  const issuerAddress = await contract.issuer();
  return normalizeAddress(issuerAddress);
}

/**
 * Retrieves the on-chain credential record for a given credentialId.
 * Calls `getCredential(bytes32 credentialId)` on the CertTrace contract.
 */
export async function fetchOnChainCredential(
  credentialId: string,
  contractAddress?: string,
  provider?: ethers.Provider,
  contractVersion: ContractVersion = CONFIGURED_CONTRACT_VERSION
): Promise<OnChainCredentialRecord> {
  if (!isValidBytes32(credentialId)) {
    throw new Error(`Invalid credentialId for contract lookup: ${credentialId}`);
  }

  const contract = getReadOnlyContract(contractAddress, provider, contractVersion);
  const raw = await contract.getCredential(credentialId);

  // Parse tuple result: (bytes32 credentialId, bytes32 commitment, address issuer, uint256 timestamp, bool isRegistered)
  return {
    credentialId: raw.credentialId ?? raw[0],
    commitment: raw.commitment ?? raw[1],
    issuer: raw.issuer ?? raw[2],
    timestamp: Number(raw.timestamp ?? raw[3]),
    isRegistered: Boolean(raw.isRegistered ?? raw[4]),
    isRevoked: contractVersion === "v2" ? Boolean(raw.isRevoked ?? raw[5]) : false,
    revokedAt: contractVersion === "v2" ? Number(raw.revokedAt ?? raw[6]) : 0,
  };
}

/**
 * Submits the `issueCredential(bytes32, bytes32)` transaction using the connected MetaMask signer.
 */
export async function submitIssueCredential(
  signer: ethers.Signer,
  credentialId: string,
  commitment: string,
  contractAddress?: string,
  contractVersion: ContractVersion = CONFIGURED_CONTRACT_VERSION
): Promise<{ txHash: string; wait: () => Promise<ethers.ContractTransactionReceipt> }> {
  const targetAddress = contractAddress || getConfiguredContractAddress(contractVersion);
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Invalid contract address: "${targetAddress}"`);
  }
  if (!isValidBytes32(credentialId)) {
    throw new Error("Invalid credentialId: must be a valid non-zero 32-byte hex string");
  }
  if (!isValidBytes32(commitment)) {
    throw new Error("Invalid commitment: must be a valid non-zero 32-byte hex string");
  }

  const contract = new ethers.Contract(targetAddress, getAbi(contractVersion), signer);
  const tx = await contract.issueCredential(credentialId, commitment);

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

/**
 * Submits a real CertTraceV2 revocation transaction and resolves only after confirmation.
 * This helper refuses to target V1, which has no revocation state model.
 */
export async function submitRevokeCredential(
  signer: ethers.Signer,
  credentialId: string,
  contractAddress?: string,
  contractVersion: ContractVersion = CONFIGURED_CONTRACT_VERSION
): Promise<{ txHash: string; wait: () => Promise<ethers.ContractTransactionReceipt> }> {
  if (contractVersion !== "v2") {
    throw new Error("Revocation is unavailable on the configured CertTrace V1 contract.");
  }

  const targetAddress = contractAddress || getConfiguredContractAddress(contractVersion);
  if (!isValidEthereumAddress(targetAddress)) {
    throw new Error(`Invalid contract address: "${targetAddress}"`);
  }
  if (!isValidBytes32(credentialId)) {
    throw new Error("Invalid credentialId: must be a valid non-zero 32-byte hex string");
  }

  const contract = new ethers.Contract(targetAddress, CERTTRACE_V2_ABI, signer);
  const tx = await contract.revokeCredential(credentialId);

  return {
    txHash: tx.hash,
    wait: async () => {
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        throw new Error(`Revocation transaction failed or reverted on-chain (tx: ${tx.hash})`);
      }
      return receipt;
    },
  };
}

/**
 * Parses contract errors, custom errors, and MetaMask user rejection errors into clear human-readable messages.
 */
export function parseContractError(error: unknown): string {
  if (!error) return "An unknown error occurred";

  const err = error as {
    code?: string | number;
    message?: string;
    data?: string;
    reason?: string;
    info?: { error?: { message?: string } };
  };

  // User rejected in MetaMask
  if (err.code === 4001 || err.code === "ACTION_REJECTED" || (err.message && /user rejected/i.test(err.message))) {
    return "Transaction was rejected by user in MetaMask.";
  }

  // Network or RPC connectivity failure
  if (err.code === "NETWORK_ERROR" || (err.message && /failed to fetch|network error|could not detect network/i.test(err.message))) {
    return "Network connectivity failure. Unable to reach the Sepolia RPC endpoint.";
  }

  // Decode custom Solidity errors if data is present
  const iface = new ethers.Interface([...CERTTRACE_ABI, ...CERTTRACE_V2_ABI]);
  if (err.data && typeof err.data === "string") {
    try {
      const parsed = iface.parseError(err.data);
      if (parsed) {
        switch (parsed.name) {
          case "CredentialAlreadyExists":
            return "This credential ID has already been registered on the blockchain. Duplicate credential IDs are rejected.";
          case "OwnableUnauthorizedAccount":
            return "Unauthorized wallet: The connected wallet is not the authorized issuer configured on this contract.";
          case "InvalidCredentialId":
            return "Rejected: Credential ID cannot be zero.";
          case "InvalidCommitment":
            return "Rejected: Cryptographic commitment cannot be zero.";
          case "OwnableInvalidOwner":
            return "Invalid owner configuration.";
          case "UnknownCredential":
            return "Revocation rejected: this credential ID is not registered on the configured contract.";
          case "CredentialAlreadyRevoked":
            return "Revocation rejected: this credential has already been revoked.";
          default:
            return `Contract reverted with custom error: ${parsed.name}`;
        }
      }
    } catch {
      // ignore parse failure and fallback to string checks
    }
  }

  // Error message inspection for custom errors
  const message = err.reason || err.message || String(error);
  if (/CredentialAlreadyExists/i.test(message)) {
    return "This credential ID has already been registered on the blockchain. Duplicate credential IDs are rejected.";
  }
  if (/OwnableUnauthorizedAccount/i.test(message)) {
    return "Unauthorized wallet: The connected wallet is not the authorized issuer configured on this contract.";
  }
  if (/InvalidCredentialId/i.test(message)) {
    return "Rejected: Credential ID cannot be zero.";
  }
  if (/InvalidCommitment/i.test(message)) {
    return "Rejected: Cryptographic commitment cannot be zero.";
  }
  if (/UnknownCredential/i.test(message)) {
    return "Revocation rejected: this credential ID is not registered on the configured contract.";
  }
  if (/CredentialAlreadyRevoked/i.test(message)) {
    return "Revocation rejected: this credential has already been revoked.";
  }

  return message;
}
