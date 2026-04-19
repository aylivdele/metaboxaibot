import { createRequire } from "module";
import ffmpeg from "fluent-ffmpeg";
import { Readable, PassThrough } from "stream";
import { logger } from "../logger.js";

const _require = createRequire(import.meta.url);
const ffmpegPath: string | null = _require("ffmpeg-static") as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Transcodes an arbitrary audio buffer to MP3.
 * Input format is auto-detected by ffmpeg (works for OGG/Opus, M4A, AAC, FLAC, etc.).
 * Used before uploading to providers that only accept MP3/WAV (e.g. HeyGen).
 *
 * Pass `inputFormat` to force ffmpeg's input demuxer when auto-detection fails
 * (e.g. raw streams without container headers).
 */
export async function transcodeToMp3(input: Buffer, inputFormat?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const readable = new Readable({ read() {} });
    readable.push(input);
    readable.push(null);

    const output = new PassThrough();
    const chunks: Buffer[] = [];
    let settled = false;
    const stderrLines: string[] = [];

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const succeed = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      resolve(buf);
    };

    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("error", fail);

    const cmd = ffmpeg(readable);
    if (inputFormat) cmd.inputFormat(inputFormat);
    cmd
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .format("mp3")
      .on("stderr", (line: string) => {
        stderrLines.push(line);
      })
      .on("error", (err: Error) => {
        logger.error(
          {
            err: err.message,
            stderr: stderrLines.slice(-20).join("\n"),
            inputBytes: input.byteLength,
            inputFormat,
          },
          "ffmpeg transcode failed",
        );
        fail(err);
      })
      .on("end", () => {
        const buf = Buffer.concat(chunks);
        if (!buf.byteLength) {
          logger.error(
            {
              stderr: stderrLines.slice(-20).join("\n"),
              inputBytes: input.byteLength,
              inputFormat,
            },
            "ffmpeg transcode produced empty output",
          );
          fail(new Error("ffmpeg transcode produced empty output"));
          return;
        }
        succeed(buf);
      })
      .pipe(output, { end: true });
  });
}

/** @deprecated Use `transcodeToMp3(input)` — input format is auto-detected. */
export async function transcodeOggToMp3(input: Buffer): Promise<Buffer> {
  return transcodeToMp3(input);
}
