import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function warnIfLarge(name, size) {
  if (size > 25 * 1024 * 1024) {
    console.warn(
      `warning: ${name} is ${size} bytes and exceeds the 25 MiB static-asset limit`,
    );
  }
}

export function isSquashfsAt(bytes, offset) {
  if (offset < 1 || offset + 96 > bytes.length) {
    return false;
  }
  const inodes = bytes.readUInt32LE(offset + 4);
  const blockSize = bytes.readUInt32LE(offset + 12);
  const major = bytes.readUInt16LE(offset + 28);
  const minor = bytes.readUInt16LE(offset + 30);
  return (
    inodes > 0 &&
    blockSize >= 4096 &&
    blockSize <= 1024 * 1024 &&
    (blockSize & (blockSize - 1)) === 0 &&
    major === 4 &&
    minor === 0
  );
}

export function appImageOffset(name, bytes) {
  if (!name.endsWith(".AppImage")) {
    return undefined;
  }
  const magic = Buffer.from("hsqs");
  let offset = bytes.lastIndexOf(magic);
  while (offset >= 0) {
    if (isSquashfsAt(bytes, offset)) {
      return offset;
    }
    offset = bytes.lastIndexOf(magic, offset - 1);
  }
  throw new Error(`Could not find the squashfs in ${name}`);
}

export function readArtifact(directory, name, urlPrefix) {
  const partNames = readdirSync(directory)
    .filter((file) => file.startsWith(`${name}.part-`))
    .sort();
  if (partNames.length > 0) {
    const parts = partNames.map((partName) => {
      const bytes = readFileSync(join(directory, partName));
      warnIfLarge(partName, bytes.length);
      return {
        url: `${urlPrefix}/${partName}`,
        size: bytes.length,
        sha256: hash(bytes),
        bytes,
      };
    });
    const whole = Buffer.concat(parts.map((part) => part.bytes));
    const squashfsOffset = appImageOffset(name, whole);
    return {
      url: parts[0].url,
      size: whole.length,
      sha256: hash(whole),
      parts: parts.map(({ bytes: _bytes, ...part }) => part),
      ...(squashfsOffset === undefined ? {} : { squashfsOffset }),
    };
  }
  const bytes = readFileSync(join(directory, name));
  warnIfLarge(name, bytes.length);
  const squashfsOffset = appImageOffset(name, bytes);
  return {
    url: `${urlPrefix}/${name}`,
    size: bytes.length,
    sha256: hash(bytes),
    ...(squashfsOffset === undefined ? {} : { squashfsOffset }),
  };
}
