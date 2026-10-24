import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./keys";

const stored: Identity = {
  key: {} as CryptoKey,
  certDer: new Uint8Array([1, 2, 3]),
  publicKeySpki: new Uint8Array([4, 5]),
  backup: new Uint8Array([6, 7, 8, 9]),
  modulusLength: 2048,
  createdAt: 1_700_000_000_000,
};

beforeAll(async () => {
  await clearIdentity();
});

afterAll(async () => {
  await clearIdentity();
});

describe("identity storage", () => {
  it("starts empty", async () => {
    await expect(loadIdentity()).resolves.toBeNull();
  });

  it("stores and loads an identity", async () => {
    await saveIdentity(stored);
    const loaded = await loadIdentity();
    expect(loaded?.createdAt).toBe(stored.createdAt);
    expect(loaded?.modulusLength).toBe(2048);
    expect(Array.from(loaded!.backup)).toEqual(Array.from(stored.backup));
    expect(Array.from(loaded!.certDer)).toEqual(Array.from(stored.certDer));
    expect(Array.from(loaded!.publicKeySpki)).toEqual(
      Array.from(stored.publicKeySpki),
    );
  });
});
