/**
 * **Play 결제가 어느 칸까지 왔나** (10-28).
 *   npx tsx engine/tools/dot_pay_ready.mts
 *
 * 사장님이 "결제" 라고 하시면 **이것부터** 돌린다. 기억으로 답하지 않는다 —
 * 10-28 에 "새 APK 를 못 올린다" 를 열흘 지난 기억에서 꺼내 말했는데 틀렸었다
 * ([[unrun-code-is-unmeasured]]).
 *
 * 칸마다 **맞음 / 어긋남 / 못 잼**으로 적는다. 못 잼은 어긋남이 아니다 —
 * Play Console 안쪽은 여기서 볼 수 없고, 그건 벽이 아니라 **눈이 없는 것**이다.
 */
import { statSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const AAB = "C:/Users/az518/Desktop/dot-android/dot-1.0.9-signed.aab";
const 유효시각 = new Date("2026-10-30T14:31:00+09:00");

type 값 = "맞음" | "어긋남" | "못 잼";
const 줄: [값, string, string][] = [];
const 적기 = (v: 값, 칸: string, 왜: string) => 줄.push([v, 칸, 왜]);

/* ① 업로드 키 — 시각만 보고 말한다. Console 안쪽은 못 본다. */
const 남은ms = 유효시각.getTime() - Date.now();
적기(
  남은ms <= 0 ? "맞음" : "어긋남",
  "업로드 키 유효",
  남은ms <= 0 ? "유효 시각 지남 — Console 에서 확인할 것" : `${Math.ceil(남은ms / 3_600_000)}시간 남음 (10-30 14:31)`,
);

/* ② 올릴 파일이 있고 **서명돼 있나** — 10-28 에 서명 안 된 파일을 올리려다 막혔다. */
try {
  const st = statSync(AAB);
  let 서명 = "못 잼";
  try {
    const jdk = "C:/Users/az518/AppData/Local/rookery-android/jdk/bin/jarsigner.exe";
    const out = execSync(`"${jdk}" -verify "${AAB}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    서명 = /jar verified/i.test(out) ? "맞음" : "어긋남";
  } catch { /* jarsigner 가 없으면 못 잰 것이다 — 없는 자를 실패로 적지 않는다 */ }
  적기(서명 as 값, "AAB 서명됨", `${(st.size / 1024).toFixed(0)}KB · ${st.mtime.toISOString().slice(0, 10)}`);
} catch {
  적기("어긋남", "AAB 서명됨", "파일이 없다: " + AAB);
}

/* ③ 서버가 결제를 열어 주나 */
try {
  const j = (await (await fetch(`${BASE}/api/dot/pay`)).json()) as { 열림?: boolean; 막는것?: string[] };
  const 막는것 = j.막는것 ?? [];
  /* 이 문은 **웹 결제**의 문이다. 앱 안 결제(Play)는 이 문을 안 지난다 —
     둘을 한 줄로 합쳐 적었더니 "결제가 막혔다" 로 읽혀서 엉뚱한 칸을 고치러 갈 뻔했다. */
  const 웹것 = 막는것.filter((m) => m.includes("받아 줄 곳"));
  const 앱과상관있는것 = 막는것.filter((m) => !m.includes("받아 줄 곳") && !m.includes("계정이 있어야"));
  적기(
    앱과상관있는것.length ? "어긋남" : "못 잼",
    "서버 결제 문",
    앱과상관있는것.length ? 앱과상관있는것.join(" · ") : "앱 안 결제는 이 문으로 안 잰다(웹 결제의 문이다)",
  );
  if (웹것.length) {
    적기("못 잼", "(참고) 웹 결제", "Dodo 가 두근도트를 못 받는다 — **다른 길**이라 이건 고장이 아니다");
  }
} catch (e) {
  적기("못 잼", "서버가 결제를 연다", "서버에 못 닿음: " + String(e).slice(0, 60));
}

/* ④ 구글에 물어볼 열쇠가 서버에 있나 — 비밀값은 안 읽는다. 있는지만 본다. */
try {
  const r = await fetch(`${BASE}/api/dot/buy`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ purchaseToken: "probe", productId: "menhera_sub" }),
  });
  const t = (await r.text()).slice(0, 160);
  /* 401 = 로그인 문에서 먼저 걸린 것이라 **열쇠가 있는지 아직 모른다.** */
  적기(r.status === 401 ? "못 잼" : r.status === 503 ? "어긋남" : "맞음", "서버에 Play 열쇠", `${r.status} ${t}`);
} catch (e) {
  적기("못 잼", "서버에 Play 열쇠", String(e).slice(0, 60));
}

/* ⑤ Play Console 안쪽(구독 상품·시험 구매)은 여기서 못 본다. 숨기지 않고 **못 잼으로 적는다.** */
적기("못 잼", "구독 상품 menhera_sub", "Play Console 안쪽 — 1.0.9 가 올라가야 메뉴가 열린다");
적기("못 잼", "시험 구매 · 승인(acknowledge)", "진짜 결제 한 건이 필요하다 — 승인이 안 되면 사흘 뒤 구글이 돈을 돌려주고 거둬 간다");

const 폭 = Math.max(...줄.map(([, 칸]) => 칸.length));
for (const [v, 칸, 왜] of 줄) console.log(`${v.padEnd(5)} ${칸.padEnd(폭)}  ${왜}`);
const 어긋남 = 줄.filter(([v]) => v === "어긋남").length;
const 못잼 = 줄.filter(([v]) => v === "못 잼").length;
console.log(`\n어긋남 ${어긋남} · 못 잼 ${못잼}`);
console.log(어긋남 ? "\n다음 칸: " + 줄.find(([v]) => v === "어긋남")![1] : "\n막는 칸 없음 — Console 안쪽을 보러 간다(engine/docs/dot-결제-한번에.md)");
