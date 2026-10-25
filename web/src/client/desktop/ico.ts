const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

export function pngToIco(png: Uint8Array): Uint8Array {
  if (!hasMagic(png, PNG_MAGIC) || png.length < 24) {
    throw new Error("The app icon is not a PNG image.");
  }
  const source = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = source.getUint32(16);
  const height = source.getUint32(20);
  if (width === 0 || height === 0) {
    throw new Error("The app icon has invalid dimensions.");
  }

  const output = new Uint8Array(22 + png.length);
  const view = new DataView(output.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  output[6] = width >= 256 ? 0 : width;
  output[7] = height >= 256 ? 0 : height;
  output[8] = 0;
  output[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  output.set(png, 22);
  return output;
}
