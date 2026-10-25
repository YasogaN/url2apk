import { describe, expect, it } from "vitest";
import { bufferSource, concat } from "./bytes";
import { importIdentity } from "./keys";

const MAGIC = new TextEncoder().encode("P1X1");
const VERSION = 1;
const SALT = 16;
const IV = 12;
const PASSWORD = "long-enough-password";

async function makeBackup(plaintext: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const material = await crypto.subtle.importKey(
    "raw",
    bufferSource(new TextEncoder().encode(PASSWORD)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(salt),
      iterations: 600_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      bufferSource(plaintext),
    ),
  );
  return concat(MAGIC, new Uint8Array([VERSION]), salt, iv, ciphertext);
}

describe("importIdentity validation", () => {
  it("rejects an unsupported outer version", async () => {
    const backup = concat(
      MAGIC,
      new Uint8Array([2]),
      new Uint8Array(SALT + IV + 1),
    );
    await expect(importIdentity(backup, PASSWORD)).rejects.toThrow(
      "Unsupported backup version.",
    );
  });

  it("rejects a corrupt payload", async () => {
    const backup = await makeBackup(new TextEncoder().encode("not json"));
    await expect(importIdentity(backup, PASSWORD)).rejects.toThrow(
      "That backup is corrupt.",
    );
  });

  it("rejects an unsupported payload version", async () => {
    const backup = await makeBackup(
      new TextEncoder().encode(JSON.stringify({ v: 2 })),
    );
    await expect(importIdentity(backup, PASSWORD)).rejects.toThrow(
      "Unsupported backup version.",
    );
  });
});
