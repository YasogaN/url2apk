import { gzipSync, gunzipSync } from "fflate";
import { bufferSource } from "../apk/bytes";
import { flatpakAppId } from "../domain";
import { packageBase, serializeConfig, type DesktopArch, type DesktopConfig } from "./config";
import { createTar, parseTar, type FlatpakTarEntry } from "./flatpak-tar";
import {
  loadFlatpakBundleWriter,
  type FlatpakBundleWriter,
} from "./flatpak-bundle";
import { encodeVariant } from "./gvariant";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type FlatpakBundle = {
  bytes: Uint8Array;
  filename: string;
};

export type FlatpakFormat = "oci" | "bundle";

export type FlatpakBuildOptions = {
  format?: FlatpakFormat;
  loadWriter?: () => Promise<FlatpakBundleWriter>;
  now?: () => number;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, message: string): JsonRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error(message);
  }
  return value as JsonRecord;
}

function parseJson(bytes: Uint8Array, message: string): JsonRecord {
  try {
    return asRecord(JSON.parse(decoder.decode(bytes)), message);
  } catch {
    throw new Error(message);
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2));
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function digestName(digest: unknown): string {
  if (typeof digest !== "string" || !digest.startsWith("sha256:")) {
    throw new Error("The Flatpak OCI digest is invalid.");
  }
  return digest.slice("sha256:".length);
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_MAGIC.length &&
    PNG_MAGIC.every((value, index) => bytes[index] === value)
  );
}

function desktopEntry(config: DesktopConfig, id: string): Uint8Array {
  return encoder.encode(
    [
      "[Desktop Entry]",
      "Type=Application",
      `Name=${config.name}`,
      `Comment=Open ${config.url}`,
      "Exec=url2app-shell",
      `Icon=${id}`,
      "Terminal=false",
      "Categories=Utility;",
      "StartupWMClass=url2app-shell",
      "",
    ].join("\n"),
  );
}

function entryData(entries: readonly FlatpakTarEntry[], name: string): Uint8Array {
  const entry = entries.find((item) => item.name === name);
  if (entry === undefined || entry.type !== "file" || entry.data === undefined) {
    throw new Error(`The Flatpak archive is missing ${name}.`);
  }
  return entry.data;
}

function replaceFile(
  entries: Map<string, FlatpakTarEntry>,
  name: string,
  data: Uint8Array,
  mode = 0o644,
): void {
  entries.set(name, { name, type: "file", mode, data });
}

export async function buildFlatpak(
  config: DesktopConfig,
  icon: Uint8Array,
  base: Uint8Array,
  arch: DesktopArch,
  options: FlatpakBuildOptions = {},
): Promise<FlatpakBundle> {
  if (base.length === 0) {
    throw new Error("The Flatpak base is empty.");
  }
  if (icon.length === 0 || !hasPngMagic(icon)) {
    throw new Error("The app icon is not a PNG image.");
  }

  const outer = parseTar(base);
  const files = new Map<string, Uint8Array>();
  for (const entry of outer) {
    if (entry.type === "file") {
      files.set(entry.name, entry.data!);
    }
  }
  const indexData = files.get("index.json");
  if (indexData === undefined) {
    throw new Error("The Flatpak OCI index is missing.");
  }
  const index = parseJson(indexData, "The Flatpak OCI index is invalid.");
  const descriptors = index.manifests;
  if (!Array.isArray(descriptors) || descriptors.length !== 1) {
    throw new Error("The Flatpak OCI index must contain one image.");
  }
  const descriptor = asRecord(descriptors[0], "The Flatpak image is invalid.");
  const annotations = asRecord(
    descriptor.annotations,
    "The Flatpak image reference is missing.",
  );
  const oldRef = annotations["org.opencontainers.image.ref.name"];
  if (typeof oldRef !== "string") {
    throw new Error("The Flatpak image reference is missing.");
  }
  const refParts = oldRef.split("/");
  if (refParts.length !== 4 || refParts[0] !== "app") {
    throw new Error("The Flatpak image reference is invalid.");
  }
  const [, baseId, refArch, branch] = refParts;

  const manifestName = `blobs/sha256/${digestName(descriptor.digest)}`;
  const manifestData = files.get(manifestName);
  if (manifestData === undefined) {
    throw new Error("The Flatpak manifest is missing.");
  }
  const manifest = parseJson(manifestData, "The Flatpak manifest is invalid.");
  const manifestConfig = asRecord(
    manifest.config,
    "The Flatpak manifest config is invalid.",
  );
  const configName = `blobs/sha256/${digestName(manifestConfig.digest)}`;
  const configData = files.get(configName);
  if (configData === undefined) {
    throw new Error("The Flatpak image config is missing.");
  }
  const imageConfig = parseJson(
    configData,
    "The Flatpak image config is invalid.",
  );
  const labels = asRecord(
    asRecord(imageConfig.config, "The Flatpak labels are missing.").Labels,
    "The Flatpak labels are missing.",
  );
  const layers = manifest.layers;
  if (!Array.isArray(layers) || layers.length !== 1) {
    throw new Error("The Flatpak layer is missing.");
  }
  const layer = asRecord(layers[0], "The Flatpak layer is invalid.");
  const layerName = `blobs/sha256/${digestName(layer.digest)}`;
  const layerGz = files.get(layerName);
  if (layerGz === undefined) {
    throw new Error("The Flatpak layer is missing.");
  }
  let layerTar: Uint8Array;
  try {
    layerTar = gunzipSync(layerGz);
  } catch {
    throw new Error("The Flatpak layer is not gzip-compressed.");
  }
  const layerEntries = parseTar(layerTar);
  const metadata = decoder.decode(entryData(layerEntries, "metadata"));
  const baseName = /^name=(.+)$/m.exec(metadata)?.[1]?.trim();
  if (baseName === undefined || baseName === "") {
    throw new Error("The Flatpak app name is missing.");
  }
  if (baseName !== baseId) {
    throw new Error("The Flatpak app name does not match the image reference.");
  }

  const id = flatpakAppId(new URL(config.url));
  const ref = `app/${id}/${refArch}/${branch}`;
  const newMetadata = metadata.replace(/^name=.*$/m, `name=${id}`);
  const iconDesktop = desktopEntry(config, id);
  const updated: FlatpakTarEntry[] = [];
  for (const entry of layerEntries) {
    let name = entry.name.replaceAll(baseId, id);
    let data = entry.data;
    if (entry.name === "metadata") {
      data = encoder.encode(newMetadata);
    } else if (entry.name.endsWith(".desktop")) {
      data = iconDesktop;
    } else if (entry.name.endsWith(".png") && entry.name.includes(baseId)) {
      data = icon;
    }
    updated.push({ ...entry, name, data });
  }
  const updatedMap = new Map(updated.map((entry) => [entry.name, entry]));
  replaceFile(updatedMap, "files/bin/config.json", serializeConfig(config));
  replaceFile(updatedMap, "files/bin/icon.png", icon);
  const newLayerTar = createTar(Array.from(updatedMap.values()));
  if (options.format === "bundle") {
    const writer = await (options.loadWriter ?? loadFlatpakBundleWriter)();
    return {
      bytes: writer.build_flatpak(
        newLayerTar,
        ref,
        Math.floor((options.now ?? Date.now)() / 1000),
      ),
      filename: `${packageBase(config)}-${arch}.flatpak`,
    };
  }
  const newLayerGz = gzipSync(newLayerTar, { level: 9, mtime: 0 });
  const layerDigest = await sha256(newLayerGz);
  const diffId = await sha256(newLayerTar);

  labels["org.flatpak.ref"] = ref;
  labels["org.flatpak.metadata"] = newMetadata;
  labels["org.flatpak.subject"] = `Export ${id}`;
  labels["org.flatpak.body"] = `Name: ${id}\nArch: ${refArch}\nBranch: ${branch}\n`;
  labels["org.flatpak.commit-metadata.xa.metadata"] = base64(
    encodeVariant({ type: "s", value: newMetadata }),
  );
  labels["org.flatpak.commit-metadata.ostree.ref-binding"] = base64(
    encodeVariant({ type: "as", value: [ref] }),
  );
  labels["org.flatpak.commit-metadata.xa.ref"] = base64(
    encodeVariant({ type: "s", value: ref }),
  );
  labels["org.flatpak.download-size"] = String(newLayerGz.length);
  imageConfig.rootfs = {
    type: "layers",
    diff_ids: [`sha256:${diffId}`],
  };
  const newConfig = jsonBytes(imageConfig);
  const configDigest = await sha256(newConfig);
  manifest.config = {
    ...manifestConfig,
    digest: `sha256:${configDigest}`,
    size: newConfig.length,
  };
  manifest.layers = [
    {
      ...layer,
      digest: `sha256:${layerDigest}`,
      size: newLayerGz.length,
    },
  ];
  const newManifest = jsonBytes(manifest);
  const manifestDigest = await sha256(newManifest);
  const newIndex = {
    ...index,
    manifests: [
      {
        ...descriptor,
        digest: `sha256:${manifestDigest}`,
        size: newManifest.length,
        annotations: {
          ...annotations,
          "org.opencontainers.image.ref.name": ref,
        },
      },
    ],
  };
  const newIndexData = jsonBytes(newIndex);

  const output = createTar([
    {
      name: "oci-layout",
      type: "file",
      mode: 0o644,
      data: files.get("oci-layout") ?? encoder.encode('{"imageLayoutVersion":"1.0.0"}'),
    },
    { name: "index.json", type: "file", mode: 0o644, data: newIndexData },
    {
      name: `blobs/sha256/${configDigest}`,
      type: "file",
      mode: 0o644,
      data: newConfig,
    },
    {
      name: `blobs/sha256/${manifestDigest}`,
      type: "file",
      mode: 0o644,
      data: newManifest,
    },
    {
      name: `blobs/sha256/${layerDigest}`,
      type: "file",
      mode: 0o644,
      data: newLayerGz,
    },
  ]);
  return {
    bytes: output,
    filename: `${packageBase(config)}-${arch}-flatpak.tar`,
  };
}
