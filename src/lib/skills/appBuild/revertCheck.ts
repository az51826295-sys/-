/**
 * **앞 회차의 고침이 되돌려졌나** (205회차 09-23).
 *
 * 왜 생겼나: "제목 글자만 키워 줘" 판(cfbc57c5)이 3줄을 바꿨고, 그중 한 줄은 **바로 앞 판이 고친
 * "클리어!" 를 도로 "클리어" 로 되돌린 것**이었다. 부탁 심판은 "다른 부분은 건드리지 않았다" 고 통과시켰다.
 * 말로 보는 심판은 이걸 못 본다 — **기계가 줄을 대 봐야** 안다.
 *
 * 셈법: (앞앞 판 → 앞 판) 에서 **새로 들어온 줄**이 (앞 판 → 이번 판) 에서 **사라지고 앞앞 판의 줄로 돌아갔으면** 되돌림이다.
 * 순수 함수라 심어서 잴 수 있다. 줄 단위 · 공백만 다른 줄은 같은 줄로 본다.
 */
const norm = (l: string) => l.replace(/\s+/g, " ").trim();
const lines = (s: string) => s.split(/\r?\n/).map(norm);

/** 앞 판이 새로 넣은 줄(앞앞 판에 없던 줄)과, 앞 판이 지운 줄(앞앞 판에 있던 줄). 순서는 안 본다 — 집합이다. */
function delta(before: string, after: string): { added: Set<string>; removed: Set<string> } {
  const b = new Set(lines(before)), a = new Set(lines(after));
  const added = new Set([...a].filter((l) => l && !b.has(l)));
  const removed = new Set([...b].filter((l) => l && !a.has(l)));
  return { added, removed };
}

export type Reverted = { line: string; 되돌아간줄: string | null };

/**
 * @param prevPrev 앞앞 판 · @param prev 앞 판 · @param cur 이번 판
 * 돌려주는 것: 앞 판이 넣었는데 이번 판에서 사라진 줄들. 그 자리에 앞앞 판의 줄이 다시 나타났으면 `되돌아간줄` 에 적힌다.
 */
export function revertedFixes(prevPrev: string, prev: string, cur: string): Reverted[] {
  const fix = delta(prevPrev, prev);          // 앞 판의 고침
  const now = new Set(lines(cur));
  // **되돌림 = 앞 판이 지운 옛 줄이 돌아온 것**(212회차 09-25). 처음 판(205회차)은 앞 판이 넣은 줄이 *사라지기만 해도* 잡았다 —
  // 위 셈법 주석과 달랐다. 그 탓에 판 9 2회차에서 `riseGravity: 0.44` 를 0.30 으로 *고치는* 것까지 되돌림으로 찍혀,
  // 고리가 앞 판의 잘못된 값을 손대지 못하고 4바퀴 내내 "되돌림" 벌점만 받다가 앞 판과 똑같은 파일을 냈다.
  // 고친 줄을 다시 고치는 건 고침이지 되돌림이 아니다. 옛 줄이 그대로 돌아왔을 때만 잡는다.
  const back = [...fix.removed].filter((r) => now.has(r));
  if (!back.length) return [];
  const gone = [...fix.added].filter((l) => !now.has(l));
  return back.map((r, i) => ({ line: gone[i] ?? gone[0] ?? "", 되돌아간줄: r }));
}

type F = { path: string; contents: string };
/**
 * 파일 묶음끼리 대 본다 — 고리가 바퀴마다 부르는 꼴. 같은 경로끼리만 견준다.
 * 돌려주는 것은 **고장 문장**들이다: 그대로 `verdict.broken` 에 얹히면 고치는 자리가 다음 바퀴에 본다.
 */
export function revertBroken(prevPrev: F[] | null | undefined, prev: F[] | null | undefined, cur: F[]): string[] {
  if (!prevPrev?.length || !prev?.length) return [];
  const out: string[] = [];
  for (const c of cur) {
    const a = prevPrev.find((f) => f.path === c.path), b = prev.find((f) => f.path === c.path);
    if (!a || !b) continue;
    for (const r of revertedFixes(a.contents, b.contents, c.contents)) {
      out.push(`되돌림: 앞 판이 고친 줄이 사라졌다 — "${r.line.slice(0, 80)}"${r.되돌아간줄 ? ` (앞앞 판의 "${r.되돌아간줄.slice(0, 60)}" 로 돌아감)` : ""}`);
    }
  }
  return out;
}
