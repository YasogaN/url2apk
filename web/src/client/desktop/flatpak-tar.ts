const BLOCK = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type FlatpakTarEntry = {
  name: string;
  type: "file" | "dir" | "symlink";
  data?: Uint8Array;
  linkname?: string;
  mode: number;
};

function readString(header: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && header[end] !== 0) {
    end += 1;
  }
  return decoder.decode(header.subarray(offset, end));
}

function readOctal(header: Uint8Array, offset: number, length: number): number {
  const text = readString(header, offset, length).trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function normalize(name: string): string {
  let value = name.replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (value === ".") {
    value = "";
  }
  return value;
}

export function parseTar(bytes: Uint8Array): FlatpakTarEntry[] {
  const entries: FlatpakTarEntry[] = [];
  const files = new Map<string, FlatpakTarEntry>();
  let offset = 0;
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const prefix = readString(header, 345, 155);
    const name = normalize(
      prefix === "" ? readString(header, 0, 100) : `${prefix}/${readString(header, 0, 100)}`,
    );
    const size = readOctal(header, 124, 12);
    const mode = readOctal(header, 100, 8);
    const typeflag = String.fromCharCode(header[156]);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) {
      throw new Error("The tar entry is truncated.");
    }
    let entry: FlatpakTarEntry | undefined;
    switch (typeflag) {
      case "0":
      case "\0":
        entry = { name, type: "file", mode, data: bytes.slice(dataStart, dataEnd) };
        break;
      case "5":
        entry = { name, type: "dir", mode };
        break;
      case "2":
        entry = {
          name,
          type: "symlink",
          mode,
          linkname: readString(header, 157, 100),
        };
        break;
      case "1": {
        const target = files.get(normalize(readString(header, 157, 100)));
        if (target === undefined || target.type !== "file") {
          throw new Error("The tar hardlink target is missing.");
        }
        entry = { name, type: "file", mode, data: target.data };
        break;
      }
      default:
        // Skip pax headers and other metadata.
        entry = undefined;
        break;
    }
    if (entry !== undefined && name !== "") {
      entries.push(entry);
      if (entry.type === "file") {
        files.set(name, entry);
      }
    }
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}

function writeString(
  header: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = encoder.encode(value);
  if (bytes.length > length) {
    throw new Error("The tar field is too long.");
  }
  header.set(bytes, offset);
}

function writeOctal(
  header: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const text = value.toString(8).padStart(length - 1, "0");
  header.set(encoder.encode(text), offset);
  header[offset + length - 1] = 0;
}

function validateName(name: string): void {
  if (name === "" || name.startsWith("/") || name.includes("\0")) {
    throw new Error("The tar entry name is invalid.");
  }
  if (name.split("/").some((part) => part === "..")) {
    throw new Error("The tar entry path escapes the archive.");
  }
}

export function createTar(entries: readonly FlatpakTarEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const directory = entry.type === "dir";
    const symlink = entry.type === "symlink";
    const name = directory ? `${entry.name}/` : entry.name;
    validateName(name);
    const header = new Uint8Array(BLOCK);
    const nameBytes = encoder.encode(name);
    if (nameBytes.length <= 100) {
      header.set(nameBytes, 0);
    } else {
      const slash = name.lastIndexOf("/");
      if (slash <= 0) {
        throw new Error("The tar entry name cannot be split.");
      }
      writeString(header, 0, 100, name.slice(slash + 1));
      writeString(header, 345, 155, name.slice(0, slash));
    }
    writeOctal(header, 100, 8, entry.mode);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, directory || symlink ? 0 : (entry.data?.length ?? 0));
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = directory ? 0x35 : symlink ? 0x32 : 0x30;
    if (symlink) {
      writeString(header, 157, 100, entry.linkname ?? "");
    }
    writeString(header, 257, 6, "ustar\0");
    writeString(header, 263, 2, "00");
    writeString(header, 265, 32, "root");
    writeString(header, 297, 32, "root");
    writeOctal(header, 329, 8, 0);
    writeOctal(header, 337, 8, 0);
    let checksum = 0;
    for (const byte of header) {
      checksum += byte;
    }
    writeString(header, 148, 6, checksum.toString(8).padStart(6, "0"));
    header[154] = 0;
    header[155] = 0x20;
    chunks.push(header);
    if (entry.type === "file") {
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
