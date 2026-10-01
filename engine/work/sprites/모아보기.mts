/** 뽑은 도트 여섯 장을 한 장으로 모아 본다 (228회차 10-01). 값 0. */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const 키들 = ["enemy_weak", "enemy_fast", "enemy_tank", "tower_arrow", "tower_cannon", "tower_frost"];
const 이름 = ["약한 적", "빠른 적", "튼튼한 적", "화살 타워", "대포 타워", "얼음 타워"];
const 칸 = 200, 글칸 = 34, 열 = 3;   // 한 장이 48×48 이고 다 같은 배율이라, 덩치 차이와 바닥선이 그대로 보인다
const 행 = Math.ceil(키들.length / 열);
const W = 칸 * 열, H = (칸 + 글칸) * 행;

const 장들 = await Promise.all(키들.map((k) =>
  sharp(`engine/work/sprites/png/${k}.png`).resize((칸 - 24), (칸 - 24), { kernel: "nearest" }).toBuffer()));

const 글 = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
  키들.map((k, i) => {
    const x = 칸 * (i % 열) + 칸 / 2, y = (칸 + 글칸) * Math.floor(i / 열) + 칸 + 22;
    return `<text x="${x}" y="${y}" font-family="Malgun Gothic" font-size="19" font-weight="700" fill="#e8eef6" text-anchor="middle">${이름[i]}</text>` +
      `<text x="${x}" y="${y + 1}" font-family="Malgun Gothic" font-size="0" fill="#000">${k}</text>`;
  }).join("") + "</svg>";

const 판 = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 24, g: 33, b: 48, alpha: 1 } } })
  .composite([
    ...장들.map((b, i) => ({ input: b, left: 칸 * (i % 열) + 12, top: (칸 + 글칸) * Math.floor(i / 열) + 12 })),
    { input: Buffer.from(글), top: 0, left: 0 },
  ]).png().toBuffer();

writeFileSync("C:/Users/az518/Desktop/로키-도트조각/_모아보기.png", 판);
console.log("→ C:/Users/az518/Desktop/로키-도트조각/_모아보기.png");
