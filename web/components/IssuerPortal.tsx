"use client";

import React, { useState, useRef } from "react";
import { hashFileBytes, generateRandomBytes32, calculateCommitment } from "../lib/crypto";
import { createVerificationProof, downloadProofFile, VerificationProof } from "../lib/proof";
import { validatePdfMetadata, validatePdfMagicBytes } from "../lib/validation";
import { DEFAULT_CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from "../lib/config";

interface IssuerState {
  file: File | null;
  fileHash: string | null;
  credentialId: string | null;
  salt: string | null;
  commitment: string | null;
  proof: VerificationProof | null;
  isProcessing: boolean;
  error: string | null;
  hasDownloadedProof: boolean;
}

export default function IssuerPortal() {
  const [state, setState] = useState<IssuerState>({
    file: null,
    fileHash: null,
    credentialId: null,
    salt: null,
    commitment: null,
    proof: null,
    isProcessing: false,
    error: null,
    hasDownloadedProof: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Reset results on new file select
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
    }));
  };

  const processCertificate = async () => {
    if (!state.file) return;

    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    try {
      const arrayBuffer = await state.file.arrayBuffer();

      // Magic bytes check
      const magicCheck = validatePdfMagicBytes(arrayBuffer);
      if (!magicCheck.valid) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
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
      const proof = createVerificationProof(
        credentialId,
        salt,
        SEPOLIA_CHAIN_ID,
        DEFAULT_CONTRACT_ADDRESS
      );

      setState((prev) => ({
        ...prev,
        fileHash,
        credentialId,
        salt,
        commitment,
        proof,
        isProcessing: false,
        error: null,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process certificate";
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: message,
      }));
    }
  };

  const handleDownloadProof = () => {
    if (!state.proof) return;
    downloadProofFile(state.proof, "certtrace-proof");
    setState((prev) => ({ ...prev, hasDownloadedProof: true }));
  };

  const handleReset = () => {
    setState({
      file: null,
      fileHash: null,
      credentialId: null,
      salt: null,
      commitment: null,
      proof: null,
      isProcessing: false,
      error: null,
      hasDownloadedProof: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <span>🎓</span> Issuer Portal: Certificate Commitment & Proof Generation
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Compute the client-side cryptographic commitment for an academic certificate and generate the verification proof file.
        </p>

        {/* Security Alert */}
        <div className="mt-4 p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
          <span className="text-base leading-none">🔒</span>
          <div>
            <strong className="font-semibold">Privacy Preservation:</strong> Hashing is executed locally in your browser using the Web Crypto API. No PDF files, student names, or sensitive information are uploaded or stored externally.
          </div>
        </div>

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

        {/* Action Button */}
        {state.file && !state.commitment && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={processCertificate}
              disabled={state.isProcessing}
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {state.isProcessing ? (
                <>
                  <span className="animate-spin">⏳</span> Computing SHA-256 & Commitment...
                </>
              ) : (
                <>
                  <span>⚡</span> Calculate Commitment & Generate Proof
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

      {/* Issuance Results & Proof Card */}
      {state.commitment && state.proof && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-emerald-500 text-xl">✓</span>
              Cryptographic Commitment Computed
            </h3>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Ready for Blockchain Registration
            </span>
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
                <span>Cryptographic Commitment (solidityPackedKeccak256 - CERTTRACE_V1)</span>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 rounded">On-Chain Payload</span>
              </div>
              <div className="text-indigo-950 dark:text-indigo-200 break-all font-semibold select-all">
                {state.commitment}
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
              <span>⚠️</span> Mandatory User Action: Download & Retain Proof
            </div>
            <p>
              You <strong>must retain both the original PDF and the generated JSON proof file</strong> for subsequent verification.
              Without this proof file (which stores your private salt and credential ID), the on-chain commitment cannot be reconstructed or proven.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleDownloadProof}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span>💾</span> Download Verification Proof (.json)
            </button>
            <button
              onClick={handleReset}
              className="py-3 px-5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm transition-colors"
            >
              Issue Another Certificate
            </button>
          </div>

          {state.hasDownloadedProof && (
            <div className="text-xs text-center text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ Proof file downloaded successfully. Ready for transaction submission to CertTrace contract on Sepolia.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
