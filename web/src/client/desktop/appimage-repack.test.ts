import { describe, expect, it, vi } from "vitest";
import type { DesktopConfig } from "./config";
import {
  appImageDesktopEntry,
  repackAppImage,
  type AppImageRepacker,
} from "./appimage-repack";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-123456789abc",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};

function repacker(
  result: Uint8Array = new Uint8Array([7, 8]),
): AppImageRepacker & { repack: ReturnType<typeof vi.fn> } {
  return {
    default: vi.fn(async () => undefined),
    repack: vi.fn(() => result),
  } as unknown as AppImageRepacker & { repack: ReturnType<typeof vi.fn> };
}

describe("appImageDesktopEntry", () => {
  it("writes the lite entry", () => {
    expect(appImageDesktopEntry(config)).toContain("Exec=shell\n");
    expect(appImageDesktopEntry(config)).toContain(
      "StartupWMClass=shell\n",
    );
    expect(appImageDesktopEntry(config)).toContain(
      "Name=Example\n",
    );
    expect(appImageDesktopEntry(config)).toContain(
      "Comment=Open https://example.com/\n",
    );
  });

});

describe("repackAppImage", () => {
  it("replaces the squashfs and preserves the runtime", async () => {
    const module = repacker(new Uint8Array([7, 8]));
    const image = new Uint8Array([1, 2, 3, 4, 5]);
    const icon = new Uint8Array([9]);
    const output = await repackAppImage(image, 3, config, icon, {
      load: async () => module,
    });
    expect(output).toEqual(new Uint8Array([1, 2, 3, 7, 8]));
    expect(module.repack).toHaveBeenCalledWith(
      new Uint8Array([4, 5]),
      expect.any(Uint8Array),
      icon,
    );
    const desktop = module.repack.mock.calls[0][1] as Uint8Array;
    expect(new TextDecoder().decode(desktop)).toContain("Name=Example\n");
  });

  it.each([
    ["zero", 0],
    ["too large", 5],
    ["fractional", 1.5],
    ["non-finite", Number.NaN],
  ])("rejects a %s offset", async (_name, offset) => {
    await expect(
      repackAppImage(new Uint8Array([1, 2, 3]), offset, config, new Uint8Array([9])),
    ).rejects.toThrow("offset is invalid");
  });

  it("rejects an empty repack", async () => {
    const module = repacker(new Uint8Array());
    await expect(
      repackAppImage(
        new Uint8Array([1, 2, 3]),
        1,
        config,
        new Uint8Array([9]),
        { load: async () => module },
      ),
    ).rejects.toThrow("empty image");
  });

  it("propagates loader and repacker errors", async () => {
    await expect(
      repackAppImage(
        new Uint8Array([1, 2, 3]),
        1,
        config,
        new Uint8Array([9]),
        {
          load: async () => {
            throw new Error("load failed");
          },
        },
      ),
    ).rejects.toThrow("load failed");
  });
});
