import { PDFParse } from "pdf-parse";
import { logger } from "../logger.js";
import { getFileUrl } from "./s3.service.js";

/**
 * Extracts plain text from a PDF buffer using pdf-parse. Fail-soft:
 * returns null on any error (password-protected, corrupted, empty) so
 * the caller can reject the request with a user-facing message rather
 * than bubbling the exception up.
 */
export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err) {
    logger.warn({ err }, "extractPdfText failed");
    return null;
  }
}

/**
 * Downloads a PDF from S3 (via presigned URL) and returns its text.
 * Returns null if the file can't be fetched or parsed.
 */
export async function extractPdfTextFromS3(s3Key: string): Promise<string | null> {
  const url = await getFileUrl(s3Key);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ s3Key, status: res.status }, "extractPdfTextFromS3: fetch failed");
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return await extractPdfText(buffer);
  } catch (err) {
    logger.warn({ err, s3Key }, "extractPdfTextFromS3 failed");
    return null;
  }
}

/**
 * Wraps extracted document text as an XML-ish block for inclusion in a
 * chat prompt. The model sees a clearly-delimited document with its
 * filename. Multiple documents get multiple blocks concatenated.
 */
export function buildDocumentPromptBlock(name: string, text: string): string {
  return `<document name="${name}">\n${text}\n</document>`;
}
