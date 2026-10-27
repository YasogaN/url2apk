import { createHash } from "node:crypto";
import { gzipSync } from "fflate";
import { createTar, type FlatpakTarEntry } from "../../src/client/desktop/flatpak-tar";
import { encodeVariant } from "../../src/client/desktop/gvariant";
import { fixturePng } from "./binaries";

const encoder = new TextEncoder();

export const BASE_ID = "dev.yasogan.url2app.base";
export const BASE_REF = `app/${BASE_ID}/x86_64/master`;

export type FlatpakBaseOptions = {
  ref?: string;
  metadata?: string;
  indexBytes?: Uint8Array;
  manifestBytes?: Uint8Array;
  configBytes?: Uint8Array;
  layerTar?: Uint8Array;
  layerGz?: Uint8Array;
  omit?: Array<"index" | "manifest" | "config" | "layer" | "metadata" | "labels" | "layout">;
  manifests?: number;
  layers?: number;
  imageConfig?: Record<string, unknown>;
  manifestConfig?: Record<string, unknown>;
};

export type FlatpakBaseFixture = {
  bytes: Uint8Array;
  index: Record<string, unknown>;
  manifest: Record<string, unknown>;
  config: Record<string, unknown>;
  layerTar: Uint8Array;
  layerGz: Uint8Array;
  configBytes: Uint8Array;
  manifestBytes: Uint8Array;
  indexBytes: Uint8Array;
  icon: Uint8Array;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2));
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function entry(
  name: string,
  data: Uint8Array,
  mode = 0o644,
): FlatpakTarEntry {
  return { name, type: "file", mode, data };
}

export async function flatpakBase(
  options: FlatpakBaseOptions = {},
): Promise<FlatpakBaseFixture> {
  const ref = options.ref ?? BASE_REF;
  const metadata =
    options.metadata ??
    `[Application]\nname=${BASE_ID}\nruntime=org.gnome.Platform/x86_64/50\ncommand=url2app-shell\n\n[Context]\nshared=ipc;network;\n`;
  const icon = fixturePng(256, 256);
  const omit = new Set(options.omit ?? []);
  const layerEntries: FlatpakTarEntry[] = [
    entry("metadata", encoder.encode(metadata)),
    entry(`export/share/applications/${BASE_ID}.desktop`, encoder.encode("base")),
    entry(`export/share/icons/hicolor/256x256/apps/${BASE_ID}.png`, icon),
    entry("files/bin/url2app-shell", Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]), 0o755),
    entry(`files/share/applications/${BASE_ID}.desktop`, encoder.encode("base")),
    entry(`files/share/icons/hicolor/256x256/apps/${BASE_ID}.png`, icon),
  ];
  if (omit.has("metadata")) {
    layerEntries.splice(0, 1);
  }
  const layerTar = options.layerTar ?? createTar(layerEntries);
  const layerGz =
    options.layerGz ?? gzipSync(layerTar, { level: 9, mtime: 0 });
  const layerDigest = sha256(layerGz);
  const diffId = sha256(layerTar);
  const labels: Record<string, string> = {
    "org.flatpak.ref": ref,
    "org.flatpak.metadata": metadata,
    "org.flatpak.subject": `Export ${BASE_ID}`,
    "org.flatpak.body": `Name: ${BASE_ID}\nArch: x86_64\nBranch: master\n`,
    "org.flatpak.commit-metadata.xa.metadata": b64(
      encodeVariant({ type: "s", value: metadata }),
    ),
    "org.flatpak.commit-metadata.ostree.ref-binding": b64(
      encodeVariant({ type: "as", value: [ref] }),
    ),
    "org.flatpak.commit-metadata.xa.ref": b64(
      encodeVariant({ type: "s", value: ref }),
    ),
    "org.flatpak.download-size": String(layerGz.length),
    "org.flatpak.installed-size": "100",
    "org.flatpak.commit": "unchanged",
    "org.flatpak.commit-metadata.ostree.collection-binding": b64(
      encodeVariant({ type: "s", value: "" }),
    ),
  };
  if (omit.has("labels")) {
    delete labels["org.flatpak.ref"];
  }
  const config: Record<string, unknown> =
    options.imageConfig === undefined
      ? {
          created: "2026-01-01T00:00:00Z",
          architecture: "amd64",
          os: "linux",
          config: { Labels: labels },
          rootfs: { type: "layers", diff_ids: [`sha256:${diffId}`] },
        }
      : options.imageConfig;
  const configBytes = options.configBytes ?? json(config);
  const configDigest = sha256(configBytes);
  const manifest: Record<string, unknown> =
    options.manifestConfig === undefined
      ? {
          schemaVersion: 2,
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          config: {
            mediaType: "application/vnd.oci.image.config.v1+json",
            digest: `sha256:${configDigest}`,
            size: configBytes.length,
          },
          layers: [
            {
              mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
              digest: `sha256:${layerDigest}`,
              size: layerGz.length,
            },
          ],
        }
      : options.manifestConfig;
  if (options.layers !== undefined) {
    manifest.layers = Array.from({ length: options.layers }, () => ({
      mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
      digest: `sha256:${layerDigest}`,
      size: layerGz.length,
    }));
  }
  const manifestBytes = options.manifestBytes ?? json(manifest);
  const manifestDigest = sha256(manifestBytes);
  const index: Record<string, unknown> = {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: Array.from({ length: options.manifests ?? 1 }, () => ({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      digest: `sha256:${manifestDigest}`,
      size: manifestBytes.length,
      annotations: {
        "org.opencontainers.image.ref.name": ref,
      },
    })),
  };
  const indexBytes = options.indexBytes ?? json(index);
  const outer: FlatpakTarEntry[] = [];
  if (!omit.has("layout")) {
    outer.push(entry("oci-layout", json({ imageLayoutVersion: "1.0.0" })));
  }
  if (!omit.has("index")) {
    outer.push(entry("index.json", indexBytes));
  }
  if (!omit.has("config")) {
    outer.push(entry(`blobs/sha256/${configDigest}`, configBytes));
  }
  if (!omit.has("manifest")) {
    outer.push(entry(`blobs/sha256/${manifestDigest}`, manifestBytes));
  }
  if (!omit.has("layer")) {
    outer.push(entry(`blobs/sha256/${layerDigest}`, layerGz));
  }
  return {
    bytes: createTar(outer),
    index,
    manifest: manifest as Record<string, unknown>,
    config: config as Record<string, unknown>,
    layerTar,
    layerGz,
    configBytes,
    manifestBytes,
    indexBytes,
    icon,
  };
}
