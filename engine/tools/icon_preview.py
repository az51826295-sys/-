"""사람 눈 게이트용 미리보기 — 통과한 아이콘을 한 장에 모아 실제로 보여준다.

심판은 스펙 적합만 잰다. "이게 저장처럼 보이나"는 기계 심판이 없다
(art_mood_fit과 같은 자리). 그러니 사장님이 **눈으로 볼 판**이 필요하다.
이 도구는 판정을 만들지 않는다 — icon_judge의 판정을 그대로 옮겨 적을 뿐이다.

  python -X utf8 tools/icon_preview.py --dir out/icons/rpg-ui-v1-strict \
      --dir out/icons/rpg-ui-curvy --out out/icons/preview.html
"""
from __future__ import annotations

import argparse
import glob
import html
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import icon_judge                             # noqa: E402

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>아이콘 레인 - 심판 통과분</title>
<style>
  body {{ font: 15px/1.5 system-ui, sans-serif; margin: 32px;
         background: #ffffff; color: #111827; }}
  h2 {{ margin: 28px 0 8px; font-size: 16px; }}
  .grid {{ display: flex; flex-wrap: wrap; gap: 14px; }}
  .cell {{ width: 150px; border: 1px solid #e5e7eb; border-radius: 10px;
           padding: 12px; text-align: center; }}
  .cell svg {{ width: 56px; height: 56px; color: #111827; }}
  .name {{ margin-top: 8px; font-size: 13px; }}
  .v {{ font-size: 12px; margin-top: 4px; }}
  .PASS {{ color: #15803d; }} .FAIL {{ color: #b91c1c; }}
  .UNDEFINED {{ color: #a16207; }}
  .why {{ font-size: 11px; color: #6b7280; margin-top: 4px;
          word-break: break-all; }}
  .note {{ color: #6b7280; font-size: 13px; }}
  @media (prefers-color-scheme: dark) {{
    body {{ background: #0b0f19; color: #e5e7eb; }}
    .cell {{ border-color: #374151; }}
    .cell svg {{ color: #e5e7eb; }}
  }}
</style>
<h1>아이콘 레인 — 생성 → 심판 → 통과분</h1>
<p class="note">심판이 재는 것은 <b>스펙 적합</b>뿐이다(격자·획·팔레트·여백·패스
수·요소·용량). "개념처럼 보이나"는 기계 심판이 없다 — 이 페이지가 그 사람 눈
게이트다.</p>
{body}
"""


def cell(path: str, doc: dict) -> str:
    with open(path, encoding="utf-8") as f:
        svg = f.read()
    res = icon_judge.judge_svg(svg, doc)
    bad = [r["rule"] for r in res["rules"] if r["ok"] is False]
    why = ("어긴 규칙: " + ", ".join(bad)) if bad else ""
    return ('<div class="cell">{svg}<div class="name">{name}</div>'
            '<div class="v {v}">{v}</div><div class="why">{why}</div></div>'
            ).format(svg=svg, name=html.escape(os.path.basename(path)),
                     v=res["verdict"], why=html.escape(why))


def build(dirs: list, doc: dict) -> str:
    out = []
    for d in dirs:
        paths = sorted(glob.glob(os.path.join(d, "*.svg")))
        if not paths:
            continue
        out.append("<h2>{}</h2><div class='grid'>{}</div>".format(
            html.escape(d), "".join(cell(p, doc) for p in paths)))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="아이콘 미리보기(사람 눈 게이트)")
    ap.add_argument("--dir", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--spec", default=icon_judge.SPEC_PATH)
    args = ap.parse_args(argv)
    doc = icon_judge.load_spec(args.spec)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(PAGE.format(body=build(args.dir, doc)))
    print(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
