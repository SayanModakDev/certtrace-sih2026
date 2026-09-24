"use client";

import React, { useState, useRef } from "react";
import { prepareCertificateVerification, VerificationPreparationSuccess } from "../lib/verification";
import { validatePdfMetadata } from "../lib/validation";
import { DEFAULT_CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from "../lib/config";

interface VerifierState {
  pdfFile: File | null;
  proofFile: File | null;
  proofContent: string | null;
  result: VerificationPreparationSuccess | null;
  isProcessing: boolean;
  error: string | null;
}

export default function VerifierPortal() {
  const [state, setState] = useState<VerifierState>({
    pdfFile: null,
    proofFile: null,
    proofContent: null,
    result: null,
    isProcessing: false,
    error: null,
  });

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

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
        error: "Please provide both the certificate PDF and the JSON proof file",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isProcessing: true, error: null, result: null }));

    try {
      const buffer = await state.pdfFile.arrayBuffer();

      const verificationResult = await prepareCertificateVerification({
        pdfFile: state.pdfFile,
        pdfBuffer: buffer,
        proofInput: state.proofContent,
        expectedChainId: SEPOLIA_CHAIN_ID,
        expectedContractAddress: DEFAULT_CONTRACT_ADDRESS,
      });

      if (!verificationResult.success) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: verificationResult.error,
          result: null,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: null,
        result: verificationResult,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification preparation failed";
      setState((prev) => ({
        ...prev,
        isProcessing: false,
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
      isProcessing: false,
      error: null,
    });
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (proofInputRef.current) proofInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <span>🔍</span> Verifier Portal: Certificate Integrity & Commitment Reconstruction
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Verify the integrity of an academic certificate by reconstructing its cryptographic commitment from the PDF and JSON proof file.
        </p>

        {/* Security & Limitations Notice */}
        <div className="mt-4 p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <span>🛡️</span> Client-Side Mathematical Integrity Check
          </div>
          <p>
            Reconstructs the commitment payload locally without transmitting the document. Final verification against on-chain issuance records is pending Web3 contract query integration.
          </p>
        </div>

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
                    Exact original file
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
                    ✓ Proof loaded
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Click to select JSON proof
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Downloaded during issuance
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
            disabled={!state.pdfFile || !state.proofContent || state.isProcessing}
            className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {state.isProcessing ? (
              <>
                <span className="animate-spin">⏳</span> Verifying & Reconstructing Commitment...
              </>
            ) : (
              <>
                <span>🔬</span> Reconstruct Commitment
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

      {/* Verification Output */}
      {state.result && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>📊</span> Cryptographic Commitment Computed
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Mathematical proof inputs validated and reconstructed successfully.
              </p>
            </div>
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                Blockchain Verification Pending Integration
              </span>
            </div>
          </div>

          {/* Critical Clarification Alert */}
          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <span>ℹ️</span> Verification Stage Notice
            </div>
            <p>
              Local document integrity and cryptographic commitment calculation succeeded. To prevent fabrication of trust, this system will only confirm registration status once live smart contract lookup is integrated with Sepolia.
            </p>
          </div>

          {/* Reconstructed Parameters */}
          <div className="grid grid-cols-1 gap-4 font-mono text-xs">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Document SHA-256 Digest
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.result.fileHash}
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Credential ID (from proof)
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.result.proof.credentialId}
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 font-sans text-xs mb-1 font-medium">
                Salt (from proof)
              </div>
              <div className="text-zinc-900 dark:text-zinc-200 break-all select-all">
                {state.result.proof.salt}
              </div>
            </div>

            <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/50">
              <div className="text-indigo-700 dark:text-indigo-400 font-sans text-xs mb-1 font-semibold flex items-center justify-between">
                <span>Reconstructed Commitment (solidityPackedKeccak256)</span>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 rounded">For Contract Lookup</span>
              </div>
              <div className="text-indigo-950 dark:text-indigo-200 break-all font-semibold select-all">
                {state.result.reconstructedCommitment}
              </div>
            </div>
          </div>

          {/* Network & Contract Reference Info */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-sans space-y-1">
            <div className="text-zinc-500 dark:text-zinc-400 font-medium">
              Target Smart Contract Reference:
            </div>
            <div className="font-mono text-zinc-800 dark:text-zinc-300 break-all">
              Chain ID: {state.result.proof.chainId} (Sepolia) | Contract: {state.result.proof.contractAddress}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleReset}
              className="w-full py-2.5 px-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm transition-colors"
            >
              Verify Another Certificate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
