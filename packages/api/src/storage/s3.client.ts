import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET ?? "metabox-media";

/**
 * Downloads a URL and uploads it to S3.
 * Returns the public S3 URL.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  folder: "images" | "audio" | "video",
  ext = "png",
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const key = `${folder}/${randomUUID()}.${ext}`;
  const contentType = response.headers.get("content-type") ?? `image/${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );

  const endpoint = process.env.S3_ENDPOINT ?? `https://s3.${process.env.S3_REGION}.amazonaws.com`;
  return `${endpoint}/${BUCKET}/${key}`;
}
