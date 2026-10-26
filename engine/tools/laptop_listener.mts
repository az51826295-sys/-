/**
 * **듣는 쪽 — 앱에서 시킨 일을 이 컴퓨터의 클로드 코드가 한다** (10-26).
 *
 *   npx tsx engine/tools/laptop_listener.mts --폴더 "C:\\Users\\az518\\Desktop\\내게임"
 *
 * 사장님: "앱이랑 내 노트북에 있는 클로드 코드랑 연결 됨?" → 이게 그 조각이다.
 * 폰이나 웹에서 한마디 하면, 이 컴퓨터가 집어서 **사장님 클로드 코드**로 일한다.
 * **값은 로키에서 안 나간다** — 사장님 구독에서 나간다. 로키는 넘기고 받는 쪽만 한다.
 *
 * ## 지키는 것 (남의 서버가 내 기계에서 뭘 돌리는 구조라서)
 *
 * - **폴더는 명령줄에서만 온다.** 서버가 보낸 `폴더` 는 이 폴더 안일 때만 따른다.
 *   서버가 "C:\Windows" 를 보내도 안 간다.
 * - 돌리기 **전에 주문을 찍는다.** 사장님이 보고 Ctrl+C 로 끊을 수 있어야 한다.
 * - 권한은 `acceptEdits` 가 기본이다 — 파일 고치기는 하고, 아무 명령이나 돌리진 않는다.
 *   전부 건너뛰는 건 사장님이 `--권한 bypassPermissions` 로 직접 적어야 한다.
 * - 열쇠는 환경변수로만 받고 화면에 안 찍는다.
 */
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { resolveJobFolder } from "../../src/lib/hand/jobFolder";

const argv = process.argv.slice(2);
const 집기 = (이름: string, 기본?: string) => {
  const i = argv.indexOf(이름);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 기본;
};

const 터 = 집기("--주소", process.env.ROOKERY_URL ?? "https://rookery-web-production.up.railway.app")!;
const 열쇠 = process.env.ROOKERY_KEY;
const 뿌리인자 = 집기("--폴더");
const 권한 = 집기("--권한", "acceptEdits")!;
const 쉬는초 = Number(집기("--쉬는초", "10"));
const 한번만 = argv.includes("--한번만");
const 최대초 = Number(집기("--최대초", "900"));

if (!열쇠) {
  console.error("ROOKERY_KEY 가 필요하다 (회사 열쇠). /ask 메뉴에서 받는다.");
  process.exit(2);
}
if (!뿌리인자) {
  console.error('--폴더 가 필요하다. 예: --폴더 "C:\\Users\\az518\\Desktop\\내게임"');
  process.exit(2);
}
const 뿌리 = realpathSync(resolve(뿌리인자));
if (!existsSync(뿌리)) { console.error("그 폴더가 없다: " + 뿌리); process.exit(2); }

/** 클로드 코드가 깔려 있나. 없으면 지금 멈춘다 — 집어 놓고 못 하면 일거리가 떠 버린다. */
async function 클로드있나(): Promise<string | null> {
  for (const 이름 of ["claude.cmd", "claude"]) {
    const ok = await new Promise<boolean>((r) => {
      const p = spawn(이름, ["--version"], { shell: true, stdio: "ignore" });
      p.on("error", () => r(false));
      p.on("close", (c) => r(c === 0));
    });
    if (ok) return 이름;
  }
  return null;
}

const 클로드 = await 클로드있나();
if (!클로드) {
  console.error("클로드 코드 CLI 가 없다. 먼저 깔아야 한다:\n  npm i -g @anthropic-ai/claude-code");
  process.exit(1);
}

/** 서버 칸 이름은 ASCII 다 — 한글 칸은 Supabase select 파서가 거부한다(10-26 에 잡혔다). */
type 일거리 = { id: string; prompt: string; folder: string | null };

async function 문(길: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(터 + 길, {
    ...init,
    headers: { "content-type": "application/json", "x-rookery-key": 열쇠!, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const t = await r.text();
  try { return JSON.parse(t) as Record<string, unknown>; } catch { return { error: t.slice(0, 200) }; }
}

/** 서버가 보낸 폴더를 믿지 않는다 — 내가 허락한 뿌리 **안**일 때만 따른다.
    판정은 `src/lib/hand/jobFolder.ts` 에 있다(자가 돌려 볼 수 있게 빼냈다). */
function 어디서돌릴까(서버가보낸: string | null): string {
  const { folder, ignored } = resolveJobFolder(뿌리, 서버가보낸);
  if (ignored) console.log(`   (서버가 보낸 폴더가 뿌리 밖이라 무시한다: ${서버가보낸})`);
  return folder;
}

async function 한건(j: 일거리): Promise<void> {
  const 방 = 어디서돌릴까(j.folder);
  console.log(`\n■ ${j.id.slice(0, 8)} · ${방}`);
  console.log("  주문: " + j.prompt.split("\n").join("\n        "));
  console.log("  (끊으려면 Ctrl+C)");

  const t0 = Date.now();
  const p = spawn(클로드!, ["-p", j.prompt, "--permission-mode", 권한], {
    cwd: 방, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });

  let 모은것 = "";
  let 탈: string | null = null;
  const 받기 = (d: Buffer) => {
    const s = d.toString();
    모은것 += s;
    process.stdout.write(s);
  };
  p.stdout.on("data", 받기);
  p.stderr.on("data", 받기);

  const 시계 = setTimeout(() => { 탈 = `${최대초}초를 넘겨 끊었다`; p.kill(); }, 최대초 * 1000);
  const code = await new Promise<number | null>((r) => {
    p.on("error", (e) => { 탈 = "못 띄웠다: " + e.message; r(null); });
    p.on("close", (c) => r(c));
  });
  clearTimeout(시계);

  const 걸린초 = (Date.now() - t0) / 1000;
  if (!탈 && code !== 0) 탈 = `클로드 코드가 ${code} 로 끝났다`;

  const 답 = await 문("/api/hand/job", {
    method: "PATCH",
    body: JSON.stringify({ id: j.id, 결과: 모은것, 탈, 걸린초 }),
  });
  console.log(`  → ${탈 ? "실패: " + 탈 : "끝"} · ${걸린초.toFixed(0)}초 · 적음: ${답.ok ? "예" : "아니오 " + String(답.error ?? "")}`);
}

console.log(`듣는다 · ${터} · 뿌리 ${뿌리} · 권한 ${권한}${한번만 ? " · 한 번만" : ` · ${쉬는초}초마다`}`);

for (;;) {
  const 답: Record<string, unknown> = await 문("/api/hand/job")
    .catch((e: unknown) => ({ error: String(e) }));
  if (답.error) console.log("못 물어봤다: " + String(답.error));
  const j = (답.job ?? null) as 일거리 | null;

  if (j) await 한건(j);
  else if (한번만) { console.log("대기 중인 일거리가 없다."); break; }

  if (한번만 && j) break;
  if (!j) await new Promise((s) => setTimeout(s, 쉬는초 * 1000));
}
