import type { DesktopArch } from "./config";

export type HostPlatform = "android" | "windows" | "linux" | "mac" | "other";
export type PrimaryTarget = "android" | "windows" | "linux";

export function detectHost(
  userAgent: string,
  platform = "",
): HostPlatform {
  const agent = userAgent.toLowerCase();
  const plat = platform.toLowerCase();
  if (agent.includes("android")) {
    return "android";
  }
  if (
    agent.includes("iphone") ||
    agent.includes("ipad") ||
    agent.includes("ipod")
  ) {
    return "mac";
  }
  if (agent.includes("win") || plat.includes("win")) {
    return "windows";
  }
  if (agent.includes("mac") || plat.includes("mac")) {
    return "mac";
  }
  if (agent.includes("linux") || plat.includes("linux")) {
    return "linux";
  }
  return "other";
}

export function primaryTarget(host: HostPlatform): PrimaryTarget {
  switch (host) {
    case "windows":
      return "windows";
    case "linux":
      return "linux";
    default:
      return "android";
  }
}

export function detectArch(
  userAgent: string,
  highEntropyArchitecture?: string,
): DesktopArch {
  if (highEntropyArchitecture === "arm") {
    return "arm64";
  }
  if (/aarch64|arm64/i.test(userAgent)) {
    return "arm64";
  }
  return "x64";
}
