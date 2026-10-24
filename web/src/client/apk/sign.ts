import { bufferSource, concat, lp, u32, u64 } from "./bytes";
import type { WrittenZip } from "./zip";

const V2_BLOCK_ID = 0x7109871a;
const RSA_PKCS1_SHA256 = 0x0103;
const MAGIC = new TextEncoder().encode("APK Sig Block 42");

export type SigningMaterial = {
  key: CryptoKey;
  certDer: Uint8Array;
  publicKeySpki: Uint8Array;
};

/**
 * Signs an unsigned APK with APK Signature Scheme v2 (RSA PKCS#1 v1.5,
 * SHA-256). v1 is unnecessary at minSdk 24 and v3 is optional, so the output is
 * intentionally v2-only.
 *
 * The structure follows apksig's V2SchemeSigner:
 *   sequence = concat(length-prefixed element for each element)
 *   pair     = length-prefixed(uint32 id + length-prefixed value)
 */
export async function signApk(
  zip: WrittenZip,
  material: SigningMaterial,
): Promise<Uint8Array> {
  const bytes = zip.bytes;
  const chunk1 = bytes.slice(0, zip.cdOffset);
  const chunk2 = bytes.slice(zip.cdOffset, zip.eocdOffset);
  const eocd = bytes.slice(zip.eocdOffset);
  const eocdView = new DataView(
    eocd.buffer,
    eocd.byteOffset,
    eocd.byteLength,
  );
  // The signing block is inserted at the old central-directory offset.
  eocdView.setUint32(16, zip.cdOffset, true);

  const finalDigest = await contentDigest([chunk1, chunk2, eocd]);

  const digestPair = pair(RSA_PKCS1_SHA256, finalDigest);
  const certificate = lp(material.certDer);
  const empty = new Uint8Array(0);
  const signedData = encode(digestPair, certificate, empty, empty);

  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", material.key, bufferSource(signedData)),
  );
  const signaturePair = pair(RSA_PKCS1_SHA256, signature);
  const signer = encode(signedData, signaturePair, material.publicKeySpki);
  const signerBlocks = lp(signer);
  const v2Value = lp(signerBlocks);

  const blockPair = concat(
    u64(4 + v2Value.length),
    u32(V2_BLOCK_ID),
    v2Value,
  );
  const blockLength = blockPair.length + 8 + 16;
  const signingBlock = concat(
    u64(blockLength),
    blockPair,
    u64(blockLength),
    MAGIC,
  );

  const finalEocd = eocd.slice();
  new DataView(
    finalEocd.buffer,
    finalEocd.byteOffset,
    finalEocd.byteLength,
  ).setUint32(16, zip.cdOffset + signingBlock.length, true);

  return concat(chunk1, signingBlock, chunk2, finalEocd);
}

function encode(...elements: Uint8Array[]): Uint8Array {
  return concat(...elements.map(lp));
}

function pair(id: number, value: Uint8Array): Uint8Array {
  return concat(u32(8 + value.length), u32(id), lp(value));
}

async function contentDigest(segments: Uint8Array[]): Promise<Uint8Array> {
  const chunkDigests: Uint8Array[] = [];
  for (const segment of segments) {
    for (let offset = 0; offset < segment.length; offset += 1024 * 1024) {
      const chunk = segment.subarray(
        offset,
        Math.min(offset + 1024 * 1024, segment.length),
      );
      chunkDigests.push(
        await sha256(concat(new Uint8Array([0xa5]), u32(chunk.length), chunk)),
      );
    }
  }
  return sha256(
    concat(
      new Uint8Array([0x5a]),
      u32(chunkDigests.length),
      concat(...chunkDigests),
    ),
  );
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bufferSource(data)));
}
