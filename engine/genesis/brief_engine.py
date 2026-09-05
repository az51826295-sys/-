"""사양서 생성기 — 설계도 엔진이 **사양서를 낸다**. 내가 타이핑하지 않는다.

`docs/north-star-and-map.md` §3-1. 최종목표 4단계 중 **3단계(설계도 산출)**의 구멍.

2026-08-27 사장님: *"최종목표 기록하고 최종목표 토대로 만들어야지."*

그날 나는 GPT에게 넘길 사양서를 **손으로 177줄 타이핑했다.** 그건 그때 필요했지만
엔진이 아니다 — 참고 화면이 바뀌거나 스펙이 바뀌면 내가 다시 손으로 고쳐야 하고,
그러면 사장님이 바꾼 것이 자동으로 반영되지 않는다.

**사양서는 세 곳에서 나온다. 전부 이미 기계가 들고 있는 것이다.**

  품질 바       사장님이 가리킨 **레퍼런스 작품**의 실측 — 도달할 목표
  스타일 성경   사장님이 고른 **우리 자산 하나** — 지금의 기준선·팔레트
  규격 스펙     pixel-sprite-v*.yaml — 크기·색 상한·알파
  금지 표현     prompt_book.BANNED — 실측으로 확인된 함정과 그 증거

여기에 사장님이 정한 **요청 목록**만 얹으면 사양서가 된다. 무엇이 바뀌든 사양서가
따라 바뀐다. **그게 엔진이다.**

**품질 바와 스타일 성경은 다르다.** 처음 만들 때 내가 이 둘을 섞어서, 사양서가
목표치를 **우리 지형**(명암폭 56.6·채도 81)에서 뽑았다 — 사장님이 "퀄리티 낮다"고
하신 바로 그 수치를 목표로 적은 것이다. 비전 2단계는 *"품질 바를 레퍼런스 작품으로
박는다"* 이지 "우리 최선을 목표로 삼는다"가 아니다.

  품질 바     = 도달할 곳   (남의 작품. 사장님이 "이 정도로 가자"고 가리킨 것)
  스타일 성경 = 맞출 곳     (우리 것. 자산끼리 서로 어긋나지 않게 하는 기준)

사양서는 **둘 다** 싣고, 그 사이의 **간극을 그대로 보여준다.** 간극을 감추면
"목표 달성"이 우리 현재 수준을 뜻하게 된다.
"""
from __future__ import annotations

import json
import os

import yaml

from genesis import prompt_book as pb
from genesis import style_bible as sb


def _spec(path: str, root: str = ".") -> dict:
    with open(os.path.join(root, path), encoding="utf-8") as fh:
        return yaml.safe_load(fh)


# 품질 바의 축 → 스타일 성경의 같은 축. 이름은 사양서에 그대로 나간다.
_AXES = [("명암폭 (밝기 5~95%)", "luma_spread", "가장 중요합니다"),
         ("밝기 중앙값", "luma_median", "전체적으로 밝다/어둡다"),
         ("채도 중앙값", "saturation_median", "**0이면 안 됩니다**"),
         ("색 수", "colors", "적으면 실루엣처럼 보입니다")]


def _targets_table(bar: dict, bible: dict) -> str:
    """**목표(레퍼런스) · 지금(우리) · 간극**을 나란히 놓는다.

    간극을 감추면 "목표 달성"이 우리 현재 수준을 뜻하게 된다. 처음 만들 때 내가
    성경을 목표로 써서, 사장님이 "퀄리티 낮다"고 하신 바로 그 수치가 목표로
    적혔다. 그래서 두 열을 분리하고 차이를 계산해 보인다.
    """
    out = ["| 축 | 목표 (레퍼런스) | 지금 (우리 성경) | 간극 | 뜻 |",
           "|---|---|---|---|---|"]
    for name, key, why in _AXES:
        t, n = bar.get(key), bible.get(key)
        # 레퍼런스에서 **재지 않은 축**은 목표가 없다. 우리 값을 목표로 슬쩍
        # 올려놓지 않는다 - 미측정은 미측정이다(3값 규율).
        if t is None:
            out.append(f"| **{name}** | (레퍼런스 미측정) | {n} | - | {why} |")
            continue
        gap = "-" if n is None else f"**{n - t:+.0f}**"
        out.append(f"| **{name}** | **{t}** | {n} | {gap} | {why} |")
    bb = bible["ramps"]
    out.append(f"| 유채색 램프 | (레퍼런스 미측정) | 색상대 {bb['band_count']}개 · "
               f"중앙 {bb['median_steps']}단계 | - | "
               f"재질마다 그림자→중간→하이라이트 |")
    return "\n".join(out)


def _banned_table() -> str:
    out = ["| 금지 | 왜 |", "|---|---|"]
    for pattern, why in pb.BANNED:
        # 정규식을 사람이 읽을 문구로 바꾼다 - 사양서를 읽는 쪽은 사람/GPT다
        shown = (pattern.replace(r"\b", "").replace(r"\s+", " ")
                 .replace(r"(?!\s+(dress|tunic|shirt|robe))", "")
                 .replace("[0-9a-fA-F]{6}", "").strip())
        out.append(f"| `{shown}` | {why} |")
    return "\n".join(out)


def build(bible_name: str, requests: list, spec_path: str,
          bar: dict | None = None, note: str = "",
          root: str = ".") -> str:
    """사양서를 **생성한다.** 손으로 쓴 문장은 여기 없다 — 전부 자료에서 온다."""
    b = sb.load(bible_name, root=root)
    if bar is None:
        raise ValueError(
            "품질 바(레퍼런스 실측)가 없다. 우리 성경을 목표로 삼으면 "
            "'목표 달성'이 우리 현재 수준을 뜻하게 된다 — 비전 2단계는 "
            "품질 바를 **레퍼런스 작품으로** 박으라고 한다")
    doc = _spec(spec_path, root)
    profiles = doc["profiles"]
    lines = [
        f"# 픽셀 아트 발주 사양서 — 생성물",
        "",
        f"> `genesis/brief_engine.py` 가 만들었습니다. 손으로 고치지 마십시오 —",
        f"> 스타일 성경·규격 스펙·금지 목록이 바뀌면 다시 생성됩니다.",
        "",
        f"- **품질 바**: {bar.get('source', '레퍼런스')} — 도달할 곳",
        f"- **스타일 성경**: {b['name']} (고른 사람: {b['chosen_by']}) — 맞출 곳",
        f"- 규격: `{doc['spec_id']}`",
        (f"- 비고: {note}" if note else ""),
        "",
        "## 1. 목표 수치",
        "",
        "**목표는 레퍼런스입니다. 우리 현재 수준이 아닙니다.**",
        "간극 열이 우리가 얼마나 모자란지입니다 — 그걸 메우는 것이 이번 발주의 목적입니다.",
        "",
        _targets_table(bar, b),
        "",
        "핵심: 파스텔이든 무엇이든 **채도가 낮은 것과 명암이 없는 것은 다릅니다.**",
        "옅으면서도 어두운 곳과 밝은 곳이 확실히 갈려야 합니다.",
        "",
        "## 2. 램프",
        "",
        "좋은 픽셀 아트는 재질마다 **그림자→중간→하이라이트가 3~5단계로 묶인",
        "램프**를 쓰고, 모든 자산이 같은 램프에서 색을 꺼내 씁니다.",
        "그래서 프롬프트에 **재질과 그 재질의 명암을 같이** 적어 주십시오.",
        "",
        f"성경의 램프: 색상대 {b['ramps']['band_count']}개, "
        f"중앙 {b['ramps']['median_steps']}단계, "
        f"무채색 {len(b['ramps']['grey_steps'])}단계",
        "",
        "## 3. 절대 쓰면 안 되는 표현",
        "",
        "우리 기계가 **자동으로 거부**합니다. 실측으로 확인된 목록입니다.",
        "",
        _banned_table(),
        "",
        "**규칙: 속성을 '낮춰라/없애라'로 요구하면 그 극단(0)이 옵니다.**",
        "원하는 것을 지목하십시오 — 색은 이름이나 16진수로, 명암은 위치로",
        "(`deep shadow under the brim`, `bright highlight on the crown`).",
        "",
        "## 4. 규격 (부류별)",
        "",
        "| 부류 | 논리 크기 | 색 상한 | 알파 |",
        "|---|---|---|---|",
    ]
    for name, p in profiles.items():
        lines.append(f"| {name} | {p['logical_size']['width']}×"
                     f"{p['logical_size']['height']} | {p['max_colors']} | "
                     f"{'이진(반투명 없음)' if p['alpha_binary'] else '자유'} |")
    lines += [
        "",
        "> 큰 그림을 주셔도 됩니다. 우리가 이 크기로 줄이고 격자에 맞춥니다.",
        "> 배경은 투명으로 주시면 가장 깨끗합니다.",
        "",
        "## 5. 요청 목록",
        "",
        "| # | 무엇 | 부류 | 비고 |",
        "|---|---|---|---|",
    ]
    for i, r in enumerate(requests, 1):
        lines.append(f"| {i} | {r['what']} | {r.get('profile', '-')} | "
                     f"{r.get('note', '')} |")
    lines += [
        "",
        "**각 건마다 서로 다른 해석의 변형을 여러 개** 주십시오.",
        "우리는 여러 개를 뽑아 기계로 거른 뒤 사람이 고르는 방식으로 갑니다 —",
        "하나씩만 받으면 품질이 운에 맡겨집니다.",
        "",
        "## 6. 우리가 검사할 것",
        "",
        "1. §3의 금지 표현이 없을 것",
        "2. **명암을 지목**했을 것 (`shadow` / `highlight` / `light`)",
        "3. **색을 이름이나 16진수로 지목**했을 것",
        "",
        "나온 그림은 §1의 수치로 판정하고, **게임 바닥 위에 1:1로 올려서**",
        "경계 대비가 읽히는지 봅니다 — 따로 보면 괜찮은데 화면에 놓으면 묻히는",
        "것을 막기 위해서입니다.",
    ]
    return "\n".join(l for l in lines if l is not None)


def write(path: str, **kw) -> str:
    text = build(**kw)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    return path
