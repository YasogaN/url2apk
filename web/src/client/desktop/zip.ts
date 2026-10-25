import { zipSync, type ZipOptions } from "fflate";

const ZIP_MTIME = Date.UTC(2020, 0, 1);

export type ZipEntry = {
  name: string;
  data?: Uint8Array;
  mode?: number;
  directory?: boolean;
};

function validateName(name: string): void {
  if (name === "") {
    throw new Error("Zip entry name is empty.");
  }
  if (name.startsWith("/")) {
    throw new Error("Zip entry name must be relative.");
  }
  if (name.includes("\0")) {
    throw new Error("Zip entry name contains a NUL byte.");
  }
  if (name.includes("\\")) {
    throw new Error("Zip entry name contains a backslash.");
  }
  if (name.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Zip entry name contains a traversal segment.");
  }
}

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const files: Record<string, [Uint8Array, ZipOptions]> = {};
  for (const entry of entries) {
    validateName(entry.name);
    if (entry.name in files) {
      throw new Error(`Zip entry name is duplicated: ${entry.name}`);
    }
    const directory = entry.directory === true;
    const mode = entry.mode ?? (directory ? 0o755 : 0o644);
    files[entry.name] = [
      entry.data ?? new Uint8Array(0),
      {
        attrs: mode << 16,
        os: 3,
        mtime: ZIP_MTIME,
      },
    ];
  }
  return zipSync(files, { level: 9 });
}
