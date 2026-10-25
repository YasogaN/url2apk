import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "./keys";
import type { PendingEntry, WrittenZip, ZipArchive, ZipEntry } from "./zip";

const mocks = vi.hoisted(() => ({
  readZip: vi.fn(),
  writeZip: vi.fn(),
  signApk: vi.fn(),
  patchManifest: vi.fn(),
  patchPackageName: vi.fn(),
}));

vi.mock("./zip", () => ({
  readZip: mocks.readZip,
  writeZip: mocks.writeZip,
}));
vi.mock("./sign", () => ({ signApk: mocks.signApk }));
vi.mock("./axml", () => ({ patchManifest: mocks.patchManifest }));
vi.mock("./arsc", () => ({ patchPackageName: mocks.patchPackageName }));

import { buildApk, ICON_PATHS } from "./build";

const identity: Identity = {
  key: {} as CryptoKey,
  certDer: new Uint8Array([1]),
  publicKeySpki: new Uint8Array([2]),
  backup: new Uint8Array([3]),
  modulusLength: 2048,
  createdAt: 0,
};

function zipEntry(name: string, data = new Uint8Array([1])): ZipEntry {
  return {
    name,
    method: 0,
    crc: 0,
    compressed: data,
    data,
    localOffset: 0,
    dataOffset: 0,
  };
}

function entries(names: string[], withIcons = true): ZipEntry[] {
  const base = [
    zipEntry("META-INF/CERT.RSA"),
    zipEntry("AndroidManifest.xml"),
    zipEntry("resources.arsc"),
    zipEntry("assets/config.json"),
  ];
  if (withIcons) {
    for (const path of ICON_PATHS) {
      base.push(zipEntry(path));
    }
  }
  return base.filter((entry) => names.includes(entry.name) || entry.name.startsWith("META-INF/"));
}

function archive(list: ZipEntry[]): ZipArchive {
  return {
    entries: list,
    cdOffset: 0,
    eocdOffset: 0,
    eocdLength: 0,
  };
}

function icons(): Map<string, Uint8Array> {
  return new Map(ICON_PATHS.map((path) => [path, new Uint8Array([1])]));
}

const input = {
  template: new Uint8Array([1]),
  packageName: "com.example.testapp",
  label: "Test App",
  versionCode: 1,
  url: "https://example.com/",
  name: "Example",
  identity,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readZip.mockReturnValue(
    archive(entries([...ICON_PATHS, "AndroidManifest.xml", "resources.arsc", "assets/config.json"])),
  );
  mocks.writeZip.mockReturnValue({
    bytes: new Uint8Array([7]),
    cdOffset: 0,
    eocdOffset: 0,
  } satisfies WrittenZip);
  mocks.signApk.mockResolvedValue(new Uint8Array([9]));
});

describe("buildApk validation", () => {
  it("rejects an invalid package name", async () => {
    await expect(
      buildApk({ ...input, packageName: "Bad", icons: icons() }),
    ).rejects.toThrow("does not fit the template");
    await expect(
      buildApk({
        ...input,
        packageName: `com.${"a".repeat(124)}`,
        icons: icons(),
      }),
    ).rejects.toThrow("does not fit the template");
  });

  it("rejects an invalid version code", async () => {
    for (const versionCode of [0, 1.5, 2_100_000_001]) {
      await expect(
        buildApk({ ...input, versionCode, icons: icons() }),
      ).rejects.toThrow("out of range");
    }
  });

  it("rejects a template without a manifest", async () => {
    mocks.readZip.mockReturnValue(archive([]));
    await expect(buildApk({ ...input, icons: icons() })).rejects.toThrow(
      "missing AndroidManifest.xml",
    );
  });

  it("rejects a template without resources.arsc", async () => {
    mocks.readZip.mockReturnValue(archive(entries(["AndroidManifest.xml"])));
    await expect(buildApk({ ...input, icons: icons() })).rejects.toThrow(
      "missing resources.arsc",
    );
  });

  it("rejects a template without assets/config.json", async () => {
    mocks.readZip.mockReturnValue(
      archive(entries(["AndroidManifest.xml", "resources.arsc"])),
    );
    await expect(buildApk({ ...input, icons: icons() })).rejects.toThrow(
      "missing assets/config.json",
    );
  });

  it("rejects a template without an icon entry", async () => {
    mocks.readZip.mockReturnValue(
      archive(
        entries([
          "AndroidManifest.xml",
          "resources.arsc",
          "assets/config.json",
          ...ICON_PATHS.slice(1),
        ]),
      ),
    );
    await expect(buildApk({ ...input, icons: icons() })).rejects.toThrow(
      "missing",
    );
  });

  it("rejects a missing generated icon", async () => {
    const missing = icons();
    missing.delete(ICON_PATHS[0]);
    await expect(buildApk({ ...input, icons: missing })).rejects.toThrow(
      "No icon layer was generated",
    );
  });
});

describe("buildApk success", () => {
  it("patches the entries, drops META-INF and signs", async () => {
    const result = await buildApk({ ...input, icons: icons() });
    expect(result).toEqual(new Uint8Array([9]));
    expect(mocks.patchManifest).toHaveBeenCalled();
    expect(mocks.patchPackageName).toHaveBeenCalled();
    expect(mocks.signApk).toHaveBeenCalled();
    const written = mocks.writeZip.mock.calls[0][0] as PendingEntry[];
    expect(written.some((entry) => entry.name.startsWith("META-INF/"))).toBe(
      false,
    );
    const config = JSON.parse(
      new TextDecoder().decode(
        written.find((entry) => entry.name === "assets/config.json")!.data,
      ),
    );
    expect(config).toEqual({
      url: "https://example.com/",
      name: "Example",
      allowExternalLinks: false,
      userAgentSuffix: null,
      themeColor: null,
    });
  });
});
