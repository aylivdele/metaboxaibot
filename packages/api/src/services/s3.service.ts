import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@metabox/shared";
import sharp from "sharp";
import { createRequire } from "module";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";

const _require = createRequire(import.meta.url);
const ffmpegPath: string | null = _require("ffmpeg-static") as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/** Seconds until a presigned GET URL expires. */
const PRESIGN_TTL = 3600;

/**
 * Run an S3 operation once, and if it throws, run it one more time after
 * a short delay. Intended for transient network/DNS blips — any error is
 * considered retryable. Logs both the failed first attempt and the final
 * outcome so silent drops are impossible.
 */
async function withRetry<T>(
  op: string,
  ctx: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, op, ...ctx }, "s3 operation failed, retrying once");
    await new Promise((r) => setTimeout(r, 500));
    try {
      return await fn();
    } catch (err2) {
      logger.error({ err: err2, op, ...ctx }, "s3 operation failed after retry");
      throw err2;
    }
  }
}

function makeClient(): S3Client | null {
  const { bucket, region, endpoint, accessKeyId, secretAccessKey } = config.s3;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Required for path-style S3 endpoints (MinIO, R2)
    forcePathStyle: !!endpoint,
  });
}

/** Builds the S3 key for a generated file. */
export function buildS3Key(section: string, userId: string, jobId: string, ext: string): string {
  return `${section}/${userId}/${jobId}.${ext}`;
}

/** Returns the content-type and extension for a given section. */
export function sectionMeta(section: string): { ext: string; contentType: string } {
  if (section === "audio") return { ext: "mp3", contentType: "audio/mpeg" };
  if (section === "video") return { ext: "mp4", contentType: "video/mp4" };
  return { ext: "jpg", contentType: "image/jpeg" };
}

/**
 * Upload a Buffer to S3. Retries once on transient errors.
 * Returns the S3 key on success, null if S3 is not configured.
 * Throws after two failed attempts — callers decide how to recover.
 */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const client = makeClient();
  if (!client) {
    logger.warn({ key }, "uploadBuffer: S3 not configured, skipping");
    return null;
  }

  await withRetry("uploadBuffer", { key, contentType, size: buffer.byteLength }, () =>
    client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    ),
  );

  return key;
}

/**
 * Fetch a remote URL and upload the response body to S3. Retries the
 * fetch+upload pipeline once on failure. Returns the S3 key on success,
 * null if S3 is not configured. Throws if the remote fetch or upload
 * keeps failing after the retry.
 */
export async function uploadFromUrl(
  key: string,
  url: string,
  contentType: string,
): Promise<string | null> {
  const client = makeClient();
  if (!client) {
    logger.warn({ key, url }, "uploadFromUrl: S3 not configured, skipping");
    return null;
  }

  return withRetry("uploadFromUrl", { key, url, contentType }, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file for S3 upload: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength) {
      throw new Error(`Fetched body is empty for S3 upload: ${url}`);
    }
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  });
}

/**
 * Returns a URL to access the stored file:
 * - public URL (if S3_PUBLIC_URL is configured)
 * - presigned GET URL (valid for PRESIGN_TTL seconds)
 * Returns null if S3 is not configured.
 *
 * Pass `downloadFilename` to force browser download via Content-Disposition: attachment.
 */
export async function getFileUrl(key: string, downloadFilename?: string): Promise<string | null> {
  const { bucket, publicUrl } = config.s3;
  if (!bucket) {
    logger.warn({ key }, "getFileUrl: S3 bucket not configured");
    return null;
  }

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  const client = makeClient();
  if (!client) {
    logger.warn({ key }, "getFileUrl: S3 client not configured");
    return null;
  }

  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ChecksumMode: undefined,
        ...(downloadFilename
          ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` }
          : {}),
      }),
      { expiresIn: PRESIGN_TTL, unsignableHeaders: new Set(["x-amz-checksum-mode"]) },
    );
  } catch (err) {
    logger.error({ err, key }, "getFileUrl: failed to sign URL");
    return null;
  }
}

/**
 * Derives the S3 key for a thumbnail from the original S3 key.
 * e.g. "image/123/abc.jpg" → "image/123/abc_thumb.webp"
 */
export function buildThumbnailKey(s3Key: string): string {
  const dot = s3Key.lastIndexOf(".");
  const base = dot !== -1 ? s3Key.slice(0, dot) : s3Key;
  return `${base}_thumb.webp`;
}

/**
 * Fetches an image URL and returns its size in megapixels
 * (width × height / 1_000_000). Throws on fetch/decode failures so
 * the caller can decide whether to fall back to a default.
 */
export async function measureImageMegapixels(imageUrl: string): Promise<number> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image for measurement: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read image dimensions");
  return (meta.width * meta.height) / 1_000_000;
}

export interface ImageProbeInfo {
  width: number;
  height: number;
  fileSizeBytes: number;
}

/**
 * Fetches an image URL and reads width/height via sharp, plus the byte length.
 * Throws on fetch/decode failures so the caller can decide how to surface the error.
 */
export async function probeImageMetadata(imageUrl: string): Promise<ImageProbeInfo> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image for probe: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read image dimensions");
  return { width: meta.width, height: meta.height, fileSizeBytes: buf.byteLength };
}

/**
 * Generates a 400px-wide WebP thumbnail from an image buffer.
 * Returns null for SVG or non-image content types.
 *
 * `.rotate()` without arguments applies EXIF orientation so phone photos
 * come out right-side-up in the thumbnail.
 *
 * The content-type guard treats unknown types (e.g. `application/octet-stream`)
 * as potentially valid images — sharp will reject them safely if they aren't.
 */
export async function generateThumbnail(buf: Buffer, contentType: string): Promise<Buffer | null> {
  if (contentType === "image/svg+xml") return null;
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    contentType !== "application/octet-stream"
  )
    return null;
  try {
    return await sharp(buf)
      .rotate() // honour EXIF orientation
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch (err) {
    logger.warn({ err, contentType }, "generateThumbnail failed");
    return null;
  }
}

/**
 * Re-encodes an image to a JPEG small enough for Telegram sendPhoto.
 * Telegram rejects photos over ~10MB and dimensions whose sum exceeds 10000.
 * Scales down to max 4096 on the longest side and steps JPEG quality down
 * until the result fits `targetBytes`. Halves dimensions as last resort.
 */
export async function compressForTelegramPhoto(
  input: Buffer,
  targetBytes: number = 9 * 1024 * 1024,
): Promise<Buffer> {
  const MAX_DIM = 4096;
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const needsResize = width > MAX_DIM || height > MAX_DIM;
  const base = () => {
    const p = sharp(input).rotate();
    return needsResize
      ? p.resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      : p;
  };

  let quality = 90;
  let out = await base().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.byteLength > targetBytes && quality > 30) {
    quality -= 15;
    out = await base().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  if (out.byteLength > targetBytes && width > 0) {
    out = await sharp(input)
      .rotate()
      .resize({ width: Math.max(512, Math.floor(width / 2)) })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  }
  return out;
}

/**
 * Extracts a single frame (~1s in) from a video buffer and returns a
 * 400px-wide WebP thumbnail. Returns null on any failure.
 *
 * We write the buffer to a temp file first instead of piping via stdin
 * because ffmpeg's `-ss` seek requires a seekable input — non-seekable
 * stdin streams silently produce zero frames, which is what made every
 * previous video job end up with thumbnailS3Key=null.
 */
export async function generateVideoThumbnail(buf: Buffer): Promise<Buffer | null> {
  const tmpFile = join(tmpdir(), `vid-${randomUUID()}.mp4`);
  try {
    await writeFile(tmpFile, buf);

    const rawFrame: Buffer = await new Promise((resolve, reject) => {
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on("data", (c: Buffer) => chunks.push(c));
      output.on("end", () => resolve(Buffer.concat(chunks)));
      output.on("error", reject);

      ffmpeg(tmpFile)
        .inputOptions(["-ss", "1"])
        .outputOptions(["-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg"])
        .on("error", reject)
        .pipe(output, { end: true });
    });

    if (!rawFrame.length) {
      logger.warn("generateVideoThumbnail: ffmpeg produced zero-byte frame");
      return null;
    }

    return await sharp(rawFrame)
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, "generateVideoThumbnail failed");
    return null;
  } finally {
    await unlink(tmpFile).catch(() => void 0);
  }
}

/**
 * Delete an object from S3. Returns true on success (or if S3 is not
 * configured — nothing to clean up), false on failure. Missing keys are
 * treated as success since the goal state (object gone) is already met.
 */
export async function deleteFile(key: string): Promise<boolean> {
  const client = makeClient();
  if (!client) {
    logger.warn({ key }, "deleteFile: S3 not configured, treating as success");
    return true;
  }

  try {
    await withRetry("deleteFile", { key }, () =>
      client.send(
        new DeleteObjectCommand({
          Bucket: config.s3.bucket!,
          Key: key,
        }),
      ),
    );
    return true;
  } catch (err) {
    logger.error({ err, key }, "deleteFile: failed to delete after retry");
    return false;
  }
}

export const s3Service = {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  uploadFromUrl,
  getFileUrl,
  deleteFile,
  generateThumbnail,
  generateVideoThumbnail,
};
