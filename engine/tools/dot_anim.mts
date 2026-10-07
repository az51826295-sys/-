/**
 * **픽셀랩으로 움직임을 뽑는다** (228회차 10-04, 사장님 *"전체적으로 전부 애니메이션이 있었어"*).
 *   npx tsx engine/tools/dot_anim.mts <묶음> [--진짜]
 *
 * 한 장짜리 도트를 눌렀다 폈다 하는 걸로는 한계가 있다. 베끼려는 게임은 **전부 움직이고 있었다** —
 * 가만히 있어도 숨 쉬고, 때릴 때 동작이 있고, 맞으면 흔들린다. 그게 "살아 있다" 의 거의 전부다.
 *
 * `animate-with-text` 는 **기준 그림 한 장**과 동작 이름을 받아 **여러 장(프레임)** 을 돌려준다.
 * 그래서 디자인은 이미 뽑은 그림이 정하고, 여기서는 **그 그림이 움직이는 것**만 만든다.
 * 따로 뽑으면 같은 캐릭터가 아니게 된다(10-04 에 캐릭터 창과 전투가 딴 사람이었던 것과 같은 함정).
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 묶음 = process.argv[2] ?? "mal";
const 진짜 = process.argv.includes("--진짜");
const 바탕칸 = `C:/Users/az518/Desktop/로키-도트/${묶음}`;
const 칸 = `${바탕칸}/anim`;
mkdirSync(칸, { recursive: true });
const KEY = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/pixellab.json`, "utf8")).apiKey as string;

type 할일 = { 그림: string; 동작: string; 말: string; 방향: "east" | "west"; 칸수?: number };
const 묶음별: Record<string, 할일[]> = {
  mal: [
    { 그림:"hero",  동작:"idle",  말:"a cute squishy jelly blob toy, glossy light blue, big dot eyes", 방향:"east" },
    { 그림:"mob1",  동작:"idle",  말:"a cute angry wind-up tin soldier toy, red and white",            방향:"west" },
  ],
  /** 길드 턴제 — **글과 맞물릴 동작**이 있어야 한다. 대기 하나, 때리는 것 하나씩. */
  guild: [
    { 그림:"r-guard",  동작:"idle",   말:"a survivor girl in heavy scavenged scrap plate armor with a huge riveted shield", 방향:"east" },
    { 그림:"r-guard",  동작:"attack", 말:"a survivor girl in heavy scavenged scrap plate armor with a huge riveted shield", 방향:"east" },
    { 그림:"r-strike", 동작:"idle",   말:"a lean survivor girl in a patched grey hooded coat with a long steel blade",      방향:"east" },
    { 그림:"r-strike", 동작:"attack", 말:"a lean survivor girl in a patched grey hooded coat with a long steel blade",      방향:"east" },
    { 그림:"r-mend",   동작:"idle",   말:"a survivor girl in a stained white field-medic coat holding a glowing green vial",방향:"east" },
    { 그림:"r-mend",   동작:"attack", 말:"a survivor girl in a stained white field-medic coat holding a glowing green vial",방향:"east" },
    { 그림:"r-bind",   동작:"idle",   말:"a thin survivor girl in a dark long coat holding a coil of heavy iron chain",     방향:"east" },
    { 그림:"r-bind",   동작:"attack", 말:"a thin survivor girl in a dark long coat holding a coil of heavy iron chain",     방향:"east" },
    { 그림:"mob1",     동작:"idle",   말:"a mutated grey rat the size of a dog with faint green glowing eyes",              방향:"west" },
    { 그림:"mob1",     동작:"attack", 말:"a mutated grey rat the size of a dog with faint green glowing eyes",              방향:"west" },
    { 그림:"mob2",     동작:"idle",   말:"a shambling husk of a man wrapped in torn rags and rusted wire",                  방향:"west" },
    { 그림:"mob2",     동작:"attack", 말:"a shambling husk of a man wrapped in torn rags and rusted wire",                  방향:"west" },
    { 그림:"mob3",     동작:"idle",   말:"a floating blob of irradiated green slime with metal scraps inside",              방향:"west" },
    { 그림:"mob3",     동작:"attack", 말:"a floating blob of irradiated green slime with metal scraps inside",              방향:"west" },
    { 그림:"boss1",    동작:"idle",   말:"a huge armored brute of welded scrap metal with a glowing green core",            방향:"west" },
    { 그림:"boss1",    동작:"attack", 말:"a huge armored brute of welded scrap metal with a glowing green core",            방향:"west" },
  ],
};
const 목록: 할일[] = 묶음별[묶음] ?? [];
if (!목록.length) { console.error(`묶음은 ${Object.keys(묶음별).join(" · ")}`); process.exit(1); }

console.log(`${묶음} — 움직임 ${목록.length}개`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

let 쓴것 = 0;
for (const t of 목록) {
  const 바탕 = `${바탕칸}/${t.그림}.png`;
  if (!existsSync(바탕)) { console.log(`  ${t.그림}/${t.동작} — 바탕 그림이 없다`); continue; }
  const 첫칸 = `${칸}/${t.그림}-${t.동작}-0.png`;
  if (existsSync(첫칸)) { console.log(`  ${t.그림}/${t.동작} — 이미 있음`); continue; }

  const 몸 = {
    description: t.말,
    action: t.동작,
    image_size: { width: 64, height: 64 },
    // 기준 그림이 64가 아니면 거절한다(보스가 96이라 10-04 에 떨어졌다) — 보내기 전에 **정수 배율로** 줄인다.
    reference_image: { type: "base64", base64: (await sharp(바탕).resize(64, 64, { kernel: "nearest", fit: "contain", background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()).toString("base64") },
    view: "side", direction: t.방향, n_frames: t.칸수 ?? 4,
  };
  // 무료 등급은 **한 번에 하나**다(429) — 줄을 서야 한다.
  for (let 판 = 1; 판 <= 6; 판++) {
    try {
      const r = await fetch("https://api.pixellab.ai/v1/animate-with-text", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify(몸), signal: AbortSignal.timeout(600_000),
      });
      const 글 = await r.text();
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 12_000)); continue; }
      if (!r.ok) { console.log(`  ${t.그림}/${t.동작} 거절 ${r.status}: ${글.slice(0, 160)}`); break; }
      const j = JSON.parse(글) as { images?: { base64?: string }[] };
      const 칸들 = j.images ?? [];
      if (!칸들.length) { console.log(`  ${t.그림}/${t.동작} — 칸이 안 왔다`); break; }
      칸들.forEach((f, i) => writeFileSync(`${칸}/${t.그림}-${t.동작}-${i}.png`, Buffer.from(f.base64 ?? "", "base64")));
      쓴것++;
      console.log(`  ${t.그림}/${t.동작} → ${칸들.length}칸${판 > 1 ? ` (${판}번째 시도)` : ""}`);
      break;
    } catch (e) { console.log(`  ${t.그림}/${t.동작} 떨어짐: ${e instanceof Error ? e.message.slice(0, 100) : e}`); break; }
  }
}
console.log(`\n움직임 ${쓴것}개 → ${칸}`);
