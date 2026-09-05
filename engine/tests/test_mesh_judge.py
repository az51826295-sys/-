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


def test_open_mesh_fails_m1():
    m = trimesh.creation.icosphere(subdivisions=5, radius=0.8)
    m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces[:-50])  # 구멍을 낸다
    v = judge_glb(_glb(m))
    assert _rule(v, "M1").verdict == FAIL


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
