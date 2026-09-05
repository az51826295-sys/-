"""3D 메시 판정 — `docs/asset-3d-intake-v0-design.md` 의 표를 그대로 코드로.

거르기만 한다. 고르지 않는다. 세 값(PASS / FAIL / UNDEFINED)이고 UNDEFINED 는
통과가 아니다 — 못 잰 것을 통과로 세면 못 잴수록 잘 통과한다.

문턱은 이 파일이 아니라 `THRESHOLDS` 한 곳에 있고, 첫 메시를 본 뒤에는 안
바꾼다(바꾸면 v1 문서로). 재는 것은 GLB 한 파일이다.
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass, field, asdict

import numpy as np
import trimesh
from pygltflib import GLTF2

THRESHOLDS = {
    "T1": {"tri_min": 2000, "tri_max": 40000},
    "T2": {"mesh_max": 8},
    "S1": {"height_min_m": 0.5, "height_max_m": 3.0},
    "A1": {"axis_tie_ratio": 0.10},
    "B1": {"bones_min": 10},
    "basis": "docs/asset-3d-intake-v0-design.md v0 (2026-09-05, 첫 메시 보기 전에 얼림)",
}

PASS, FAIL, UNDEFINED = "PASS", "FAIL", "UNDEFINED"


@dataclass
class Rule:
    id: str
    verdict: str
    measured: object
    why: str


@dataclass
class MeshVerdict:
    verdict: str
    rules: list = field(default_factory=list)
    measured: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "rules": [asdict(r) for r in self.rules],
            "measured": self.measured,
            "thresholds": THRESHOLDS,
        }


def _overall(rules: list[Rule]) -> str:
    if any(r.verdict == FAIL for r in rules):
        return FAIL
    if any(r.verdict == UNDEFINED for r in rules):
        return UNDEFINED
    return PASS


def judge_glb(data: bytes, want_rig: bool = False) -> MeshVerdict:
    """GLB 바이트를 받아 표대로 잰다. 파일을 안 쓴다 — 임시 파일이 남지 않게."""
    rules: list[Rule] = []
    measured: dict = {}

    # ── 형상: trimesh ──
    try:
        scene = trimesh.load(io.BytesIO(data), file_type="glb", force="scene")
    except Exception as e:  # noqa: BLE001 — 파서가 못 읽으면 전부 UNDEFINED 다
        return MeshVerdict(UNDEFINED, [Rule("parse", UNDEFINED, str(e)[:200], "GLB 를 못 읽었다")], {})

    geoms = [g for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh)]
    non_tri = len(scene.geometry) - len(geoms)
    tri = int(sum(len(g.faces) for g in geoms))
    measured["triangles"] = tri
    measured["meshes"] = len(geoms)
    measured["non_triangle_geometries"] = non_tri

    t = THRESHOLDS["T1"]
    if not geoms:
        rules.append(Rule("T1", UNDEFINED, tri, "삼각형 메시가 하나도 없다"))
    elif t["tri_min"] <= tri <= t["tri_max"]:
        rules.append(Rule("T1", PASS, tri, f"{t['tri_min']}~{t['tri_max']} 안"))
    else:
        rules.append(Rule("T1", FAIL, tri, f"{t['tri_min']}~{t['tri_max']} 밖"))

    m = THRESHOLDS["T2"]["mesh_max"]
    rules.append(Rule("T2", PASS if len(geoms) <= m else FAIL, len(geoms), f"메시 {m}개 이하"))

    if geoms:
        watertight = [bool(g.is_watertight) for g in geoms]
        measured["watertight"] = watertight
        rules.append(Rule("M1", PASS if all(watertight) else FAIL, sum(watertight),
                          "모든 메시가 닫혀 있어야 한다"))

        winding = [bool(g.is_winding_consistent) for g in geoms]
        measured["winding_consistent"] = winding
        rules.append(Rule("M2", PASS if all(winding) else FAIL, sum(winding),
                          "뒤집힌 면이 없어야 한다"))

        has_uv = []
        for g in geoms:
            uv = getattr(getattr(g, "visual", None), "uv", None)
            has_uv.append(uv is not None and len(uv) == len(g.vertices))
        measured["has_uv"] = has_uv
        rules.append(Rule("U1", PASS if all(has_uv) else FAIL, sum(has_uv), "모든 메시에 UV"))

        # 크기·축: 장면 전체 바운딩 박스
        try:
            ext = np.asarray(scene.bounding_box.extents, dtype=float)
        except Exception:  # noqa: BLE001
            ext = np.zeros(3)
        measured["extents_m"] = [float(x) for x in ext]
        if float(ext.max()) <= 0:
            rules.append(Rule("S1", UNDEFINED, measured["extents_m"], "바운딩 박스가 0"))
            rules.append(Rule("A1", UNDEFINED, measured["extents_m"], "바운딩 박스가 0"))
        else:
            h = float(ext[1])  # glTF 는 Y-up
            s = THRESHOLDS["S1"]
            rules.append(Rule("S1", PASS if s["height_min_m"] <= h <= s["height_max_m"] else FAIL,
                              round(h, 3), f"높이(Y) {s['height_min_m']}~{s['height_max_m']} m"))
            order = np.argsort(ext)[::-1]
            longest, second = float(ext[order[0]]), float(ext[order[1]])
            tie = (longest - second) / longest <= THRESHOLDS["A1"]["axis_tie_ratio"]
            if tie:
                rules.append(Rule("A1", UNDEFINED, measured["extents_m"], "가장 긴 축이 둘 이상(±10%)"))
            else:
                rules.append(Rule("A1", PASS if order[0] == 1 else FAIL, "XYZ"[order[0]],
                                  "가장 긴 축이 Y 여야 한다"))
    else:
        for rid in ("M1", "M2", "U1", "S1", "A1"):
            rules.append(Rule(rid, UNDEFINED, None, "삼각형 메시가 없다"))

    # ── 재질·본: pygltflib (trimesh 는 스킨을 안 본다) ──
    try:
        g2 = GLTF2.load_from_bytes(data)
        textures = 0
        for mat in g2.materials or []:
            pbr = mat.pbrMetallicRoughness
            if pbr is not None and pbr.baseColorTexture is not None:
                textures += 1
        measured["base_color_textures"] = textures
        measured["materials"] = len(g2.materials or [])
        if not g2.materials:
            rules.append(Rule("X1", UNDEFINED, 0, "재질이 없다"))
        else:
            rules.append(Rule("X1", PASS if textures >= 1 else FAIL, textures, "baseColor 텍스처 1개 이상"))

        bones = 0
        names: list[str] = []
        for skin in g2.skins or []:
            for j in skin.joints or []:
                bones += 1
                n = g2.nodes[j].name if j < len(g2.nodes) else None
                if n:
                    names.append(n)
        measured["bones"] = bones
        measured["bone_names_sample"] = names[:12]
        if not want_rig:
            rules.append(Rule("B1", UNDEFINED, bones, "리깅을 요청하지 않았다 — 재지 않는다"))
        else:
            ok = bones >= THRESHOLDS["B1"]["bones_min"] and len(names) == bones
            rules.append(Rule("B1", PASS if ok else FAIL, bones, "본 10개 이상, 전부 이름 있음"))
    except Exception as e:  # noqa: BLE001
        rules.append(Rule("X1", UNDEFINED, None, f"glTF 구조를 못 읽었다: {str(e)[:120]}"))
        rules.append(Rule("B1", UNDEFINED, None, "glTF 구조를 못 읽었다"))

    # B1 의 UNDEFINED(요청 안 함)는 종합에 안 섞는다 — 안 잰 것이지 못 잰 것이 아니다.
    counted = [r for r in rules if not (r.id == "B1" and not want_rig)]
    return MeshVerdict(_overall(counted), rules, measured)


if __name__ == "__main__":  # python -m genesis.mesh_judge file.glb
    import sys
    with open(sys.argv[1], "rb") as fh:
        print(json.dumps(judge_glb(fh.read()).to_dict(), ensure_ascii=False, indent=1))
