// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadImage, paintImage, paintLetter } from "./paint";

type FakeContext = {
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
};

let context: FakeContext;

function fakeContext(): FakeContext {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  };
}

beforeEach(() => {
  context = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("paintLetter", () => {
  it("draws the letter on the canvas", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    paintLetter(canvas, "A");
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context.fillText).toHaveBeenCalledWith("A", 128, 138.24);
    expect(context.font).toContain("600");
  });

  it("uses palette values when present", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) =>
        name === "--color-ink" ? "#111111" : "#eeeeee",
      fontFamily: "Test Mono",
    } as unknown as CSSStyleDeclaration);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    paintLetter(canvas, "B");
    expect(context.fillText).toHaveBeenCalledWith("B", 128, 138.24);
  });

  it("does nothing without a 2D context", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(
      null,
    );
    const canvas = document.createElement("canvas");
    expect(() => paintLetter(canvas, "C")).not.toThrow();
    expect(context.fillText).not.toHaveBeenCalled();
  });
});

describe("paintImage", () => {
  it("draws an image", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const image = {
      naturalWidth: 100,
      naturalHeight: 50,
      width: 0,
      height: 0,
    } as unknown as HTMLImageElement;
    expect(paintImage(canvas, image)).toBe(true);
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("rejects images with no dimensions", () => {
    const canvas = document.createElement("canvas");
    const noWidth = {
      naturalWidth: 0,
      naturalHeight: 10,
      width: 0,
      height: 10,
    } as unknown as HTMLImageElement;
    const noHeight = {
      naturalWidth: 10,
      naturalHeight: 0,
      width: 10,
      height: 0,
    } as unknown as HTMLImageElement;
    expect(paintImage(canvas, noWidth)).toBe(false);
    expect(paintImage(canvas, noHeight)).toBe(false);
  });

  it("returns false without a 2D context", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(
      null,
    );
    const canvas = document.createElement("canvas");
    const image = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
    expect(paintImage(canvas, image)).toBe(false);
  });
});

describe("loadImage", () => {
  class FakeImage {
    decoding = "";
    naturalWidth = 10;
    naturalHeight = 10;
    width = 10;
    height = 10;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      queueMicrotask(() => {
        if (value === "ok") {
          this.onload?.();
        } else {
          this.onerror?.();
        }
      });
    }
  }

  it("resolves a loaded image", async () => {
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    await expect(loadImage("ok")).resolves.toBeInstanceOf(FakeImage);
  });

  it("rejects a failed image", async () => {
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    await expect(loadImage("bad")).rejects.toThrow(
      "That image could not be read.",
    );
  });
});
