import "reflect-metadata";
import * as x509 from "@peculiar/x509";
import { bufferSource, concat } from "./bytes";
import type { SigningMaterial } from "./sign";

const DB_NAME = "url-to-apk";
const DB_VERSION = 1;
const STORE = "identity";
const KEY = "current";
const MAGIC = new TextEncoder().encode("P1X1");
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;
const ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export type Identity = SigningMaterial & {
  backup: Uint8Array;
  modulusLength: 2048 | 4096;
  createdAt: number;
};

type BackupPayload = {
  v: number;
  modulusLength: 2048 | 4096;
  createdAt: number;
  pkcs8: string;
  certDer: string;
  publicKeySpki: string;
};

x509.cryptoProvider.set(crypto);

export async function createIdentity(
  modulusLength: 2048 | 4096,
  password: string,
): Promise<Identity> {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const createdAt = Date.now();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serialNumber(),
    name: "CN=URL to APK",
    notBefore: new Date(createdAt - 86_400_000),
    notAfter: new Date(createdAt + 3650 * 86_400_000),
    signingAlgorithm: ALGORITHM,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
    ],
  });
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keys.privateKey),
  );
  const publicKeySpki = new Uint8Array(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  );
  const certDer = new Uint8Array(cert.rawData);
  const backup = await encryptBackup(password, {
    v: VERSION,
    modulusLength,
    createdAt,
    pkcs8: toBase64(pkcs8),
    certDer: toBase64(certDer),
    publicKeySpki: toBase64(publicKeySpki),
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bufferSource(pkcs8),
    ALGORITHM,
    false,
    ["sign"],
  );
  return {
    key,
    certDer,
    publicKeySpki,
    backup,
    modulusLength,
    createdAt,
  };
}

export async function importIdentity(
  backup: Uint8Array,
  password: string,
): Promise<Identity> {
  if (backup.length < MAGIC.length + 1 + SALT_BYTES + IV_BYTES) {
    throw new Error("That backup is incomplete.");
  }
  if (!MAGIC.every((byte, index) => backup[index] === byte)) {
    throw new Error("That is not a URL to APK key backup.");
  }
  if (backup[4] !== VERSION) {
    throw new Error("Unsupported backup version.");
  }

  const salt = backup.slice(5, 5 + SALT_BYTES);
  const iv = backup.slice(5 + SALT_BYTES, 5 + SALT_BYTES + IV_BYTES);
  const ciphertext = backup.slice(5 + SALT_BYTES + IV_BYTES);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await deriveKey(password, salt),
      bufferSource(ciphertext),
    );
  } catch {
    throw new Error("That password did not unlock the backup.");
  }

  let payload: BackupPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext)) as BackupPayload;
  } catch {
    throw new Error("That backup is corrupt.");
  }
  if (payload.v !== VERSION) {
    throw new Error("Unsupported backup version.");
  }

  const pkcs8 = fromBase64(payload.pkcs8);
  const certDer = fromBase64(payload.certDer);
  const publicKeySpki = fromBase64(payload.publicKeySpki);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bufferSource(pkcs8),
    ALGORITHM,
    false,
    ["sign"],
  );
  return {
    key,
    certDer,
    publicKeySpki,
    backup,
    modulusLength: payload.modulusLength,
    createdAt: payload.createdAt,
  };
}

export async function saveIdentity(identity: Identity): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(identity, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadIdentity(): Promise<Identity | null> {
  const database = await openDatabase();
  const record = await new Promise<Identity | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as Identity | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return record ?? null;
}

export async function clearIdentity(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function encryptBackup(
  password: string,
  payload: BackupPayload,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await deriveKey(password, salt),
      bufferSource(new TextEncoder().encode(JSON.stringify(payload))),
    ),
  );
  return concat(MAGIC, new Uint8Array([VERSION]), salt, iv, ciphertext);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    bufferSource(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function serialNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[0] = (bytes[0] & 0x7f) | 0x01;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
