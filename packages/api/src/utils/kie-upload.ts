import { fetchWithLog } from "./fetch.js";

const KIE_FILE_BASE = "https://kieai.redpandaai.co";

interface KieFileUploadResponse {
  success: boolean;
  code: number;
  msg: string;
  data?: {
    fileName: string;
    filePath: string;
    downloadUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
  };
}

/**
 * Upload a file to KIE's temporary storage via URL.
 * KIE downloads the file from the given URL and returns a public download link.
 * Files are automatically deleted after 3 days.
 *
 * Used to make S3 presigned URLs / Telegram file URLs accessible to KIE's
 * generation endpoints (which cannot reach private/expiring URLs).
 */
export async function uploadFileUrl(apiKey: string, fileUrl: string): Promise<string> {
  const resp = await fetchWithLog(`${KIE_FILE_BASE}/api/file-url-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileUrl,
      uploadPath: "metabox/media",
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`KIE file upload failed: ${resp.status} ${txt}`);
  }

  const data = (await resp.json()) as KieFileUploadResponse;
  if (!data.success || data.code !== 200 || !data.data?.downloadUrl) {
    throw new Error(`KIE file upload failed: ${data.code} — ${data.msg}`);
  }

  return data.data.downloadUrl;
}
