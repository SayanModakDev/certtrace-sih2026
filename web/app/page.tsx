"use client";

import React, { useState } from "react";
import IssuerPortal from "../components/IssuerPortal";
import VerifierPortal from "../components/VerifierPortal";
import {
  CONFIGURED_CONTRACT_ADDRESS,
  SEPOLIA_CHAIN_ID,
  isContractConfigured,
} from "../lib/config";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"issuer" | "verifier">("issuer");
  const contractConfigured = isContractConfigured();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 flex items-center justify-center text-white font-bold text-xl shadow-sm shadow-indigo-500/20">
              CT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-zinc-900 dark:text-zinc-50">
                  CertTrace
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  SIH 2026
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Academic Certificate Issuance & Integrity Verification
              </p>
            </div>
          </div>

          {/* Network Pill */}
          <div className="flex items-center gap-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-zinc-600 dark:text-zinc-400">Sepolia (ID: {SEPOLIA_CHAIN_ID})</span>
            <span className="text-zinc-400 dark:text-zinc-600">|</span>
            {contractConfigured ? (
              <span
                className="text-zinc-700 dark:text-zinc-300 truncate max-w-32.5 sm:max-w-40 font-medium"
                title={CONFIGURED_CONTRACT_ADDRESS}
              >
                {CONFIGURED_CONTRACT_ADDRESS.slice(0, 6)}...{CONFIGURED_CONTRACT_ADDRESS.slice(-4)}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Contract: Not Configured
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-zinc-200/70 dark:bg-zinc-900 p-1.5 rounded-2xl flex gap-1 border border-zinc-200 dark:border-zinc-800 shadow-inner">
            <button
              onClick={() => setActiveTab("issuer")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "issuer"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span>🎓</span>
              <span>Issuer Portal</span>
            </button>
            <button
              onClick={() => setActiveTab("verifier")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "verifier"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span>🔍</span>
              <span>Verifier Portal</span>
            </button>
          </div>
        </div>

        {/* Dynamic Tab View */}
        {activeTab === "issuer" ? <IssuerPortal /> : <VerifierPortal />}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              CertTrace — Student Innovation (SIH26194)
            </p>
            <p className="mt-0.5">
              Developed by BWU SolveArc for Smart India Hackathon 2026.
            </p>
          </div>
          <div className="text-center sm:text-right space-y-0.5">
            <p>Cryptographic Scheme: <span className="font-mono text-zinc-700 dark:text-zinc-300">CERTTRACE_V1</span></p>
            <p>Web Crypto API SHA-256 + ethers.js solidityPackedKeccak256</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
