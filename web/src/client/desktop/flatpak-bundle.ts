export type FlatpakBundleWriter = {
  default: () => Promise<unknown>;
  build_flatpak: (
    tar: Uint8Array,
    refName: string,
    timestamp: number,
  ) => Uint8Array;
};

const WASM_MODULE_URL = "/wasm/url2app_flatpak_bundle.js";

/* v8 ignore start -- the browser loader is exercised by the wasm integration check */
let modulePromise: Promise<FlatpakBundleWriter> | null = null;

export function loadFlatpakBundleWriter(): Promise<FlatpakBundleWriter> {
  modulePromise ??= import(/* @vite-ignore */ WASM_MODULE_URL).then(
    async (module) => {
      const writer = module as FlatpakBundleWriter;
      await writer.default();
      return writer;
    },
  );
  return modulePromise;
}
/* v8 ignore stop */
