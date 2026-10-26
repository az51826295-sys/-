/**
 * **듣는 쪽의 경계를 잰다** (10-26). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/laptop-job-test.mts [--sabotage]
 *
 * 앱 → 노트북 고리에서 제일 위험한 칸은 "어디서 돌리나" 다. 서버가 보낸 폴더를
 * 그대로 따르면 남의 서버가 내 기계 아무 데서나 클로드 코드를 돌리게 된다.
 * 그래서 그 판정만 떼어 와서 잰다 — DB·클로드 코드 없이 돈다.
 *
 * `--sabotage` 는 자가 눈먼 건 아닌지 본다(통과만 보고 적지 않으려고).
 */
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { resolveJobFolder } from "../../../src/lib/hand/jobFolder";

const 심기 = process.argv.includes("--sabotage");

/* 심은 판: 뿌리 밖을 막지 않는 자. 자가 멀쩡하면 이 판에서 실패가 나와야 한다. */
const 판정 = 심기
  ? (뿌리: string, 받은: string | null) => ({ folder: 받은 ? join(뿌리, received(받은)) : 뿌리, ignored: false })
  : resolveJobFolder;
function received(s: string) { return s; }

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

const 집 = mkdtempSync(join(tmpdir(), "rk-job-"));
const 뿌리 = join(집, "내게임");
mkdirSync(join(뿌리, "art"), { recursive: true });
mkdirSync(join(집, "내게임2"), { recursive: true });   /* 앞글자가 같은 이웃 — startsWith 함정 */
mkdirSync(join(집, "남의것"), { recursive: true });

/* ── 안으로 보내면 따른다 ── */
const a = 판정(뿌리, "art");
재기("뿌리 안 폴더는 따른다", a.folder.endsWith("art" ) && !a.ignored, { folder: a.folder });

const b = 판정(뿌리, null);
재기("안 보내면 뿌리에서 돈다", b.folder === 뿌리 || b.folder.endsWith("내게임"), { folder: b.folder });

const c = 판정(뿌리, "   ");
재기("빈 값도 뿌리에서 돈다", !c.ignored && c.folder.endsWith("내게임"), { folder: c.folder });

/* ── 밖으로 보내면 막는다 — 여기가 경계다 ── */
for (const [이름, 보낸것] of [
  ["위로 올라가기", ".." + sep + "남의것"],
  ["절대경로", process.platform === "win32" ? "C:\\Windows" : "/etc"],
  ["여러 번 올라가기", ".." + sep + ".." + sep + ".."],
  ["앞글자가 같은 이웃", ".." + sep + "내게임2"],
] as const) {
  const r = 판정(뿌리, 보낸것);
  const 뿌리안 = r.folder === 뿌리 || r.folder.startsWith(뿌리 + sep);
  재기(`밖으로 못 나간다 — ${이름}`, 뿌리안 && r.ignored, { 보낸것, folder: r.folder, ignored: r.ignored });
}

/* ── 심링크로 돌아 나가기 ── */
let 링크됐나 = false;
try {
  symlinkSync(join(집, "남의것"), join(뿌리, "샛길"), "junction");
  링크됐나 = true;
} catch { /* 윈도에선 권한이 필요할 수 있다 */ }
if (링크됐나) {
  const r = 판정(뿌리, "샛길");
  재기("심링크로도 못 나간다", (r.folder === 뿌리 || r.folder.startsWith(뿌리 + sep)) && r.ignored,
    { folder: r.folder, ignored: r.ignored });
} else {
  console.log("못 잼  심링크 — 이 기계에서 링크를 못 만들었다 (실패가 아니다)");
}

if (심기) {
  console.log(나쁨 ? `\n심은 판에서 ${나쁨}개 잡았다 — 자가 산다` : "\n**심었는데 다 통과했다 — 자가 눈멀었다**");
  process.exit(나쁨 ? 0 : 1);
}
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
