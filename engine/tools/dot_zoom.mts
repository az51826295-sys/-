/** 도트를 **정수 배율**로 키워서 눈으로 본다. 줄이거나 흐리게 키우면 도트가 아니게 된다. */
import sharp from "sharp";
const f = process.argv[2];
const 배 = Number(process.argv[3] ?? 6);
const m = await sharp(f).metadata();
const 나올곳 = f.replace(/\.png$/i, `-x${배}.png`);
await sharp(f).resize((m.width ?? 64) * 배, (m.height ?? 64) * 배, { kernel: "nearest" }).png().toFile(나올곳);
console.log(`${m.width}x${m.height} → ${배}배 → ${나올곳}`);
