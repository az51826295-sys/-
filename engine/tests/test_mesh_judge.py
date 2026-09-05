"""메시 판정이 표(asset-3d-intake-v0)대로 세 값을 내는가.

진짜 생성기 출력 없이 시험한다 — 상자·구는 trimesh 가 만든다. 재는 것은 판정
로직이지 생성기가 아니다.
"""
import io

import numpy as np
import trimesh

from genesis.mesh_judge import judge_glb, PASS, FAIL, UNDEFINED


def _glb(mesh: trimesh.Trimesh) -> bytes:
    scene = trimesh.Scene(mesh)
    return scene.export(file_type="glb")


def _rule(v, rid):
    return next(r for r in v.rules if r.id == rid)


def test_a_person_sized_closed_sphere_passes_shape_rules():
    # 반지름 0.8 → 높이 1.6 m. 삼각형 수를 T1 안으로.
    m = trimesh.creation.icosphere(subdivisions=5, radius=0.8)  # 20480 faces
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)))
    v = judge_glb(_glb(m))
    assert _rule(v, "T1").verdict == PASS
    assert _rule(v, "T2").verdict == PASS
    assert _rule(v, "M1").verdict == PASS
    assert _rule(v, "M2").verdict == PASS
    assert _rule(v, "U1").verdict == PASS
    assert _rule(v, "S1").verdict == PASS
    # 구는 세 축이 같아서 위 축을 못 가른다 → UNDEFINED 가 맞다
    assert _rule(v, "A1").verdict == UNDEFINED


def test_too_few_triangles_fails_t1_not_undefined():
    m = trimesh.creation.box(extents=(0.5, 1.6, 0.3))  # 12 faces
    v = judge_glb(_glb(m))
    assert _rule(v, "T1").verdict == FAIL
    assert _rule(v, "T1").measured == 12
    assert v.verdict == FAIL


def test_tall_box_has_y_up_and_fails_uv_without_texture_coords():
    m = trimesh.creation.box(extents=(0.5, 1.6, 0.3))
    v = judge_glb(_glb(m))
    assert _rule(v, "A1").verdict == PASS
    assert _rule(v, "A1").measured == "Y"
    assert _rule(v, "U1").verdict == FAIL


def test_open_mesh_is_reported_but_not_counted_v1():
    # v1: 닫힘은 3D 프린팅 기준이다. 게임 메시는 열려 있어도 된다 — 정보만 남긴다.
    m = trimesh.creation.icosphere(subdivisions=5, radius=0.8)
    m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces[:-50])  # 구멍을 낸다
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)))
    v = judge_glb(_glb(m))
    assert _rule(v, "M1").verdict == UNDEFINED
    assert all(r.verdict != FAIL for r in v.rules)  # 구멍 때문에 떨어지지 않는다


def test_prop_profile_accepts_a_low_wide_chest():
    # 보물상자: 낮고 옆으로 길다. character 로 재면 S1·A1 에서 떨어지고, prop 이면 아니다.
    m = trimesh.creation.box(extents=(1.0, 0.45, 0.6))
    m = m.subdivide().subdivide().subdivide().subdivide().subdivide()  # 12 → 12288 면
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)))
    c = judge_glb(_glb(m), profile="character")
    assert _rule(c, "S1").verdict == FAIL and _rule(c, "A1").verdict == FAIL
    p = judge_glb(_glb(m), profile="prop")
    assert _rule(p, "S1").verdict == PASS
    assert _rule(p, "A1").verdict == UNDEFINED  # 정보만
    assert p.measured["profile"] == "prop"


def test_no_material_is_undefined_not_fail():
    m = trimesh.creation.icosphere(subdivisions=5, radius=0.8)
    v = judge_glb(_glb(m))
    x1 = _rule(v, "X1")
    assert x1.verdict in (UNDEFINED, FAIL)  # trimesh 가 기본 재질을 넣을 수도 있다
    if x1.verdict == UNDEFINED:
        assert v.verdict != PASS  # 못 잰 것은 통과가 아니다


def test_rig_not_requested_does_not_count_against_overall():
    m = trimesh.creation.icosphere(subdivisions=5, radius=0.8)
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)))
    v = judge_glb(_glb(m), want_rig=False)
    assert _rule(v, "B1").verdict == UNDEFINED
    v2 = judge_glb(_glb(m), want_rig=True)
    assert _rule(v2, "B1").verdict == FAIL  # 요청했는데 본이 없다


def test_garbage_is_undefined():
    v = judge_glb(b"not a glb")
    assert v.verdict == UNDEFINED


def test_s1_accepts_cm_unit_with_hint():
    """리깅 출력은 cm 로 온다(E7). 100배 작은 캐릭터는 크기가 틀린 게 아니라 단위가 다른 것."""
    import numpy as np, trimesh, io
    from genesis.mesh_judge import judge_glb
    m = trimesh.creation.box(extents=(0.006, 0.017, 0.003))  # 1.7 cm 키
    m.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(m.vertices), 2)))
    data = trimesh.Scene(m).export(file_type="glb")
    v = judge_glb(data, want_rig=False, profile="character")
    s1 = next(r for r in v.rules if r.id == "S1")
    assert s1.verdict == "PASS" and "100" in s1.why
    assert v.measured.get("unit_scale_hint") == 100
