import { patchManifest } from "./axml";
import { patchPackageName } from "./arsc";
import { signApk, type SigningMaterial } from "./sign";
import { readZip, writeZip, type PendingEntry } from "./zip";

const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const PACKAGE_MAX_LENGTH = 127;

export const ICON_PATHS = [
  "res/drawable-nodpi-v4/ic_launcher_background.png",
  "res/drawable-nodpi-v4/ic_launcher_foreground.png",
  "res/drawable-nodpi-v4/ic_launcher_monochrome.png",
  "res/mipmap-mdpi-v4/ic_launcher.png",
  "res/mipmap-mdpi-v4/ic_launcher_round.png",
  "res/mipmap-hdpi-v4/ic_launcher.png",
  "res/mipmap-hdpi-v4/ic_launcher_round.png",
  "res/mipmap-xhdpi-v4/ic_launcher.png",
  "res/mipmap-xhdpi-v4/ic_launcher_round.png",
  "res/mipmap-xxhdpi-v4/ic_launcher.png",
  "res/mipmap-xxhdpi-v4/ic_launcher_round.png",
  "res/mipmap-xxxhdpi-v4/ic_launcher.png",
  "res/mipmap-xxxhdpi-v4/ic_launcher_round.png",
] as const;

export type BuildInput = {
  template: Uint8Array;
  packageName: string;
  label: string;
  versionCode: number;
  url: string;
  name: string;
  icons: Map<string, Uint8Array>;
  identity: SigningMaterial;
};

export async function buildApk(input: BuildInput): Promise<Uint8Array> {
  if (
    input.packageName.length > PACKAGE_MAX_LENGTH ||
    !PACKAGE_NAME.test(input.packageName)
  ) {
    throw new Error("That package name does not fit the template.");
  }
  if (
    !Number.isInteger(input.versionCode) ||
    input.versionCode < 1 ||
    input.versionCode > 2_100_000_000
  ) {
    throw new Error("That version code is out of range.");
  }

  const archive = readZip(input.template);
  const entries: PendingEntry[] = archive.entries
    .filter((entry) => !entry.name.startsWith("META-INF/"))
    .map((entry) => ({ name: entry.name, data: entry.data.slice() }));
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const manifest = byName.get("AndroidManifest.xml");
  if (manifest === undefined) {
    throw new Error("The template is missing AndroidManifest.xml.");
  }
  patchManifest(manifest.data, {
    packageName: input.packageName,
    label: input.label,
    versionCode: input.versionCode,
  });

  const arsc = byName.get("resources.arsc");
  if (arsc === undefined) {
    throw new Error("The template is missing resources.arsc.");
  }
  patchPackageName(arsc.data, input.packageName);

  const config = byName.get("assets/config.json");
  if (config === undefined) {
    throw new Error("The template is missing assets/config.json.");
  }
  config.data = new TextEncoder().encode(
    JSON.stringify({
      url: input.url,
      name: input.name,
      allowExternalLinks: false,
      userAgentSuffix: null,
      themeColor: null,
    }),
  );

  for (const path of ICON_PATHS) {
    const entry = byName.get(path);
    const data = input.icons.get(path);
    if (entry === undefined) {
      throw new Error(`The template is missing ${path}.`);
    }
    if (data === undefined) {
      throw new Error(`No icon layer was generated for ${path}.`);
    }
    entry.data = data;
  }

  return signApk(writeZip(entries), input.identity);
}
