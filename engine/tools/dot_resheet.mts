/**
 * **표정 시트를 다시 그려 자르고 세운다** (226회차 2026-09-27).
 *
 * 사장님 "도트 자르는 거 너무 못해" 를 재 보니 배경 제거(반투명 0%)도 도트 격자(8×8 블록 100% 균일)도
 * 통과였다. 남은 결함은 **그림 자체**였다 — 유나의 shy 는 홍조 자리에 줄무늬가 그려져 있었다.
 * 자르기로는 못 고치므로 다시 그린다. 오늘 옮긴 `gpt-image-2.5-flare` 가 이 일에서도 나은지 같이 본다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_resheet.mts <slug> [--run]
 */
import fs from "node:fs";
import { createImageProvider } from "../../src/lib/providers/images";
import { sheetPrompt, cutSheet, cleanSprite, SHEET_ORDER, 색으로가를수있나 } from "../../src/lib/dot/sprites";
import { createClient } from "@supabase/supabase-js";

const slug = process.argv[2] ?? "yuna";
const RUN = process.argv.includes("--run");
const db = createClient(process.env.DOT_SUPABASE_URL!, process.env.DOT_SUPABASE_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_characters").select("look,name").eq("slug", slug).maybeSingle();
const look = (data as { look: unknown; name: string } | null);
if (!look) throw new Error(`${slug} 없음`);
const appearance = typeof look.look === "string" ? look.look : JSON.stringify(look.look);
const prompt = sheetPrompt({ appearance } as never);
console.log(`${slug}(${look.name}) · ${appearance.slice(0, 70)}`);
if (!RUN) { console.log("\n--run 을 붙이면 그린다(그림값 $0.05쯤)."); process.exit(0); }

const drawer = createImageProvider();
const t0 = Date.now();
const made = await drawer.draw(prompt, "high", "1024x1024");
console.log(`그렸다 ${((Date.now()-t0)/1000).toFixed(0)}초 · ${made.model}`);

const out = `C:/Users/az518/Desktop/도트-${slug}-새판`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/_sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));

// 226회차 09-28 사장님 "색으로 구분해라": **색으로 못 가르는 시트는 쓰지 않는다.**
// 지금까지는 마젠타가 아니어도 플러드 필로 어물쩍 넘어가 지저분한 판이 통과했다.
// 재 보니 마젠타 판은 섞인 띠 0.41% 인데 갈색 질감 판은 21.20% 였다 — 재료가 나쁜 것이다.
const 시트버퍼 = Buffer.from(made.dataUrl.split(",")[1], "base64");
const 가를수 = await 색으로가를수있나(시트버퍼);
console.log(`색 가르기: ${가를수.가능 ? "된다" : "**안 된다**"} — ${가를수.왜}`);
if (!가를수.가능) {
  console.log("이 시트는 안 쓴다. 배경이 평평한 마젠타가 아니면 잘라도 가장자리가 지저분해진다.");
  console.log("다시 그리려면 같은 명령을 한 번 더 돌린다(그림값이 또 든다).");
  process.exit(2);
}

const cells = await cutSheet(made.dataUrl);
console.log(`잘랐다 ${cells.length}칸`);
for (const c of cells) {
  const clean = await cleanSprite(c.png);
  fs.writeFileSync(`${out}/${c.emotion}.png`, clean);
  console.log(`  ${c.emotion.padEnd(10)} 잉크 ${(c.inkRatio*100).toFixed(1)}%`);
}
console.log(`\n${out} — 이제 dot_align.mts 로 세운다.`);
