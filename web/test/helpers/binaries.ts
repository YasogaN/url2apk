export function minimalPe(): Uint8Array {
  const bytes = new Uint8Array(0x80);
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  new DataView(bytes.buffer).setUint32(0x3c, 0x40, true);
  bytes[0x40] = 0x50;
  bytes[0x41] = 0x45;
  bytes[0x42] = 0;
  bytes[0x43] = 0;
  return bytes;
}

export function minimalElf(): Uint8Array {
  return Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]);
}

export function minimalPng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
  ]);
}
