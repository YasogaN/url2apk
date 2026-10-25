export const TRAILER_MAGIC = "NAPP";
export const TRAILER_VERSION = 1;
export const TRAILER_SIZE = 64;
export const TRAILER_JSON_OFFSET = 8;
export const TRAILER_ICON_OFFSET = 24;
export const TRAILER_PAYLOAD_OFFSET = 40;

export type Trailer = {
  jsonOffset: number;
  jsonLength: number;
  iconOffset: number;
  iconLength: number;
  payloadOffset: number;
};

export type TrailerResult =
  | { ok: true; trailer: Trailer }
  | { ok: false; message: string };

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MAGIC = new TextEncoder().encode(TRAILER_MAGIC);

function readOffset(view: DataView, offset: number): number | null {
  const value = view.getBigUint64(offset, true);
  if (value > MAX_SAFE) {
    return null;
  }
  return Number(value);
}

export function buildTrailer(trailer: Trailer): Uint8Array {
  const bytes = new Uint8Array(TRAILER_SIZE);
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, TRAILER_VERSION, true);
  view.setBigUint64(TRAILER_JSON_OFFSET, BigInt(trailer.jsonOffset), true);
  view.setBigUint64(TRAILER_JSON_OFFSET + 8, BigInt(trailer.jsonLength), true);
  view.setBigUint64(TRAILER_ICON_OFFSET, BigInt(trailer.iconOffset), true);
  view.setBigUint64(TRAILER_ICON_OFFSET + 8, BigInt(trailer.iconLength), true);
  view.setBigUint64(
    TRAILER_PAYLOAD_OFFSET,
    BigInt(trailer.payloadOffset),
    true,
  );
  return bytes;
}

export function appendPayload(
  base: Uint8Array,
  json: Uint8Array,
  icon: Uint8Array,
): Uint8Array {
  const jsonOffset = base.length;
  const iconOffset = jsonOffset + json.length;
  const output = new Uint8Array(
    base.length + json.length + icon.length + TRAILER_SIZE,
  );
  output.set(base, 0);
  output.set(json, jsonOffset);
  output.set(icon, iconOffset);
  output.set(
    buildTrailer({
      jsonOffset,
      jsonLength: json.length,
      iconOffset,
      iconLength: icon.length,
      payloadOffset: base.length,
    }),
    output.length - TRAILER_SIZE,
  );
  return output;
}

export function readTrailer(bytes: Uint8Array): TrailerResult {
  if (bytes.length < TRAILER_SIZE) {
    return {
      ok: false,
      message: "The file is too small to contain a config trailer.",
    };
  }

  const start = bytes.length - TRAILER_SIZE;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, TRAILER_SIZE);
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (view.getUint8(index) !== MAGIC[index]) {
      return {
        ok: false,
        message: "The config trailer is missing.",
      };
    }
  }
  if (view.getUint16(4, true) !== TRAILER_VERSION) {
    return {
      ok: false,
      message: "The config trailer version is not supported.",
    };
  }

  const jsonOffset = readOffset(view, TRAILER_JSON_OFFSET);
  const jsonLength = readOffset(view, TRAILER_JSON_OFFSET + 8);
  const iconOffset = readOffset(view, TRAILER_ICON_OFFSET);
  const iconLength = readOffset(view, TRAILER_ICON_OFFSET + 8);
  const payloadOffset = readOffset(view, TRAILER_PAYLOAD_OFFSET);
  if (
    jsonOffset === null ||
    jsonLength === null ||
    iconOffset === null ||
    iconLength === null ||
    payloadOffset === null
  ) {
    return {
      ok: false,
      message: "The config trailer has out-of-range offsets.",
    };
  }

  const trailer: Trailer = {
    jsonOffset,
    jsonLength,
    iconOffset,
    iconLength,
    payloadOffset,
  };
  if (payloadOffset === 0 || payloadOffset > jsonOffset) {
    return {
      ok: false,
      message: "The config payload offset is invalid.",
    };
  }
  if (jsonLength === 0 || jsonOffset + jsonLength > iconOffset) {
    return {
      ok: false,
      message: "The config JSON range is invalid.",
    };
  }
  if (iconOffset + iconLength > start) {
    return {
      ok: false,
      message: "The config icon range is invalid.",
    };
  }
  return { ok: true, trailer };
}
