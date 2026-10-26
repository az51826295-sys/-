/**
 * **폴더에 떨군 것을 진짜로 재 주나** (10-26). 모델 0 · 값 0(판정 서비스는 사장님 것).
 *   npx tsx engine/work/probe/measure-live-test.mts
 *
 * 로키 DB 없이 도는지가 핵심이다 — 판정 서비스(`JUDGE_URL`)만 부른다.
 * 진짜 그림으로 왕복해서, **맞음/어긋남/못 잼이 갈리는지**까지 본다.
 * 기준 숫자는 그 서비스가 들고 있다("사장님이 가리킨 레퍼런스 화면 실측").
 */
import { readFileSync, existsSync } from "node:fs";

const 판정터 = process.env.JUDGE_URL ?? "https://judge-production-3d80.up.railway.app";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/* ── ① 기준이 숫자로 서 있나 ── */
const th = await fetch(판정터 + "/api/judge/thresholds").then((r) => r.json()).catch(() => null) as
  { character?: Record<string, number>; basis?: string } | null;
재기("기준이 숫자로 박혀 있다", !!th?.character && Object.keys(th.character).length >= 4, { 기준: th?.character });
재기("기준에 근거가 적혀 있다", !!th?.basis && th.basis.length > 5, { 근거: th?.basis });

/* ── ② 진짜 그림을 보내 본다 — 잿빛 캐릭터 그림을 쓴다 ── */
const 후보 = [
  "public/dot-sprites/haru/face/happy.png",
  "public/dot-sprites/nabi/face/happy.png",
  "public/ash/art/c-knight.png",
];
const 그림길 = 후보.find((p) => existsSync(p));
if (!그림길) {
  console.log("\n못 잼: 보낼 그림을 못 찾았다 — 위 후보 경로가 다 없다.");
} else {
  const b64 = readFileSync(그림길).toString("base64");
  console.log(`\n보낸 그림: ${그림길} (${Math.round(b64.length / 1024)}KB base64)`);
  const t0 = Date.now();
  const r = await fetch(판정터 + "/api/judge/character", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ images: [b64] }),
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as unknown as Response));
  const 걸림 = Date.now() - t0;

  재기("판정 서비스가 답한다", r.ok, { status: r.status, 걸림: 걸림 + "ms" });
  if (r.ok) {
    const j = await r.json() as { verdict?: string; colors?: number; saturation?: number; luma_spread?: number; fail?: string[]; undefined?: string[] };
    재기("판정이 세 값 중 하나다", ["PASS", "FAIL", "UNDEFINED"].includes(String(j.verdict)), { verdict: j.verdict });
    재기("잰 숫자를 같이 준다", typeof j.colors === "number" || typeof j.luma_spread === "number",
      { colors: j.colors, saturation: j.saturation, luma_spread: j.luma_spread });
    console.log("   까닭:", [...(j.fail ?? []), ...(j.undefined ?? [])].slice(0, 3).join(" / ") || "(없음)");
  } else {
    console.log("   본문:", (await r.text()).slice(0, 200));
  }
}

console.log("\n못 잰 것: 폴더에서 파일을 집는 부분 — 사람이 폴더를 골라야 해서 헤드리스로 못 돈다.");
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
