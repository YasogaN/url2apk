import { describe, expect, it } from "vitest";
import { buildApk } from "./apk/build";
import { renderIconLayers } from "./apk/icons";
import * as keys from "./apk/keys";
import { buildDesktopArtifact } from "./desktop/build";
import { repackAppImage } from "./desktop/appimage-repack";
import {
  fetchBase,
  findBase,
  formatBytes,
  loadManifest,
  needsConfirmation,
} from "./desktop/manifest";
import { loadAndroidModules, loadDesktopModules, loadKeys } from "./lazy";
import { loadShell } from "./shell-cache";

describe("lazy modules", () => {
  it("loads the key module", async () => {
    const modules = await loadKeys();
    expect(modules.createIdentity).toBe(keys.createIdentity);
    expect(modules.loadIdentity).toBe(keys.loadIdentity);
  });

  it("loads the Android modules", async () => {
    const modules = await loadAndroidModules();
    expect(modules).toEqual({ buildApk, renderIconLayers, loadShell });
  });

  it("loads the desktop modules", async () => {
    const modules = await loadDesktopModules();
    expect(modules).toEqual({
      buildDesktopArtifact,
      repackAppImage,
      fetchBase,
      findBase,
      formatBytes,
      loadManifest,
      needsConfirmation,
    });
  });
});
