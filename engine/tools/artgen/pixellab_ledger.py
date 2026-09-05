"""PixelLab 생성 원장 — 주문마다 잔량을 재서 **실제 소모**를 기록한다.

  python -X utf8 tools/artgen/pixellab_ledger.py            # 잔량과 지금까지의 소모

**왜 생겼나.** 2026-08-27, 나는 타일셋 주문 1건을 "생성 1회"로 세고 사장님께
"잔량 19 → 15"라고 보고했다. 실제 잔량은 **9**였다. 21에서 시작해 성공한 타일셋
4건에 **12회**가 나갔다 - 한 건에 3회다. 명세 어디에도 그 수가 안 적혀 있고, 나는
확인하지 않고 1이라고 가정했다.

Anthropic 쪽은 원장이 있어서 이런 일이 안 났다. PixelLab 쪽만 없었다.
`docs/measurement-rules.md` §8이 "지출 상한은 실험 승인과 별개의 결정"이라고
말하는데, **얼마 나가는지 모르면 상한도 없는 것과 같다.**

이 도구는 주문 전후로 `/balance` 를 읽어 차이를 기록한다. 추측하지 않는다.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER = os.path.join(ROOT, "data", "pixellab_ledger.jsonl")
BASE = "https://api.pixellab.ai/v2"


def _key(root: str = ROOT) -> str:
    with open(os.path.join(root, ".secrets", "pixellab.key"),
              encoding="ascii") as fh:
        return fh.read().strip()


def balance(root: str = ROOT) -> dict:
    req = urllib.request.Request(
        BASE + "/balance", headers={"Authorization": f"Bearer {_key(root)}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def generations(root: str = ROOT) -> float:
    return float(balance(root)["subscription"]["generations"])


def record(what: str, before: float, after: float, ok: bool,
           note: str = "", stamp: str | None = None) -> dict:
    """한 주문의 실제 소모. **시각은 밖에서 준다** - 안에서 만들면 재실행이 안 된다."""
    row = {"what": what, "before": before, "after": after,
           "spent": round(before - after, 3), "ok": ok, "note": note}
    if stamp:
        row["at"] = stamp
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


class Order:
    """주문 하나를 감싸 잔량 차이를 원장에 남긴다.

        with Order("create-tileset water") as o:
            ...주문...
        print(o.spent)
    """

    def __init__(self, what: str, note: str = "", root: str = ROOT):
        self.what, self.note, self.root = what, note, root
        self.before = self.after = self.spent = None
        self.ok = False

    def __enter__(self):
        self.before = generations(self.root)
        return self

    def __exit__(self, exc_type, *_):
        self.ok = exc_type is None
        try:
            self.after = generations(self.root)
            self.spent = round(self.before - self.after, 3)
            record(self.what, self.before, self.after, self.ok, self.note)
        except Exception as exc:                   # 원장 실패가 주문을 못 삼킨다
            print(f"원장 기록 실패: {exc}", file=sys.stderr)
        return False


def rows() -> list:
    if not os.path.exists(LEDGER):
        return []
    with open(LEDGER, encoding="utf-8") as fh:
        return [json.loads(ln) for ln in fh if ln.strip()]


def main(argv=None) -> int:
    b = balance()
    s = b["subscription"]
    print(f"생성 잔량 {s['generations']} / {s['total']}  "
          f"(상태 {s['status']})  USD 크레딧 {b['credits']['usd']}")
    r = rows()
    if not r:
        print("원장이 비어 있다 - 08-27 이전 주문은 기록되지 않았다(도구가 없었다)")
        return 0
    print(f"\n{'무엇':34} {'소모':>6}  결과")
    for row in r:
        print(f"{row['what']:34} {row['spent']:>6}  "
              f"{'성공' if row['ok'] else '실패'}  {row.get('note', '')}")
    print(f"\n원장 합계 {sum(x['spent'] for x in r):.1f}회")
    return 0


if __name__ == "__main__":
    sys.exit(main())
