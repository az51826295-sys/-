import sharp from "sharp";
const W = 1200, H = 630;
const pic = await sharp("C:/Users/az518/Desktop/두근도트-스레드/realdot/taeo-closeup-eye.png").resize({ height: 470 }).png().toBuffer();
const pm = await sharp(pic).metadata();
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#16161c"/>
<text x="40" y="78" font-family="Malgun Gothic" font-size="52" font-weight="bold" fill="#ffffff">진짜 도트 변환</text>
<text x="40" y="122" font-family="Malgun Gothic" font-size="28" fill="#b9b9c6">AI가 뽑은 도트 그림을 한 칸 = 한 색으로 · 미리보기 무료</text></svg>`;
await sharp(Buffer.from(svg)).composite([{ input: pic, left: Math.round((W - pm.width!) / 2), top: H - pm.height! - 24 }]).png().toFile("public/pixel-og.png");
console.log(pm.width, pm.height);
