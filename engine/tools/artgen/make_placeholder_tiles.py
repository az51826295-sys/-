"""자리표시자 타일 아틀라스 생성 (16px 규격, 스타일 확정 전용).

진짜 아트가 아니라 맵 구조를 보기 위한 최소 타일 8종. 규격
오라클(24색·격자)을 태생부터 지키게 만든다. 스타일 확정 후 이
파일의 산출물만 교체하면 게임은 그대로 돈다.

  python tools/artgen/make_placeholder_tiles.py
  -> game/assets/tiles/atlas.png (128x16, 타일 8개 가로 배열)
"""

import os
import random

from PIL import Image

TILE = 16
OUT = os.path.join("game", "assets", "tiles", "atlas.png")

GRASS = (74, 108, 58)
GRASS_D = (62, 94, 50)
GRASS_L = (88, 122, 66)
PATH = (168, 144, 98)
PATH_D = (146, 124, 84)
WATER = (56, 96, 140)
WATER_L = (76, 120, 166)
TRUNK = (92, 64, 40)
LEAF = (46, 76, 40)
LEAF_L = (58, 92, 48)
WALL = (140, 108, 72)
WALL_D = (118, 90, 60)
ROOF = (152, 68, 56)
ROOF_D = (128, 56, 48)
DOOR = (74, 52, 34)


def tile(base):
    return Image.new("RGB", (TILE, TILE), base)


def speckle(img, color, n, rng):
    for _ in range(n):
        img.putpixel((rng.randrange(TILE), rng.randrange(TILE)), color)
    return img


def main():
    rng = random.Random(7)
    tiles = []

    tiles.append(speckle(tile(GRASS), GRASS_D, 14, rng))      # 0 풀
    tiles.append(speckle(tile(GRASS), GRASS_L, 14, rng))      # 1 풀 변형

    t = tile(PATH)                                            # 2 길
    speckle(t, PATH_D, 10, rng)
    tiles.append(t)

    t = tile(WATER)                                           # 3 물
    for y in (3, 8, 13):
        for x in range(TILE):
            if (x + y) % 4 < 2:
                t.putpixel((x, y), WATER_L)
    tiles.append(t)

    t = speckle(tile(GRASS), GRASS_D, 8, rng)                 # 4 나무
    for y in range(1, 11):
        for x in range(2, 14):
            dx, dy = x - 8, y - 6
            if dx * dx + dy * dy * 1.6 <= 30:
                t.putpixel((x, y), LEAF_L if (x + y) % 3 else LEAF)
    for y in range(11, 15):
        for x in (7, 8):
            t.putpixel((x, y), TRUNK)
    tiles.append(t)

    t = tile(WALL)                                            # 5 벽
    for x in (0, 5, 10, 15):
        for y in range(TILE):
            t.putpixel((x, y), WALL_D)
    tiles.append(t)

    t = tile(ROOF)                                            # 6 지붕
    for y in (3, 7, 11, 15):
        for x in range(TILE):
            t.putpixel((x, y), ROOF_D)
    tiles.append(t)

    t = tile(WALL)                                            # 7 문
    for x in (0, 15):
        for y in range(TILE):
            t.putpixel((x, y), WALL_D)
    for y in range(3, TILE):
        for x in range(5, 11):
            t.putpixel((x, y), DOOR)
    tiles.append(t)

    atlas = Image.new("RGB", (TILE * len(tiles), TILE))
    for i, im in enumerate(tiles):
        atlas.paste(im, (i * TILE, 0))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    colors = len(set(atlas.getdata()))
    print(f"저장: {OUT} ({atlas.size[0]}x{atlas.size[1]}, {colors}색)")


if __name__ == "__main__":
    main()
