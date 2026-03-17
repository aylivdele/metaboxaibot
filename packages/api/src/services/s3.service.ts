import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@metabox/shared";

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
export function buildS3Key(
  section: string,
  userId: string,
  jobId: string,
  ext: string,
): string {
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
 */
export async function getFileUrl(key: string): Promise<string | null> {
  const { bucket, publicUrl } = config.s3;
  if (!bucket) return null;

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  const client = makeClient();
  if (!client) return null;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGN_TTL },
  );
}

export const s3Service = { buildS3Key, sectionMeta, uploadBuffer, uploadFromUrl, getFileUrl };
