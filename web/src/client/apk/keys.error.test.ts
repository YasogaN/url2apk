import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./keys";

const identity: Identity = {
  key: {} as CryptoKey,
  certDer: new Uint8Array([1]),
  publicKeySpki: new Uint8Array([2]),
  backup: new Uint8Array([3]),
  modulusLength: 2048,
  createdAt: 0,
};

function failingTransaction(): IDBTransaction {
  const request = {
    error: new Error("request failed"),
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest;
  const transaction = {
    error: new Error("transaction failed"),
    oncomplete: null,
    onerror: null,
    objectStore: () => ({
      put: () => {
        queueMicrotask(() => {
          transaction.onerror?.(new Event("error"));
        });
      },
      get: () => {
        queueMicrotask(() => {
          request.onerror?.(new Event("error"));
        });
        return request;
      },
      delete: () => {
        queueMicrotask(() => {
          transaction.onerror?.(new Event("error"));
        });
      },
    }),
  } as unknown as IDBTransaction;
  return transaction;
}

function mockOpen(
  database: IDBDatabase | null,
  error: Error | null,
): void {
  const request = {
    result: database,
    error,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  } as unknown as IDBOpenDBRequest;
  vi.spyOn(indexedDB, "open").mockImplementation(() => {
    queueMicrotask(() => {
      if (database === null) {
        request.onerror?.(new Event("error"));
      } else {
        request.onsuccess?.(new Event("success"));
      }
    });
    return request;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("identity storage errors", () => {
  it("rejects when opening the database fails", async () => {
    mockOpen(null, new Error("open failed"));
    await expect(loadIdentity()).rejects.toThrow("open failed");
  });

  it("rejects when a save transaction fails", async () => {
    mockOpen(
      {
        transaction: () => failingTransaction(),
        close: vi.fn(),
      } as unknown as IDBDatabase,
      null,
    );
    await expect(saveIdentity(identity)).rejects.toThrow("transaction failed");
  });

  it("rejects when a load request fails", async () => {
    mockOpen(
      {
        transaction: () => failingTransaction(),
        close: vi.fn(),
      } as unknown as IDBDatabase,
      null,
    );
    await expect(loadIdentity()).rejects.toThrow("request failed");
  });

  it("rejects when a clear transaction fails", async () => {
    mockOpen(
      {
        transaction: () => failingTransaction(),
        close: vi.fn(),
      } as unknown as IDBDatabase,
      null,
    );
    await expect(clearIdentity()).rejects.toThrow("transaction failed");
  });
});
