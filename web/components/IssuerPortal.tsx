"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { hashFileBytes, generateRandomBytes32, calculateCommitment, normalizeAddress, isValidBytes32 } from "../lib/crypto";
import { createVerificationProof, downloadProofFile, VerificationProof } from "../lib/proof";
import { validatePdfMetadata, validatePdfMagicBytes } from "../lib/validation";
import {
  SEPOLIA_CHAIN_ID,
  CONFIGURED_CONTRACT_ADDRESS,
  isContractConfigured,
  getExplorerTxUrl,
  CONFIGURED_CONTRACT_VERSION,
  contractSupportsRevocation,
} from "../lib/config";
import {
  isMetaMaskInstalled,
  getBrowserProvider,
  requestConnectWallet,
  switchToSepolia,
  getAuthorizedIssuer,
  submitIssueCredential,
  fetchOnChainCredential,
  parseContractError,
  OnChainCredentialRecord,
  submitRevokeCredential,
} from "../lib/contract";
import { createVerificationUrl, downloadQrImage, generateVerificationQrDataUrl } from "../lib/qr";

interface IssuerState {
  file: File | null;
  fileHash: string | null;
  credentialId: string | null;
  salt: string | null;
  commitment: string | null;
  proof: VerificationProof | null;
  hasDownloadedProof: boolean;
  userConfirmedSavedProof: boolean;
  isComputingCrypto: boolean;

  // Blockchain Transaction States
  isSubmittingTx: boolean;
  txHash: string | null;
  confirmedReceipt: ethers.ContractTransactionReceipt | null;
  confirmedOnChainRecord: OnChainCredentialRecord | null;
  error: string | null;
  verificationUrl: string | null;
  qrDataUrl: string | null;
  qrError: string | null;
}

export default function IssuerPortal() {
  const [state, setState] = useState<IssuerState>({
    file: null,
    fileHash: null,
    credentialId: null,
    salt: null,
    commitment: null,
    proof: null,
    hasDownloadedProof: false,
    userConfirmedSavedProof: false,
    isComputingCrypto: false,
    isSubmittingTx: false,
    txHash: null,
    confirmedReceipt: null,
    confirmedOnChainRecord: null,
    error: null,
    verificationUrl: null,
    qrDataUrl: null,
    qrError: null,
  });

  // Wallet Connection States
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [contractAuthorizedIssuer, setContractAuthorizedIssuer] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isCheckingIssuer, setIsCheckingIssuer] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [revocationCredentialId, setRevocationCredentialId] = useState("");
  const [isSubmittingRevocation, setIsSubmittingRevocation] = useState(false);
  const [revocationTxHash, setRevocationTxHash] = useState<string | null>(null);
  const [revocationConfirmed, setRevocationConfirmed] = useState<OnChainCredentialRecord | null>(null);
  const [revocationError, setRevocationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const contractConfigured = isContractConfigured();
  const revocationSupported = contractSupportsRevocation();
  const isCorrectNetwork = walletChainId === SEPOLIA_CHAIN_ID;
  const isAuthorizedIssuer = Boolean(
    walletAddress &&
    contractAuthorizedIssuer &&
    normalizeAddress(walletAddress) === normalizeAddress(contractAuthorizedIssuer)
  );

  useEffect(() => {
    let cancelled = false;

    if (!state.confirmedReceipt || !state.credentialId) return;

    try {
      const verificationUrl = createVerificationUrl(
        state.credentialId,
        undefined,
        CONFIGURED_CONTRACT_VERSION
      );
      setState((prev) => ({ ...prev, verificationUrl, qrDataUrl: null, qrError: null }));

      generateVerificationQrDataUrl(verificationUrl)
        .then((qrDataUrl) => {
          if (!cancelled) setState((prev) => ({ ...prev, qrDataUrl }));
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              qrError: error instanceof Error ? error.message : "Failed to generate verification QR code",
            }));
          }
        });
    } catch (error: unknown) {
      setState((prev) => ({
        ...prev,
        qrError: error instanceof Error ? error.message : "Failed to build verification link",
      }));
    }

    return () => {
      cancelled = true;
    };
  }, [state.confirmedReceipt, state.credentialId]);

  // Check on-chain authorized issuer when contract or wallet changes
  const checkOnChainIssuer = useCallback(async () => {
    if (!contractConfigured) return;
    setIsCheckingIssuer(true);
    try {
      const issuer = await getAuthorizedIssuer();
      setContractAuthorizedIssuer(issuer);
    } catch {
      setContractAuthorizedIssuer(null);
    } finally {
      setIsCheckingIssuer(false);
    }
  }, [contractConfigured]);

  useEffect(() => {
    checkOnChainIssuer();
  }, [checkOnChainIssuer]);

  // Setup MetaMask event listeners
  useEffect(() => {
    if (!isMetaMaskInstalled()) return;

    const ethereum = (window as unknown as { ethereum: {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    } }).ethereum;

    const handleAccountsChanged = (accounts: unknown) => {
      const accList = accounts as string[];
      if (accList && accList.length > 0) {
        setWalletAddress(normalizeAddress(accList[0]));
      } else {
        setWalletAddress(null);
      }
    };

    const handleChainChanged = (chainIdHex: unknown) => {
      const newChainId = parseInt(chainIdHex as string, 16);
      setWalletChainId(newChainId);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    // Initial check if already connected
    const provider = getBrowserProvider();
    if (provider) {
      provider.listAccounts().then((accounts) => {
        if (accounts.length > 0) {
          setWalletAddress(normalizeAddress(accounts[0].address));
        }
      }).catch(() => {});

      provider.getNetwork().then((net) => {
        setWalletChainId(Number(net.chainId));
      }).catch(() => {});
    }

    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    setState((prev) => ({ ...prev, error: null }));
    try {
      const { address, chainId } = await requestConnectWallet();
      setWalletAddress(address);
      setWalletChainId(chainId);
      await checkOnChainIssuer();
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        error: parseContractError(err),
      }));
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      await switchToSepolia();
      const provider = getBrowserProvider();
      if (provider) {
        const net = await provider.getNetwork();
        setWalletChainId(Number(net.chainId));
      }
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        error: parseContractError(err),
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validation = validatePdfMetadata(selected);
    if (!validation.valid) {
      setState((prev) => ({
        ...prev,
        file: null,
        error: validation.error || "Invalid file",
        fileHash: null,
        credentialId: null,
        salt: null,
        commitment: null,
        proof: null,
        txHash: null,
        confirmedReceipt: null,
        confirmedOnChainRecord: null,
        verificationUrl: null,
        qrDataUrl: null,
        qrError: null,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      file: selected,
      error: null,
      fileHash: null,
      credentialId: null,
      salt: null,
      commitment: null,
      proof: null,
      hasDownloadedProof: false,
      userConfirmedSavedProof: false,
      txHash: null,
      confirmedReceipt: null,
      confirmedOnChainRecord: null,
      verificationUrl: null,
      qrDataUrl: null,
      qrError: null,
    }));
  };

  const processCertificate = async () => {
    if (!state.file) return;

    setState((prev) => ({ ...prev, isComputingCrypto: true, error: null }));

    try {
      const arrayBuffer = await state.file.arrayBuffer();

      const magicCheck = validatePdfMagicBytes(arrayBuffer);
      if (!magicCheck.valid) {
        setState((prev) => ({
          ...prev,
          isComputingCrypto: false,
          error: magicCheck.error || "File is not a valid PDF document",
        }));
        return;
      }

      // SHA-256 via Web Crypto API
      const fileHash = await hashFileBytes(arrayBuffer);

      // Secure randomness for credentialId and salt
      const credentialId = generateRandomBytes32();
      const salt = generateRandomBytes32();

      // Compute commitment
      const commitment = calculateCommitment(credentialId, fileHash, salt);

      // Create standardized proof
      let proof: VerificationProof | null = null;
      if (contractConfigured) {
        proof = createVerificationProof(credentialId, salt, SEPOLIA_CHAIN_ID, CONFIGURED_CONTRACT_ADDRESS);
      }

      setState((prev) => ({
        ...prev,
        fileHash,
        credentialId,
        salt,
        commitment,
        proof,
        isComputingCrypto: false,
        error: null,
        hasDownloadedProof: false,
        userConfirmedSavedProof: false,
        txHash: null,
        confirmedReceipt: null,
        confirmedOnChainRecord: null,
        verificationUrl: null,
        qrDataUrl: null,
        qrError: null,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process certificate";
      setState((prev) => ({
        ...prev,
        isComputingCrypto: false,
        error: message,
      }));
    }
  };

  const handleDownloadProof = () => {
    if (!state.proof) return;
    downloadProofFile(state.proof, "certtrace-proof");
    setState((prev) => ({ ...prev, hasDownloadedProof: true }));
  };

  // Submit on-chain registration transaction to CertTrace contract
  const handleRegisterOnChain = async () => {
    if (!contractConfigured) {
      setState((prev) => ({
        ...prev,
        error: "Cannot submit: CertTrace contract address is not configured in the environment.",
      }));
      return;
    }

    if (!walletAddress || !isCorrectNetwork) {
      setState((prev) => ({
        ...prev,
        error: "Please connect your MetaMask wallet to the Sepolia testnet first.",
      }));
      return;
    }

    if (!isAuthorizedIssuer) {
      setState((prev) => ({
        ...prev,
        error: `Connected account (${walletAddress}) is not the authorized issuer configured on this contract.`,
      }));
      return;
    }

    if (!state.credentialId || !state.commitment) {
      setState((prev) => ({
        ...prev,
        error: "Missing credential ID or cryptographic commitment.",
      }));
      return;
    }

    if (!state.hasDownloadedProof || !state.userConfirmedSavedProof) {
      setState((prev) => ({
        ...prev,
        error: "Please download and confirm that you have saved the verification proof file before submitting.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isSubmittingTx: true,
      error: null,
      txHash: null,
      confirmedReceipt: null,
      confirmedOnChainRecord: null,
      verificationUrl: null,
      qrDataUrl: null,
      qrError: null,
    }));

    try {
      const provider = getBrowserProvider();
      if (!provider) {
        throw new Error("MetaMask provider is not available.");
      }
      const signer = await provider.getSigner();

      // Submit transaction to the contract
      const { txHash, wait } = await submitIssueCredential(
        signer,
        state.credentialId,
        state.commitment,
        CONFIGURED_CONTRACT_ADDRESS
      );

      setState((prev) => ({ ...prev, txHash }));

      // Wait for block confirmation receipt
      const receipt = await wait();

      // Confirm record exists on-chain
      const record = await fetchOnChainCredential(state.credentialId, CONFIGURED_CONTRACT_ADDRESS);

      setState((prev) => ({
        ...prev,
        isSubmittingTx: false,
        confirmedReceipt: receipt,
        confirmedOnChainRecord: record,
        error: null,
      }));
    } catch (err: unknown) {
      // Retain existing credentialId, salt, and proof on failure so issuer can retry
      setState((prev) => ({
        ...prev,
        isSubmittingTx: false,
        error: parseContractError(err),
      }));
    }
  };

  const handleRevokeCredential = async () => {
    const credentialId = revocationCredentialId.trim();
    if (!revocationSupported) {
      setRevocationError("Revocation is unavailable on the configured CertTrace V1 deployment.");
      return;
    }
    if (!isValidBytes32(credentialId)) {
      setRevocationError("Enter a valid non-zero bytes32 credential ID.");
      return;
    }
    if (!walletAddress || !isCorrectNetwork || !isAuthorizedIssuer) {
      setRevocationError("Connect the authorized issuer wallet on Sepolia before revoking.");
      return;
    }

    setIsSubmittingRevocation(true);
    setRevocationTxHash(null);
    setRevocationConfirmed(null);
    setRevocationError(null);

    try {
      const provider = getBrowserProvider();
      if (!provider) throw new Error("MetaMask provider is not available.");
      const signer = await provider.getSigner();
      const { txHash, wait } = await submitRevokeCredential(
        signer,
        credentialId,
        CONFIGURED_CONTRACT_ADDRESS,
        CONFIGURED_CONTRACT_VERSION
      );

      setRevocationTxHash(txHash);
      await wait();
      const record = await fetchOnChainCredential(
        credentialId,
        CONFIGURED_CONTRACT_ADDRESS,
        undefined,
        CONFIGURED_CONTRACT_VERSION
      );
      if (!record.isRegistered || !record.isRevoked) {
        throw new Error("The confirmed transaction did not produce a revoked credential state.");
      }
      setRevocationConfirmed(record);
    } catch (error: unknown) {
      setRevocationError(parseContractError(error));
    } finally {
      setIsSubmittingRevocation(false);
    }
  };

  const handleReset = () => {
    setState({
      file: null,
      fileHash: null,
      credentialId: null,
      salt: null,
      commitment: null,
      proof: null,
      hasDownloadedProof: false,
      userConfirmedSavedProof: false,
      isComputingCrypto: false,
      isSubmittingTx: false,
      txHash: null,
      confirmedReceipt: null,
      confirmedOnChainRecord: null,
      error: null,
      verificationUrl: null,
      qrDataUrl: null,
      qrError: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet & Contract Connection Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>🦊</span> Issuer Wallet Authorization
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Only the authorized wallet configured on the smart contract can register certificates.
            </p>
          </div>

          <div>
            {!walletAddress ? (
              <button
                onClick={handleConnectWallet}
                disabled={isConnectingWallet}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isConnectingWallet ? "Connecting..." : "Connect MetaMask"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <span className="text-zinc-500">Connected: </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={() => setWalletAddress(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 py-1.5 px-2"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Missing MetaMask Notification */}
        {isMounted && !isMetaMaskInstalled() && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <span>🦊</span>
            <div>
              <strong>MetaMask extension not found:</strong> Install the{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-amber-950 dark:hover:text-amber-100"
              >
                MetaMask browser extension
              </a>{" "}
              to connect your authorized issuer account and sign blockchain transactions.
            </div>
          </div>
        )}

        {/* Contract & Network Diagnostics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 block font-medium mb-1">
              Smart Contract Deployment ({CONFIGURED_CONTRACT_VERSION.toUpperCase()} issuance):
            </span>
            {contractConfigured ? (
              <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all select-all">
                {CONFIGURED_CONTRACT_ADDRESS}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                ⚠️ Not Configured (set the trusted {CONFIGURED_CONTRACT_VERSION.toUpperCase()} address)
              </span>
            )}
          </div>

          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 block font-medium mb-1">
              Network & Authorization Status:
            </span>
            {!walletAddress ? (
              <span className="text-zinc-500">Wallet not connected</span>
            ) : !isCorrectNetwork ? (
              <div className="flex items-center justify-between">
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Wrong Network (ID: {walletChainId})
                </span>
                <button
                  onClick={handleSwitchNetwork}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium py-1 px-2.5 rounded-lg"
                >
                  Switch to Sepolia
                </button>
              </div>
            ) : isCheckingIssuer ? (
              <span className="text-zinc-500">Verifying authorization...</span>
            ) : isAuthorizedIssuer ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                ✓ Authorized Issuer Wallet Verified
              </span>
            ) : (
              <span className="text-red-600 dark:text-red-400 font-medium">
                ✗ Unauthorized Wallet (Mismatch with Contract Issuer)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Issuer Portal Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <span>🎓</span> Certificate Issuance & On-Chain Registration
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Compute client-side cryptographic commitment, download the mandatory proof, and register the credential on the Sepolia blockchain.
        </p>

        {/* File Selection */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Select Certificate Document (PDF Only)
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl p-8 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-900/50"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf"
              className="hidden"
            />
            <div className="flex flex-col items-center">
              <span className="text-3xl mb-2">📄</span>
              {state.file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {state.file.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {(state.file.size / 1024).toFixed(1)} KB — Ready to compute commitment
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Click to select or drag and drop your certificate PDF
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Supports .pdf files up to 25 MB
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {state.error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{state.error}</span>
            </div>
            <button
              onClick={() => setState((prev) => ({ ...prev, error: null }))}
              className="text-xs underline hover:no-underline text-red-600 dark:text-red-400"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Action Button: Compute Commitment */}
        {state.file && !state.commitment && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={processCertificate}
              disabled={state.isComputingCrypto}
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {state.isComputingCrypto ? (
                <>
                  <span className="animate-spin">⏳</span> Computing SHA-256 & Commitment...
                </>
              ) : (
                <>
                  <span>⚡</span> Calculate Commitment & Prepare Proof
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="py-2.5 px-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Issuance Results & Blockchain Registration Card */}
      {state.commitment && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-emerald-500 text-xl">✓</span>
              Cryptographic Commitment Prepared
            </h3>
            {state.confirmedReceipt ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                ✓ Confirmed On Sepolia Blockchain
              </span>
            ) : contractConfigured ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Awaiting Blockchain Registration
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                Blockchain Not Configured
              </span>
            )}
          </div>

          {/* Cryptographic Parameters Grid */}
          <div className="grid grid-cols-1 gap-4 font-mono text-xs">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Document SHA-256 Digest (exact PDF bytes)
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.fileHash}
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Credential ID (32-byte secure random)
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.credentialId}
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Salt (32-byte cryptographic entropy)
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.salt}
              </div>
            </div>

            <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/50">
              <div className="text-indigo-700 dark:text-indigo-400 font-sans text-xs mb-1 font-semibold flex items-center justify-between">
                <span>Cryptographic Commitment (solidityPackedKeccak256)</span>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 rounded">Payload</span>
              </div>
              <div className="text-indigo-950 dark:text-indigo-200 break-all font-semibold select-all">
                {state.commitment}
              </div>
            </div>
          </div>

          {/* Download Proof & Retention Warning (Required before submission) */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-3">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
              <span>⚠️</span> Mandatory Proof Download & Confirmation
            </div>
            <p>
              The verification proof stores the private salt and credential ID required for future verification. You must download and safely store this file before submitting the blockchain transaction.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleDownloadProof}
                disabled={!state.proof}
                className="bg-amber-700 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5"
              >
                <span>💾</span> Download Proof File (.json)
              </button>

              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-amber-950 dark:text-amber-100">
                <input
                  type="checkbox"
                  checked={state.userConfirmedSavedProof}
                  onChange={(e) => setState((prev) => ({ ...prev, userConfirmedSavedProof: e.target.checked }))}
                  className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span>I confirm I have downloaded and securely saved this proof file</span>
              </label>
            </div>
          </div>

          {/* Blockchain Submission Section */}
          <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {!state.confirmedReceipt ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleRegisterOnChain}
                  disabled={
                    !contractConfigured ||
                    !walletAddress ||
                    !isCorrectNetwork ||
                    !isAuthorizedIssuer ||
                    !state.userConfirmedSavedProof ||
                    state.isSubmittingTx
                  }
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  {state.isSubmittingTx ? (
                    <>
                      <span className="animate-spin">⏳</span> Submitting Transaction to Sepolia...
                    </>
                  ) : (
                    <>
                      <span>⛓️</span> Submit issueCredential() to Blockchain
                    </>
                  )}
                </button>

                {!contractConfigured && (
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                    Blockchain registration is disabled: CertTrace contract address is not configured.
                  </p>
                )}
                {contractConfigured && (!walletAddress || !isCorrectNetwork || !isAuthorizedIssuer) && (
                  <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
                    Connect an authorized issuer wallet on Sepolia to enable blockchain registration.
                  </p>
                )}
                {contractConfigured && walletAddress && isAuthorizedIssuer && !state.userConfirmedSavedProof && (
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                    Please download the proof file and check the confirmation box above to proceed.
                  </p>
                )}
              </div>
            ) : (
              /* Confirmed On-Chain Registration State */
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                  <span>✓</span> Credential Confirmed on Sepolia Blockchain
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-700 dark:text-zinc-300">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400">Block Number: </span>
                    <span className="font-mono font-medium">{state.confirmedReceipt.blockNumber}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400">Timestamp: </span>
                    <span className="font-mono font-medium">
                      {state.confirmedOnChainRecord?.timestamp
                        ? new Date(state.confirmedOnChainRecord.timestamp * 1000).toLocaleString()
                        : "Confirmed"}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Transaction Hash: </span>
                    {state.txHash && (
                      <a
                        href={getExplorerTxUrl(state.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-indigo-600 dark:text-indigo-400 underline hover:no-underline break-all"
                      >
                        {state.txHash} ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pending Transaction Tracker */}
            {state.isSubmittingTx && state.txHash && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  <span>Transaction broadcast! Waiting for block confirmation...</span>
                </div>
                <a
                  href={getExplorerTxUrl(state.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-indigo-600 dark:text-indigo-400 underline hover:no-underline"
                >
                  View on Sepolia Etherscan ↗
                </a>
              </div>
            )}

            {state.confirmedReceipt && state.credentialId && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-xl space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                    Share Public Verification Entry
                  </h4>
                  <p className="mt-1 text-xs text-indigo-800 dark:text-indigo-300">
                    This QR contains only the CertTrace verification URL and public credential ID. It does not contain the PDF, salt, proof file, or personal data, and it is not proof of validity.
                  </p>
                </div>

                {state.qrError ? (
                  <p className="text-xs text-red-700 dark:text-red-300">{state.qrError}</p>
                ) : state.qrDataUrl && state.verificationUrl ? (
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element -- locally generated data URL */}
                    <img
                      src={state.qrDataUrl}
                      alt="QR code for the CertTrace public verification entry"
                      width={180}
                      height={180}
                      className="rounded-lg border border-indigo-200 bg-white p-2"
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <p className="font-mono text-[11px] break-all text-indigo-950 dark:text-indigo-200 select-all">
                        {state.verificationUrl}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={state.verificationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-3 rounded-lg text-xs"
                        >
                          Open Verification Link ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadQrImage(state.qrDataUrl!, state.credentialId!)}
                          className="border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 font-medium py-2 px-3 rounded-lg text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                        >
                          Download QR PNG
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-indigo-700 dark:text-indigo-300">Generating QR code locally...</p>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleReset}
              className="py-2.5 px-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-xs font-medium transition-colors"
            >
              Issue Another Certificate
            </button>
          </div>
        </div>
      )}

      {revocationSupported ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Revoke a Registered Credential</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              V2 only. Revocation is permanent and succeeds only after the Sepolia transaction confirms and the updated status is read back on-chain.
            </p>
          </div>
          <input
            value={revocationCredentialId}
            onChange={(event) => setRevocationCredentialId(event.target.value)}
            placeholder="0x… credential ID"
            aria-label="Credential ID to revoke"
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 font-mono text-xs"
          />
          {revocationError && <p className="text-xs text-red-600 dark:text-red-400">{revocationError}</p>}
          {isSubmittingRevocation && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {revocationTxHash ? "Transaction broadcast; waiting for confirmation…" : "Waiting for MetaMask submission…"}
            </p>
          )}
          {revocationTxHash && (
            <a href={getExplorerTxUrl(revocationTxHash)} target="_blank" rel="noopener noreferrer" className="block text-xs font-mono text-indigo-600 dark:text-indigo-400 underline break-all">
              {revocationTxHash} ↗
            </a>
          )}
          {revocationConfirmed && (
            <p className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300">
              REVOKED — on-chain status confirmed at {new Date(revocationConfirmed.revokedAt * 1000).toLocaleString()}
            </p>
          )}
          <button
            type="button"
            onClick={handleRevokeCredential}
            disabled={isSubmittingRevocation || !walletAddress || !isCorrectNetwork || !isAuthorizedIssuer}
            className="w-full bg-red-700 hover:bg-red-600 text-white font-medium py-2.5 px-4 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmittingRevocation ? "Revocation Pending…" : "Submit revokeCredential()"}
          </button>
        </div>
      ) : (
        <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-xs text-zinc-600 dark:text-zinc-400">
          <strong className="text-zinc-800 dark:text-zinc-200">Revocation status:</strong>{" "}
          The configured Sepolia contract is CertTrace V1 and has no revocation function. A separately deployed V2 contract must be explicitly configured before real revocation controls can be enabled.
        </div>
      )}
    </div>
  );
}
