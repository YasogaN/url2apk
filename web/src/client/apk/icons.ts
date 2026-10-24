import { initials } from "../domain";
import { ICON_PATHS } from "./build";

type Palette = { ink: string; paper: string };

const DENSITIES = [48, 72, 96, 144, 192] as const;

export async function renderIconLayers(
  source: HTMLImageElement | null,
  name: string,
): Promise<Map<string, Uint8Array>> {
  const colors = readPalette();
  const letter = initials(name);
  const usable = source !== null && (source.naturalWidth || source.width) > 0;

  const background = canvas(432);
  const foreground = canvas(432);
  const monochrome = canvas(432);

  if (usable) {
    cover(background, source, colors.paper);
    letterTile(monochrome, letter, "#ffffff");
  } else {
    fill(background, colors.ink);
    letterTile(foreground, letter, colors.paper);
    letterTile(monochrome, letter, "#ffffff");
  }

  const layers = new Map<string, Uint8Array>();
  layers.set(ICON_PATHS[0], await toPng(background));
  layers.set(ICON_PATHS[1], await toPng(foreground));
  layers.set(ICON_PATHS[2], await toPng(monochrome));

  for (const [index, size] of DENSITIES.entries()) {
    const square = canvas(size);
    const round = canvas(size);
    if (usable) {
      masked(square, size, false, () => cover(square, source, colors.paper));
      masked(round, size, true, () => cover(round, source, colors.paper));
    } else {
      masked(square, size, false, () => {
        fill(square, colors.ink);
        letterTile(square, letter, colors.paper);
      });
      masked(round, size, true, () => {
        fill(round, colors.ink);
        letterTile(round, letter, colors.paper);
      });
    }
    layers.set(ICON_PATHS[3 + index * 2], await toPng(square));
    layers.set(ICON_PATHS[4 + index * 2], await toPng(round));
  }

  return layers;
}

function canvas(size: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = size;
  element.height = size;
  return element;
}

function context(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = element.getContext("2d");
  if (ctx === null) {
    throw new Error("Canvas is not available.");
  }
  return ctx;
}

function fill(element: HTMLCanvasElement, color: string): void {
  const ctx = context(element);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, element.width, element.height);
}

function letterTile(
  element: HTMLCanvasElement,
  letter: string,
  color: string,
): void {
  const ctx = context(element);
  const size = element.width;
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(size * 0.36)}px ${window.getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, size / 2, size * 0.52);
}

function cover(
  element: HTMLCanvasElement,
  image: HTMLImageElement,
  background: string,
): void {
  const ctx = context(element);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.max(element.width / width, element.height / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  fill(element, background);
  ctx.drawImage(
    image,
    (element.width - drawWidth) / 2,
    (element.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function masked(
  element: HTMLCanvasElement,
  size: number,
  round: boolean,
  draw: () => void,
): void {
  const ctx = context(element);
  ctx.save();
  if (round) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    const radius = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(size, 0, size, size, radius);
    ctx.arcTo(size, size, 0, size, radius);
    ctx.arcTo(0, size, 0, 0, radius);
    ctx.arcTo(0, 0, size, 0, radius);
    ctx.closePath();
    ctx.clip();
  }
  draw();
  ctx.restore();
}

function readPalette(): Palette {
  const styles = window.getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue("--color-ink").trim() || "#0c0c0b",
    paper: styles.getPropertyValue("--color-paper").trim() || "#f3f2ee",
  };
}

function toPng(element: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    element.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("The icon could not be encoded."));
        return;
      }
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        reject,
      );
    }, "image/png");
  });
}
