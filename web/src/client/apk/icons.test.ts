// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixturePng } from "../../../test/helpers/binaries";
import { bufferSource } from "./bytes";
import { ICON_PATHS } from "./build";
import { renderIconLayers } from "./icons";

type FakeContext = {
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  arcTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
};

function fakeContext(): FakeContext {
  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => {
      callback(new Blob([bufferSource(fixturePng())], { type: "image/png" }));
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("renderIconLayers", () => {
  it("renders every icon path from the letter", async () => {
    const layers = await renderIconLayers(null, "Example");
    expect(layers.size).toBe(ICON_PATHS.length);
    expect([...layers.keys()]).toEqual([...ICON_PATHS]);
    for (const value of layers.values()) {
      expect(value).toEqual(fixturePng());
    }
  });

  it("renders every icon path from an image", async () => {
    const image = {
      naturalWidth: 100,
      naturalHeight: 50,
      width: 0,
      height: 0,
    } as unknown as HTMLImageElement;
    const layers = await renderIconLayers(image, "Example");
    expect(layers.size).toBe(ICON_PATHS.length);
  });

  it("uses an image width when naturalWidth is zero", async () => {
    const image = {
      naturalWidth: 0,
      naturalHeight: 0,
      width: 100,
      height: 50,
    } as unknown as HTMLImageElement;
    const layers = await renderIconLayers(image, "Example");
    expect(layers.size).toBe(ICON_PATHS.length);
  });

  it("uses the palette values when present", async () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "#123456",
      fontFamily: "Test Mono",
    } as unknown as CSSStyleDeclaration);
    const layers = await renderIconLayers(null, "Example");
    expect(layers.size).toBe(ICON_PATHS.length);
  });

  it("fails when the canvas context is unavailable", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(renderIconLayers(null, "Example")).rejects.toThrow(
      "Canvas is not available.",
    );
  });

  it("fails when the canvas encoder returns null", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => {
        callback(null);
      },
    );
    await expect(renderIconLayers(null, "Example")).rejects.toThrow(
      "The icon could not be encoded.",
    );
  });

  it("fails when the blob cannot be read", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => {
        callback({
          arrayBuffer: () => Promise.reject(new Error("boom")),
        } as unknown as Blob);
      },
    );
    await expect(renderIconLayers(null, "Example")).rejects.toThrow("boom");
  });
});
