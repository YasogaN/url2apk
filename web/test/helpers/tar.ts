import { gunzipSync } from "fflate";

export type ParsedTarEntry = {
  name: string;
  mode: number;
  size: number;
  mtime: number;
  type: string;
  data: Uint8Array;
  checksumOk: boolean;
};

function readString(header: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && header[end] !== 0) {
    end += 1;
  }
  return new TextDecoder().decode(header.slice(offset, end));
}

export function parseTar(bytes: Uint8Array): ParsedTarEntry[] {
  const entries: ParsedTarEntry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    const size = Number.parseInt(readString(header, 124, 12), 8);
    const mode = Number.parseInt(readString(header, 100, 8), 8);
    const mtime = Number.parseInt(readString(header, 136, 12), 8);
    const checksumField = header.slice();
    checksumField.fill(0x20, 148, 156);
    const checksum = checksumField.reduce((sum, byte) => sum + byte, 0);
    entries.push({
      name: prefix === "" ? name : `${prefix}/${name}`,
      mode,
      size,
      mtime,
      type: String.fromCharCode(header[156]),
      data: bytes.slice(offset + 512, offset + 512 + size),
      checksumOk:
        readString(header, 148, 8) === checksum.toString(8).padStart(6, "0"),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export function parseTarGz(bytes: Uint8Array): ParsedTarEntry[] {
  return parseTar(gunzipSync(bytes));
}
