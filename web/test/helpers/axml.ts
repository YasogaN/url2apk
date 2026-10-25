import {
  LABEL_SENTINEL,
  PACKAGE_SENTINEL,
} from "../../src/client/apk/axml";

export type StringInfo = {
  prefixOffset: number;
  prefixSize: number;
  byteLengthPrefixOffset: number;
  byteLengthPrefixSize: number;
  dataOffset: number;
  codeUnits: number;
  byteLength: number;
};

export type BuiltAxml = {
  bytes: Uint8Array;
  strings: Map<string, StringInfo>;
  poolDataOffset: number;
  versionDataOffset: number | null;
  sortedFlagsOffset: number;
};

export type BuildOptions = {
  utf8?: boolean;
  sorted?: boolean;
  includePackage?: boolean;
  includeLabel?: boolean;
  otherElement?: boolean;
  includeManifest?: boolean;
  includeVersionCode?: boolean;
  otherAttribute?: boolean;
  badChunk?: boolean;
  extraString?: string;
};

const encoder = new TextEncoder();

function utf8Length(value: number, size: number): Uint8Array {
  if (size === 1) {
    return Uint8Array.of(value);
  }
  return Uint8Array.of(0x80 | (value >> 8), value & 0xff);
}

function utf16Length(value: number): Uint8Array {
  if (value < 0x8000) {
    return Uint8Array.of(value & 0xff, value >> 8);
  }
  return Uint8Array.of(0x00, 0x80, value & 0xff, value >> 8);
}

export function buildAxml(options: BuildOptions = {}): BuiltAxml {
  const {
    utf8 = false,
    sorted = true,
    includePackage = true,
    includeLabel = true,
    otherElement = true,
    includeManifest = true,
    includeVersionCode = true,
    otherAttribute = true,
    badChunk = false,
    extraString,
  } = options;

  const strings: string[] = [];
  if (includePackage) strings.push(PACKAGE_SENTINEL);
  if (includeLabel) strings.push(LABEL_SENTINEL);
  strings.push("manifest", "versionCode", "other");
  if (extraString !== undefined) strings.push(extraString);

  const index = new Map(strings.map((value, position) => [value, position]));
  const dataParts: Uint8Array[] = [];
  const infos = new Map<string, StringInfo>();
  let dataOffset = 0;
  for (const value of strings) {
    const codeUnits = value.length;
    const encoded = utf8
      ? encoder.encode(value)
      : (() => {
          const bytes = new Uint8Array(codeUnits * 2);
          const view = new DataView(bytes.buffer);
          for (let index = 0; index < codeUnits; index += 1) {
            view.setUint16(index * 2, value.charCodeAt(index), true);
          }
          return bytes;
        })();
    const prefix1Size = codeUnits < 0x80 ? 1 : 2;
    const prefix2Size = encoded.length < 0x80 ? 1 : 2;
    const prefix1 = utf8
      ? utf8Length(codeUnits, prefix1Size)
      : utf16Length(codeUnits);
    const prefix2 = utf8 ? utf8Length(encoded.length, prefix2Size) : new Uint8Array();
    const info: StringInfo = {
      prefixOffset: dataOffset,
      prefixSize: prefix1.length,
      byteLengthPrefixOffset: dataOffset + prefix1.length,
      byteLengthPrefixSize: prefix2.length,
      dataOffset: dataOffset + prefix1.length + prefix2.length,
      codeUnits,
      byteLength: utf8 ? encoded.length : codeUnits * 2,
    };
    infos.set(value, info);
    const part = new Uint8Array(prefix1.length + prefix2.length + info.byteLength);
    part.set(prefix1, 0);
    part.set(prefix2, prefix1.length);
    part.set(encoded, prefix1.length + prefix2.length);
    dataParts.push(part);
    dataOffset += part.length;
  }

  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const dataLength = dataParts.reduce((sum, part) => sum + part.length, 0);
  let poolSize = stringsStart + dataLength;
  while (poolSize % 4 !== 0) poolSize += 1;
  const flags = (utf8 ? 0x100 : 0) | (sorted ? 1 : 0);

  const chunks: Uint8Array[] = [];
  let versionChunkIndex: number | null = null;
  let versionAttrIndex: number | null = null;
  const makeElement = (
    name: string,
    attributes: string[],
  ): Uint8Array => {
    const size = 36 + attributes.length * 20;
    const chunk = new Uint8Array(size);
    const view = new DataView(chunk.buffer);
    view.setUint16(0, 0x0102, true);
    view.setUint16(2, 16, true);
    view.setUint32(4, size, true);
    view.setUint32(8, 1, true);
    view.setUint32(12, 0xffffffff, true);
    view.setUint32(16, 0xffffffff, true);
    view.setUint32(20, index.get(name)!, true);
    view.setUint16(24, 20, true);
    view.setUint16(26, 20, true);
    view.setUint16(28, attributes.length, true);
    attributes.forEach((attribute, position) => {
      const base = 36 + position * 20;
      view.setUint32(base, 0xffffffff, true);
      view.setUint32(base + 4, index.get(attribute)!, true);
      view.setUint32(base + 8, 0xffffffff, true);
      view.setUint16(base + 12, 8, true);
      view.setUint8(base + 14, 0);
      view.setUint8(base + 15, 0x10);
      view.setUint32(base + 16, 0, true);
      if (attribute === "versionCode") {
        versionAttrIndex = position;
      }
    });
    return chunk;
  };

  if (otherElement) {
    chunks.push(makeElement("other", []));
  }
  if (includeManifest) {
    const attributes: string[] = [];
    if (otherAttribute) attributes.push("other");
    if (includeVersionCode) attributes.push("versionCode");
    versionChunkIndex = chunks.length;
    chunks.push(makeElement("manifest", attributes));
  }
  if (badChunk) {
    const chunk = new Uint8Array(16);
    new DataView(chunk.buffer).setUint16(0, 0x0001, true);
    new DataView(chunk.buffer).setUint32(4, 4, true);
    chunks.push(chunk);
  }

  const bodySize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const total = 8 + poolSize + bodySize;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x0003, true);
  view.setUint16(2, 8, true);
  view.setUint32(4, total, true);
  const pool = 8;
  view.setUint16(pool, 0x0001, true);
  view.setUint16(pool + 2, headerSize, true);
  view.setUint32(pool + 4, poolSize, true);
  view.setUint32(pool + 8, strings.length, true);
  view.setUint32(pool + 12, 0, true);
  view.setUint32(pool + 16, flags, true);
  view.setUint32(pool + 20, stringsStart, true);
  view.setUint32(pool + 24, 0, true);
  let offset = pool + headerSize;
  for (const value of strings) {
    view.setUint32(offset, infos.get(value)!.prefixOffset, true);
    offset += 4;
  }
  let data = pool + stringsStart;
  for (const part of dataParts) {
    bytes.set(part, data);
    data += part.length;
  }
  let cursor = pool + poolSize;
  let versionDataOffset: number | null = null;
  chunks.forEach((chunk, chunkIndex) => {
    if (chunkIndex === versionChunkIndex && versionAttrIndex !== null) {
      versionDataOffset = cursor + 36 + versionAttrIndex * 20 + 16;
    }
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  });

  return {
    bytes,
    strings: infos,
    poolDataOffset: pool + stringsStart,
    versionDataOffset,
    sortedFlagsOffset: pool + 16,
  };
}
