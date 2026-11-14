// A deliberately small ZIP reader/writer for canvas share bundles
// (main/share/canvasShare.js). Written against Node's zlib instead of pulling
// in a zip dependency so every safety check on an untrusted archive lives
// here, in one place we control:
//   - only "stored" (0) and "deflate" (8) entries, no encryption, no ZIP64,
//     no multi-disk archives;
//   - sizes come from the central directory and are checked against the
//     caller's limits *before* anything is inflated, and inflation itself is
//     capped at the declared size (a zip bomb can't lie its way past it);
//   - every entry's CRC-32 is verified;
//   - entry names are validated by the caller (see isSafeEntryName), never
//     joined onto a filesystem path here.
// Plain Node, no Electron: it runs under Vitest as-is.

const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { randomUUID } = require("node:crypto");

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const ZIP64_MARKER = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  if (typeof zlib.crc32 === "function") {
    return zlib.crc32(buffer) >>> 0;
  }
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

function zipError(message, code = "SHARE_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Writes `entries` ([{ name, data: Buffer, compress?: boolean }]) to
// `outPath` through a temp file next to it, renamed into place only once the
// archive is complete -- a failed export never leaves a half-written bundle
// under the name the user picked.
async function writeZip(outPath, entries) {
  const absOut = path.resolve(outPath);
  const tempPath = path.join(path.dirname(absOut), `.${path.basename(absOut)}.${randomUUID()}.tmp`);
  const handle = await fs.open(tempPath, "wx");
  const central = [];
  const stamp = dosDateTime();
  let offset = 0;

  try {
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, "utf8");
      const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
      if (raw.length >= ZIP64_MARKER) {
        throw zipError(`"${entry.name}" is too large to share.`, "SHARE_TOO_LARGE");
      }
      const crc = crc32(raw);
      let method = METHOD_STORE;
      let payload = raw;
      if (entry.compress !== false && raw.length > 0) {
        const deflated = zlib.deflateRawSync(raw, { level: 6 });
        if (deflated.length < raw.length) {
          method = METHOD_DEFLATE;
          payload = deflated;
        }
      }

      const local = Buffer.alloc(30);
      local.writeUInt32LE(SIG_LOCAL, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(FLAG_UTF8, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(stamp.time, 10);
      local.writeUInt16LE(stamp.date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(payload.length, 18);
      local.writeUInt32LE(raw.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      local.writeUInt16LE(0, 28);

      await handle.write(local);
      await handle.write(nameBytes);
      await handle.write(payload);

      central.push({ nameBytes, method, crc, compressedSize: payload.length, size: raw.length, offset });
      offset += local.length + nameBytes.length + payload.length;
      if (offset >= ZIP64_MARKER) {
        throw zipError("This canvas is too large to share as one file.", "SHARE_TOO_LARGE");
      }
    }

    const centralStart = offset;
    for (const record of central) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(SIG_CENTRAL, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(FLAG_UTF8, 8);
      header.writeUInt16LE(record.method, 10);
      header.writeUInt16LE(stamp.time, 12);
      header.writeUInt16LE(stamp.date, 14);
      header.writeUInt32LE(record.crc, 16);
      header.writeUInt32LE(record.compressedSize, 20);
      header.writeUInt32LE(record.size, 24);
      header.writeUInt16LE(record.nameBytes.length, 28);
      header.writeUInt32LE(record.offset, 42);
      await handle.write(header);
      await handle.write(record.nameBytes);
      offset += header.length + record.nameBytes.length;
    }

    const eocd = Buffer.alloc(EOCD_MIN_SIZE);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(offset - centralStart, 12);
    eocd.writeUInt32LE(centralStart, 16);
    await handle.write(eocd);
    await handle.close();
    await fs.rename(tempPath, absOut);
    return { outPath: absOut, sizeBytes: offset + eocd.length };
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readExactly(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw zipError("This share file is truncated or damaged.");
  }
  return buffer;
}

// Opens an untrusted archive and returns its entry table plus a reader.
// `limits`: { maxArchiveBytes, maxEntries, maxEntryBytes, maxTotalBytes }.
// Throws (code SHARE_INVALID / SHARE_TOO_LARGE) on anything outside them.
async function openZip(filePath, limits = {}) {
  const {
    maxArchiveBytes = Infinity,
    maxEntries = 10000,
    maxEntryBytes = Infinity,
    maxTotalBytes = Infinity,
  } = limits;

  const handle = await fs.open(filePath, "r");
  try {
    const { size: fileSize } = await handle.stat();
    if (fileSize > maxArchiveBytes) {
      throw zipError("This share file is larger than AirPaste will import.", "SHARE_TOO_LARGE");
    }
    if (fileSize < EOCD_MIN_SIZE) {
      throw zipError("This isn't an AirPaste share file.");
    }

    const tailLength = Math.min(fileSize, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
    const tail = await readExactly(handle, fileSize - tailLength, tailLength);
    let eocdIndex = -1;
    for (let index = tail.length - EOCD_MIN_SIZE; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === SIG_EOCD) {
        eocdIndex = index;
        break;
      }
    }
    if (eocdIndex === -1) {
      throw zipError("This isn't an AirPaste share file.");
    }

    const diskNumber = tail.readUInt16LE(eocdIndex + 4);
    const centralDisk = tail.readUInt16LE(eocdIndex + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdIndex + 8);
    const entryCount = tail.readUInt16LE(eocdIndex + 10);
    const centralSize = tail.readUInt32LE(eocdIndex + 12);
    const centralOffset = tail.readUInt32LE(eocdIndex + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
      throw zipError("Split share files aren't supported.");
    }
    if (entryCount === 0xffff || centralSize === ZIP64_MARKER || centralOffset === ZIP64_MARKER) {
      throw zipError("This share file uses a ZIP format AirPaste doesn't read.");
    }
    if (entryCount > maxEntries) {
      throw zipError("This share file has too many entries.", "SHARE_TOO_LARGE");
    }
    if (centralOffset + centralSize > fileSize) {
      throw zipError("This share file is truncated or damaged.");
    }

    const centralDir = await readExactly(handle, centralOffset, centralSize);
    const entries = [];
    let cursor = 0;
    let totalBytes = 0;

    for (let index = 0; index < entryCount; index += 1) {
      if (cursor + 46 > centralDir.length || centralDir.readUInt32LE(cursor) !== SIG_CENTRAL) {
        throw zipError("This share file is truncated or damaged.");
      }
      const flags = centralDir.readUInt16LE(cursor + 8);
      const method = centralDir.readUInt16LE(cursor + 10);
      const crc = centralDir.readUInt32LE(cursor + 16);
      const compressedSize = centralDir.readUInt32LE(cursor + 20);
      const size = centralDir.readUInt32LE(cursor + 24);
      const nameLength = centralDir.readUInt16LE(cursor + 28);
      const extraLength = centralDir.readUInt16LE(cursor + 30);
      const commentLength = centralDir.readUInt16LE(cursor + 32);
      const localOffset = centralDir.readUInt32LE(cursor + 42);
      const nameEnd = cursor + 46 + nameLength;
      if (nameEnd > centralDir.length) {
        throw zipError("This share file is truncated or damaged.");
      }
      const name = centralDir.toString("utf8", cursor + 46, nameEnd);
      cursor = nameEnd + extraLength + commentLength;

      if (flags & FLAG_ENCRYPTED) {
        throw zipError("Encrypted share files aren't supported.");
      }
      if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
        throw zipError("This share file uses a compression method AirPaste doesn't read.");
      }
      if (compressedSize === ZIP64_MARKER || size === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
        throw zipError("This share file uses a ZIP format AirPaste doesn't read.");
      }
      if (size > maxEntryBytes) {
        throw zipError(`"${name}" in this share file is larger than AirPaste will import.`, "SHARE_TOO_LARGE");
      }
      totalBytes += size;
      if (totalBytes > maxTotalBytes) {
        throw zipError("This share file unpacks to more data than AirPaste will import.", "SHARE_TOO_LARGE");
      }
      if (localOffset + 30 > fileSize) {
        throw zipError("This share file is truncated or damaged.");
      }

      entries.push({ name, method, crc, compressedSize, size, localOffset });
    }

    const read = async (entry) => {
      const local = await readExactly(handle, entry.localOffset, 30);
      if (local.readUInt32LE(0) !== SIG_LOCAL) {
        throw zipError("This share file is truncated or damaged.");
      }
      const dataStart = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      if (dataStart + entry.compressedSize > fileSize) {
        throw zipError("This share file is truncated or damaged.");
      }
      const compressed = await readExactly(handle, dataStart, entry.compressedSize);
      let data;
      if (entry.method === METHOD_STORE) {
        data = compressed;
      } else {
        try {
          // maxOutputLength makes inflate itself refuse to produce more than
          // the size the archive declared -- a bomb can't expand past it.
          data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) });
        } catch {
          throw zipError(`"${entry.name}" in this share file is damaged.`);
        }
      }
      if (data.length !== entry.size || crc32(data) !== entry.crc) {
        throw zipError(`"${entry.name}" in this share file is damaged.`);
      }
      return data;
    };

    return {
      entries,
      read,
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

module.exports = {
  crc32,
  openZip,
  writeZip,
};
