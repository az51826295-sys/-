/**
 * 섞어 보내기 첫 성적표 (183회차 09-19) — 같은 고장 셋을 후보 자리마다 시켜 본다. 심판은 정규식(고장이 실제로 사라졌나)과 바뀐 줄 수.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/seat_ab_probe.mts [--seats gpt-5.6-luna,deepseek-v4-flash]
 * 재료: 데모 회사의 마지막 웹 게임(두더지). 값 ≈ 후보 하나당 $0.01.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { buildPatch } = await import("../../src/lib/skills/appBuild/patch");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
const { costOf } = await import("../../src/lib/costs/pricing");
const { checkFiles } = await import("../../src/lib/skills/appBuild/verify");
const db = createServiceClient();
const si = process.argv.indexOf("--seats");
const seats = (si > 0 ? process.argv[si + 1] : "gpt-5.6-luna,deepseek-v4-flash").split(",");
const { data: rows } = await db.from("deliverables").select("id, title, assignment_id, content_json").eq("company_id", "00add05a-e81d-4e04-9980-34bb412a8780").eq("deliverable_type", "app_build").ilike("title", "%두더지%").order("created_at", { ascending: false }).limit(1);
const d = rows?.[0]; if (!d) throw new Error("두더지 판 없음");
const c = d.content_json as { files: { path: string; language: string; contents: string }[]; criteria: { id: string; when: string; then: string }[] };
const html = c.files.find((f) => /\.html?$/.test(f.path))!;
type Bug = { name: string; plant: (s: string) => string; fixed: (s: string) => boolean; ask: string };
const bugs: Bug[] = [
  { name: "점수 안 오름", plant: (s) => s.replace(/score\s*\+=\s*1/, "score = score"), fixed: (s) => /score\s*(\+=\s*1|\+\+)/.test(s), ask: "두더지를 눌러도 점수가 0에서 안 올라." },
  { name: "시간 안 줄어듦", plant: (s) => s.replace(/secondsLeft\s*-=\s*1/, "secondsLeft -= 0"), fixed: (s) => /secondsLeft\s*(-=\s*1|--)/.test(s), ask: "남은 시간이 20에서 안 줄어들고 게임이 안 끝나." },
  { name: "시작 단추 안 먹음", plant: (s) => s.replace(/addEventListener\(\s*["']click["']\s*,\s*startGame/, 'addEventListener("clik", startGame'), fixed: (s) => /addEventListener\(\s*["']click["']\s*,\s*startGame/.test(s), ask: "게임 시작 단추를 눌러도 아무 일도 안 일어나." },
];
for (const b of bugs) { const p = b.plant(html.contents); if (p === html.contents) { console.log(`고장 "${b.name}" 을 못 심었다(패턴 없음) — 뺀다`); } }
const usable = bugs.filter((b) => b.plant(html.contents) !== html.contents);
console.log(`판: ${d.title} · ${html.contents.split("\n").length}줄 · 고장 ${usable.length}개 · 자리 ${seats.join(", ")}\n`);
console.log("자리 | 고장 | 고쳐짐 | 조각 | 바뀐 줄 | 문법 | 초 | $");
const tally: Record<string, { fixed: number; n: number; usd: number; sec: number; lines: number }> = {};
for (const seat of seats) {
  const ai = await seatProvider(seat);
  if (!ai) { console.log(`${seat}: 못 앉힘(열쇠 없음)`); continue; }
  tally[seat] = { fixed: 0, n: 0, usd: 0, sec: 0, lines: 0 };
  for (const b of usable) {
    const broken = { ...html, contents: b.plant(html.contents) };
    const t0 = Date.now();
    let usd = 0;
    const metered = { ...ai, async generateStructuredOutput<T>(a: Parameters<typeof ai.generateStructuredOutput<T>>[0]) { const r = await ai.generateStructuredOutput(a); usd += costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedInputTokens: r.cachedInputTokens }); return r; } };
    let line: string;
    try {
      const p = await buildPatch(metered, { title: d.title as string, ask: b.ask, criteria: c.criteria, failedChecks: [], full: [broken], rest: [] });
      const sec = Math.round((Date.now() - t0) / 1000);
      if (!p.ok) { line = `${seat} | ${b.name} | 조각 안 붙음 | - | - | - | ${sec} | ${usd.toFixed(4)}`; }
      else {
        const out = p.files.find((f) => f.path === html.path)!.contents;
        const ok = b.fixed(out);
        const syntax = checkFiles([{ ...html, contents: out }]).every((x) => !x.checked || x.ok) ? "됨" : "깨짐";
        tally[seat].fixed += ok ? 1 : 0; tally[seat].lines += p.changedLines;
        line = `${seat} | ${b.name} | ${ok ? "예" : "아니오"} | ${p.patch.edits.length} | ${p.changedLines}/${p.totalLines} | ${syntax} | ${sec} | ${usd.toFixed(4)}`;
      }
      tally[seat].n++; tally[seat].usd += usd; tally[seat].sec += sec;
    } catch (e) { line = `${seat} | ${b.name} | 실패: ${e instanceof Error ? e.message.slice(0, 60) : e}`; tally[seat].n++; }
    console.log(line);
  }
}
console.log("\n합계:");
for (const [s, t] of Object.entries(tally)) console.log(`  ${s}: 고쳐짐 ${t.fixed}/${t.n} · 바뀐 줄 합 ${t.lines} · ${t.sec}초 · $${t.usd.toFixed(4)}`);
