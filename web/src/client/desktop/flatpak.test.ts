import { gunzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { fixturePng } from "../../../test/helpers/binaries";
import { bufferSource } from "../apk/bytes";
import { flatpakBase } from "../../../test/helpers/flatpak";
import { flatpakAppId } from "../domain";
import { serializeConfig, type DesktopConfig } from "./config";
import { buildFlatpak } from "./flatpak";
import type { FlatpakBundleWriter } from "./flatpak-bundle";
import { createTar, parseTar } from "./flatpak-tar";
import { encodeVariant } from "./gvariant";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const id = flatpakAppId(new URL(config.url));
const ref = `app/${id}/x86_64/master`;

const flatpakWriter = vi.hoisted(() => ({
  default: vi.fn(async () => undefined),
  build_flatpak: vi.fn(() => new Uint8Array([9])),
}));

vi.mock("./flatpak-bundle", () => ({
  loadFlatpakBundleWriter: vi.fn(async () => flatpakWriter),
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function files(entries: ReturnType<typeof parseTar>): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.type === "file" && entry.data !== undefined) {
      map.set(entry.name, entry.data);
    }
  }
  return map;
}

function text(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("buildFlatpak", () => {
  it("rewrites the base into a per-site OCI bundle", async () => {
    const base = await flatpakBase();
    const result = await buildFlatpak(config, base.icon, base.bytes, "x64");
    expect(result.filename).toBe("example-6789ab-x64-flatpak.tar");

    const outer = files(parseTar(result.bytes));
    const index = JSON.parse(text(outer.get("index.json")!)) as {
      manifests: Array<{
        digest: string;
        size: number;
        annotations: Record<string, string>;
      }>;
    };
    expect(index.manifests[0]?.annotations["org.opencontainers.image.ref.name"]).toBe(
      ref,
    );
    const manifestBytes = outer.get(
      `blobs/sha256/${index.manifests[0]?.digest.slice(7)}`,
    );
    expect(manifestBytes).toBeDefined();
    expect(index.manifests[0]?.size).toBe(manifestBytes?.length);

    const manifest = JSON.parse(text(manifestBytes!)) as {
      config: { digest: string; size: number };
      layers: Array<{ digest: string; size: number }>;
    };
    const configBytes = outer.get(
      `blobs/sha256/${manifest.config.digest.slice(7)}`,
    );
    expect(configBytes).toBeDefined();
    expect(manifest.config.size).toBe(configBytes?.length);
    const layerGz = outer.get(
      `blobs/sha256/${manifest.layers[0]?.digest.slice(7)}`,
    );
    expect(layerGz).toBeDefined();
    expect(manifest.layers[0]?.size).toBe(layerGz?.length);

    const imageConfig = JSON.parse(text(configBytes!)) as {
      config: { Labels: Record<string, string> };
      rootfs: { diff_ids: string[] };
    };
    const labels = imageConfig.config.Labels;
    const metadata = text(
      files(parseTar(gunzipSync(layerGz!))).get("metadata")!,
    );
    expect(metadata).toContain(`name=${id}`);
    expect(labels["org.flatpak.ref"]).toBe(ref);
    expect(labels["org.flatpak.metadata"]).toBe(metadata);
    expect(
      Buffer.from(labels["org.flatpak.commit-metadata.xa.metadata"]!, "base64"),
    ).toEqual(Buffer.from(encodeVariant({ type: "s", value: metadata })));
    expect(
      Buffer.from(
        labels["org.flatpak.commit-metadata.ostree.ref-binding"]!,
        "base64",
      ),
    ).toEqual(Buffer.from(encodeVariant({ type: "as", value: [ref] })));
    expect(
      Buffer.from(labels["org.flatpak.commit-metadata.xa.ref"]!, "base64"),
    ).toEqual(Buffer.from(encodeVariant({ type: "s", value: ref })));
    expect(labels["org.flatpak.download-size"]).toBe(String(layerGz?.length));
    expect(labels["org.flatpak.commit"]).toBe("unchanged");

    const layerTar = gunzipSync(layerGz!);
    expect(imageConfig.rootfs.diff_ids).toEqual([`sha256:${await digest(layerTar)}`]);
    const layer = files(parseTar(layerTar));
    expect(text(layer.get("metadata")!)).toContain(`name=${id}`);
    expect(layer.has(`export/share/applications/${id}.desktop`)).toBe(true);
    expect(layer.has(`files/share/applications/${id}.desktop`)).toBe(true);
    expect(text(layer.get(`export/share/applications/${id}.desktop`)!)).toContain(
      "Name=Example",
    );
    expect(layer.get(`export/share/icons/hicolor/256x256/apps/${id}.png`)).toEqual(
      base.icon,
    );
    expect(layer.get(`files/share/icons/hicolor/256x256/apps/${id}.png`)).toEqual(
      base.icon,
    );
    expect(layer.get("files/bin/config.json")).toEqual(
      serializeConfig(config),
    );
    expect(layer.get("files/bin/icon.png")).toEqual(base.icon);
    expect(layer.get("files/bin/url2app-shell")).toEqual(
      Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]),
    );
  });

  it("builds a classic .flatpak bundle through the writer", async () => {
    const base = await flatpakBase();
    const writer = {
      default: vi.fn(async () => undefined),
      build_flatpak: vi.fn(() => new Uint8Array([7, 8])),
    } as unknown as FlatpakBundleWriter & {
      build_flatpak: ReturnType<typeof vi.fn>;
    };
    const bundle = await buildFlatpak(
      config,
      base.icon,
      base.bytes,
      "x64",
      {
        format: "bundle",
        loadWriter: async () => writer,
        now: () => 1_234_000,
      },
    );
    expect(bundle.filename).toBe("example-6789ab-x64.flatpak");
    expect(bundle.bytes).toEqual(new Uint8Array([7, 8]));
    expect(writer.build_flatpak).toHaveBeenCalledOnce();
    const [tar, refName, timestamp] = writer.build_flatpak.mock.calls[0]!;
    expect(tar).toBeInstanceOf(Uint8Array);
    expect(refName).toBe("app/app.com.example/x86_64/master");
    expect(timestamp).toBe(1234);
    const layer = files(parseTar(tar as Uint8Array));
    expect(text(layer.get("metadata")!)).toContain("name=app.com.example");
  });

  it("uses the default Flatpak writer and clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_234_000);
    try {
      const base = await flatpakBase();
      flatpakWriter.build_flatpak.mockClear();
      const bundle = await buildFlatpak(
        config,
        base.icon,
        base.bytes,
        "x64",
        { format: "bundle" },
      );
      expect(bundle.filename).toBe("example-6789ab-x64.flatpak");
      expect(bundle.bytes).toEqual(new Uint8Array([9]));
      expect(flatpakWriter.build_flatpak).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "app/app.com.example/x86_64/master",
        1234,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects empty input and non-PNG icons", async () => {
    const base = await flatpakBase();
    await expect(buildFlatpak(config, base.icon, new Uint8Array(), "x64")).rejects.toThrow(
      "empty",
    );
    await expect(
      buildFlatpak(config, new Uint8Array([1, 2, 3]), base.bytes, "x64"),
    ).rejects.toThrow("PNG");
  });

  it.each([
    ["a missing index", { omit: ["index"] as const }, "index is missing"],
    [
      "an invalid index",
      { indexBytes: encoder.encode("{") },
      "index is invalid",
    ],
    ["too many images", { manifests: 2 }, "one image"],
    ["an invalid reference", { ref: "bad" }, "reference is invalid"],
    ["a missing manifest", { omit: ["manifest"] as const }, "manifest is missing"],
    ["a missing config", { omit: ["config"] as const }, "config is missing"],
    ["a missing layer", { omit: ["layer"] as const }, "layer is missing"],
    ["no layers", { layers: 0 }, "layer is missing"],
    [
      "a corrupt layer",
      { layerGz: new TextEncoder().encode("not gzip") },
      "not gzip",
    ],
    ["missing metadata", { omit: ["metadata"] as const }, "missing metadata"],
    [
      "an empty app name",
      { metadata: "[Application]\nname=\n" },
      "app name is missing",
    ],
    [
      "a mismatched app name",
      { metadata: "[Application]\nname=wrong\n" },
      "does not match",
    ],
    [
      "missing labels",
      { imageConfig: { rootfs: { type: "layers", diff_ids: [] } } },
      "labels are missing",
    ],
    [
      "an invalid digest",
      {
        indexBytes: encoder.encode(
          JSON.stringify({
            manifests: [
              {
                digest: "bad",
                annotations: {
                  "org.opencontainers.image.ref.name":
                    "app/dev.yasogan.url2app.base/x86_64/master",
                },
              },
            ],
          }),
        ),
      },
      "digest is invalid",
    ],
    [
      "a missing reference",
      { indexBytes: encoder.encode(JSON.stringify({ manifests: [{}] })) },
      "reference is missing",
    ],
    [
      "a non-string reference",
      {
        indexBytes: encoder.encode(
          JSON.stringify({ manifests: [{ annotations: {} }] }),
        ),
      },
      "reference is missing",
    ],
    [
      "a non-array image list",
      { indexBytes: encoder.encode(JSON.stringify({ manifests: {} })) },
      "one image",
    ],
    [
      "a null image",
      { indexBytes: encoder.encode(JSON.stringify({ manifests: [null] })) },
      "image is invalid",
    ],
    [
      "a missing manifest config",
      { manifestConfig: { layers: [] } },
      "manifest config is invalid",
    ],
    [
      "an invalid manifest config digest",
      {
        manifestConfig: {
          config: { digest: "bad" },
          layers: [{ digest: "sha256:00", size: 1 }],
        },
      },
      "digest is invalid",
    ],
    [
      "an invalid manifest JSON",
      { manifestBytes: encoder.encode("{") },
      "manifest is invalid",
    ],
    [
      "an invalid config JSON",
      { configBytes: encoder.encode("{") },
      "image config is invalid",
    ],
    [
      "a non-app reference",
      { ref: "runtime/dev.yasogan.url2app.base/x86_64/master" },
      "reference is invalid",
    ],
  ])("rejects %s", async (_label, options, message) => {
    const base = await flatpakBase(options as never);
    await expect(buildFlatpak(config, base.icon, base.bytes, "x64")).rejects.toThrow(
      message,
    );
  });

  it("ignores non-file outer entries", async () => {
    const base = await flatpakBase();
    const entries = parseTar(base.bytes);
    entries.push({ name: "extra", type: "dir", mode: 0o755 });
    const result = await buildFlatpak(
      config,
      base.icon,
      createTar(entries),
      "x64",
    );
    expect(result.filename).toBe("example-6789ab-x64-flatpak.tar");
  });

  it("falls back to a minimal oci-layout file", async () => {
    const base = await flatpakBase({ omit: ["layout"] });
    const result = await buildFlatpak(config, base.icon, base.bytes, "x64");
    const outer = files(parseTar(result.bytes));
    expect(text(outer.get("oci-layout")!)).toContain("imageLayoutVersion");
  });

  it("uses the actual URL-derived app ID", async () => {
    const base = await flatpakBase();
    const news: DesktopConfig = {
      ...config,
      url: "https://news.ycombinator.com/",
    };
    const result = await buildFlatpak(news, base.icon, base.bytes, "x64");
    const outer = files(parseTar(result.bytes));
    const index = JSON.parse(text(outer.get("index.json")!)) as {
      manifests: Array<{ annotations: Record<string, string> }>;
    };
    expect(
      index.manifests[0]?.annotations["org.opencontainers.image.ref.name"],
    ).toBe("app/com.ycombinator.news/x86_64/master");
  });
});
