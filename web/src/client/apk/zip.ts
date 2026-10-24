import { deflateSync, inflateSync } from "fflate";
import { concat } from "./bytes";

export type ZipEntry = {
  name: string;
  method: number;
  crc: number;
  compressed: Uint8Array;
  data: Uint8Array;
  localOffset: number;
  dataOffset: number;
};

export type ZipArchive = {
  entries: ZipEntry[];
  cdOffset: number;
  eocdOffset: number;
  eocdLength: number;
};

export type PendingEntry = {
  name: string;
  data: Uint8Array;
};

export type WrittenZip = {
  bytes: Uint8Array;
  cdOffset: number;
  eocdOffset: number;
};

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const ALIGN_EXTRA_ID = 0xd935;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let value = 0xffffffff;
  for (let index = 0; index < data.length; index++) {
    value = (value >>> 8) ^ CRC_TABLE[(value ^ data[index]) & 0xff];
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function readZip(bytes: Uint8Array): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEocd(view, bytes.length);
  const total = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported.");
  }
  if (cdOffset + cdSize > eocdOffset) {
    throw new Error("Invalid central directory.");
  }

  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  for (let index = 0; index < total; index++) {
    if (view.getUint32(cursor, true) !== CENTRAL) {
      throw new Error("Invalid central directory entry.");
    }
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );

    if (view.getUint32(localOffset, true) !== LOCAL) {
      throw new Error(`Invalid local header for ${name}.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(
      dataOffset,
      dataOffset + compressedSize,
    );

    let data: Uint8Array;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateSync(compressed);
    } else {
      throw new Error(`Unsupported compression method ${method}.`);
    }
    if (data.length !== uncompressedSize) {
      throw new Error(`Bad uncompressed size for ${name}.`);
    }
    if (crc32(data) !== crc) {
      throw new Error(`Bad CRC for ${name}.`);
    }

    entries.push({
      name,
      method,
      crc,
      compressed,
      data,
      localOffset,
      dataOffset,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entries,
    cdOffset,
    eocdOffset,
    eocdLength: bytes.length - eocdOffset,
  };
}

export function writeZip(entries: PendingEntry[]): WrittenZip {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const stored = entry.name === "resources.arsc";
    const method = stored ? 0 : 8;
    const crc = crc32(entry.data);
    const compressed = stored
      ? entry.data
      : deflateSync(entry.data, { level: 9 });
    const extra = stored ? alignmentExtra(offset, name.length) : new Uint8Array(0);

    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, extra.length, true);

    const localRecord = concat(local, name, extra, compressed);
    localParts.push(localRecord);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint32(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += localRecord.length;
  }

  const cdOffset = offset;
  const centralDirectory = concat(...centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirectory.length, true);
  eocdView.setUint32(16, cdOffset, true);

  const bytes = concat(...localParts, centralDirectory, eocd);
  return {
    bytes,
    cdOffset,
    eocdOffset: cdOffset + centralDirectory.length,
  };
}

function findEocd(view: DataView, length: number): number {
  const minimum = Math.max(0, length - 0xffff - 22);
  for (let position = length - 22; position >= minimum; position--) {
    if (view.getUint32(position, true) === EOCD) {
      return position;
    }
  }
  throw new Error("End of central directory not found.");
}

function alignmentExtra(offset: number, nameLength: number): Uint8Array {
  const base = 6;
  const padding = (4 - ((offset + 30 + nameLength + base) % 4)) % 4;
  const extra = new Uint8Array(base + padding);
  const view = new DataView(extra.buffer);
  view.setUint16(0, ALIGN_EXTRA_ID, true);
  view.setUint16(2, 2, true);
  view.setUint16(4, 4, true);
  return extra;
}
