"""도트 심판 — LLM 제안이 심판을 달고 레지스트리에 올라간 첫 사례.

2026-08-25 23:23 실 Proposer 호출이 "공포 분위기 픽셀 RPG"에서 제안한
pixel_art_style을, 모델이 낸 문장("저해상도 블록 기반인가" — 기준 없음) 대신
사람이 정한 심판(논리 해상도·색 수·알파 이진)으로 바꿔 승격한 것.

핵심 주장: 같은 그림이라도 **정수배 확대(NEAREST)는 도트고, 부드러운 확대
(BICUBIC)는 도트가 아니다.** 사람 눈에는 비슷해도 격자·색 수·알파가 갈린다.
"""

import random

import pytest

from genesis import asset_probe as ap
from tools import artifact_adapter as aa
from tools import judge_bench as jb

PALETTE = [(20, 16, 32, 255), (60, 40, 80, 255), (140, 60, 60, 255),
           (200, 180, 120, 255), (30, 90, 70, 255), (0, 0, 0, 0),
           (240, 240, 240, 255), (15, 15, 20, 255)]
SPEC = {"max_logical_size": 128, "max_colors": 32, "alpha_binary": True}


def dot_source(size=32, seed=7):
    from PIL import Image
    rng = random.Random(seed)
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        for x in range(size):
            img.putpixel((x, y), PALETTE[rng.randrange(len(PALETTE))])
    return img


def write_scaled(path, mode, factor=8, size=32):
    from PIL import Image
    src = dot_source(size)
    src.resize((size * factor, size * factor), mode).save(path)
    return str(path)


def atom():
    reg = jb.load_registry()
    return next(a for a in reg if a["id"] == "pixel_art_style")


# ---------------------------------------------------------------- 측정

def test_nearest_upscale_keeps_the_grid(tmp_path):
    from PIL import Image
    m = ap.measure_pixel_art(write_scaled(tmp_path / "r.png", Image.NEAREST))
    assert m["block_size"] == 8
    assert (m["logical_width"], m["logical_height"]) == (32, 32)
    assert m["alpha_binary"] is True
    assert m["color_count"] <= len(PALETTE)


def test_smooth_upscale_destroys_it(tmp_path):
    from PIL import Image
    m = ap.measure_pixel_art(write_scaled(tmp_path / "f.png", Image.BICUBIC))
    assert m["block_size"] == 1               # 격자가 없다
    assert m["logical_width"] == 256
    assert m["alpha_binary"] is False         # 반투명 경계가 생겼다
    assert m["color_count"] > 1000            # 색이 터졌다


def test_native_resolution_dot_is_not_penalised(tmp_path):
    """확대하지 않은 32x32 원본도 도트다(블록 1이지만 논리 해상도가 작다)."""
    dot_source(32).save(tmp_path / "n.png")
    m = ap.measure_pixel_art(str(tmp_path / "n.png"))
    assert m["logical_width"] == 32 and m["logical_height"] == 32


def test_broken_file_is_reported(tmp_path):
    p = tmp_path / "b.png"
    p.write_bytes(b"\x89PNG\r\n\x1a\n nope")
    assert ap.measure_pixel_art(str(p))["error"]


# ---------------------------------------------------------------- 심판

def test_promoted_atom_has_teeth_and_is_bound():
    a = atom()
    r = jb.bench_atom(a)
    assert r["verdict"] == "teeth" and r["teeth"] == 5
    assert r["evidence"] == "measured"
    assert aa.binding_status(a)["status"] == "bound"
    assert a["adapter"] == "pixel_art_asset"


def test_real_dot_passes_and_fake_dot_fails(tmp_path):
    from PIL import Image
    real = write_scaled(tmp_path / "r.png", Image.NEAREST)
    fake = write_scaled(tmp_path / "f.png", Image.BICUBIC)
    src = {"adapter": "pixel_art_asset", "spec": SPEC}
    ok = aa.judge_artifacts(atom(), {**src, "params": {"path": real}})
    no = aa.judge_artifacts(atom(), {**src, "params": {"path": fake}})
    assert ok["verdict"] == "passed" and ok["evidence"] == "measured"
    assert no["verdict"] == "failed"


def test_model_sentence_alone_would_not_have_passed():
    """모델이 낸 check는 문장이라 심판대에 못 오른다 - 승격 경로가 막는다."""
    from tools import proposer as pr
    with pytest.raises(ValueError, match="judge 명세"):
        pr.promote_proposal({"id": "pixel_art_style_v0", "reason": "x"},
                            verdict="real",
                            check="저해상도 블록 기반 그래픽을 사용하는가",
                            registry_path=str(jb.REGISTRY))


def test_request_now_decomposes_through_the_registry():
    """'공포 분위기 픽셀 RPG'가 별칭으로 잡힌다 - 23:20에는 0개였다."""
    from tools import blueprint_engine as be
    out = be.run("공포 분위기 픽셀 RPG", approve=True)
    assert "pixel_art_style" in out["intake"]
    assert "pixel_art_style" in {c["atom"] for c in out["blueprint"]["checklist"]}
