import { MAX_PDF_SIZE_BYTES, MIN_PDF_SIZE_BYTES } from "./config";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates file metadata (name, extension, size).
 */
export function validatePdfMetadata(file: { name: string; size: number; type?: string }): FileValidationResult {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  // Check file name & extension
  if (!file.name || !file.name.toLowerCase().endsWith(".pdf")) {
    return { valid: false, error: "Only PDF files (.pdf) are supported" };
  }

  // Check MIME type if present (some browsers might report application/octet-stream or empty)
  if (file.type && file.type !== "application/pdf" && file.type !== "") {
    return { valid: false, error: "Invalid file type: expected application/pdf" };
  }

  // Check file size
  if (file.size <= 0) {
    return { valid: false, error: "The selected file is empty (0 bytes)" };
  }

  if (file.size < MIN_PDF_SIZE_BYTES) {
    return { valid: false, error: "The file is too small to be a valid PDF" };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    const maxMb = MAX_PDF_SIZE_BYTES / (1024 * 1024);
    return { valid: false, error: `File exceeds maximum allowed size of ${maxMb} MB` };
  }

  return { valid: true };
}

/**
 * Inspects the initial bytes of a buffer for the standard PDF magic header (%PDF-).
 */
export function validatePdfMagicBytes(buffer: ArrayBuffer | Uint8Array): FileValidationResult {
  if (!buffer || buffer.byteLength < 5) {
    return { valid: false, error: "Buffer is too small to contain a valid PDF header" };
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // PDF header starts with '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2d)
  const isPdfHeader =
    bytes[0] === 0x25 && // '%'
    bytes[1] === 0x50 && // 'P'
    bytes[2] === 0x44 && // 'D'
    bytes[3] === 0x46 && // 'F'
    bytes[4] === 0x2d;   // '-'

  if (!isPdfHeader) {
    return { valid: false, error: "The file does not appear to be a valid PDF (missing %PDF- header)" };
  }

  return { valid: true };
}
