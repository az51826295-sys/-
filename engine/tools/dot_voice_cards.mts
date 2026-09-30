/**
 * **"처음 vs 친해진 뒤" 비교 카드** (227회차 09-30). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_voice_cards.mts 후
 *
 * 경쟁 조사(09-30)가 두근도트에 **1순위로 추천한 게시물**이다:
 *   *"같은 캐릭터가 친밀도 낮을 때와 높을 때 어떻게 말하고 표정이 바뀌는지 비교하라.
 *    제타 리뷰의 최대 불만이 '성격이 오락가락' 이라, 변화가 실제로 작동한다는 걸 보여 주는 게 무기다."*
 *
 * 그래서 **지어낸 대사를 쓰지 않는다.** `dot_voice_test.mts` 가 실제 서버에서 받은 답을 그대로 올린다 —
 * 광고에 쓰는 말풍선이 진짜 앱이 한 말이어야 한다. 같은 말을 걸었으니 다른 것은 단계뿐이다.
 *
 * 어느 말을 고르나: 다섯 마디 중 **1단계와 5단계 답이 가장 다른 것**(길이 차이 + 존댓말 차이).
 * 사람이 고르면 제일 그럴듯한 것만 고르게 된다 — 기준을 먼저 정해 놓고 기계가 고른다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const 표 = process.argv[2] ?? "후";
const 자료 = JSON.parse(readFileSync(`engine/work/voice/${표}.json`, "utf8")) as {
  할말: string[];
  판들: { 캐릭터: string; 단계: number; 답: string[] }[];
};
const OUT = "C:/Users/az518/Desktop/두근도트-인스타/말투비교";
mkdirSync(OUT, { recursive: true });

const W = 1080, H = 1350;          // 인스타 피드 4:5
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 한글은 한 글자 폭이 거의 같다 — 글자 수로 접는다. */
function 접기(글: string, 한줄: number): string[] {
  const 줄: string[] = [];
  for (const 문단 of 글.split(/\n+/)) {
    let 남 = 문단.trim();
    while (남.length > 한줄) {
      let 자를곳 = 남.lastIndexOf(" ", 한줄);
      if (자를곳 < 한줄 * 0.5) 자를곳 = 한줄;
      줄.push(남.slice(0, 자를곳).trim());
      남 = 남.slice(자를곳).trim();
    }
    if (남) 줄.push(남);
  }
  return 줄;
}

/** 말풍선 하나를 SVG 조각으로. 반환: [svg, 높이]. */
function 말풍선(글: string, 내것: boolean, y: number): [string, number] {
  const 크기 = 36, 줄높이 = 50, 한줄 = 17, 안여백 = 26;
  const 줄들 = 접기(글, 한줄);
  const 가장긴 = Math.max(...줄들.map((l) => l.length));
  const bw = Math.min(760, 가장긴 * 크기 * 0.98 + 안여백 * 2);
  const bh = 줄들.length * 줄높이 + 안여백 * 1.4;
  const x = 내것 ? W - 60 - bw : 60;
  const 색 = 내것 ? "#fee500" : "#ffffff";
  const 글자 = 줄들.map((l, i) =>
    `<text x="${x + 안여백}" y="${y + 안여백 + 크기 * 0.95 + i * 줄높이}" font-family="${글꼴}" font-size="${크기}" fill="#141414">${esc(l)}</text>`).join("");
  return [`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="26" ry="26" fill="${색}" stroke="#1c1c1c" stroke-width="3"/>${글자}`, bh];
}

// 문장 끝이 존댓말인가 — 자와 같은 규칙(짧게)
const 존대비 = (a: string) => {
  const 문장 = a.split(/(?<=[.!?…])\s+|\n+/u).map((s) => s.trim().replace(/[\s.,!?~…ㅋㅎㅠㅜ헤하]+$/u, "")).filter((s) => s.length >= 2);
  if (!문장.length) return 0;
  return 문장.filter((s) => /(요|죠|까|니다)$/u.test(s)).length / 문장.length;
};

const 이름들 = [...new Set(자료.판들.map((p) => p.캐릭터))];
for (const 이름 of 이름들) {
  const 처음 = 자료.판들.find((p) => p.캐릭터 === 이름 && p.단계 === 1);
  const 나중 = 자료.판들.find((p) => p.캐릭터 === 이름 && p.단계 === 5);
  if (!처음 || !나중) { console.log(`${이름}: 1단계나 5단계 답이 없다`); continue; }

  // 가장 다른 한 마디를 고른다(실패한 답은 빼고)
  let 고른 = -1, 차이 = -1;
  for (let i = 0; i < 자료.할말.length; i++) {
    const a = 처음.답[i], b = 나중.답[i];
    if (!a || !b || a.startsWith("(실패") || b.startsWith("(실패")) continue;
    const d = Math.abs(b.length - a.length) / 10 + Math.abs(존대비(a) - 존대비(b)) * 3;
    if (d > 차이) { 차이 = d; 고른 = i; }
  }
  if (고른 < 0) { console.log(`${이름}: 쓸 답이 없다`); continue; }

  const 물음 = 자료.할말[고른];
  let svg = `<rect width="${W}" height="${H}" fill="#a5bccd"/>`;
  svg += `<text x="${W / 2}" y="92" font-family="${글꼴}" font-size="52" font-weight="800" fill="#141414" text-anchor="middle">${esc(이름)} · 같은 말, 다른 대답</text>`;
  let y = 150;
  for (const [판, 제목] of [[처음, "처음 만난 날"], [나중, "친해진 뒤"]] as const) {
    svg += `<rect x="60" y="${y}" width="${W - 120}" height="54" rx="27" fill="#141414"/>`;
    svg += `<text x="${W / 2}" y="${y + 38}" font-family="${글꼴}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${제목}</text>`;
    y += 80;
    const [a, ah] = 말풍선(물음, true, y); svg += a; y += ah + 20;
    const [b, bh] = 말풍선(판.답[고른], false, y); svg += b; y += bh + 46;
  }
  svg += `<text x="${W / 2}" y="${H - 50}" font-family="${글꼴}" font-size="30" fill="#3c434b" text-anchor="middle">실제 앱에서 받은 답 그대로 · 두근도트</text>`;

  const 넘침 = y > H - 90;
  const png = await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`)).png().toBuffer();
  const p = `${OUT}/말투비교-${이름}.png`;
  writeFileSync(p, png);
  console.log(`${이름.padEnd(4)} "${물음}" 로 비교 · ${넘침 ? "**아래가 넘친다 — 답이 길다**" : "칸 안에 들어감"} → ${p}`);
}
