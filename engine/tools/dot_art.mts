/**
 * **픽셀랩으로 도트 묶음을 뽑는다** (228회차 10-04, 사장님 "다 도트로 가자").
 *   npx tsx engine/tools/dot_art.mts <묶음> [--진짜]
 *
 * 제미나이로 UI 를 그려 봤더니 그림체가 셋(그린 UI · 애니 일러 · 도트)이라 한 몸이 안 됐다.
 * 그래서 **전부 도트**로 간다. 우리가 가진 것 중 픽셀랩이 제일 좋다 — 64×64 에 3KB, 한 장 20초.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 묶음 = process.argv[2] ?? "slime";
const 진짜 = process.argv.includes("--진짜");
const 칸 = `C:/Users/az518/Desktop/로키-도트/${묶음}`;
mkdirSync(칸, { recursive: true });
const KEY = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/pixellab.json`, "utf8")).apiKey as string;

/** 모든 조각에 붙는 공통 줄. 빠지면 조각마다 다른 게임이 된다. */
/**
 * 10-04 사장님: *"미감이 안 좋아, 대중성이 있어야 해"* → **밝고 귀엽게** 갈아탔다.
 * 어둡고 복잡한 그림은 폰 화면에서 안 읽힌다. 돈 버는 키우기 게임은 전부 두꺼운 외곽선·큰 눈·쨍한 색이다.
 */
const 세상 = "cute chibi mobile game sprite, very thick black outline, big simple shapes, large round eyes, bright saturated colors, soft pastel toy world, clean and readable at small size, no gradient";

type 조각 = { 이름: string; 말: string; 크기?: number };
const 묶음들: Record<string, 조각[]> = {
  /**
   * **말랑이 종류** (10-04 사장님: *"가만히 멈춰서 움직이니까 말랑이 종류를 늘릴 수 있는 거야"*).
   * 맞는 말이다 — 가만히 떠 있는 것만 하면 종류를 아무리 늘려도 움직임을 새로 안 만들어도 된다.
   * 그래서 **뽑기의 알맹이는 종류**가 된다. 실제 말랑이(스퀴시) 가 그런 것들이다.
   */
  jelly: [
    { 이름: "j-pudding",  말: "a cute squishy caramel pudding toy character with big dot eyes and a tiny smile" },
    { 이름: "j-bread",    말: "a cute squishy loaf of milk bread toy character with big dot eyes" },
    { 이름: "j-donut",    말: "a cute squishy pink frosted donut toy character with sprinkles and big dot eyes" },
    { 이름: "j-peach",    말: "a cute squishy peach toy character with a tiny leaf and big dot eyes" },
    { 이름: "j-berry",    말: "a cute squishy strawberry toy character with big dot eyes" },
    { 이름: "j-cat",      말: "a cute squishy white cat toy character, round and soft, big dot eyes" },
    { 이름: "j-panda",    말: "a cute squishy panda toy character, round and soft, big dot eyes" },
    { 이름: "j-bunny",    말: "a cute squishy white bunny toy character with long ears and big dot eyes" },
    { 이름: "j-dino",     말: "a cute squishy green baby dinosaur toy character with tiny spikes and big dot eyes" },
    { 이름: "j-octo",     말: "a cute squishy purple octopus toy character with big dot eyes" },
    { 이름: "j-unicorn",  말: "a cute squishy pastel unicorn toy character with a rainbow horn and big dot eyes" },
    { 이름: "j-penguin",  말: "a cute squishy penguin toy character, round and soft, big dot eyes" },
  ],
  /** 말랑이 키우기 (10-04). 주인공은 몬스터가 아니라 **장난감**이다 — 그래야 슬라임이랑 안 겹친다. */
  mal: [
    { 이름: "hero",  말: "a cute squishy jelly toy blob character, round and soft, glossy light blue body, two big simple dot eyes, tiny smile, facing right, bouncy pose" },
    { 이름: "mob1",  말: "a cute angry wind-up tin soldier toy, small and round, big dot eyes, red and white, facing left" },
    { 이름: "mob2",  말: "a cute grumpy teddy bear toy with a stitched patch, round body, big dot eyes, brown, facing left" },
    { 이름: "mob3",  말: "a cute bouncy rubber duck toy with an angry eyebrow, yellow, big dot eyes, facing left" },
    { 이름: "boss1", 말: "a big cute boss toy: a giant jack-in-the-box with a grinning clown head popping out, purple and gold, big round eyes, facing left", 크기: 96 },
    { 이름: "mate1", 말: "a cute squishy jelly toy blob, glossy pink body, big dot eyes, happy face, facing right" },
    { 이름: "mate2", 말: "a cute squishy jelly toy blob, glossy mint green body, big dot eyes, sleepy face, facing right" },
    { 이름: "mate3", 말: "a cute squishy jelly toy blob, glossy orange body, big dot eyes, surprised face, facing right" },
    { 이름: "coin",  말: "a single cute shiny gold coin with a star mark, centered item icon", 크기: 32 },
    { 이름: "gem",   말: "a single cute sparkling pink gem, centered item icon", 크기: 32 },
  ],
  /** 길드 턴제 — 역할 넷이 **실루엣만 봐도** 갈려야 한다. 전투에서 누가 누군지 글자 없이 읽혀야 하니까. */
  guild: [
    { 이름: "r-guard",  말: "a lone survivor girl in heavy scavenged plate armor made of welded scrap, holding a huge riveted metal shield, braced stance, facing right, side view" },
    { 이름: "r-strike", 말: "a lean survivor girl in a patched grey hooded coat, holding a long cut-down steel blade low, forward-leaning stance, facing right, side view" },
    { 이름: "r-mend",   말: "a survivor girl in a stained white field-medic coat with a satchel, holding up a glowing green vial, facing right, side view" },
    { 이름: "r-bind",   말: "a thin survivor girl in a dark long coat, holding a coil of heavy iron chain, hood down, facing right, side view" },
  ],
  slime: [
    { 이름: "hero",    말: "a lone scavenger girl in a patched grey hooded coat and rusted metal shoulder plate, holding a cut-down steel blade, facing right, side view, battle ready pose" },
    { 이름: "mob1",    말: "a mutated grey rat the size of a dog, matted fur, glowing faint green eyes, facing left, side view" },
    { 이름: "mob2",    말: "a shambling husk of a man wrapped in torn rags and rusted wire, facing left, side view" },
    { 이름: "mob3",    말: "a floating blob of irradiated green slime with scraps of metal suspended inside it, facing left, side view" },
    { 이름: "boss1",   말: "a huge armored brute made of welded scrap metal plates with one glowing green core in its chest, facing left, side view, menacing", 크기: 96 },
    { 이름: "coin",    말: "a single worn scavenged metal coin, scratched dull brass, centered item icon", 크기: 32 },
    { 이름: "shard",   말: "a single glowing green irradiated crystal shard, centered item icon", 크기: 32 },
  ],
};
const 할것 = 묶음들[묶음];
if (!할것) { console.error(`묶음은 ${Object.keys(묶음들).join(" · ")}`); process.exit(1); }
console.log(`${묶음} — ${할것.length}조각`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

let 쓴것 = 0;
for (const c of 할것) {
  const 나올곳 = `${칸}/${c.이름}.png`;
  if (existsSync(나올곳)) { console.log(`  ${c.이름} — 이미 있음`); continue; }
  const n = c.크기 ?? 64;
  const t0 = Date.now();
  // 무료 등급은 **한 번에 하나**다(429). 앞 장이 아직 도는 중이면 기다렸다 다시 건다 —
  // 10-04 에 일곱 장 중 넷이 이걸로 떨어졌다. 모델이 거절한 게 아니라 줄을 안 섰던 것이다.
  for (let 판 = 1; 판 <= 6; 판++) {
    try {
      const r = await fetch("https://api.pixellab.ai/v1/generate-image-pixflux", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ description: `${c.말}, ${세상}`, image_size: { width: n, height: n }, no_background: true }),
        signal: AbortSignal.timeout(300_000),
      });
      const 글 = await r.text();
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 12_000)); continue; }
      if (!r.ok) { console.log(`  ${c.이름} 거절 ${r.status}: ${글.slice(0, 140)}`); break; }
      const b64 = (JSON.parse(글) as { image?: { base64?: string } }).image?.base64;
      if (!b64) { console.log(`  ${c.이름} — 안 왔다`); break; }
      writeFileSync(나올곳, Buffer.from(b64, "base64"));
      쓴것++;
      console.log(`  ${c.이름} ${n}×${n} → ${((Date.now() - t0) / 1000).toFixed(0)}초${판 > 1 ? ` (${판}번째 시도)` : ""}`);
      break;
    } catch (e) { console.log(`  ${c.이름} 떨어짐: ${e instanceof Error ? e.message.slice(0, 100) : e}`); break; }
  }
}
console.log(`\n${쓴것}장 → ${칸}`);
