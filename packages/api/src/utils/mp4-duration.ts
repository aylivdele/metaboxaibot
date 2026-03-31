/**
 * Lightweight MP4 metadata parser.
 * Walks the ISO Base Media box tree to extract duration and video resolution
 * without any external dependencies.
 *
 * Duration: moov → mvhd (supports version 0 with 32-bit and version 1 with 64-bit fields)
 * Resolution: moov → trak → tkhd (width/height as 16.16 fixed-point; audio tracks have 0×0)
 */
export interface Mp4Info {
  /** Video duration in seconds, or null if moov/mvhd not found. */
  duration: number | null;
  /** Video width in pixels, or null if not found. */
  width: number | null;
  /** Video height in pixels, or null if not found. */
  height: number | null;
}

export function parseMp4Info(buf: Buffer): Mp4Info {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) return { duration: null, width: null, height: null };

  const duration = parseMvhd(buf, moov.start, moov.end);
  const dims = parseVideoTrackDimensions(buf, moov.start, moov.end);
  return { duration, width: dims?.width ?? null, height: dims?.height ?? null };
}

/** Backward-compatible wrapper — returns duration in seconds, or null. */
export function parseMp4Duration(buf: Buffer): number | null {
  return parseMp4Info(buf).duration;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Scan boxes within [start, end) for a box of the given type.
 * Returns the content range [contentStart, contentEnd) (i.e. after the 8-byte header).
 */
function findBox(
  buf: Buffer,
  start: number,
  end: number,
  type: string,
): { start: number; end: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buf.readUInt32BE(offset);
    if (size < 8) break;
    const boxType = buf.toString("latin1", offset + 4, offset + 8);
    const boxEnd = Math.min(offset + size, buf.length);
    if (boxType === type) return { start: offset + 8, end: boxEnd };
    offset += size;
  }
  return null;
}

/**
 * Walk moov content for mvhd and return duration in seconds.
 *
 * mvhd v0 layout (offsets from box start):
 *   [0-3] size  [4-7] type  [8] version  [9-11] flags
 *   [12-15] ctime  [16-19] mtime  [20-23] timescale  [24-27] duration  …
 *
 * mvhd v1 layout:
 *   [0-3] size  [4-7] type  [8] version  [9-11] flags
 *   [12-19] ctime  [20-27] mtime  [28-31] timescale  [32-39] duration  …
 */
function parseMvhd(buf: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buf.readUInt32BE(offset);
    if (size < 8) break;
    const boxType = buf.toString("latin1", offset + 4, offset + 8);

    if (boxType === "mvhd") {
      const version = buf.readUInt8(offset + 8);
      if (version === 1 && offset + 40 <= buf.length) {
        const timescale = buf.readUInt32BE(offset + 28);
        if (timescale === 0) return null;
        const hi = buf.readUInt32BE(offset + 32);
        const lo = buf.readUInt32BE(offset + 36);
        return (hi * 0x1_0000_0000 + lo) / timescale;
      } else if (version === 0 && offset + 28 <= buf.length) {
        const timescale = buf.readUInt32BE(offset + 20);
        if (timescale === 0) return null;
        return buf.readUInt32BE(offset + 24) / timescale;
      }
    }

    offset += size;
  }
  return null;
}

/**
 * Walk moov content for trak boxes, then parse each tkhd to find the video track.
 * Audio tracks have width=0 and height=0 in tkhd; the video track has non-zero values.
 */
function parseVideoTrackDimensions(
  buf: Buffer,
  moovStart: number,
  moovEnd: number,
): { width: number; height: number } | null {
  let offset = moovStart;
  while (offset + 8 <= moovEnd) {
    const size = buf.readUInt32BE(offset);
    if (size < 8) break;
    const boxType = buf.toString("latin1", offset + 4, offset + 8);

    if (boxType === "trak") {
      const trakStart = offset + 8;
      const trakEnd = Math.min(offset + size, buf.length);
      const dims = parseTkhd(buf, trakStart, trakEnd);
      if (dims) return dims; // first video track (non-zero dims)
    }

    offset += size;
  }
  return null;
}

/**
 * Parse the tkhd box inside a trak to get width/height of the video track.
 *
 * tkhd v0 layout (offsets from box start):
 *   [0-3] size  [4-7] type  [8] version  [9-11] flags
 *   [12-15] ctime  [16-19] mtime  [20-23] track_ID  [24-27] reserved  [28-31] duration
 *   [32-39] reserved  [40-41] layer  [42-43] alt_grp  [44-45] volume  [46-47] reserved
 *   [48-83] matrix (36 bytes)
 *   [84-87] width (16.16 fixed-point)  [88-91] height (16.16 fixed-point)
 *
 * tkhd v1 layout:
 *   [0-3] size  [4-7] type  [8] version  [9-11] flags
 *   [12-19] ctime  [20-27] mtime  [28-31] track_ID  [32-35] reserved  [36-43] duration
 *   [44-51] reserved  [52-53] layer  [54-55] alt_grp  [56-57] volume  [58-59] reserved
 *   [60-95] matrix (36 bytes)
 *   [96-99] width (16.16 fixed-point)  [100-103] height (16.16 fixed-point)
 *
 * Width/height are 16.16 fixed-point: upper 16 bits = integer pixels.
 */
function parseTkhd(
  buf: Buffer,
  start: number,
  end: number,
): { width: number; height: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buf.readUInt32BE(offset);
    if (size < 8) break;
    const boxType = buf.toString("latin1", offset + 4, offset + 8);

    if (boxType === "tkhd") {
      const version = buf.readUInt8(offset + 8);
      const widthOff = version === 1 ? offset + 96 : offset + 84;
      const heightOff = version === 1 ? offset + 100 : offset + 88;

      if (heightOff + 4 <= buf.length) {
        // Upper 16 bits of the 16.16 fixed-point value = integer pixel count
        const width = buf.readUInt16BE(widthOff);
        const height = buf.readUInt16BE(heightOff);
        if (width > 0 && height > 0) return { width, height };
      }
    }

    offset += size;
  }
  return null;
}
