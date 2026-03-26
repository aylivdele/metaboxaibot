/**
 * Lightweight MP4 duration parser.
 * Walks the top-level ISO Base Media box tree to find moov → mvhd,
 * then reads timescale and duration without any external dependencies.
 *
 * Supports both mvhd version 0 (32-bit fields) and version 1 (64-bit fields).
 * Returns duration in seconds, or null if the moov/mvhd box is not found.
 */
export function parseMp4Duration(buf: Buffer): number | null {
  const moovEnd = findMoov(buf);
  if (!moovEnd) return null;
  return parseMvhd(buf, moovEnd.start, moovEnd.end);
}

/** Scan top-level boxes for 'moov'. Returns its content range [start, end). */
function findMoov(buf: Buffer): { start: number; end: number } | null {
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const boxSize = buf.readUInt32BE(offset);
    if (boxSize < 8) break; // corrupt or end padding
    const boxType = buf.toString("latin1", offset + 4, offset + 8);
    if (boxType === "moov") {
      return { start: offset + 8, end: Math.min(offset + boxSize, buf.length) };
    }
    offset += boxSize;
  }
  return null;
}

/** Scan boxes inside moov for 'mvhd' and extract duration in seconds. */
function parseMvhd(buf: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const boxSize = buf.readUInt32BE(offset);
    if (boxSize < 8) break;
    const boxType = buf.toString("latin1", offset + 4, offset + 8);

    if (boxType === "mvhd" && offset + 32 <= buf.length) {
      const version = buf.readUInt8(offset + 8); // first byte after box header
      if (version === 1 && offset + 40 <= buf.length) {
        // version 1 — 64-bit creation/modification times
        // layout: [4 size][4 type][1 version][3 flags][8 ctime][8 mtime][4 timescale][8 duration]
        const timescale = buf.readUInt32BE(offset + 28);
        if (timescale === 0) return null;
        const hi = buf.readUInt32BE(offset + 32);
        const lo = buf.readUInt32BE(offset + 36);
        return (hi * 0x1_0000_0000 + lo) / timescale;
      } else if (version === 0) {
        // version 0 — 32-bit creation/modification times
        // layout: [4 size][4 type][1 version][3 flags][4 ctime][4 mtime][4 timescale][4 duration]
        const timescale = buf.readUInt32BE(offset + 20);
        if (timescale === 0) return null;
        const durationVal = buf.readUInt32BE(offset + 24);
        return durationVal / timescale;
      }
    }

    offset += boxSize;
  }
  return null;
}
