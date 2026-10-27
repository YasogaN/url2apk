import type { DesktopConfig } from "./config";

const WASM_MODULE_URL = "/wasm/url2app_appimage_repack.js";

export type AppImageRepacker = {
  default: () => Promise<unknown>;
  repack(
    squashfs: Uint8Array,
    desktop: Uint8Array,
    icon: Uint8Array,
  ): Uint8Array;
};

export type RepackOptions = {
  load?: () => Promise<AppImageRepacker>;
};

/* v8 ignore start -- the browser loader is exercised by the wasm integration check */
let modulePromise: Promise<AppImageRepacker> | null = null;

export function loadAppImageRepacker(): Promise<AppImageRepacker> {
  modulePromise ??= import(/* @vite-ignore */ WASM_MODULE_URL).then(
    async (module) => {
      const repacker = module as AppImageRepacker;
      await repacker.default();
      return repacker;
    },
  );
  return modulePromise;
}
/* v8 ignore stop */

export function appImageDesktopEntry(config: DesktopConfig): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${config.name}`,
    `Comment=Open ${config.url}`,
    "Exec=shell",
    "Icon=url2app-shell",
    "Terminal=false",
    "Categories=Utility;",
    "StartupWMClass=shell",
    "",
  ].join("\n");
}

export async function repackAppImage(
  image: Uint8Array,
  squashfsOffset: number,
  config: DesktopConfig,
  icon: Uint8Array,
  options: RepackOptions = {},
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(squashfsOffset) ||
    squashfsOffset <= 0 ||
    squashfsOffset >= image.length
  ) {
    throw new Error("The AppImage filesystem offset is invalid.");
  }
  /* v8 ignore next -- exercised by the wasm integration check */
  const repacker = await (options.load ?? loadAppImageRepacker)();
  const replacement = repacker.repack(
    image.subarray(squashfsOffset),
    new TextEncoder().encode(appImageDesktopEntry(config)),
    icon,
  );
  if (replacement.length === 0) {
    throw new Error("The AppImage repacker returned an empty image.");
  }
  const output = new Uint8Array(squashfsOffset + replacement.length);
  output.set(image.subarray(0, squashfsOffset));
  output.set(replacement, squashfsOffset);
  return output;
}
