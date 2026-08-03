import { inflateRawSync } from "node:zlib";

/**
 * Read one file out of a ZIP using only node:zlib.
 *
 * The Tatoeba archive is a plain DEFLATE zip, which inflateRaw already handles —
 * the only missing piece is the container format, and that is fifty lines. An
 * unzip dependency for two one-off importers would cost more than this.
 *
 * Shared by import-sentences and attach-examples; it was written twice before
 * this file existed, which is exactly one time too many for a binary parser.
 */
export function readFromZip(zip: Buffer, wanted: string): Buffer {
  let eocd = -1;
  const floor = Math.max(0, zip.length - 66_000); // max comment length + header
  for (let i = zip.length - 22; i >= floor; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip: no end-of-central-directory record");

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === wanted) {
      // The local header's own name/extra lengths can differ from the central
      // directory's, so re-read them at the local record.
      const lNameLen = zip.readUInt16LE(localOff + 26);
      const lExtraLen = zip.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`unsupported compression method ${method} for ${name}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in archive`);
}
