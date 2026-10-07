/**
 * **사장님이 보낸 사진을 모방 재료로 앉힌다** (228회차 10-03).
 *   npx tsx engine/tools/사진받기.mts <폴더|파일...> [--이름 <꾸러미>]
 *
 * 하는 일은 둘뿐이다: **차례대로 번호를 붙이고**, **가로 640 으로 줄인다.**
 *
 * 왜 줄이나 — 폰 사진은 한 장이 2천 토큰이 넘는다. 16장이면 4만 토큰이고,
 * 그만큼이 **한 판 값**으로 그대로 나간다. 640 이면 UI 글자는 그대로 읽히는데 값은 절반이다.
 * 왜 번호를 붙이나 — 모방은 **차례**를 증거로 쓴다. 파일 이름이 섞이면 차례가 증거가 아니게 된다.
 */
import sharp from "sharp";
import { readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const i이름 = process.argv.indexOf("--이름");
const 꾸러미 = i이름 > 0 ? process.argv[i이름 + 1] : "사진";
// 이름 **값**까지 걸러야 한다 — 안 그러면 꾸러미 이름을 사진 파일로 알고 찾으러 간다(10-03 에 겪음).
const 들어온것 = process.argv.slice(2).filter((a, i) => !a.startsWith("--") && i + 2 !== i이름 + 1);
const 나올칸 = `C:/Users/az518/Desktop/로키-게임모방/${꾸러미}`;

const 그림인가 = (f: string) => /\.(png|jpe?g|webp)$/i.test(f);
const 파일들: string[] = [];
for (const a of 들어온것) {
  if (!statSync(a).isDirectory()) { if (그림인가(a)) 파일들.push(a); continue; }
  for (const f of readdirSync(a).filter(그림인가).sort()) 파일들.push(join(a, f));
}
if (!파일들.length) { console.error("그림 파일을 못 찾았다"); process.exit(1); }

rmSync(나올칸, { recursive: true, force: true });
mkdirSync(나올칸, { recursive: true });

let n = 0;
for (const f of 파일들) {
  const 나올곳 = `${나올칸}/${String(++n).padStart(2, "0")}.jpg`;
  const 잰것 = await sharp(f).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(나올곳);
  console.log(`${String(n).padStart(2, "0")}  ${f.split(/[\\/]/).pop()}  →  ${잰것.width}×${잰것.height}`);
}
console.log(`\n${n}장 → ${나올칸}`);
