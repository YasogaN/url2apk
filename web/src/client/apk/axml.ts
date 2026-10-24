import { concat } from "./bytes";

type PoolString = {
  value: string;
  dataOffset: number;
  prefixOffset: number;
  prefixSize: number;
  byteLength: number;
  codeUnits: number;
};

type StringPool = {
  chunkStart: number;
  end: number;
  utf8: boolean;
  strings: PoolString[];
};

export type ManifestPatch = {
  packageName: string;
  label: string;
  versionCode: number;
};

export const PACKAGE_SENTINEL = `com.urltoapk.a${"0".repeat(20)}`;
export const LABEL_SENTINEL = `__URLTOAPK_LABEL__${"~".repeat(110)}`;

const XML_CHUNK = 0x0003;
const STRING_POOL_CHUNK = 0x0001;
const START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x100;
const SORTED_FLAG = 0x1;

export function patchManifest(bytes: Uint8Array, patch: ManifestPatch): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== XML_CHUNK) {
    throw new Error("Not an Android binary XML document.");
  }
  const pool = parseStringPool(bytes);
  replaceString(bytes, pool, PACKAGE_SENTINEL, patch.packageName);
  replaceString(bytes, pool, LABEL_SENTINEL, patch.label);
  patchVersionCode(bytes, view, pool, patch.versionCode);
  clearSortedFlag(bytes, pool);
}

function parseStringPool(bytes: Uint8Array): StringPool {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkStart = 8;
  if (view.getUint16(chunkStart, true) !== STRING_POOL_CHUNK) {
    throw new Error("String pool not found.");
  }
  const headerSize = view.getUint16(chunkStart + 2, true);
  const size = view.getUint32(chunkStart + 4, true);
  const count = view.getUint32(chunkStart + 8, true);
  const flags = view.getUint32(chunkStart + 16, true);
  const stringsStart = view.getUint32(chunkStart + 20, true);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const strings: PoolString[] = [];

  for (let index = 0; index < count; index++) {
    const offset = view.getUint32(chunkStart + headerSize + index * 4, true);
    let position = chunkStart + stringsStart + offset;
    let prefixSize = 0;
    let codeUnits = 0;

    if (utf8) {
      const first = readUtf8Length(bytes, position);
      position += first.size;
      const second = readUtf8Length(bytes, position);
      position += second.size;
      prefixSize = first.size;
      codeUnits = first.value;
      strings.push({
        value: new TextDecoder().decode(
          bytes.subarray(position, position + second.value),
        ),
        dataOffset: position,
        prefixOffset: chunkStart + stringsStart + offset,
        prefixSize,
        byteLength: second.value,
        codeUnits,
      });
    } else {
      const length = view.getUint16(position, true);
      if ((length & 0x8000) !== 0) {
        codeUnits =
          ((length & 0x7fff) << 16) | view.getUint16(position + 2, true);
        prefixSize = 4;
      } else {
        codeUnits = length;
        prefixSize = 2;
      }
      position += prefixSize;
      strings.push({
        value: decodeUtf16(bytes, position, codeUnits),
        dataOffset: position,
        prefixOffset: chunkStart + stringsStart + offset,
        prefixSize,
        byteLength: codeUnits * 2,
        codeUnits,
      });
    }
  }

  return {
    chunkStart,
    end: chunkStart + size,
    utf8,
    strings,
  };
}

function replaceString(
  bytes: Uint8Array,
  pool: StringPool,
  oldValue: string,
  newValue: string,
): void {
  const entry = pool.strings.find((candidate) => candidate.value === oldValue);
  if (entry === undefined) {
    throw new Error("Expected placeholder string was not found.");
  }
  if (pool.utf8) {
    const fitted = fitUtf8(newValue, entry.byteLength);
    bytes.set(fitted, entry.dataOffset);
    const codeUnits = new TextDecoder().decode(fitted).length;
    writeLengthPrefix(bytes, entry, codeUnits);
    return;
  }
  const fitted = fitUtf16(newValue, entry.codeUnits);
  writeUtf16(bytes, entry.dataOffset, fitted);
  writeLengthPrefix(bytes, entry, fitted.length);
}

function writeLengthPrefix(
  bytes: Uint8Array,
  entry: PoolString,
  codeUnits: number,
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.prefixSize === 4) {
    view.setUint16(entry.prefixOffset, 0x8000, true);
    view.setUint16(entry.prefixOffset + 2, codeUnits, true);
    return;
  }
  view.setUint16(entry.prefixOffset, codeUnits, true);
}

function clearSortedFlag(bytes: Uint8Array, pool: StringPool): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(pool.chunkStart + 16, true);
  view.setUint32(pool.chunkStart + 16, flags & ~SORTED_FLAG, true);
}

function patchVersionCode(
  bytes: Uint8Array,
  view: DataView,
  pool: StringPool,
  versionCode: number,
): void {
  let cursor = pool.end;
  while (cursor + 16 <= bytes.length) {
    const type = view.getUint16(cursor, true);
    const size = view.getUint32(cursor + 4, true);
    if (size < 8) {
      break;
    }
    if (type === START_ELEMENT) {
      const nameIndex = view.getUint32(cursor + 16 + 4, true);
      const name = pool.strings[nameIndex]?.value;
      if (name === "manifest") {
        const attributeStart = view.getUint16(cursor + 16 + 8, true);
        const attributeCount = view.getUint16(cursor + 16 + 12, true);
        const base = cursor + 16 + attributeStart;
        for (let index = 0; index < attributeCount; index++) {
          const attribute = base + index * 20;
          const attributeName =
            pool.strings[view.getUint32(attribute + 4, true)]?.value;
          if (attributeName === "versionCode") {
            view.setUint32(attribute + 8, 0xffffffff, true);
            view.setUint32(attribute + 16, versionCode, true);
            return;
          }
        }
      }
    }
    cursor += size;
  }
  throw new Error("versionCode attribute was not found.");
}

function readUtf8Length(
  bytes: Uint8Array,
  offset: number,
): { value: number; size: number } {
  const first = bytes[offset];
  if ((first & 0x80) !== 0) {
    return {
      value: ((first & 0x7f) << 8) | bytes[offset + 1],
      size: 2,
    };
  }
  return { value: first, size: 1 };
}

function fitUtf16(value: string, maxCodeUnits: number): number[] {
  const out: number[] = [];
  for (const character of value) {
    const units = character.length;
    if (out.length + units > maxCodeUnits) {
      break;
    }
    for (let index = 0; index < units; index++) {
      out.push(character.charCodeAt(index));
    }
  }
  while (out.length < maxCodeUnits) {
    out.push(0x20);
  }
  return out;
}

function fitUtf8(value: string, maxBytes: number): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let used = 0;
  for (const character of value) {
    const encoded = encoder.encode(character);
    if (used + encoded.length > maxBytes) {
      break;
    }
    parts.push(encoded);
    used += encoded.length;
  }
  const padding = new Uint8Array(maxBytes - used);
  padding.fill(0x20);
  return concat(...parts, padding);
}

function writeUtf16(bytes: Uint8Array, offset: number, units: number[]): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < units.length; index++) {
    view.setUint16(offset + index * 2, units[index], true);
  }
}

function decodeUtf16(bytes: Uint8Array, offset: number, units: number): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let value = "";
  for (let index = 0; index < units; index++) {
    value += String.fromCharCode(view.getUint16(offset + index * 2, true));
  }
  return value;
}
