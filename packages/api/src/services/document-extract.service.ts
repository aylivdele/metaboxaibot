import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { logger } from "../logger.js";
import { getFileUrl } from "./s3.service.js";

const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_CSV_ALT = "text/comma-separated-values";

const MAX_TEXT_CHARS = 500_000;
const MAX_TABLE_ROWS = 100;

/** True for documents that go through the extract+inline path (everything except PDF). */
export function isTextClassMime(mime: string): boolean {
  if (mime === MIME_PDF) return false;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  if (mime === MIME_DOCX) return true;
  if (mime === MIME_XLSX) return true;
  if (mime === MIME_CSV_ALT) return true;
  return false;
}

/** Extract plain text from a PDF buffer. Returns null on failure. */
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

/** Downloads a PDF from S3 and returns its text. Returns null on failure. */
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
 * Unified extractor — dispatches by mime type.
 * Returns null on failure (corrupted, password-protected, empty, unsupported).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string | null> {
  try {
    if (mimeType === MIME_PDF) return await extractPdfText(buffer);
    if (mimeType === MIME_DOCX) return await extractDocx(buffer);
    if (mimeType === MIME_XLSX) return extractXlsx(buffer);
    if (mimeType === "text/csv" || mimeType === MIME_CSV_ALT) return extractCsv(buffer);
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return capText(buffer.toString("utf-8").trim());
    }
    logger.warn({ mimeType, fileName }, "extractTextFromBuffer: unsupported mime");
    return null;
  } catch (err) {
    logger.warn({ err, mimeType, fileName }, "extractTextFromBuffer failed");
    return null;
  }
}

/** Fetch from S3 and extract text. Returns null on any failure. */
export async function extractTextFromS3(
  s3Key: string,
  mimeType: string,
  fileName: string,
): Promise<string | null> {
  const url = await getFileUrl(s3Key);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ s3Key, status: res.status }, "extractTextFromS3: fetch failed");
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return await extractTextFromBuffer(buffer, mimeType, fileName);
  } catch (err) {
    logger.warn({ err, s3Key, mimeType }, "extractTextFromS3 failed");
    return null;
  }
}

/** Wraps extracted document text as an XML-ish block for prompt inclusion. */
export function buildDocumentPromptBlock(name: string, text: string): string {
  return `<document name="${name}">\n${text}\n</document>`;
}

// ── Internal extractors ──────────────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<string | null> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim();
  return text && text.length > 0 ? capText(text) : null;
}

function extractXlsx(buffer: Buffer): string | null {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const blocks: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as unknown[][];
    if (rows.length === 0) continue;
    const table = formatTable(rows.map((r) => r.map(cellToString)));
    blocks.push(`### Sheet: ${sheetName}\n\n${table}`);
  }
  if (blocks.length === 0) return null;
  return capText(blocks.join("\n\n"));
}

function extractCsv(buffer: Buffer): string | null {
  // Reuse the xlsx parser for CSV — it handles quoting/escaping correctly.
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
  const first = wb.SheetNames[0];
  if (!first) return null;
  const sheet = wb.Sheets[first];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];
  if (rows.length === 0) return null;
  return capText(formatTable(rows.map((r) => r.map(cellToString))));
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Renders rows as a markdown table, capped at MAX_TABLE_ROWS (excluding header). */
function formatTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const totalDataRows = rows.length - 1;
  const truncated = rows.length > MAX_TABLE_ROWS + 1;
  const displayed = truncated ? rows.slice(0, MAX_TABLE_ROWS + 1) : rows;

  const header = displayed[0] ?? [];
  const colCount = Math.max(...displayed.map((r) => r.length), 1);
  const pad = (r: string[]) => {
    const copy = r.slice(0, colCount);
    while (copy.length < colCount) copy.push("");
    return copy.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " "));
  };

  const headerRow = pad(header);
  const separator = new Array(colCount).fill("---");
  const bodyRows = displayed.slice(1).map(pad);

  const lines: string[] = [
    `| ${headerRow.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...bodyRows.map((r) => `| ${r.join(" | ")} |`),
  ];
  if (truncated) {
    lines.push(`\n_[truncated: showing first ${MAX_TABLE_ROWS} of ${totalDataRows} rows]_`);
  }
  return lines.join("\n");
}

function capText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n_[truncated: content exceeds ${MAX_TEXT_CHARS} chars]_`;
}
