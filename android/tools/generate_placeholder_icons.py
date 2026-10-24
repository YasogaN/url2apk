#!/usr/bin/env python3
"""Generate the neutral placeholder launcher icons for the shell template.

These are deliberately generic. The web generator replaces every PNG in the
template with artwork derived from the user's upload or letter avatar, so this
script exists to keep the checked-in template reproducible.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "app" / "src" / "main" / "res"

INK = (16, 16, 16, 255)
PAPER = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def draw_globe(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, width: int) -> None:
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=PAPER, width=width)
    draw.line((cx - r, cy, cx + r, cy), fill=PAPER, width=width)
    draw.ellipse((cx - r * 0.42, cy - r, cx + r * 0.42, cy + r), outline=PAPER, width=width)


def foreground(size: int = 432) -> Image.Image:
    image = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(image)
    # 108dp adaptive canvas, 72dp safe zone. Keep the mark inside the safe zone.
    draw_globe(draw, size / 2, size / 2, size * 0.25, max(4, size // 20))
    return image


def background(size: int = 432) -> Image.Image:
    return Image.new("RGBA", (size, size), INK)


def legacy(size: int, round_icon: bool) -> Image.Image:
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    pad = size * scale * 0.04
    box = (pad, pad, size * scale - pad, size * scale - pad)
    if round_icon:
        draw.ellipse(box, fill=INK)
    else:
        draw.rounded_rectangle(box, radius=size * scale * 0.22, fill=INK)
    draw_globe(
        draw,
        size * scale / 2,
        size * scale / 2,
        size * scale * 0.26,
        max(2, int(size * scale * 0.045)),
    )
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    (RES / "drawable-nodpi").mkdir(parents=True, exist_ok=True)
    background().save(RES / "drawable-nodpi" / "ic_launcher_background.png")
    foreground().save(RES / "drawable-nodpi" / "ic_launcher_foreground.png")
    foreground().save(RES / "drawable-nodpi" / "ic_launcher_monochrome.png")

    for density, size in DENSITIES.items():
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        legacy(size, round_icon=False).save(directory / "ic_launcher.png")
        legacy(size, round_icon=True).save(directory / "ic_launcher_round.png")


if __name__ == "__main__":
    main()
