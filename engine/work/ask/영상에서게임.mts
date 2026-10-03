/**
 * **영상 한 편 → 만들 수 있는 기준** (228회차 10-03, 사장님 "영상 먼저 그 다음 게임").
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/영상에서게임.mts <플레이영상.mp4> [--진짜]
 *
 * ## 왜 영상이어야 하나
 * 10-02 에 만든 게임 모방(`게임모방자.mts`)은 **돌아가는 게임**을 헤드리스로 눌러 보며 장면을 떴다.
 * 그런데 사장님이 베끼고 싶은 것은 **메이플·스컬** 같은 것이다 — 우리가 못 돌린다. 가진 것은 **영상**뿐이다.
 * 그래서 들어오는 자리를 바꾼다: 게임이 아니라 **영상**을 받는다.
 *
 * ## 고르게 뜨지 않는다
 * 10-02 에 영상 모방에서 1.8초 간격으로 고르게 떴더니 모델이 **그 간격을 컷 길이로 읽었다.**
 * 여기서도 같다 — 고르게 뜨면 "이만큼마다 바뀐다" 로 읽힌다. ffmpeg 에게 **화면이 확 바뀐 자리**를 묻고,
 * 그 자리가 모자라면 그때만 고르게 채운다. 그리고 **몇 초 지점인지 같이 준다** — 시간이 규칙의 증거다.
 *
 * ## 나오는 것은 주문이다
 * 감상문이 아니라 `app_build` 가 그대로 쓰는 기준(id·when·then)이다.
 * 이 파일이 끝나면 `모방으로짓기.mts` 가 그걸 받아 게임을 만든다. 영상 → 기준 → 게임.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const 영상 = process.argv.find((a) => /\.(mp4|mov|webm|mkv)$/i.test(a));
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-게임모방";
mkdirSync(칸, { recursive: true });
if (!영상 || !existsSync(영상)) { console.error("플레이 영상 파일이 필요하다 (.mp4)"); process.exit(1); }

const FF = ffmpegPath as unknown as string;
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 영상]).toString()) as { format: { duration: string } };
const 길이 = Number(j.format.duration);
console.log(`영상: ${영상} (${길이.toFixed(1)}초)`);

/** 화면이 확 바뀐 자리. 고르게 뜨면 그 간격이 답으로 둔갑한다(10-02 에 겪음). */
function 바뀐자리(): number[] {
  const 읽기 = (e: unknown) => String((e as { stderr?: Buffer })?.stderr ?? "");
  let 글 = "";
  try {
    // stdio 에 "pipe" 를 섞으면 반환 타입이 흔들린다 — 쓰는 것은 stderr 뿐이라 통째로 버퍼로 받는다.
    글 = String(execFileSync(FF, ["-i", 영상!, "-filter:v", "select='gt(scene,0.2)',showinfo", "-f", "null", "-"]));
  } catch (e) { 글 = 읽기(e); }
  return [...글.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.3 && t < 길이 - 0.3);
}

const 바뀜 = 바뀐자리();
// 게임 영상은 컷이 안 바뀌고 **안에서만** 움직이는 때가 많다 — 그러면 바뀐 자리가 거의 안 나온다.
// 그때는 고르게 채우되, **고르게 떴다는 것을 모델에게 말한다**(간격을 규칙으로 읽지 않게).
const 고르게 = 바뀜.length < 4;
const 초들 = (고르게
  ? Array.from({ length: 6 }, (_, i) => 길이 * ((i + 0.7) / 7))
  : 바뀜.map((t) => t + 0.3)).map((s) => Math.round(s * 10) / 10).slice(0, 8);
console.log(고르게
  ? `컷이 거의 안 바뀐다(움직임만 있는 영상) → 고르게 ${초들.length}장: ${초들.join("·")}초`
  : `바뀐 자리 ${바뀜.length}곳 → ${초들.length}장: ${초들.join("·")}초`);

const 장면: string[] = [];
for (const s of 초들) {
  const f = `${칸}/영상-${s}초.jpg`;
  execFileSync(FF, ["-y", "-ss", String(s), "-i", 영상, "-frames:v", "1", "-q:v", "4", f], { stdio: ["ignore", "ignore", "pipe"] });
  장면.push(readFileSync(f).toString("base64"));
}

if (!진짜) { console.log("\n목(mock)은 그림을 못 본다 — 기준을 뽑으려면 --진짜"); process.exit(0); }

type 결과 = {
  무엇: string; 화면칸: string[]; 조작: string; 규칙: string[]; 손맛: string; 그림결: string;
  기준: { id: string; when: string; then: string }[]; 안가져올것: string[]; 못본것: string[];
};

const { 게임모방꼴, 게임모방지시문 } = await import("../../../src/lib/ask/게임모방");
const { defaultProviders } = await import("../../../src/lib/execution/shared");
const { meterProviders } = await import("../../../src/lib/costs/meter");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "video_to_game" } as any);

const 물음 = [
  `같은 게임의 플레이 영상에서 뽑은 장면 ${장면.length}장이다(시간 순).`,
  `각 장면의 초: ${초들.map((s) => `${s}초`).join(" · ")}`,
  고르게
    ? "이 장면들은 **고르게 뜬 것**이다 — 장면 사이 간격은 컷 길이가 아니다. 간격을 규칙으로 읽지 마라."
    : "이 장면들은 **화면이 확 바뀐 자리**에서 떴다 — 이웃한 두 초의 차이가 그 장면이 이어진 시간이다.",
  "",
  "장면 사이의 차이를 보고, 만들 수 있는 기준으로 옮겨라.",
].join("\n");

const { output } = await ai.generateStructuredOutput({
  systemInstructions: 게임모방지시문, input: 물음, images: 장면,
  schema: 게임모방꼴, schemaName: "game_copy", maxTokens: 16000, tier: "judgment",
});
const r = output as 결과;

console.log(`\n무엇: ${r.무엇}`);
console.log(`화면 칸: ${r.화면칸.join(" · ")}`);
console.log(`조작: ${r.조작}`);
console.log(`손맛: ${r.손맛}`);
console.log(`규칙:`); for (const x of r.규칙) console.log(`  · ${x}`);
console.log(`\n기준 ${r.기준.length}개:`); for (const c of r.기준) console.log(`  [${c.id}] ${c.when} → ${c.then}`);
console.log(`\n안 가져올 것:`); for (const x of r.안가져올것) console.log(`  ✗ ${x}`);
console.log(`못 본 것:`); for (const x of r.못본것) console.log(`  ? ${x}`);

const 하면 = r.기준.filter((c) => /면|하면|누르|밟|맞|먹/.test(c.when)).length;
const 잼: [string, boolean, string][] = [
  ["① 기준 10개 이상", r.기준.length >= 10, `${r.기준.length}개`],
  ["② when·then 둘 다 찼나", r.기준.every((c) => c.when.trim().length > 4 && c.then.trim().length > 6), `빈 칸 ${r.기준.filter((c) => !c.when.trim() || !c.then.trim()).length}개`],
  ["③ '하면' 이 절반 넘나(화면 설명이 아니라 규칙인가)", 하면 * 2 >= r.기준.length, `${하면}/${r.기준.length}`],
  ["④ 못 본 것을 채웠나", r.못본것.length >= 1, `${r.못본것.length}개`],
  ["⑤ 안 가져올 것을 적었나", r.안가져올것.length >= 1, `${r.안가져올것.length}개`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
console.log(`\n${잼.filter((x) => x[1]).length}/${잼.length}`);
writeFileSync(`${칸}/기준.json`, JSON.stringify(r, null, 2));
console.log(`기준 → ${칸}/기준.json`);
console.log(`다음: npx tsx engine/tools/rookery_env.mts engine/work/ask/모방으로짓기.mts  ← 이 기준으로 게임을 만든다`);
if (잼.some((x) => !x[1])) process.exitCode = 1;
