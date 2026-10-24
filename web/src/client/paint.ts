type Palette = {
  ink: string;
  paper: string;
};

function readPalette(): Palette {
  const styles = window.getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue("--color-ink").trim() || "#0c0c0b",
    paper: styles.getPropertyValue("--color-paper").trim() || "#f3f2ee",
  };
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext("2d");
}

export function paintLetter(canvas: HTMLCanvasElement, letter: string): void {
  const ctx = context(canvas);
  if (ctx === null) {
    return;
  }
  const { ink, paper } = readPalette();
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = paper;
  ctx.font = `600 ${Math.round(size * 0.46)}px ${window.getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, size / 2, size * 0.54);
}

export function paintImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): boolean {
  const ctx = context(canvas);
  if (ctx === null) {
    return false;
  }
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return false;
  }
  const { paper } = readPalette();
  const size = canvas.width;
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return true;
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = source;
  });
}
