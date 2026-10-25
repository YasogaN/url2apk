import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findAndroidTool } from "./test-tools";

const temporary: string[] = [];
const original = {
  PATH: process.env.PATH,
  ANDROID_HOME: process.env.ANDROID_HOME,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
  TEST_TOOL: process.env.TEST_TOOL,
};

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "url2app-tools-"));
  temporary.push(directory);
  return directory;
}

function touch(directory: string, name: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, "");
  return path;
}

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("findAndroidTool", () => {
  it("prefers an explicit non-empty environment variable", () => {
    process.env.TEST_TOOL = "/custom/tool";
    expect(findAndroidTool("TEST_TOOL", "tool")).toBe("/custom/tool");
  });

  it("ignores an empty explicit variable", () => {
    process.env.TEST_TOOL = "";
    const root = tempDir();
    const path = touch(join(root, "build-tools", "36.0.0"), "tool");
    process.env.ANDROID_HOME = root;
    delete process.env.ANDROID_SDK_ROOT;
    expect(findAndroidTool("TEST_TOOL", "tool")).toBe(path);
  });

  it("finds the tool under ANDROID_HOME", () => {
    const root = tempDir();
    const path = touch(join(root, "build-tools", "36.0.0"), "tool");
    process.env.ANDROID_HOME = root;
    delete process.env.ANDROID_SDK_ROOT;
    expect(findAndroidTool("MISSING", "tool")).toBe(path);
  });

  it("falls back to ANDROID_SDK_ROOT", () => {
    const root = tempDir();
    const path = touch(join(root, "build-tools", "36.0.0"), "tool");
    delete process.env.ANDROID_HOME;
    process.env.ANDROID_SDK_ROOT = root;
    expect(findAndroidTool("MISSING", "tool")).toBe(path);
  });

  it("finds the tool on PATH", () => {
    const root = tempDir();
    const path = touch(root, "tool");
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    process.env.PATH = root;
    expect(findAndroidTool("MISSING", "tool")).toBe(path);
  });

  it("returns undefined when the tool is absent", () => {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    process.env.PATH = "";
    expect(findAndroidTool("MISSING", "tool")).toBeUndefined();
  });

  it("handles an undefined PATH", () => {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    delete process.env.PATH;
    expect(findAndroidTool("MISSING", "tool")).toBeUndefined();
  });

  it("continues when a candidate is absent", () => {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    process.env.PATH = tempDir();
    expect(findAndroidTool("MISSING", "tool")).toBeUndefined();
  });

  it("tries Windows extensions on win32", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const root = tempDir();
    const path = touch(root, "tool.exe");
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    process.env.PATH = root;
    expect(findAndroidTool("MISSING", "tool")).toBe(path);
  });
});
