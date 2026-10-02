/**
 * **영상 한 편 → 만들 수 있는 컷 표** (228회차 10-02).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/영상모방자.mts [영상.mp4] [--진짜]
 *   (안 주면 오늘 만든 두근도트 참여형 릴스를 쓴다 — **답을 내가 아는 영상**이라야 자가 자다)
 *
 * 재는 것:
 *   ① 컷 표가 준 장면 수만큼 찼나
 *   ② 기준에 **숫자가 들어갔나** (숫자 없는 기준은 지킬 수가 없다)
 *   ③ `못본것` 을 채웠나 — 소리는 장면으로 모른다
 *   ④ `안가져올것` 을 적었나
 *   ⑤ **내가 아는 답**을 짚었나 — 이 릴스에는 "댓글"·"다음 캐릭터"·빈 자리가 있다
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const 영상 = process.argv.find((a) => /\.mp4$/i.test(a))
  ?? "C:/Users/az518/Desktop/두근도트-영상/참여형/두근도트-다음캐릭터.mp4";
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-영상모방";
mkdirSync(칸, { recursive: true });
if (!existsSync(영상)) { console.error(`영상이 없다: ${영상}`); process.exit(1); }

const FF = ffmpegPath as unknown as string;
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 영상]).toString()) as { format: { duration: string } };
const 길이 = Number(j.format.duration);
console.log(`영상: ${영상} (${길이.toFixed(1)}초)`);

/**
 * **컷이 바뀌는 자리를 찾는다.**
 *
 * 처음에는 1.8초 간격으로 고르게 떴다. 그랬더니 모델이 **그 간격을 컷 길이로 읽어** "각 컷 1.8초" 라고
 * 적었다 — 진짜는 2.4·1.5·1.5·1.5·2.0·2.8초였다. 내가 뜬 방식이 답을 만들어 버린 것이다.
 * 그래서 ffmpeg 에게 **화면이 확 바뀐 지점**을 묻고, 그 조금 뒤를 뜬다. 그러면 초가 진짜 컷 초가 된다.
 */
function 컷경계(): number[] {
  try {
    const 글 = execFileSync(FF, ["-i", 영상, "-filter:v", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] }).toString();
    const 때 = [...글.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
    return 때;
  } catch (e) {
    // ffmpeg 은 -f null 에서 stderr 로 뱉고 0 이 아닌 값을 낼 수 있다 — 그 글에도 답이 들어 있다.
    const 글 = String((e as { stderr?: Buffer }).stderr ?? "");
    return [...글.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
  }
}
const 경계 = 컷경계();
// 경계 **조금 뒤**를 뜬다(전환 한가운데는 두 컷이 섞여 흐릿하다). 첫 컷은 0.6초에서.
const 초들 = (경계.length >= 3 ? [0.6, ...경계.map((t) => t + 0.45)] : [0.6, 2.4, 4.2, 6.0, 7.8, 9.6])
  .filter((s) => s < 길이 - 0.2).map((s) => Math.round(s * 10) / 10).slice(0, 8);
console.log(경계.length >= 3 ? `컷이 바뀐 자리 ${경계.length}곳: ${경계.map((t) => t.toFixed(1)).join(" · ")}초` : "컷 경계를 못 찾아 고르게 뜬다");
const 장면: string[] = [];
for (const s of 초들) {
  const f = `${칸}/장면-${s}초.jpg`;
  execFileSync(FF, ["-y", "-ss", String(s), "-i", 영상, "-frames:v", "1", "-q:v", "4", f], { stdio: ["ignore", "ignore", "pipe"] });
  장면.push(readFileSync(f).toString("base64"));
}
console.log(`장면 ${장면.length}장 (${초들.join("초 · ")}초) → ${칸}`);

type 결과 = {
  무엇: string; 컷표: { 초: string; 무엇: string; 글자: string }[];
  길이: string; 글자쓰임: string; 리듬: string;
  기준: { id: string; 무엇: string }[]; 안가져올것: string[]; 못본것: string[];
};

if (!진짜) { console.log("목(mock)은 그림을 못 본다 — 판정을 재려면 --진짜"); process.exit(0); }

const { 영상모방꼴, 영상모방지시문, 영상모방물음 } = await import("../../../src/lib/ask/영상모방");
const { defaultProviders } = await import("../../../src/lib/execution/shared");
const { meterProviders } = await import("../../../src/lib/costs/meter");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "video_copy" } as any);
const { output } = await ai.generateStructuredOutput({
  systemInstructions: 영상모방지시문, input: 영상모방물음(초들), images: 장면,
  schema: 영상모방꼴, schemaName: "video_copy", maxTokens: 16000, tier: "judgment",
});
const r = output as 결과;

console.log(`\n무엇: ${r.무엇}`);
console.log(`길이: ${r.길이}`);
console.log(`글자 쓰임: ${r.글자쓰임}`);
console.log(`리듬: ${r.리듬}`);
console.log(`\n컷 표:`); for (const c of r.컷표) console.log(`  ${c.초.padEnd(7)} ${c.무엇} ${c.글자 && c.글자 !== "없음" ? `— 글자: "${c.글자}"` : ""}`);
console.log(`\n기준 ${r.기준.length}개:`); for (const c of r.기준) console.log(`  [${c.id}] ${c.무엇}`);
console.log(`\n안 가져올 것:`); for (const x of r.안가져올것) console.log(`  ✗ ${x}`);
console.log(`못 본 것:`); for (const x of r.못본것) console.log(`  ? ${x}`);

const 글 = JSON.stringify(r);
const 알맹이 = ["댓글", "캐릭터", "비어"];
const 짚은것 = 알맹이.filter((w) => 글.includes(w));
const 숫자있는기준 = r.기준.filter((c) => /\d/.test(c.무엇)).length;
const 잼: [string, boolean, string][] = [
  ["① 컷 표가 장면 수만큼 찼나", r.컷표.length >= 초들.length, `${r.컷표.length}/${초들.length}`],
  ["② 기준에 숫자가 들어갔나(절반 넘게)", 숫자있는기준 * 2 >= r.기준.length && r.기준.length >= 8, `${숫자있는기준}/${r.기준.length}`],
  ["③ 못 본 것을 채웠나", r.못본것.length >= 1, `${r.못본것.length}개`],
  ["④ 안 가져올 것을 적었나", r.안가져올것.length >= 1, `${r.안가져올것.length}개`],
  ["⑤ 내가 아는 알맹이를 짚었나", 짚은것.length >= 2, `${짚은것.join("·")} (${짚은것.length}/${알맹이.length})`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
const 맞음 = 잼.filter((x) => x[1]).length;
console.log(`\n${맞음}/${잼.length}`);
writeFileSync(`${칸}/컷표.json`, JSON.stringify(r, null, 2));
console.log(`컷 표 → ${칸}/컷표.json  (이대로 영상 주문이 된다)`);
if (맞음 < 잼.length) process.exitCode = 1;
