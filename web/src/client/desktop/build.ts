import { buildAppImage } from "./appimage";
import type {
  DesktopArch,
  DesktopArtifact,
  DesktopConfig,
} from "./config";
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

export function buildDesktopArtifact(
  request: DesktopBuildRequest,
): DesktopBuildResult {
  const { config, icon, artifact, arch, base } = request;
  switch (artifact) {
    case "windows-portable": {
      const shell = patchWindowsExe(base, config, icon);
      const bundle = buildWindowsPortable(config, icon, shell, arch);
      return { bytes: bundle.archive, filename: bundle.filename };
    }
    case "windows-setup": {
      const bundle = buildWindowsInstaller(config, icon, base, arch);
      return { bytes: bundle.bytes, filename: bundle.filename };
    }
    case "linux-tar": {
      const bundle = buildLinuxBundle(config, icon, base, arch);
      return { bytes: bundle.archive, filename: bundle.filename };
    }
    case "linux-appimage": {
      const bundle = buildAppImage(config, icon, base, arch, "lite");
      return { bytes: bundle.bytes, filename: bundle.filename };
    }
    case "linux-appimage-full": {
      const bundle = buildAppImage(config, icon, base, arch, "full");
      return { bytes: bundle.bytes, filename: bundle.filename };
    }
  }
}
