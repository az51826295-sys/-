# 맨몸의 **실제 치수**를 잰다. 추측이 아니라 메시에서.
#
# 09-09 사장님: "3D 투구만드는 것도 기준도 없이 만들고 조잡하게 붙여놓고."
# 맞다. 우리는 규격 없이 글로만 주문하고, 나온 것을 유니티에서 밀고 당겼다.
# 규격을 쓰려면 **몸의 진짜 숫자**가 먼저 있어야 한다.
#
# 재는 법(모델러가 하는 방식): 머리는 눈대중이 아니라 **스킨 가중치**로 잡는다 —
# `Head` 뼈에 0.5 넘게 물린 정점만 모으면 그것이 그 캐릭터의 머리다.
#
# 실행:
#   blender.exe --background --python measure_body.py -- <rigged.fbx> [출력.json]
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
fbx = argv[0]
out = argv[1] if len(argv) > 1 else ""

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)

arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    print("MEASURE_FAIL: 메시가 없다")
    sys.exit(1)
# 조각(투구·무기)은 아마추어가 없다. 그것도 재야 한다 — 규격을 쓰려면 조각의 실제 크기와
# **원점이 어디 있는지**를 알아야 하기 때문이다(09-09).

report = {"file": os.path.basename(fbx), "bones": len(arm.data.bones) if arm else 0, "meshes": len(meshes)}

# ── 전체 키 (세상 좌표) ─────────────────────────────────────────
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for m in meshes:
    for c in m.bound_box:
        w = m.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
# FBX 는 Z-up 으로 들어온다. 키는 Z.
report["height_m"] = round(hi.z - lo.z, 4)
report["foot_z"] = round(lo.z, 4)

# ── 뼈 자리 (관심 있는 것만) ──────────────────────────────────
want = ["head", "neck", "spine", "chest", "hips", "shoulder", "hand", "foot"]
bones = {}
for b in (arm.data.bones if arm else []):
    n = b.name.lower()
    if not any(w in n for w in want):
        continue
    hpos = arm.matrix_world @ b.head_local
    tpos = arm.matrix_world @ b.tail_local
    bones[b.name] = {
        "head": [round(v, 4) for v in hpos],
        "tail": [round(v, 4) for v in tpos],
        "length_m": round((tpos - hpos).length, 4),
    }
report["bones_of_interest"] = bones

# ── 머리 덩어리: Head 뼈에 0.5 넘게 물린 정점 ────────────────
head_bone = next((b.name for b in arm.data.bones if b.name.lower().endswith("head")), None) if arm else None
report["head_bone"] = head_bone
if head_bone:
    pts = []
    for m in meshes:
        gi = m.vertex_groups.get(head_bone)
        if gi is None:
            continue
        for v in m.data.vertices:
            for g in v.groups:
                if g.group == gi.index and g.weight > 0.5:
                    pts.append(m.matrix_world @ v.co)
                    break
    if pts:
        mn = Vector((min(p[i] for p in pts) for i in range(3)))
        mx = Vector((max(p[i] for p in pts) for i in range(3)))
        ctr = (mn + mx) / 2
        hb = arm.matrix_world @ arm.data.bones[head_bone].head_local
        report["head"] = {
            "verts": len(pts),
            "min": [round(v, 4) for v in mn],
            "max": [round(v, 4) for v in mx],
            "center": [round(v, 4) for v in ctr],
            "width_x_m": round(mx.x - mn.x, 4),
            "depth_y_m": round(mx.y - mn.y, 4),
            "height_z_m": round(mx.z - mn.z, 4),
            # 조각을 붙일 때 쓸 값: Head 뼈에서 머리 중심까지 얼마나 위인가.
            "center_above_bone_m": round(ctr.z - hb.z, 4),
            "top_above_bone_m": round(mx.z - hb.z, 4),
        }
    else:
        report["head"] = {"verts": 0, "note": "Head 정점 그룹에 0.5 넘는 가중치가 없다"}

# ── 조각이면: 크기와 **원점이 덩어리 어디에 있나** ─────────────
if not arm:
    size = hi - lo
    ctr = (lo + hi) / 2
    report["part"] = {
        "size_m": [round(v, 4) for v in size],
        "center": [round(v, 4) for v in ctr],
        # 원점(0,0,0)이 덩어리 중심에서 얼마나 떨어져 있나. 0에 가까울수록 붙이기 쉽다.
        "origin_offset_m": round(ctr.length, 4),
        "longest_m": round(max(size), 4),
    }

# ── 삼각형 수 ────────────────────────────────────────────────
tris = 0
for m in meshes:
    m.data.calc_loop_triangles()
    tris += len(m.data.loop_triangles)
report["triangles"] = tris

text = json.dumps(report, ensure_ascii=False, indent=2)
print("MEASURE_OK")
print(text)
if out:
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
