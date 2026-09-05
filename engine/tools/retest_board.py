"""취향 test–retest 판 (docs/taste-retest-v0-design.md).

  python -X utf8 tools/retest_board.py                 # 판 만들기
  python -X utf8 tools/retest_board.py --record "1=3 2=5 ..."   # 답 기록·집계

이미 고르신 자리 중 다섯을 **순서를 섞어** 다시 낸다. 1회차에 무엇을 고르셨는지는
화면에 없고, 대조표는 따로 봉해 둔다.

재는 것: **top-1 재현율** — 같은 후보를 다시 고르시는 비율. 이건 사장님 실력을
재는 게 아니라 **취향 관문의 천장**을 재는 것이다. 천장이 0.75보다 낮으면
지금 관문은 물리적으로 달성 불가이고, 지금까지의 NO-PROMOTE는 심판이 아니라
계측 한계를 잰 것이 된다.
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import math
import os
import random
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

SEED = 20260829          # 판을 섞는 시드. 기록에 남는다
N_CONCEPTS = 5
POOL_DIR = "out/icons/pick-v2/candidates"
PICK_FILES = ("data/picks/pick-v2.json", "data/picks/pick-v2-equipment.json")
# 2회차(설계 §6): 1회차에서 안 쓴 자리 전부. 표본을 이어 붙이는 게 아니라
# **독립 회차**이고 판정도 따로 낸다.
ROUND2_EXCLUDE = ("01_attack", "03_shop", "05_equipment", "06_stats",
                  "07_dialogue")
POOL_DIRS = {"pick-v2": "out/icons/pick-v2/candidates",
             "pick-v1": "out/icons/pick-v1/candidates"}
PICK_FILES_V1 = ("data/picks/pick-v1.json",)


def load_first_round(root: str = ROOT) -> dict:
    """1회차에 고르신 것 — 개념 → 파일명."""
    out = {}
    for f in PICK_FILES:
        p = os.path.join(root, f)
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        for g in d["groups"]:
            for s in g["shown"]:
                if s.get("picked"):
                    out[g["group"]] = os.path.basename(
                        s["path"].replace("\\", "/"))
    return out


def load_first_round_v1(root: str = ROOT) -> dict:
    out = {}
    for f in PICK_FILES_V1:
        p = os.path.join(root, f)
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        for g in d["groups"]:
            for s in g["shown"]:
                if s.get("picked"):
                    out[g["group"]] = os.path.basename(
                        s["path"].replace("\\", "/"))
    return out


def build(root: str = ROOT, seed: int = SEED, n: int = N_CONCEPTS,
          round2: bool = False) -> dict:
    """1회차 판(자리 5개) 또는 2회차 판(남은 자리 전부, 설계 §6)."""
    first = load_first_round(root)
    pools = {c: POOL_DIRS["pick-v2"] for c in first}
    if round2:
        v1 = load_first_round_v1(root)
        for c, f in v1.items():
            first[c + "@v1"] = f
            pools[c + "@v1"] = POOL_DIRS["pick-v1"]
    rng = random.Random(seed + (1 if round2 else 0))
    concepts = sorted(first)
    if round2:
        chosen = sorted(c for c in concepts if c not in ROUND2_EXCLUDE)
    else:
        chosen = sorted(rng.sample(concepts, min(n, len(concepts))))
    board = {"spec": "taste-retest-v0", "seed": seed,
             # 판을 낸 시각. 기록 시각과의 차가 **선별 경과의 상한**이다
             # (사장님이 그 사이에 다른 일을 하셨을 수 있으므로 상한이다).
             "board_ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
             "design": "docs/taste-retest-v0-design.md",
             "concepts": [], "key": {},
             "note": "대조표(key)는 사장님이 다시 고르신 뒤에만 연다"}
    for i, concept in enumerate(chosen, 1):
        base = pools.get(concept, POOL_DIR)
        group = concept.split("@", 1)[0]
        files = sorted(glob.glob(os.path.join(root, base, group, "*.svg")))
        names = [os.path.basename(f) for f in files]
        order = list(range(len(names)))
        rng.shuffle(order)                     # 1회차와 다른 순서로 낸다
        items = []
        for new_no, idx in enumerate(order, 1):
            items.append({"no": new_no, "file": names[idx],
                          "svg": open(files[idx], encoding="utf-8").read()})
            board["key"][f"{i}:{new_no}"] = names[idx]
        board["concepts"].append({"slot": i, "concept": concept,
                                  "pool": base, "items": items})
        board["key"][f"{i}:first_choice"] = first[concept]
    return board


def sheet(board: dict) -> str:
    """고르는 판. **판이 스스로 시간을 잰다.**

    게이트 ②-3(세트당 선별 시간)의 계측기다. 판을 낸 시각과 기록 시각의 차로
    재면 그 사이의 다른 일이 전부 섞여 상한이 무의미해진다(실측 132.8분·55.1분).
    그래서 **판이 열린 순간부터 다 고를 때까지**를 페이지가 직접 잰다.

    번호를 눌러 고르면 답 줄이 자동으로 만들어지고, 마지막에 걸린 시간이 같이
    나온다 — 사장님은 그 한 줄만 주시면 된다.
    """
    css = """<style>
  body { font: 15px/1.6 system-ui, sans-serif; margin:24px; background:#fff;
         color:#111827; }
  h2 { margin:26px 0 6px; font-size:16px; }
  .row { display:flex; flex-wrap:wrap; gap:12px; }
  .cell { width:118px; border:1px solid #e5e7eb; border-radius:10px;
          padding:10px; text-align:center; cursor:pointer;
          background:transparent; color:inherit; font:inherit; }
  .cell:hover { border-color:#9ca3af; }
  .cell[aria-pressed="true"] { border-color:#0d6e63; border-width:2px;
          background:#e2efec; }
  .cell svg { width:56px; height:56px; color:#111827; }
  .no { font-weight:700; margin-top:6px; }
  code { background:#f3f4f6; padding:1px 5px; border-radius:4px; }
  .note { color:#6b7280; font-size:13.5px; }
  #bar { position:sticky; top:0; background:#fff; border-bottom:1px solid #e5e7eb;
         padding:10px 0; margin-bottom:8px; z-index:2; }
  #out { font-family:ui-monospace,monospace; font-size:15px; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) body { background:#0b0f19; color:#e5e7eb; }
    :root:not([data-theme="light"]) .cell { border-color:#374151; }
    :root:not([data-theme="light"]) .cell svg { color:#e5e7eb; }
    :root:not([data-theme="light"]) .cell[aria-pressed="true"] {
        border-color:#58bfae; background:#133029; }
    :root:not([data-theme="light"]) #bar { background:#0b0f19;
        border-color:#1f2937; }
    :root:not([data-theme="light"]) code { background:#1f2937; }
  }
  :root[data-theme="dark"] body { background:#0b0f19; color:#e5e7eb; }
  :root[data-theme="dark"] .cell { border-color:#374151; }
  :root[data-theme="dark"] .cell svg { color:#e5e7eb; }
  :root[data-theme="dark"] .cell[aria-pressed="true"] { border-color:#58bfae;
      background:#133029; }
  :root[data-theme="dark"] #bar { background:#0b0f19; border-color:#1f2937; }
  :root[data-theme="dark"] code { background:#1f2937; }
</style>"""
    parts = [f'<title>다시 고르기</title>{css}',
             '<h1>다시 고르기 — 같은 자리, 섞은 순서</h1>',
             '<p class="note">자리마다 <b>하나씩</b> 눌러 주십시오. 전에 무엇을 '
             '고르셨는지는 보여드리지 않습니다.<br>'
             '이 판은 <b>고르는 데 걸린 시간을 스스로 잽니다</b> — 다 고르시면 '
             '아래 한 줄을 그대로 주시면 됩니다.</p>',
             '<div id="bar"><span id="out">아직 고른 것이 없습니다</span></div>']
    for c in board["concepts"]:
        parts.append(f'<h2>{c["slot"]}. {html.escape(c["concept"])}</h2>'
                     '<div class="row">')
        for it in c["items"]:
            parts.append(
                f'<button type="button" class="cell" aria-pressed="false" '
                f'data-slot="{c["slot"]}" data-no="{it["no"]}">'
                f'{it["svg"]}<div class="no">{it["no"]}</div></button>')
        parts.append("</div>")
    parts.append("""<script>
(function () {
  var t0 = Date.now(), picks = {}, total = %d;
  var out = document.getElementById("out");
  function render() {
    var keys = Object.keys(picks).sort(function (a, b) { return a - b; });
    if (!keys.length) { out.textContent = "아직 고른 것이 없습니다"; return; }
    var line = keys.map(function (k) { return k + "=" + picks[k]; }).join(" ");
    var mins = ((Date.now() - t0) / 60000);
    var done = keys.length === total;
    out.textContent = line + "   (" + keys.length + "/" + total + ", "
      + mins.toFixed(1) + "분" + (done ? " · 다 고르셨습니다" : "") + ")";
  }
  document.querySelectorAll(".cell").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var slot = btn.dataset.slot;
      document.querySelectorAll('.cell[data-slot="' + slot + '"]')
        .forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
      picks[slot] = btn.dataset.no;
      render();
    });
  });
})();
</script>""" % len(board["concepts"]))
    return "\n".join(parts)


def _binom_tail_ge(k: int, n: int, p: float) -> float:
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i)
               for i in range(k, n + 1))


def _binom_tail_le(k: int, n: int, p: float) -> float:
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i)
               for i in range(0, k + 1))


def _solve(fn, target: float) -> float:
    """단조 함수의 이분법. 표본이 작아 정규근사를 쓰지 않는다."""
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if fn(mid) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _clopper_pearson(k: int, n: int, alpha: float = 0.05) -> tuple:
    """정확 이항 구간(Clopper-Pearson). n=5에서도 참인 구간을 준다."""
    if n == 0:
        return (None, None)
    lo = 0.0 if k == 0 else _solve(
        lambda p: _binom_tail_ge(k, n, p), alpha / 2)
    hi = 1.0 if k == n else _solve(
        lambda p: -_binom_tail_le(k, n, p), -alpha / 2)
    return (round(lo, 4), round(hi, 4))


def tally(board: dict, answers: dict) -> dict:
    """설계 §3 — top-1 재현율과 정확 이항 구간.

    `answers`는 {자리: [번호...]}. 등록된 질문은 **자리마다 하나**이므로:

    - `strict`  : 하나만 고른 자리만 센다(등록된 판정식). 여러 개 고른 자리는
                  질문에 답한 것이 아니므로 **미정의**로 빼고 사유를 남긴다.
    - `inclusive`: 1회차 선택이 이번에 고른 집합 안에 있는가 — 기술 통계다.
                  여러 개를 고르면 우연히 맞을 확률이 올라가므로(그 자리의
                  `고른 수 / 후보 수`) **판정에 쓰지 않는다.**
    """
    k = n = 0
    inc_k = inc_n = 0
    chance_terms = []
    rows, skipped = [], []
    for c in board["concepts"]:
        slot = c["slot"]
        picks = answers.get(slot) or []
        first = board["key"].get(f"{slot}:first_choice")
        pool = len(c["items"])
        if not picks:
            rows.append({"slot": slot, "concept": c["concept"],
                         "answer": None, "same": None})
            continue
        chosen = [board["key"].get(f"{slot}:{no}") for no in picks]
        inc_n += 1
        hit = first in chosen
        if hit:
            inc_k += 1
        chance_terms.append(len(picks) / pool)
        row = {"slot": slot, "concept": c["concept"], "answer": picks,
               "first_choice": first, "second_choice": chosen,
               "included": hit, "pool": pool}
        if len(picks) == 1:
            n += 1
            row["same"] = (chosen[0] == first)
            if row["same"]:
                k += 1
        else:
            row["same"] = None
            skipped.append({"slot": slot, "concept": c["concept"],
                            "why": f"{len(picks)}개를 고르셨다 - 1-of-N 질문에 "
                                   f"답한 것이 아니라 판정에서 뺀다"})
        rows.append(row)

    lo, hi = _clopper_pearson(k, n)
    if n == 0:
        verdict, why = "undefined", "no_single_pick_slots"
    elif hi is not None and hi < 0.75:
        verdict, why = "gate_unreachable", "upper_below_gate"
    elif lo is not None and lo >= 0.75:
        verdict, why = "gate_reachable", "lower_at_or_above_gate"
    else:
        verdict, why = "undefined", "interval_straddles_gate"
    chance = (sum(chance_terms) / len(chance_terms)) if chance_terms else None
    elapsed = None
    if board.get("board_ts"):
        try:
            t0 = time.mktime(time.strptime(board["board_ts"],
                                           "%Y-%m-%dT%H:%M:%S"))
            elapsed = round((time.time() - t0) / 60.0, 1)
        except ValueError:
            elapsed = None
    return {"spec": "taste-retest-v0", "verdict": verdict, "why": why,
            "selection_minutes_upper": elapsed,
            "selection_slots": len(board["concepts"]),
            "repeat_rate": (k / n if n else None), "k": k, "n": n,
            "ci95": [lo, hi], "gate": 0.75, "chance_single": round(1 / 6, 4),
            "inclusive": {"k": inc_k, "n": inc_n,
                          "rate": (inc_k / inc_n if inc_n else None),
                          "chance": (round(chance, 4) if chance else None),
                          "note": "기술 통계다. 여러 개를 고르면 우연 확률이 "
                                  "올라가므로 판정에 쓰지 않는다"},
            "skipped": skipped, "rows": rows}


def _parse_answers(text: str, board: dict) -> dict:
    """`1=3 2=5` 도 `01 2, 03 3,6 05 3` 도 받는다.

    사장님은 자리를 원래 개념 접두사(`01_attack`의 `01`)로도 부르신다. 그래서
    **0을 붙인 두 자리 토큰만 자리 머리**로 보고, 맨 숫자는 고른 번호로 본다 —
    그렇게 안 하면 `03 3,6` 의 `6`이 `06`(stats)으로 읽힌다(실제로 그랬다).
    `1=3` 처럼 등호를 쓰면 그 한 쌍은 그대로 자리=번호다.
    """
    by_slot = {c["slot"]: c for c in board["concepts"]}
    by_prefix = {}
    for c in board["concepts"]:
        by_prefix[c["concept"].split("_", 1)[0]] = c["slot"]
    out: dict = {}

    # 1) 등호 형식이 있으면 그것부터(가장 분명하다)
    import re
    for m in re.finditer(r"(\d+)\s*=\s*(\d+)", text):
        head, no = m.group(1), int(m.group(2))
        # 등호 형식은 내가 안내한 자리 번호(1..5)가 먼저다. 그 다음이 접두사.
        slot = (int(head) if int(head) in by_slot
                else by_prefix.get(head.zfill(2)))
        if slot:
            out.setdefault(slot, []).append(no)
    if out:
        return out

    # 2) 아니면 토큰을 훑는다. 0붙은 두 자리 = 자리 머리, 맨 숫자 = 고른 번호
    slot = None
    for tok in re.split(r"[\s,;]+", text.strip()):
        if not tok:
            continue
        if tok in by_prefix:
            slot = by_prefix[tok]
            out.setdefault(slot, [])
            continue
        if tok.isdigit() and slot is not None:
            out[slot].append(int(tok))
    return {k: v for k, v in out.items() if v}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--board", default="data/picks/retest-v1.board.json")
    ap.add_argument("--sheet", default="out/icons/retest-v1.html")
    ap.add_argument("--round2", action="store_true",
                    help="2회차 판(남은 자리 전부, 설계 §6)")
    ap.add_argument("--record", help='답: "1=3 2=5 ..."')
    ap.add_argument("--out", default="data/picks/retest-v1.json")
    a = ap.parse_args(argv)

    if a.record:
        board = json.load(open(os.path.join(ROOT, a.board), encoding="utf-8"))
        answers = _parse_answers(a.record, board)
        res = tally(board, answers)
        with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
            json.dump(res, fh, ensure_ascii=False, indent=2)
        lo, hi = res["ci95"]
        print(f"하나만 고른 자리에서 같음: {res['k']}/{res['n']} = "
              f"{(res['repeat_rate'] or 0):.2f}  95% [{lo}, {hi}]")
        print(f"  관문 0.75 · 무작위로 맞을 확률 {res['chance_single']}")
        inc = res["inclusive"]
        if inc["n"]:
            print(f"참고(판정 아님) 고른 집합에 포함: {inc['k']}/{inc['n']} = "
                  f"{(inc['rate'] or 0):.2f}  우연 {inc['chance']}")
        for r in res["rows"]:
            if not r.get("answer"):
                continue
            if r["same"] is None:
                mark = f"여러 개({len(r['answer'])}개) - 판정에서 뺌"
            elif r["same"]:
                mark = "같음"
            else:
                mark = f"다름({r['first_choice']} → {r['second_choice'][0]})"
            print(f"  {r['concept']:<14} {mark}")
        for sk in res["skipped"]:
            print(f"  ! {sk['concept']}: {sk['why']}")
        print(f"판정: {res['verdict']} ({res['why']})")
        print(f"기록: {a.out}")
        return 0

    board = build(round2=a.round2)
    os.makedirs(os.path.dirname(os.path.join(ROOT, a.board)), exist_ok=True)
    with open(os.path.join(ROOT, a.board), "w", encoding="utf-8") as fh:
        json.dump(board, fh, ensure_ascii=False, indent=2)
    path = os.path.join(ROOT, a.sheet)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(sheet(board))
    print(f"자리 {len(board['concepts'])}개 → {a.sheet}")
    for c in board["concepts"]:
        print(f"  {c['slot']}. {c['concept']} ({len(c['items'])}개, 순서 섞음)")
    print(f"대조표: {a.board} (다시 고르신 뒤에 연다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
