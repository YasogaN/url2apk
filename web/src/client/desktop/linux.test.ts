import { describe, expect, it } from "vitest";
import { parseTarGz } from "../../../test/helpers/tar";
import { packageBase, type DesktopConfig } from "./config";
import { buildLinuxBundle, desktopEntryText, readmeText } from "./linux";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const base = packageBase(config);
const shell = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 9, 9, 9]);
const icon = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

describe("buildLinuxBundle", () => {
  it("builds a gzipped tar with the shell, config, icon, readme and desktop entry", () => {
    const bundle = buildLinuxBundle(config, icon, shell, "x64");
    expect(bundle.base).toBe(base);
    expect(bundle.filename).toBe(`${base}-x64.tar.gz`);

    const entries = parseTarGz(bundle.archive);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    expect([...byName.keys()]).toEqual([
      `${base}/`,
      `${base}/${base}`,
      `${base}/config.json`,
      `${base}/icon.png`,
      `${base}/README.txt`,
      `${base}/${config.id}.desktop`,
    ]);
    expect(byName.get(`${base}/`)).toMatchObject({
      type: "5",
      mode: 0o755,
    });
    expect(byName.get(`${base}/${base}`)).toMatchObject({
      type: "0",
      mode: 0o755,
    });
    expect(byName.get(`${base}/${base}`)?.data).toEqual(shell);
    expect(byName.get(`${base}/config.json`)?.mode).toBe(0o644);
    expect(
      JSON.parse(
        new TextDecoder().decode(byName.get(`${base}/config.json`)?.data),
      ),
    ).toEqual(config);
    expect(byName.get(`${base}/icon.png`)?.data).toEqual(icon);

    const readme = new TextDecoder().decode(
      byName.get(`${base}/README.txt`)?.data,
    );
    expect(readme).toContain("Example");
    expect(readme).toContain("https://example.com/");
    expect(readme).toContain(`./${base}`);
    expect(readme).toContain(config.id);

    const desktop = new TextDecoder().decode(
      byName.get(`${base}/${config.id}.desktop`)?.data,
    );
    expect(desktop).toContain("[Desktop Entry]");
    expect(desktop).toContain("Name=Example");
    expect(desktop).toContain(`Exec=${base}`);
    expect(desktop).toContain(`Icon=${config.id}`);
    expect(desktop).toContain(`StartupWMClass=${base}`);
    expect(desktop).toContain("Categories=Utility;");
  });

  it("uses the requested architecture in the filename", () => {
    expect(buildLinuxBundle(config, icon, shell, "arm64").filename).toBe(
      `${base}-arm64.tar.gz`,
    );
  });

  it("rejects an empty shell", () => {
    expect(() =>
      buildLinuxBundle(config, icon, new Uint8Array(0), "x64"),
    ).toThrow("shell is empty");
  });

  it("rejects a shell that is not ELF", () => {
    expect(() =>
      buildLinuxBundle(config, icon, new Uint8Array([0x7f]), "x64"),
    ).toThrow("not an ELF");
    expect(() =>
      buildLinuxBundle(config, icon, new Uint8Array(7).fill(1), "x64"),
    ).toThrow("not an ELF");
  });

  it("rejects an empty icon", () => {
    expect(() =>
      buildLinuxBundle(config, new Uint8Array(0), shell, "x64"),
    ).toThrow("icon is empty");
  });

  it("rejects an icon that is not PNG", () => {
    expect(() =>
      buildLinuxBundle(config, new Uint8Array([0x89]), shell, "x64"),
    ).toThrow("not a PNG");
    expect(() =>
      buildLinuxBundle(config, new Uint8Array(8).fill(1), shell, "x64"),
    ).toThrow("not a PNG");
  });
});

describe("desktop text", () => {
  it("writes the desktop entry", () => {
    expect(desktopEntryText(config, base)).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Example",
        "Comment=Open https://example.com/",
        `Exec=${base}`,
        `Icon=${config.id}`,
        "Terminal=false",
        "Categories=Utility;",
        `StartupWMClass=${base}`,
        "",
      ].join("\n"),
    );
  });

  it("writes the readme", () => {
    const readme = readmeText(config, base);
    expect(readme).toContain("Example");
    expect(readme).toContain("Run:");
    expect(readme).toContain("It does not auto-update.");
  });
});
