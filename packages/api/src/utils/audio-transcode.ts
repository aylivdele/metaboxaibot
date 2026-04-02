import { createRequire } from "module";
import ffmpeg from "fluent-ffmpeg";
import { Readable, PassThrough } from "stream";

const _require = createRequire(import.meta.url);
const ffmpegPath: string | null = _require("ffmpeg-static") as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Transcodes an audio buffer from OGG/Opus to MP3.
 * Used before uploading to providers that don't support OGG (e.g. HeyGen).
 */
export async function transcodeOggToMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const readable = new Readable({ read() {} });
    readable.push(input);
    readable.push(null);

    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);

    ffmpeg(readable)
      .inputFormat("ogg")
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .format("mp3")
      .on("error", reject)
      .pipe(output, { end: true });
  });
}
