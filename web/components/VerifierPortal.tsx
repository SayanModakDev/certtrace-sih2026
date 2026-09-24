"use client";

import React, { useState, useRef } from "react";
import { verifyCertificateWithBlockchain, VerificationResult } from "../lib/verification";
import { validatePdfMetadata } from "../lib/validation";
import {
  SEPOLIA_CHAIN_ID,
  CONFIGURED_CONTRACT_ADDRESS,
  isContractConfigured,
  getExplorerAddressUrl,
} from "../lib/config";
import { parseVerificationCredentialId } from "../lib/qr";

interface VerifierState {
  pdfFile: File | null;
  proofFile: File | null;
  proofContent: string | null;
  result: VerificationResult | null;
  isVerifying: boolean;
  error: string | null;
}

interface VerifierPortalProps {
  initialCredentialId?: string | null;
}

export default function VerifierPortal({ initialCredentialId = null }: VerifierPortalProps) {
  const [state, setState] = useState<VerifierState>({
    pdfFile: null,
    proofFile: null,
    proofContent: null,
    result: null,
    isVerifying: false,
    error: null,
  });

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const contractConfigured = isContractConfigured();
  const qrCredentialId = parseVerificationCredentialId(initialCredentialId);
  const hasQrEntry = Boolean(initialCredentialId);
  const hasInvalidQrEntry = hasQrEntry && !qrCredentialId;

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validatePdfMetadata(file);
    if (!validation.valid) {
      setState((prev) => ({
        ...prev,
        pdfFile: null,
        error: validation.error || "Invalid PDF file",
        result: null,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      pdfFile: file,
      error: null,
      result: null,
    }));
  };

  const handleProofChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      setState((prev) => ({
        ...prev,
        proofFile: null,
        proofContent: null,
        error: "Verification proof must be a .json file",
        result: null,
      }));
      return;
    }

    try {
      const text = await file.text();
      setState((prev) => ({
        ...prev,
        proofFile: file,
        proofContent: text,
        error: null,
        result: null,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        proofFile: null,
        proofContent: null,
        error: "Failed to read the selected proof file",
        result: null,
      }));
    }
  };

  const handleVerify = async () => {
    if (!state.pdfFile || !state.proofContent) {
      setState((prev) => ({
        ...prev,
        error: "Please provide both the certificate PDF and the JSON proof file.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isVerifying: true, error: null, result: null }));

    try {
      const buffer = await state.pdfFile.arrayBuffer();

      const verificationResult = await verifyCertificateWithBlockchain({
        pdfFile: state.pdfFile,
        pdfBuffer: buffer,
        proofInput: state.proofContent,
        expectedChainId: SEPOLIA_CHAIN_ID,
        expectedContractAddress: CONFIGURED_CONTRACT_ADDRESS,
        expectedCredentialId: qrCredentialId,
      });

      setState((prev) => ({
        ...prev,
        isVerifying: false,
        error: null,
        result: verificationResult,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setState((prev) => ({
        ...prev,
        isVerifying: false,
        error: message,
        result: null,
      }));
    }
  };

  const handleReset = () => {
    setState({
      pdfFile: null,
      proofFile: null,
      proofContent: null,
      result: null,
      isVerifying: false,
      error: null,
    });
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (proofInputRef.current) proofInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <span>🔍</span> Verifier Portal: On-Chain Certificate Verification
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Verify the authenticity and integrity of an academic certificate using read-only blockchain lookup.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            No MetaMask Required
          </span>
        </div>

        {/* Contract Configuration Notice */}
        {!contractConfigured ? (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <span>⚠️</span> Blockchain Not Configured
            </div>
            <p>
              The CertTrace contract address is not configured in the environment. Set{" "}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">
                NEXT_PUBLIC_CONTRACT_ADDRESS
              </code>{" "}
              in <code className="font-mono">.env.local</code> to enable live on-chain verification.
            </p>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Target Contract: </span>
              <span className="font-mono">{CONFIGURED_CONTRACT_ADDRESS}</span>
            </div>
            <a
              href={getExplorerAddressUrl(CONFIGURED_CONTRACT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 underline hover:no-underline font-mono"
            >
              Sepolia Etherscan ↗
            </a>
          </div>
        )}

        {/* QR-link entry context. A public ID is a lookup hint, never authenticity proof. */}
        {hasQrEntry && (
          <div
            className={`mt-4 p-4 rounded-xl border text-xs space-y-1 ${
              hasInvalidQrEntry
                ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300"
                : "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60 text-indigo-800 dark:text-indigo-300"
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <span>{hasInvalidQrEntry ? "⚠️" : "▦"}</span>
              {hasInvalidQrEntry ? "Invalid QR Verification Link" : "QR Verification Entry Loaded"}
            </div>
            {qrCredentialId ? (
              <>
                <p className="font-mono break-all">Credential ID: {qrCredentialId}</p>
                <p>
                  This public ID only opens the verification workflow. Upload the original PDF and its
                  proof file below; CertTrace will then recalculate the commitment and query Sepolia.
                </p>
              </>
            ) : (
              <p>The link does not contain a valid non-zero bytes32 credential ID.</p>
            )}
          </div>
        )}

        {/* Dual Upload Section */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PDF Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              1. Original Certificate Document (.pdf)
            </label>
            <div
              onClick={() => pdfInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl p-5 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-900/50 min-h-35 flex flex-col justify-center items-center"
            >
              <input
                type="file"
                ref={pdfInputRef}
                onChange={handlePdfChange}
                accept="application/pdf"
                className="hidden"
              />
              <span className="text-2xl mb-1">📄</span>
              {state.pdfFile ? (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 break-all">
                    {state.pdfFile.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {(state.pdfFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Click to select certificate PDF
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Exact raw bytes will be hashed locally
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Proof JSON Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              2. Verification Proof File (.json)
            </label>
            <div
              onClick={() => proofInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl p-5 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-900/50 min-h-35 flex flex-col justify-center items-center"
            >
              <input
                type="file"
                ref={proofInputRef}
                onChange={handleProofChange}
                accept=".json,application/json"
                className="hidden"
              />
              <span className="text-2xl mb-1">🔑</span>
              {state.proofFile ? (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 break-all">
                    {state.proofFile.name}
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ Proof file loaded
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Click to select JSON proof
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Issued by the institution
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

        {/* Verification Action */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleVerify}
            disabled={!state.pdfFile || !state.proofContent || state.isVerifying || hasInvalidQrEntry}
            className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {state.isVerifying ? (
              <>
                <span className="animate-spin">⏳</span> Querying Sepolia Smart Contract...
              </>
            ) : (
              <>
                <span>🔬</span> Verify Authenticity On-Chain
              </>
            )}
          </button>
          {(state.pdfFile || state.proofFile || state.result) && (
            <button
              onClick={handleReset}
              className="py-2.5 px-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Verification Result Output */}
      {state.result && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          {/* Status Headline Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {state.result.outcome === "MATCHES_REGISTERED_DOCUMENT" && <span className="text-emerald-500">✓</span>}
                {state.result.outcome === "REVOKED_REGISTERED_DOCUMENT" && <span className="text-red-500">✗</span>}
                {state.result.outcome === "DOCUMENT_MISMATCH" && <span className="text-amber-500">⚠️</span>}
                {state.result.outcome === "UNKNOWN_CREDENTIAL" && <span className="text-zinc-400">ℹ️</span>}
                {state.result.outcome === "VERIFICATION_UNAVAILABLE" && <span className="text-red-500">✗</span>}
                {state.result.headline}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl">
                {state.result.details}
              </p>
            </div>

            <div>
              {state.result.outcome === "MATCHES_REGISTERED_DOCUMENT" && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  MATCHES REGISTERED DOCUMENT
                </span>
              )}
              {state.result.outcome === "REVOKED_REGISTERED_DOCUMENT" && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800">
                  REVOKED — REGISTERED DOCUMENT
                </span>
              )}
              {state.result.outcome === "DOCUMENT_MISMATCH" && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  DOCUMENT MISMATCH
                </span>
              )}
              {state.result.outcome === "UNKNOWN_CREDENTIAL" && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
                  UNKNOWN CREDENTIAL
                </span>
              )}
              {state.result.outcome === "VERIFICATION_UNAVAILABLE" && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800">
                  VERIFICATION UNAVAILABLE
                </span>
              )}
            </div>
          </div>

          {/* On-Chain Record Details (If found) */}
          {state.result.onChainRecord && state.result.onChainRecord.isRegistered && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 text-xs">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                On-Chain Contract Record
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block mb-0.5">Recorded Issuer Wallet:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 break-all">
                    {state.result.onChainRecord.issuer}
                  </span>
                  {state.result.isIssuerAuthorized && (
                    <span className="inline-block mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Matches Contract Authorized Issuer
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block mb-0.5">Blockchain Issuance Timestamp:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {new Date(state.result.onChainRecord.timestamp * 1000).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block mb-0.5">Registration Status:</span>
                  <span className={`font-semibold ${
                    state.result.onChainRecord.isRevoked
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {state.result.onChainRecord.isRevoked ? "Revoked / Registered" : "Active / Registered"}
                  </span>
                  {state.result.onChainRecord.isRevoked && state.result.onChainRecord.revokedAt > 0 && (
                    <span className="block mt-1 text-zinc-500 dark:text-zinc-400">
                      Revoked: {new Date(state.result.onChainRecord.revokedAt * 1000).toLocaleString()}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block mb-0.5">Contract Reference:</span>
                  {state.result.contractAddress && (
                    <a
                      href={getExplorerAddressUrl(state.result.contractAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-indigo-600 dark:text-indigo-400 underline hover:no-underline break-all"
                    >
                      {state.result.contractAddress.slice(0, 8)}...{state.result.contractAddress.slice(-6)} ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cryptographic Parameters Comparison */}
          {state.result.fileHash && state.result.reconstructedCommitment && (
            <div className="grid grid-cols-1 gap-3 font-mono text-xs">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                  Document SHA-256 Digest (computed locally from PDF)
                </div>
                <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                  {state.result.fileHash}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                  Reconstructed Commitment (solidityPackedKeccak256)
                </div>
                <div className="text-zinc-900 dark:text-zinc-200 break-all select-all font-semibold">
                  {state.result.reconstructedCommitment}
                </div>
              </div>

              {state.result.onChainRecord && state.result.onChainRecord.isRegistered && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                    On-Chain Stored Commitment
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-200 break-all select-all font-semibold">
                    {state.result.onChainRecord.commitment}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleReset}
              className="w-full py-2.5 px-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm transition-colors font-medium"
            >
              Verify Another Certificate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
