"""선별 세션 — 심판이 거른 것을 **사람이 고른다**. 그 선택이 다음 심판의 재료다.

2026-08-26 사장님 지시: "인간한테 중간에 결과물을 주고, 인간이 선택하는 대로
심판자 구성."

지금까지의 순서는 [생성 → 기계 심판 → 기계가 첫 통과분 채택]이었다. 마지막 칸을
사람에게 넘긴다:

    생성 → 기계 심판(하드 스펙: 격자·획·팔레트…) → **사람이 고름** → 그 선택이
    골든 positive이자 취향 문턱의 재료 → holdout을 통과할 때만 자동 심판으로 승격

이 도구는 두 가지만 한다. **판정하지 않는다.**
  sheet   후보를 번호 붙여 한 장으로 (사람이 볼 판)
  record  고른 번호를 출처와 함께 적는다 (누가·언제·무엇을 보고 골랐나)

기록 규율:
- **보여준 것 전부**를 남긴다(shown). 고른 것만 남기면 나중에 "무엇 중에서
  골랐나"를 복원할 수 없고, 그러면 rejected가 반례가 되지 못한다.
- 보여주지 않은 것은 고를 수 없다(번호 검증). 사후에 표본을 늘리지 않는다.
- 한 세션은 한 파일이고 덮어쓰지 않는다(--force 없이는).

  python -X utf8 tools/pick_session.py sheet --root out/icons/pick-v1 \\
      --out out/icons/pick-v1/sheet.html
  python -X utf8 tools/pick_session.py record --root out/icons/pick-v1 \\
      --pick 01_save=2 --pick 03_map=5 --by 사장님 --out data/picks/pick-v1.json
"""
from __future__ import annotations

import argparse
import base64
import glob
import hashlib
import html
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import icon_lane                            # noqa: E402
from tools import icon_judge                             # noqa: E402


def load_pool(root: str) -> list:
    """후보 풀을 읽는다. `<root>/candidates/<개념>/cNN.(svg|png)` 구조.

    매체는 섞여도 된다 — 아이콘(SVG)이든 풍경(PNG)이든 사람이 고르는 절차는
    같다. 번호는 파일 이름 순서로 **고정**된다: 사람이 본 번호와 기록의 번호가
    같아야 한다. 정렬을 바꾸면 기록이 거짓말이 된다.
    """
    base = os.path.join(root, "candidates")
    groups = []
    for gdir in sorted(glob.glob(os.path.join(base, "*"))):
        if not os.path.isdir(gdir):
            continue
        paths = sorted(glob.glob(os.path.join(gdir, "*.svg"))
                       + glob.glob(os.path.join(gdir, "*.png")))
        items = []
        for k, path in enumerate(paths, 1):
            with open(path, "rb") as f:
                blob = f.read()
            item = {"no": k, "path": os.path.relpath(path, ROOT),
                    "kind": "svg" if path.endswith(".svg") else "png",
                    "sha1": hashlib.sha1(blob).hexdigest()[:12]}
            if item["kind"] == "svg":
                item["svg"] = blob.decode("utf-8")
                item["structure_hash"] = icon_lane.structure_hash(item["svg"])
            else:
                item["b64"] = base64.b64encode(blob).decode("ascii")
                item["structure_hash"] = item["sha1"]   # 픽셀은 바이트가 서명
            items.append(item)
        if items:
            groups.append({"group": os.path.basename(gdir), "items": items})
    return groups


PAGE = """<!doctype html>
<meta charset="utf-8">
<title>선별 세션 - 고르실 차례입니다</title>
<style>
  body {{ font: 15px/1.55 system-ui, sans-serif; margin: 28px;
         background: #fff; color: #111827; }}
  h2 {{ margin: 26px 0 6px; font-size: 16px; }}
  .row {{ display: flex; flex-wrap: wrap; gap: 12px; }}
  .cell {{ width: 132px; border: 1px solid #e5e7eb; border-radius: 10px;
           padding: 10px; text-align: center; }}
  .cell svg {{ width: 56px; height: 56px; color: #111827; }}
  .cell img {{ width: 100%; border-radius: 6px;
               image-rendering: pixelated; }}   /* 도트를 뭉개지 않는다 */
  .wide {{ width: 300px; }}
  .no {{ font-weight: 700; margin-top: 6px; }}
  .meta {{ font-size: 11px; color: #6b7280; }}
  .note {{ color: #6b7280; font-size: 13px; }}
  code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 4px; }}
  @media (prefers-color-scheme: dark) {{
    body {{ background: #0b0f19; color: #e5e7eb; }}
    .cell {{ border-color: #374151; }} .cell svg {{ color: #e5e7eb; }}
    code {{ background: #1f2937; }}
  }}
</style>
<h1>선별 세션 — {set_name}</h1>
<p class="note">여기 있는 것은 <b>기계 심판을 통과한 후보</b>뿐입니다(격자·획
굵기·팔레트·여백·요소·용량). 기계는 여기까지만 합니다. <b>어느 것이 개념에
맞고 세트에 어울리는지는 사장님이 고르십니다.</b> 고른 번호를 말씀해 주시면
그대로 기록합니다 — 고른 것과 <i>고르지 않은 것</i> 둘 다 다음 심판의 재료가
됩니다.</p>
<p class="note">답하실 형식: <code>{example}</code></p>
{body}
<p class="note">후보 {total}개 / 기계 판정은 전부 PASS(하드 스펙 기준) ·
생성 {ts}</p>
"""


def _verdict_of(item: dict, doc: dict) -> str:
    """판정을 **만들지 않는다** — 기존 심판을 불러 옮겨 적을 뿐이다.

    SVG는 아이콘 심판, PNG는 그림 레인 심판. 못 부르면 빈 칸으로 둔다.
    """
    try:
        if item["kind"] == "svg":
            return icon_judge.judge_svg(item["svg"], doc)["verdict"]
        from tools import image_lane_run as image_lane
        return image_lane.judge_image(os.path.join(ROOT, item["path"]),
                                      image_lane.load_spec())["verdict"]
    except Exception:                       # noqa: BLE001 - 판정은 부수적이다
        return ""


def build_sheet(groups: list, set_name: str, doc: dict) -> str:
    blocks = []
    for g in groups:
        cells = []
        for it in g["items"]:
            verdict = _verdict_of(it, doc)
            if it["kind"] == "svg":
                body, wide = it["svg"], ""
            else:
                body = ('<img alt="{} #{}" src="data:image/png;base64,{}">'
                        .format(html.escape(g["group"]), it["no"], it["b64"]))
                wide = " wide"
            cells.append(
                '<div class="cell{wide}">{body}<div class="no">{g} #{no}</div>'
                '<div class="meta">{v} · {sha}</div></div>'.format(
                    wide=wide, body=body, g=html.escape(g["group"]),
                    no=it["no"], v=verdict, sha=it["sha1"]))
        blocks.append("<h2>{}</h2><div class='row'>{}</div>".format(
            html.escape(g["group"]), "".join(cells)))
    example = " ".join(f'{g["group"]}=1' for g in groups[:2]) or "01_save=2"
    return PAGE.format(set_name=html.escape(set_name), body="\n".join(blocks),
                       example=html.escape(example),
                       total=sum(len(g["items"]) for g in groups),
                       ts=time.strftime("%Y-%m-%d %H:%M"))


def record_picks(groups: list, picks: dict, by: str, set_name: str,
                 note: str = "") -> dict:
    """고른 번호를 출처와 함께 기록한다. 보여준 것 전부를 같이 남긴다.

    고르지 않은 후보는 `rejected`가 된다 — 사람이 실제로 보고 안 고른 것이라
    합성 변이보다 훨씬 좋은 반례다.
    """
    session = {"id": set_name, "by": by, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
               "note": note, "groups": [], "picked": [], "rejected": [],
               "undecided_items": [], "shown_total": 0}
    for g in groups:
        want = picks.get(g["group"])
        wanted = ([] if want is None else
                  [want] if isinstance(want, int) else list(want))
        numbers = {it["no"] for it in g["items"]}
        for w in wanted:
            if w not in numbers:
                raise ValueError(
                    f'{g["group"]}에 {w}번 후보가 없다(있는 번호: '
                    f'{sorted(numbers)}) - 보여주지 않은 것은 고를 수 없다')
        rows = []
        for it in g["items"]:
            chosen = it["no"] in wanted
            rows.append({k: it[k] for k in ("no", "path", "sha1",
                                            "structure_hash")}
                        | {"picked": chosen})
            if chosen:
                session["picked"].append(it["path"])
            elif wanted:
                # 고른 것이 있는 자리에서만 '안 고른 것'이 반례가 된다
                session["rejected"].append(it["path"])
            else:
                # 아무도 고르지 않은 자리 = 거절이 아니라 **미판정**이다.
                # 참고용 그룹의 후보를 반례로 세면 기록이 거짓말이 된다.
                session["undecided_items"].append(it["path"])
        session["groups"].append({
            "group": g["group"], "shown": rows,
            "picked_no": wanted[0] if len(wanted) == 1 else None,
            "picked_nos": wanted})
        session["shown_total"] += len(rows)
    session["undecided_groups"] = [g["group"] for g in session["groups"]
                                   if not g["picked_nos"]]
    return session


def _parse_picks(pairs: list) -> dict:
    out = {}
    for p in pairs or []:
        if "=" not in p:
            raise ValueError(f"--pick 형식은 개념=번호 다: {p!r}")
        key, val = p.split("=", 1)
        nums = [int(v) for v in val.replace(" ", "").split(",") if v]
        # 한 개면 정수, 여러 개면 목록 - 타일처럼 "여러 개 고르는 자리"가 있다
        out[key.strip()] = nums[0] if len(nums) == 1 else nums
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="선별 세션(사람이 고른다)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s1 = sub.add_parser("sheet", help="후보를 번호 붙여 한 장으로")
    s1.add_argument("--root", required=True)
    s1.add_argument("--out", required=True)
    s1.add_argument("--set-name", default="")

    s2 = sub.add_parser("record", help="고른 번호를 출처와 함께 기록")
    s2.add_argument("--root", required=True)
    s2.add_argument("--pick", action="append", default=[],
                    help="개념=번호 (예: 01_save=2). 여러 개면 쉼표"
                         "(예: 02_tileset=3,7,12). 안 고른 개념은 비워 둔다")
    s2.add_argument("--by", default="사장님")
    s2.add_argument("--note", default="")
    s2.add_argument("--out", required=True)
    s2.add_argument("--force", action="store_true")
    s2.add_argument("--set-name", default="")

    args = ap.parse_args(argv)
    groups = load_pool(args.root)
    if not groups:
        print(f"후보가 없다: {args.root}/candidates/*")
        return 2
    set_name = args.set_name or os.path.basename(args.root.rstrip("/\\"))

    if args.cmd == "sheet":
        doc = icon_judge.load_spec()
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(build_sheet(groups, set_name, doc))
        print(args.out)
        return 0

    if os.path.exists(args.out) and not args.force:
        print(f"이미 있다(덮어쓰지 않는다): {args.out}")
        return 2
    session = record_picks(groups, _parse_picks(args.pick), args.by, set_name,
                           args.note)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(session, f, ensure_ascii=False, indent=2)
    print(f'기록: {args.out}')
    print(f'  고른 것 {len(session["picked"])} / 안 고른 것(반례) '
          f'{len(session["rejected"])} / 미판정 '
          f'{len(session["undecided_items"])} / 보여준 것 '
          f'{session["shown_total"]}')
    if session["undecided_groups"]:
        print(f'  아직 안 고른 개념: {", ".join(session["undecided_groups"])}')
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
