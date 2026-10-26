export type KeyModule = typeof import("./apk/keys");

export type AndroidModules = {
  buildApk: typeof import("./apk/build").buildApk;
  renderIconLayers: typeof import("./apk/icons").renderIconLayers;
  loadShell: typeof import("./shell-cache").loadShell;
};

export type DesktopModules = {
  buildDesktopArtifact: typeof import("./desktop/build").buildDesktopArtifact;
  repackAppImage: typeof import("./desktop/appimage-repack").repackAppImage;
  fetchBase: typeof import("./desktop/manifest").fetchBase;
  findBase: typeof import("./desktop/manifest").findBase;
  formatBytes: typeof import("./desktop/manifest").formatBytes;
  loadManifest: typeof import("./desktop/manifest").loadManifest;
  needsConfirmation: typeof import("./desktop/manifest").needsConfirmation;
};

export function loadKeys(): Promise<KeyModule> {
  return import("./apk/keys");
}

export async function loadAndroidModules(): Promise<AndroidModules> {
  const [build, icons, shell] = await Promise.all([
    import("./apk/build"),
    import("./apk/icons"),
    import("./shell-cache"),
  ]);
  return {
    buildApk: build.buildApk,
    renderIconLayers: icons.renderIconLayers,
    loadShell: shell.loadShell,
  };
}

export async function loadDesktopModules(): Promise<DesktopModules> {
  const [manifest, build, repack] = await Promise.all([
    import("./desktop/manifest"),
    import("./desktop/build"),
    import("./desktop/appimage-repack"),
  ]);
  return {
    buildDesktopArtifact: build.buildDesktopArtifact,
    repackAppImage: repack.repackAppImage,
    fetchBase: manifest.fetchBase,
    findBase: manifest.findBase,
    formatBytes: manifest.formatBytes,
    loadManifest: manifest.loadManifest,
    needsConfirmation: manifest.needsConfirmation,
  };
}
