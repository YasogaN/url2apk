export function patchPackageName(arsc: Uint8Array, packageName: string): void {
  if (packageName.length > 128) {
    throw new Error("Package name is too long.");
  }
  const view = new DataView(arsc.buffer, arsc.byteOffset, arsc.byteLength);
  const tableSize = view.getUint32(4, true);
  let cursor = 12;
  while (cursor + 8 <= tableSize) {
    const type = view.getUint16(cursor, true);
    const size = view.getUint32(cursor + 4, true);
    if (size < 8) {
      throw new Error("Invalid resource table chunk.");
    }
    if (type === 0x0200) {
      for (let index = 0; index < 128; index++) {
        const code =
          index < packageName.length ? packageName.charCodeAt(index) : 0;
        view.setUint16(cursor + 12 + index * 2, code, true);
      }
      return;
    }
    cursor += size;
  }
  throw new Error("Package chunk not found.");
}

