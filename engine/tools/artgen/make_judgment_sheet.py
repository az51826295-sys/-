"""오디션 심사 시트: 결과물 전부를 최근접 확대해 한 장으로."""

import glob
import os

from PIL import Image

SRC = os.path.join("audition", "pixellab")
SCALE = 6
PAD = 24
BG = (34, 32, 38)


def up(path, scale=SCALE):
    img = Image.open(path).convert("RGBA")
    return img.resize((img.width * scale, img.height * scale),
                      Image.NEAREST)


def main():
    icon = up(os.path.join(SRC, "icon_0.png"))
    dirs = [up(os.path.join(SRC, f"merchant_{d}.png"))
            for d in ("south", "west", "east", "north")]
    tiles = [up(p, 4) for p in sorted(
        glob.glob(os.path.join(SRC, "tileset_*.png")))]

    row1_h = max(icon.height, dirs[0].height)
    row1_w = icon.width + PAD + sum(d.width + PAD for d in dirs)
    tcols = 8
    tile_w = tiles[0].width
    tile_h = tiles[0].height
    trows = (len(tiles) + tcols - 1) // tcols
    row2_w = tcols * (tile_w + 4)
    row2_h = trows * (tile_h + 4)

    W = max(row1_w, row2_w) + PAD * 2
    H = PAD + row1_h + PAD * 2 + row2_h + PAD
    sheet = Image.new("RGBA", (W, H), BG + (255,))

    x = PAD
    sheet.alpha_composite(icon, (x, PAD + (row1_h - icon.height) // 2))
    x += icon.width + PAD
    for d in dirs:
        sheet.alpha_composite(d, (x, PAD + (row1_h - d.height) // 2))
        x += d.width + PAD

    y0 = PAD + row1_h + PAD * 2
    for i, t in enumerate(tiles):
        r, c = divmod(i, tcols)
        sheet.alpha_composite(t, (PAD + c * (tile_w + 4),
                                  y0 + r * (tile_h + 4)))

    out = os.path.join(SRC, "judgment_sheet.png")
    sheet.convert("RGB").save(out)
    print("저장:", out, sheet.size)


if __name__ == "__main__":
    main()
