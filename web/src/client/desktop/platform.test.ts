import { describe, expect, it } from "vitest";
import { detectArch, detectHost, primaryTarget } from "./platform";

describe("detectHost", () => {
  it("recognizes Android before Linux", () => {
    expect(
      detectHost(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
        "Linux armv8l",
      ),
    ).toBe("android");
  });

  it("treats iOS as macOS for desktop purposes", () => {
    expect(detectHost("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mac");
    expect(detectHost("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("mac");
    expect(detectHost("Mozilla/5.0 (iPod touch)")).toBe("mac");
  });

  it("detects Windows from the agent or platform", () => {
    expect(detectHost("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "windows",
    );
    expect(detectHost("custom", "Win32")).toBe("windows");
  });

  it("detects macOS from the agent or platform", () => {
    expect(detectHost("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe(
      "mac",
    );
    expect(detectHost("custom", "MacIntel")).toBe("mac");
  });

  it("detects Linux from the agent or platform", () => {
    expect(detectHost("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(detectHost("custom", "Linux x86_64")).toBe("linux");
  });

  it("falls back to other", () => {
    expect(detectHost("custom", "unknown")).toBe("other");
  });
});

describe("primaryTarget", () => {
  it("maps desktop hosts and defaults to Android", () => {
    expect(primaryTarget("windows")).toBe("windows");
    expect(primaryTarget("linux")).toBe("linux");
    expect(primaryTarget("android")).toBe("android");
    expect(primaryTarget("mac")).toBe("android");
    expect(primaryTarget("other")).toBe("android");
  });
});

describe("detectArch", () => {
  it("uses the high-entropy architecture when available", () => {
    expect(detectArch("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "arm")).toBe(
      "arm64",
    );
  });

  it("falls back to the user agent", () => {
    expect(detectArch("Mozilla/5.0 (X11; Linux aarch64)")).toBe("arm64");
    expect(detectArch("Mozilla/5.0 (Windows NT 10.0; ARM64)")).toBe("arm64");
  });

  it("defaults to x64", () => {
    expect(detectArch("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "x86")).toBe(
      "x64",
    );
    expect(detectArch("Mozilla/5.0 (X11; Linux x86_64)")).toBe("x64");
  });
});
