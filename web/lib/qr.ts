import QRCode from "qrcode";
import { CONFIGURED_PUBLIC_APP_ORIGIN } from "./config";
import { isValidBytes32 } from "./crypto";

const VERIFY_PATH = "/verify";

function normalizePublicOrigin(origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("Invalid public application origin for verification QR link");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Verification QR origin must use HTTP or HTTPS");
  }

  return parsed.origin;
}

/**
 * Builds a public, non-secret entry URL. The credential ID is an identifier, not proof.
 */
export function createVerificationUrl(
  credentialId: string,
  publicOrigin?: string
): string {
  if (!isValidBytes32(credentialId)) {
    throw new Error("Cannot create verification link: invalid credential ID");
  }

  const candidateOrigin = publicOrigin || CONFIGURED_PUBLIC_APP_ORIGIN ||
    (typeof window !== "undefined" ? window.location.origin : "");

  if (!candidateOrigin) {
    throw new Error(
      "Public application origin is unavailable. Set NEXT_PUBLIC_APP_ORIGIN for QR generation."
    );
  }

  const url = new URL(VERIFY_PATH, normalizePublicOrigin(candidateOrigin));
  url.searchParams.set("id", credentialId.toLowerCase());
  return url.toString();
}

/** Returns a valid public credential ID from a QR/query value, or null. */
export function parseVerificationCredentialId(value: unknown): string | null {
  if (typeof value !== "string" || !isValidBytes32(value)) return null;
  return value.toLowerCase();
}

/** Ensures a proof belongs to the public credential ID carried by the QR link. */
export function credentialIdMatchesQrEntry(
  qrCredentialId: string | null | undefined,
  proofCredentialId: string
): boolean {
  if (!qrCredentialId) return true;
  return qrCredentialId.toLowerCase() === proofCredentialId.toLowerCase();
}

/** Generates a PNG data URL locally. No certificate or proof data is uploaded. */
export async function generateVerificationQrDataUrl(verificationUrl: string): Promise<string> {
  const parsed = new URL(verificationUrl);
  if (parsed.pathname !== VERIFY_PATH) {
    throw new Error("QR URL must target the CertTrace verification route");
  }
  const credentialId = parseVerificationCredentialId(parsed.searchParams.get("id"));
  if (!credentialId) {
    throw new Error("QR URL is missing a valid credential ID");
  }

  return QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#18181b", light: "#ffffff" },
  });
}

export function downloadQrImage(dataUrl: string, credentialId: string): void {
  if (typeof document === "undefined" || !isValidBytes32(credentialId)) return;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `certtrace-verification-qr-${credentialId.slice(2, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
