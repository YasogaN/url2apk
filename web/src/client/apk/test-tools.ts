import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const BUILD_TOOLS_VERSION = "36.0.0";

/**
 * Find an Android build-tools binary without assuming a machine-specific SDK.
 * Explicit env vars win, then $ANDROID_HOME/$ANDROID_SDK_ROOT, then PATH.
 */
export function findAndroidTool(
  envName: string,
  binary: string,
): string | undefined {
  const explicit = process.env[envName];
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }

  const extensions =
    process.platform === "win32" ? [".exe", ".bat", ""] : [""];
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const roots =
    sdk === undefined ? [] : [join(sdk, "build-tools", BUILD_TOOLS_VERSION)];
  roots.push(...(process.env.PATH ?? "").split(delimiter).filter(Boolean));

  for (const root of roots) {
    for (const extension of extensions) {
      const candidate = join(root, `${binary}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}
