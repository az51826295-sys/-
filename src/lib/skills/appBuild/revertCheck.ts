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
  const out: Reverted[] = [];
  for (const l of fix.added) {
    if (now.has(l)) continue;                  // 고침이 살아 있다
    // 앞 판이 지웠던 줄 중 이번 판에 다시 나타난 것이 있나 — 있으면 명백한 되돌림
    const back = [...fix.removed].find((r) => now.has(r)) ?? null;
    out.push({ line: l, 되돌아간줄: back });
  }
  return out;
}
