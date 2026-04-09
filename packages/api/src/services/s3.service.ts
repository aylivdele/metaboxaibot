import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@metabox/shared";
import sharp from "sharp";
import { createRequire } from "module";
import ffmpeg from "fluent-ffmpeg";
import { Readable, PassThrough } from "stream";

const _require = createRequire(import.meta.url);
const ffmpegPath: string | null = _require("ffmpeg-static") as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/** Seconds until a presigned GET URL expires. */
const PRESIGN_TTL = 3600;

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
 * Upload a Buffer to S3.
 * Returns the S3 key on success, null if S3 is not configured.
 */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const client = makeClient();
  if (!client) return null;

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Fetch a remote URL and upload the response body to S3.
 * Returns the S3 key on success, null if S3 is not configured or fetch fails.
 */
export async function uploadFromUrl(
  key: string,
  url: string,
  contentType: string,
): Promise<string | null> {
  const client = makeClient();
  if (!client) return null;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file for S3 upload: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadBuffer(key, buffer, contentType);
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
  if (!bucket) return null;

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  const client = makeClient();
  if (!client) return null;

  return getSignedUrl(
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

/**
 * Generates a 400px-wide WebP thumbnail from an image buffer.
 * Returns null for SVG or non-image content types.
 */
export async function generateThumbnail(buf: Buffer, contentType: string): Promise<Buffer | null> {
  if (!contentType.startsWith("image/") || contentType === "image/svg+xml") return null;
  try {
    return await sharp(buf)
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Extracts a single frame (~1s in) from a video buffer and returns a
 * 400px-wide WebP thumbnail. Returns null on any failure.
 */
export async function generateVideoThumbnail(buf: Buffer): Promise<Buffer | null> {
  try {
    const rawFrame: Buffer = await new Promise((resolve, reject) => {
      const readable = new Readable({ read() {} });
      readable.push(buf);
      readable.push(null);

      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on("data", (c: Buffer) => chunks.push(c));
      output.on("end", () => resolve(Buffer.concat(chunks)));
      output.on("error", reject);

      ffmpeg(readable)
        .inputOptions(["-ss", "1"])
        .outputOptions(["-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg"])
        .on("error", reject)
        .pipe(output, { end: true });
    });

    return await sharp(rawFrame)
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

export const s3Service = {
  buildS3Key,
  buildThumbnailKey,
  sectionMeta,
  uploadBuffer,
  uploadFromUrl,
  getFileUrl,
  generateThumbnail,
  generateVideoThumbnail,
};
