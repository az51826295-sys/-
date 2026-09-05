"""SVG 래스터 — hidden 규칙 중 그림으로만 잴 수 있는 것들.

사전 등록: `docs/icon-raster-rules-design.md`(규약·정의·문턱 출처). 이 모듈은
**정의를 구현할 뿐** 문턱을 정하지 않는다.

- `optical_weight` : 96px 렌더의 알파 커버리지 평균(0~1)
- `roundtrip_diff` : 원본 SVG와 **파서가 다시 써낸** SVG의 픽셀 차이
- `contrast`       : 여기 없다. 색 문맥이 없어 정의 자체가 불가(설계 §1)

못 그린 것은 값이 아니라 `None`이다 — 미측정은 fail이 아니라 undefined다
(judge-bench-v1.2 규율 4).
"""
from __future__ import annotations

import functools
import io
import os
import tempfile
import xml.etree.ElementTree as ET

from genesis import icon_lane

RENDER_PX = 96                  # hidden 스펙 roundtrip.render_px (동결값)
RENDER_COLOR = "#000000"        # 기하 측정용. 판정용 색 문맥이 아니다(설계 §0)


def available() -> bool:
    """래스터 경로가 이 기계에 깔려 있나.

    없으면 "잴 수 없다"가 아니라 **아직 계측기가 없다**로 다룬다 — 도구가 없다고
    후보를 미정의로 떨어뜨리면, 기계를 옮겼을 뿐인데 판정이 바뀐다.
    """
    try:
        import pypdfium2                                  # noqa: F401
        from reportlab.graphics import renderPDF          # noqa: F401
        from svglib.svglib import svg2rlg                 # noqa: F401
    except ImportError:
        return False
    return True


def _fmt(v: float) -> str:
    """좌표를 다시 쓸 때의 표기. 값이 같으면 문자열도 같아야 한다."""
    return f"{v:g}"


def reemit_path(d: str) -> str:
    """파서가 읽은 그대로 path 데이터를 다시 써낸다.

    파서가 무언가를 놓치면(망가진 d에서 중간에 멈추는 등) 여기서 사라지고,
    그러면 왕복 렌더가 달라진다 — 그게 이 함수의 쓸모다.
    """
    parts = []
    for cmd, args in icon_lane.parse_path(d or ""):
        parts.append(cmd if not args
                     else cmd + " " + " ".join(_fmt(a) for a in args))
    return " ".join(parts)


def reemit_svg(svg: str) -> str | None:
    """SVG 전체를 파서의 눈으로 다시 써낸다. 못 읽으면 None."""
    try:
        root = ET.fromstring(svg or "")
    except ET.ParseError:
        return None
    for el in root.iter():
        if icon_lane._local(el.tag) == "path" and "d" in el.attrib:
            el.set("d", reemit_path(el.attrib["d"]))
    return ET.tostring(root, encoding="unicode")


def _prepare(svg: str, px: int) -> str | None:
    """렌더 규약을 입힌다: 크기 고정 + **모든 색을 하나로 정규화**.

    색을 지우는 이유(설계 §0): 우리는 기하를 재는데 회색조 렌더는 색의 밝기를
    같이 담는다. 빨간 획은 검은 획보다 밝아서 커버리지가 낮게 나온다 — 그러면
    "시각 무게"가 그림이 아니라 색을 재는 셈이다. 색을 하나로 눌러 두면
    남는 차이는 기하뿐이다. `fill="none"`은 색이 아니라 **안 그린다**는 뜻이라
    건드리지 않는다.
    """
    try:
        root = ET.fromstring(svg or "")
    except ET.ParseError:
        return None
    root.set("width", str(px))
    root.set("height", str(px))
    if not root.get("viewBox"):
        return None                     # 좌표계가 없으면 크기를 못 맞춘다
    for el in root.iter():
        for k, v in list(el.attrib.items()):
            if k in ("stroke", "fill") and isinstance(v, str):
                if v.strip().lower() != "none":
                    el.set(k, RENDER_COLOR)
            elif isinstance(v, str) and "currentColor" in v:
                el.set(k, v.replace("currentColor", RENDER_COLOR))
    return ET.tostring(root, encoding="unicode")


@functools.lru_cache(maxsize=512)
def _render_rows(svg: str, px: int) -> tuple | None:
    """렌더 결과를 SVG 문자열로 캐시한다.

    골든·세트 판정은 **같은 자산을 스펙만 바꿔** 여러 번 채점한다. 그림은
    스펙과 무관하므로 매번 다시 그리면 그만큼이 통째로 낭비다(실측: 골든
    테스트 55초 → 캐시 후 대폭 단축). 불변 튜플로 돌려주고 호출자가 목록으로
    바꾼다 — 캐시된 값을 밖에서 고칠 수 없게.
    """
    return _render_rows_uncached(svg, px)


def render_coverage(svg: str, px: int = RENDER_PX) -> list | None:
    """96×96 커버리지 지도(0~1). 흰 바탕에 검은 획을 그려 밝기를 뒤집는다.

    경로: SVG → svglib → reportlab PDF → PDFium 래스터(설계 §4). 알파 채널이
    없는 대신 획이 순수 검정이므로 커버리지 = (255 - 회색값)/255 로 같은 값이
    나온다.
    """
    rows = _render_rows(svg, px)
    return None if rows is None else [list(r) for r in rows]


def _render_rows_uncached(svg: str, px: int):
    prepared = _prepare(svg, px)
    if prepared is None:
        return None
    try:
        import pypdfium2 as pdfium
        from reportlab.graphics import renderPDF
        from svglib.svglib import svg2rlg
    except ImportError:
        return None

    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(suffix=".svg")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(prepared)
        drawing = svg2rlg(tmp)
        if drawing is None:
            return None
        page = pdfium.PdfDocument(io.BytesIO(renderPDF.drawToString(drawing)))[0]
        img = page.render(scale=px / page.get_width()).to_pil().convert("L")
        if img.size != (px, px):
            from PIL import Image
            img = img.resize((px, px), Image.LANCZOS)
        data = img.tobytes()          # getdata()는 Pillow 14에서 사라진다
    except Exception:                   # 렌더러가 못 그린 입력 → 미측정
        return None
    finally:
        if tmp and os.path.isfile(tmp):
            os.unlink(tmp)
    return tuple(tuple((255 - data[y * px + x]) / 255 for x in range(px))
                 for y in range(px))


def optical_weight(svg: str, px: int = RENDER_PX) -> float | None:
    """시각 무게 = 커버리지 평균. 굵고 빽빽할수록 크다."""
    cov = render_coverage(svg, px)
    if cov is None:
        return None
    total = sum(sum(row) for row in cov)
    return round(total / (px * px), 6)


def coverage_diff(a: str, b: str, px: int = RENDER_PX) -> float | None:
    """두 SVG를 같은 규약으로 그려 픽셀 차이 평균(0~1). 하나라도 못 그리면 None.

    지표가 그림 변화에 실제로 반응하는지를 이 함수로 시험한다(이빨 검사).
    """
    ca, cb = render_coverage(a, px), render_coverage(b, px)
    if ca is None or cb is None:
        return None
    diff = sum(abs(ca[y][x] - cb[y][x]) for y in range(px) for x in range(px))
    return round(diff / (px * px), 6)


def roundtrip_diff(svg: str, px: int = RENDER_PX) -> float | None:
    """원본과 재출력본의 픽셀 차이 평균(0~1). 우리 해석 = 렌더러의 그림인가."""
    again = reemit_svg(svg)
    if again is None:
        return None
    return coverage_diff(svg, again, px)


def optical_weight_delta(svgs: list, px: int = RENDER_PX) -> float | None:
    """세트의 시각 무게 폭(최대−최소). 2건 미만이거나 못 잰 게 있으면 None."""
    if len(svgs) < 2:
        return None                     # 비교 대상이 없으면 0이 아니라 미정의
    weights = [optical_weight(s, px) for s in svgs]
    if any(w is None for w in weights):
        return None
    return round(max(weights) - min(weights), 6)
