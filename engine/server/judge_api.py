"""판정 API — 연출가 엔진을 로키가 부를 수 있게 연다.

로키(`ai-workforce`)의 `art_bible` 기술은 **강제 가능한 말로** 설계도를 쓴다.
그런데 지금까지 **강제하는 쪽이 없었다** — 설계도를 쓰고 나면 그 뒤에 나올
자산이 그 팔레트를 지키는지 아무도 안 봤다.

그 검사는 여기 있다. 다시 쓰지 않고 서비스로 붙인다 — 로키는 TypeScript고
이쪽은 Python인데, 둘 중 하나를 옮기는 것보다 HTTP 하나가 싸고, 계측기가
한 곳에만 있는 편이 낫다(두 벌이면 언젠가 서로 다른 답을 낸다).

**여기는 거르기만 한다. 고르지 않는다.** 순위도 매기지 않는다 — 마지막 칸은
사람 것이다(2026-08-26 확정).
"""
from __future__ import annotations

import base64
import io
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi import APIRouter                                  # noqa: E402
from pydantic import BaseModel                                 # noqa: E402

from genesis import character_judge as cj                      # noqa: E402
from genesis import mesh_judge as mj                           # noqa: E402
from genesis import context_view as cv                         # noqa: E402
from genesis import prompt_book as pb                          # noqa: E402
from genesis import style_bible as sb                          # noqa: E402

router = APIRouter(prefix="/api/judge")

GROUND = os.path.join(ROOT, "data", "ground.png")


def _write(images: list, prefix: str) -> list:
    """base64 를 임시 파일로. 계측기들이 경로를 받게 돼 있다."""
    d = tempfile.mkdtemp(prefix=prefix)
    out = []
    for i, b64 in enumerate(images):
        raw = base64.b64decode(b64.split(",")[-1])
        p = os.path.join(d, f"{i}.png")
        with open(p, "wb") as fh:
            fh.write(raw)
        out.append(p)
    return out


class CharacterRequest(BaseModel):
    """한 후보의 방향들. **낱장이 아니라 세트가 판정 단위다.**"""
    images: list[str]
    ground: str | None = None
    bible: str | None = None


@router.post("/character")
def judge_character(req: CharacterRequest) -> dict:
    paths = _write(req.images, "judge_char_")
    if not paths:
        return {"verdict": "UNDEFINED", "why": ["그림이 없다"]}

    out = cj.judge(paths)

    # 게임 화면 안에서도 본다. 따로 보면 멀쩡한데 바닥에 놓으면 안 읽히는 것이
    # 픽셀 아트 실패의 대부분이고, 규격 검사만으로는 그걸 못 잡는다.
    ground = req.ground or (GROUND if os.path.exists(GROUND) else None)
    if ground:
        ctx = cv.judge_in_context(paths, ground)
        out["in_context"] = ctx
        if ctx["verdict"] == "FAIL":
            out["verdict"] = "FAIL"
            out.setdefault("fail", []).extend(ctx["fail"])

    # 스타일 성경이 있으면 "같은 세계인가" 도 잰다. 좋은가를 묻지 않는다.
    if req.bible:
        try:
            out["vs_bible"] = sb.compare(paths, sb.load(req.bible, root=ROOT))
        except FileNotFoundError:
            out["vs_bible"] = {"error": f"성경이 없다: {req.bible}"}

    # 10-28: **얼마나 가까운가**를 같이 낸다. 더하기만 한다 — 판정은 안 건드린다.
    try:
        out["progress"] = _progress(out)
        덜된것 = [p for p in out["progress"] if not p["ok"]]
        if 덜된것:
            가장가까운 = max(덜된것, key=lambda p: p["ratio"])
            out["closest"] = f"{가장가까운['id']} 이 제일 가깝다 — {가장가까운['got']} / {가장가까운['need']} ({int(가장가까운['ratio'] * 100)}%)"
    except Exception as e:                                        # noqa: BLE001
        # 가까움은 덤이다. 여기서 터져서 **판정 전체를 못 받게** 하면 안 된다.
        out["progress_error"] = str(e)[:120]

    out["note"] = ("기계는 걸렀을 뿐 고르지 않았다. 마지막 칸은 사람이 고른다")
    return out


class PromptRequest(BaseModel):
    text: str


@router.post("/prompt")
def judge_prompt(req: PromptRequest) -> dict:
    """발주 문구 검사. **누가 썼든**(사람·GPT·나) 같은 검사를 받는다.

    금지 표현은 실측으로 확인된 함정들이다 — `no harsh contrast` 를 보냈더니
    명암폭이 172에서 36이 됐고, `low saturation` 은 채도 3짜리 흑백을 낳았다.
    속성을 낮추라고만 하면 0이 온다.
    """
    return pb.lint(req.text)


class BibleRequest(BaseModel):
    images: list[str]
    name: str
    chosen_by: str
    note: str = ""


@router.post("/bible")
def adopt_bible(req: BibleRequest) -> dict:
    """고른 것 하나를 기준으로 승격한다. **`chosen_by` 없이는 거부한다.**

    기준은 고르는 것이지 모집단에서 뽑는 것이 아니다(measurement-rules §14).
    어긋난 것들의 평균으로 기준을 만들면 어긋남이 기준이 된다.
    """
    paths = _write(req.images, "bible_")
    try:
        doc = sb.adopt(paths, req.name, chosen_by=req.chosen_by,
                       note=req.note, root=ROOT)
    except sb.NotChosen as exc:
        return {"ok": False, "why": str(exc)}
    doc.pop("sources", None)
    return {"ok": True, **doc}


@router.get("/thresholds")
def thresholds() -> dict:
    """무엇으로 거르는지, 그 수가 어디서 왔는지. 감출 이유가 없다."""
    return {
        "character": {
            "min_colors": cj.MIN_COLORS,
            "min_saturation": cj.MIN_SATURATION,
            "min_luma_spread": cj.MIN_LUMA_SPREAD,
            "min_ground_contrast": cj.MIN_GROUND_CONTRAST,
            "max_color_spread": cj.MAX_COLOR_SPREAD,
            "target_ground_luma": cj.TARGET_GROUND_LUMA,
        },
        "in_context": {
            "min_edge_contrast": cv.MIN_EDGE_CONTRAST,
            "min_silhouette": cv.MIN_SILHOUETTE,
        },
        "basis": "사장님이 가리킨 레퍼런스 화면 실측 (명암폭 172 · 캐릭터-바닥 대비 99)",
        # 10-28: 내가 붙는 쪽이 되어 네 판 돌려 보니 **숫자만 있고 세는 법이 없었다.**
        # 색을 3→7→12 로 올리고도 16 을 못 넘겼다 — 무엇의 개수인지 몰라서 겨냥을 못 했다.
        # 숫자를 주면서 세는 법을 안 주는 것은 과녁을 가리고 쏘라는 것과 같다.
        "how": HOW,
        "input": (
            "**캐릭터는 배경을 투명하게 비운 PNG** 로 낸다. 투명도(alpha>0)인 화소만 센다 — "
            "배경이 칠해져 있으면 배경까지 캐릭터로 세어서 채도·명암이 엉뚱해진다."
        ),
    }


# 세는 법과 고치는 법. 재는 코드(`character_judge.measure`)와 **같은 말**이어야 한다 —
# 어긋나면 시키는 대로 고쳤는데 숫자가 안 움직이는 일이 생긴다.
HOW = {
    "colors": {
        "세는법": "투명하지 않은 화소의 **서로 다른 RGB 값 개수**. 그림이 여러 장이면 그 중앙값.",
        "고치는법": "같은 면을 2~3톤으로 나눠라(밝은 면·어두운 면·테두리). 그라데이션 말고 **단을 나누는** 쪽이 빨리 는다. 작은 장식(버클·눈동자·금속)이 한 톤씩 보탠다.",
        "방향": "클수록 좋다",
    },
    "saturation": {
        "세는법": "화소마다 `max(R,G,B) - min(R,G,B)` 를 구해 그 **중앙값**. 0~255.",
        "고치는법": "회색을 줄여라. 어두운 칸도 완전한 회색 말고 **색을 띤 어둠**(보라빛·푸른빛)으로 두면 오른다.",
        "방향": "클수록 좋다",
    },
    "luma_spread": {
        "세는법": "밝기 `0.299R+0.587G+0.114B` 를 줄 세워 **95번째에서 5번째를 뺀 값**. 끝값 하나에 안 흔들리게 양끝 5%를 버린다.",
        "고치는법": "제일 밝은 칸과 제일 어두운 칸을 **더 벌려라**. 하이라이트 한 점과 깊은 그림자 한 칸이면 크게 는다.",
        "방향": "클수록 좋다",
    },
    "ground_contrast": {
        "세는법": "캐릭터 밝기 중앙값과 바닥 밝기(기본 169)의 **차이의 절대값**.",
        "고치는법": "캐릭터를 바닥보다 **뚜렷하게 어둡게 하거나 밝게** 해라. 중간 밝기로 모으면 땅에 묻힌다.",
        "방향": "클수록 좋다",
        "필요한것": "바닥이 있어야 잰다. 투명 스프라이트만 내면 **못 잼**이다.",
    },
    "color_spread": {
        "세는법": "그림 **여러 장** 사이의 색 개수 차이 `(최대-최소)/최대`.",
        "고치는법": "방향마다 쓰는 색 수를 비슷하게 맞춰라. 한 방향만 단순하면 튄다.",
        "방향": "작을수록 좋다",
        "필요한것": "두 장 이상이어야 잰다. 한 장이면 **못 잼**이다.",
    },
}


def _progress(m: dict) -> list:
    """**얼마나 가까운가.** 어긋남 한 글자만 주면 나아지는지 알 수 없다.

    10-28 에 내가 색을 3→7→12 로 올렸는데 네 판 모두 "어긋남" 이었다. 좋아지고
    있었는데 화면에 그게 없어서, 붙은 도구는 포기하는 게 합리적인 상태였다.
    """
    규칙 = [
        ("colors", cj.MIN_COLORS, "min"),
        ("saturation", cj.MIN_SATURATION, "min"),
        ("luma_spread", cj.MIN_LUMA_SPREAD, "min"),
        ("ground_contrast", cj.MIN_GROUND_CONTRAST, "min"),
        ("color_spread", cj.MAX_COLOR_SPREAD, "max"),
    ]
    out = []
    for key, need, kind in 규칙:
        got = m.get(key)
        if got is None:          # 안 잰 칸은 0 으로 적지 않는다 — 0 은 "못 본다" 일 수 있다
            continue
        if kind == "min":
            ok = got >= need
            ratio = min(1.0, got / need) if need else 1.0
            gap = round(max(0.0, need - got), 2)
        else:
            ok = got <= need
            ratio = min(1.0, need / got) if got else 1.0
            gap = round(max(0.0, got - need), 3)
        out.append({"id": key, "got": got, "need": need, "ok": ok,
                    "ratio": round(ratio, 3), "gap": gap,
                    "방향": HOW.get(key, {}).get("방향", "")})
    return out


class MeshRequest(BaseModel):
    """GLB 하나. 링크를 주면 판정기가 받아 온다(생성기 링크는 서명돼 있어 짧게 산다),
    아니면 base64 로 통째로."""
    glb_url: str | None = None
    glb_base64: str | None = None
    want_rig: bool = False
    profile: str = "character"


@router.post("/mesh")
def judge_mesh(req: MeshRequest) -> dict:
    """3D 메시를 `docs/asset-3d-intake-v0-design.md` 표대로 잰다. 거르기만 한다."""
    import urllib.request
    if req.glb_base64:
        data = base64.b64decode(req.glb_base64.split(",")[-1])
    elif req.glb_url:
        try:
            with urllib.request.urlopen(req.glb_url, timeout=120) as r:
                data = r.read()
        except Exception as e:  # noqa: BLE001
            return {"verdict": "UNDEFINED", "rules": [{"id": "fetch", "verdict": "UNDEFINED",
                    "measured": None, "why": f"GLB 를 못 받았다: {str(e)[:160]}"}], "measured": {},
                    "thresholds": mj.THRESHOLDS}
    else:
        return {"verdict": "UNDEFINED", "rules": [{"id": "input", "verdict": "UNDEFINED",
                "measured": None, "why": "glb_url 도 glb_base64 도 없다"}], "measured": {},
                "thresholds": mj.THRESHOLDS}
    return mj.judge_glb(data, want_rig=req.want_rig, profile=req.profile).to_dict()


class TexturesRequest(BaseModel):
    glb_url: str | None = None
    glb_base64: str | None = None


@router.post("/mesh/textures")
def mesh_textures(req: TexturesRequest) -> dict:
    """GLB 의 PBR 맵을 유니티 모양(PNG, base64)으로. 리깅 FBX 에 빠진 노멀·금속 맵을
    원본 GLB 에서 되찾는 자리다(22:40)."""
    import urllib.request
    from genesis import mesh_textures as mt
    if req.glb_base64:
        data = base64.b64decode(req.glb_base64.split(",")[-1])
    elif req.glb_url:
        try:
            with urllib.request.urlopen(req.glb_url, timeout=120) as r:
                data = r.read()
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"GLB 를 못 받았다: {str(e)[:160]}"}
    else:
        return {"ok": False, "error": "glb_url 도 glb_base64 도 없다"}
    try:
        maps = mt.extract_pbr_maps(data)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"맵을 못 꺼냈다: {str(e)[:160]}"}
    enc = lambda b: base64.b64encode(b).decode("ascii") if b else None  # noqa: E731
    return {
        "ok": True,
        "note": maps.note,
        "base_color_png": enc(maps.base_color_png),
        "normal_png": enc(maps.normal_png),
        "metallic_smoothness_png": enc(maps.metallic_smoothness_png),
        "occlusion_png": enc(maps.occlusion_png),
        "detail_normal_png": enc(maps.detail_normal_png),
        "detail_mask_png": enc(maps.detail_mask_png),
    }
