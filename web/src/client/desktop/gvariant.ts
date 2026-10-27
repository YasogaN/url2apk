const encoder = new TextEncoder();

export type VariantValue =
  | { type: "s"; value: string }
  | { type: "as"; value: readonly string[] }
  | { type: "ay"; value: Uint8Array }
  | { type: "t"; value: bigint };

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeString(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  const output = new Uint8Array(bytes.length + 1);
  output.set(bytes);
  return output;
}

export function offsetSize(length: number): number {
  if (length <= 0xff) {
    return 1;
  }
  if (length <= 0xffff) {
    return 2;
  }
  if (length <= 0xffffffff) {
    return 4;
  }
  return 8;
}

function encodeArrayOfStrings(values: readonly string[]): Uint8Array {
  const elements = values.map(encodeString);
  const data = concat(elements);
  const width = offsetSize(data.length);
  const table = new Uint8Array(elements.length * width);
  let end = 0;
  let tableOffset = 0;
  for (const element of elements) {
    end += element.length;
    let value = end;
    for (let index = 0; index < width; index += 1) {
      table[tableOffset] = value & 0xff;
      value >>>= 8;
      tableOffset += 1;
    }
  }
  return concat([data, table]);
}

function encodeUint64(value: bigint): Uint8Array {
  const output = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function encodeValue(value: VariantValue): Uint8Array {
  switch (value.type) {
    case "s":
      return encodeString(value.value);
    case "as":
      return encodeArrayOfStrings(value.value);
    case "ay":
      return value.value;
    case "t":
      return encodeUint64(value.value);
  }
}

export function encodeVariant(value: VariantValue): Uint8Array {
  return concat([
    encodeValue(value),
    new Uint8Array(1),
    encoder.encode(value.type),
  ]);
}
