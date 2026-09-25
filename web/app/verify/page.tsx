import Link from "next/link";
import VerifierPortal from "../../components/VerifierPortal";
import { SEPOLIA_CHAIN_ID } from "../../lib/config";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const query = await searchParams;
  const credentialId = typeof query.id === "string" ? query.id : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Return to CertTrace home">
            <span className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 flex items-center justify-center text-white font-bold text-xl shadow-sm">
              CT
            </span>
            <span>
              <span className="block font-bold text-lg tracking-tight">CertTrace</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">Public Verification</span>
            </span>
          </Link>
          <div className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 px-3 py-1.5 rounded-xl">
            Sepolia (ID: {SEPOLIA_CHAIN_ID}) · CertTrace Registry
          </div>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <VerifierPortal initialCredentialId={credentialId} />
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400">
        A QR link is a public lookup entry only. PDF integrity is established after file and proof verification.
      </footer>
    </div>
  );
}
