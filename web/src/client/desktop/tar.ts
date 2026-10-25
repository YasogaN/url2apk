import { gzipSync } from "fflate";

const BLOCK = 512;
const encoder = new TextEncoder();

export type TarEntry = {
  name: string;
  data?: Uint8Array;
  mode?: number;
  mtime?: number;
  directory?: boolean;
};

function writeText(
  header: Uint8Array,
  offset: number,
  text: string,
): void {
  header.set(encoder.encode(text), offset);
}

function writeOctal(
  header: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const text = value.toString(8).padStart(length - 1, "0");
  writeText(header, offset, text);
  header[offset + length - 1] = 0;
}

function validateName(name: string): void {
  if (name === "") {
    throw new Error("Tar entry name is empty.");
  }
  if (name.startsWith("/")) {
    throw new Error("Tar entry name must be relative.");
  }
  if (name.includes("\0")) {
    throw new Error("Tar entry name contains a NUL byte.");
  }
  if (name.includes("\\")) {
    throw new Error("Tar entry name contains a backslash.");
  }
  if (name.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Tar entry name contains a traversal segment.");
  }
  if (encoder.encode(name).length > 255) {
    throw new Error("Tar entry name is too long.");
  }
}

function headerFor(entry: TarEntry): Uint8Array {
  validateName(entry.name);
  const header = new Uint8Array(BLOCK);
  const nameBytes = encoder.encode(entry.name);
  if (nameBytes.length <= 100) {
    header.set(nameBytes, 0);
  } else {
    const slash = entry.name.lastIndexOf("/");
    if (slash <= 0) {
      throw new Error("Tar entry name cannot be split into a ustar prefix.");
    }
    const prefix = entry.name.slice(0, slash);
    const rest = entry.name.slice(slash + 1);
    if (
      rest === "" ||
      encoder.encode(prefix).length > 155 ||
      encoder.encode(rest).length > 100
    ) {
      throw new Error("Tar entry name cannot be split into a ustar prefix.");
    }
    header.set(encoder.encode(rest), 0);
    header.set(encoder.encode(prefix), 345);
  }

  const data = entry.data ?? new Uint8Array(0);
  const isDirectory = entry.directory === true;
  writeOctal(header, 100, 8, entry.mode ?? (isDirectory ? 0o755 : 0o644));
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, isDirectory ? 0 : data.length);
  writeOctal(header, 136, 12, entry.mtime ?? 0);
  header.fill(0x20, 148, 156);
  header[156] = isDirectory ? 0x35 : 0x30;
  writeText(header, 257, "ustar\0");
  writeText(header, 263, "00");
  writeText(header, 265, "root");
  writeText(header, 297, "root");
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  writeText(header, 148, checksum.toString(8).padStart(6, "0"));
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

export function createTar(entries: readonly TarEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = headerFor(entry);
    chunks.push(header);
    if (entry.directory !== true) {
      const data = entry.data ?? new Uint8Array(0);
      if (data.length > 0) {
        chunks.push(data);
        const padding = (BLOCK - (data.length % BLOCK)) % BLOCK;
        if (padding > 0) {
          chunks.push(new Uint8Array(padding));
        }
      }
    }
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function gzipTar(entries: readonly TarEntry[]): Uint8Array {
  return gzipSync(createTar(entries), { level: 9, mtime: 0 });
}
