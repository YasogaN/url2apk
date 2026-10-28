import { buildAppImage } from "./appimage";
import type {
  DesktopArch,
  DesktopArtifact,
  DesktopConfig,
} from "./config";
import { buildFlatpak } from "./flatpak";
import { buildWindowsInstaller } from "./installer";
import { buildLinuxBundle } from "./linux";
import { patchWindowsExe } from "./pe";
import { buildWindowsPortable } from "./windows";

export type DesktopBuildRequest = {
  config: DesktopConfig;
  icon: Uint8Array;
  artifact: DesktopArtifact;
  arch: DesktopArch;
  base: Uint8Array;
};

export type DesktopBuildResult = {
  bytes: Uint8Array;
  filename: string;
};

export async function buildDesktopArtifact(
  request: DesktopBuildRequest,
): Promise<DesktopBuildResult> {
  const { config, icon, artifact, arch, base } = request;
  switch (artifact) {
    case "windows-portable": {
      const shell = patchWindowsExe(base, config, icon);
      const bundle = buildWindowsPortable(config, icon, shell, arch);
      return { bytes: bundle.archive, filename: bundle.filename };
    }
    case "windows-setup-user":
    case "windows-setup-system": {
      const bundle = buildWindowsInstaller(config, icon, base, arch);
      return { bytes: bundle.bytes, filename: bundle.filename };
    }
    case "linux-tar": {
      const bundle = buildLinuxBundle(config, icon, base, arch);
      return { bytes: bundle.archive, filename: bundle.filename };
    }
    case "linux-appimage": {
      const bundle = buildAppImage(config, icon, base, arch);
      return { bytes: bundle.bytes, filename: bundle.filename };
    }
    case "linux-flatpak":
      return buildFlatpak(config, icon, base, arch, { format: "bundle" });
    case "linux-flatpak-oci":
      return buildFlatpak(config, icon, base, arch, { format: "oci" });
  }
}
