/**
 * **뽑은 아이콘을 게임에 넣는다** (10-10 사장님 시안).
 *   npx tsx engine/tools/ash_아이콘넣기.mts
 * 격자에서 자른 칸을 **뜻 있는 이름**으로 옮긴다. 이름이 코드와 같아야 찾아 쓴다.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const 뿌리 = "C:/Users/az518/Desktop/로키-도트/아이콘";
const 칸 = "public/ash/art/icon";
mkdirSync(칸, { recursive: true });

const 짝: Record<string, string> = {
  "탭-1": "t-hall", "탭-2": "t-crew", "탭-3": "t-run", "탭-4": "t-forge", "탭-5": "t-shop", "탭-6": "t-bag",
  "서브-1": "s-gear", "서브-2": "s-grow", "서브-3": "s-skill", "서브-4": "s-scroll",
  "재료-1": "m-파편", "재료-2": "m-잔혼", "재료-3": "m-수호핵", "재료-4": "m-가죽",
  "재료-5": "m-강철", "재료-6": "m-이빨", "재료-7": "m-거인뼈", "재료-8": "m-별가루",
  "갈래-1": "c-shop", "갈래-2": "c-sell", "갈래-3": "c-upgrade", "갈래-4": "c-craft",
  "물건-1": "i-철검", "물건-2": "i-대검", "물건-3": "i-엄니검", "물건-4": "i-지팡이",
  "물건-5": "i-가죽갑옷", "물건-6": "i-강철갑옷", "물건-7": "i-맹수흉갑", "물건-8": "i-약",
  /* 10-11 "그림 넣어 모든거" — 4~8구간이 생기며 그림 없이 돌던 서른 칸 */
  "재료2-1": "m-석편", "재료2-2": "m-저울추", "재료2-3": "m-독액", "재료2-4": "m-독주머니",
  "재료2-5": "m-용암결정", "재료2-6": "m-골렘핵", "재료2-7": "m-빙결정", "재료2-8": "m-눈물",
  "재료2-9": "m-심연정수", "재료2-10": "m-마안",
  "물건2-1": "i-거인검", "물건2-2": "i-거인갑옷", "물건2-3": "i-성패검", "물건2-4": "i-성소갑옷",
  "물건2-5": "i-독아검", "물건2-6": "i-늪갑옷", "물건2-7": "i-골렘검", "물건2-8": "i-골렘갑옷",
  "물건2-9": "i-핵검", "물건2-10": "i-핵갑옷", "물건2-11": "i-여왕검", "물건2-12": "i-여왕갑옷",
  "물건2-13": "i-심연검", "물건2-14": "i-심연갑옷",
  "영혼석-1": "o-폭풍", "영혼석-2": "o-혈", "영혼석-3": "o-역천",
  "영혼석-4": "o-재기", "영혼석-5": "o-별빛", "영혼석-6": "o-신속",
};
const 넣은: string[] = [];
for (const [앞, 뒤] of Object.entries(짝)) {
  try { copyFileSync(`${뿌리}/${앞}.png`, `${칸}/${뒤}.png`); 넣은.push(`icon/${뒤}`); }
  catch { console.log("없음:", 앞); }
}
const 길 = "public/ash/art/manifest.json";
const 옛 = JSON.parse(readFileSync(길, "utf8")) as string[];
const 새 = Array.from(new Set([...옛, ...넣은])).sort();
writeFileSync(길, JSON.stringify(새));
console.log(`아이콘 ${넣은.length}개 · manifest ${옛.length} → ${새.length}`);
