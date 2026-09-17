# 조각을 몸에 **맞춰서** 내보낸다 — 엔진이 실행 중에 숫자로 밀지 않아도 되게.
#
# 09-09. 왜 필요한가: Meshy 가 낸 투구는 크기 21.7×27.6×30.0 cm 인데 **원점이 아래 테두리**에 있었다.
# 그것을 Head 뼈에 붙이면 테두리가 뼈에 오고, 뼈는 목 밑동이라 투구가 목에 걸린다 — 이틀을 여기서 썼다.
# 업계가 이 일을 엔진이 아니라 DCC(블렌더·마야)에서 하는 이유가 이것이다.
#
# 여기서 하는 일 (전부 결정적, 모델 호출 없음):
#   1. 몸에서 붙을 자리를 **잰다** — 그 뼈에 물린 정점 덩어리의 중심과 크기.
#   2. 조각을 그 덩어리에 맞게 **키운다**(가장 긴 변 기준, 여유 비율은 인자).
#   3. 조각을 그 자리에 **옮긴다**.
#   4. 조각의 **원점을 뼈 위치로** 굽는다 → 유니티는 그냥 자식으로 달면 끝(localPosition 0).
#
# 실행:
#   blender.exe --background --python fit_part.py -- <몸.fbx> <조각.fbx> <나갈.fbx> [뼈=Head] [여유=1.08] [삼각형=3000]
import bpy, sys, os, json
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
body_fbx, part_fbx, out_fbx = a[0], a[1], a[2]
bone_name = a[3] if len(a) > 3 else "Head"
fit = float(a[4]) if len(a) > 4 else 1.08
target_tris = int(a[5]) if len(a) > 5 else 3000

bpy.ops.wm.read_factory_settings(use_empty=True)

# ── 1. 몸: 그 뼈가 잡고 있는 덩어리를 잰다 ─────────────────────
bpy.ops.import_scene.fbx(filepath=body_fbx)
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if arm is None:
    print("FIT_FAIL: 몸에 아마추어가 없다"); sys.exit(1)
bone = next((b for b in arm.data.bones if b.name.lower() == bone_name.lower()), None)
if bone is None:
    print("FIT_FAIL: 뼈를 못 찾았다 " + bone_name); sys.exit(1)
bone_pos = arm.matrix_world @ bone.head_local

pts = []
for m in [o for o in bpy.data.objects if o.type == "MESH"]:
    gi = m.vertex_groups.get(bone.name)
    if gi is None:
        continue
    for v in m.data.vertices:
        for g in v.groups:
            if g.group == gi.index and g.weight > 0.5:
                pts.append(m.matrix_world @ v.co)
                break
if not pts:
    print("FIT_FAIL: 그 뼈에 물린 정점이 없다"); sys.exit(1)
mn = Vector((min(p[i] for p in pts) for i in range(3)))
mx = Vector((max(p[i] for p in pts) for i in range(3)))
target_center = (mn + mx) / 2
target_size = mx - mn
target_longest = max(target_size)

body_objs = list(bpy.data.objects)

# ── 2~3. 조각: 키우고 옮긴다 ──────────────────────────────────
bpy.ops.import_scene.fbx(filepath=part_fbx)
part_objs = [o for o in bpy.data.objects if o not in body_objs and o.type == "MESH"]
if not part_objs:
    print("FIT_FAIL: 조각에 메시가 없다"); sys.exit(1)

def part_bounds():
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in part_objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi

lo, hi = part_bounds()
def tri_count():
    n = 0
    for o in part_objs:
        o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n
tris_before = tri_count()
before = {"size": [round(v, 4) for v in (hi - lo)], "center": [round(v, 4) for v in ((lo + hi) / 2)],
          "triangles": tris_before}

# ── 폴리곤 감축 ──────────────────────────────────────────────
# 09-09: 산 투구가 삼각형 **30,356개** — 몸 전체(29,385)보다 많았다. 게임 자산이 아니다.
# **감축(Decimate)은 딱딱한 조각에만 쓴다.** 스키닝된 몸에 쓰면 토폴로지가 불규칙해져
# 가중치가 깨지고 관절에서 메시가 찢어진다(그건 리토폴로지가 할 일이다). 투구는 딱딱하니 여기서는 맞다.
# Collapse 는 살아남은 정점이 제 UV 를 그대로 들고 가므로 텍스처는 계속 맞는다 —
# 다만 많이 줄이면 이음매 근처가 늘어날 수 있어 **실루엣과 사진으로 확인한다.**
if target_tris > 0 and tris_before > target_tris:
    ratio = target_tris / float(tris_before)
    for o in part_objs:
        md = o.modifiers.new(name="Rookery_Decimate", type="DECIMATE")
        md.decimate_type = "COLLAPSE"
        md.ratio = ratio
        md.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.update()
lo, hi = part_bounds()

scale = (target_longest * fit) / max(hi - lo)
for o in part_objs:
    o.scale = o.scale * scale
bpy.context.view_layer.update()

lo, hi = part_bounds()
delta = target_center - ((lo + hi) / 2)
for o in part_objs:
    o.location = o.location + delta
bpy.context.view_layer.update()

# ── 4. 원점을 뼈 자리로 굽는다 ────────────────────────────────
# 유니티에서 Head 뼈의 자식으로 달고 localPosition·localRotation 을 0 으로 두면 제자리에 온다.
for o in part_objs:
    o.location = o.location - bone_pos
bpy.context.view_layer.update()

# 몸은 빼고 조각만 내보낸다 — 조각 파일에 몸이 들어가면 살이 갑옷 속에서 비친다.
bpy.ops.object.select_all(action="DESELECT")
for o in part_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = part_objs[0]
bpy.ops.export_scene.fbx(filepath=out_fbx, use_selection=True, apply_scale_options="FBX_SCALE_ALL",
                         object_types={"MESH"}, add_leaf_bones=False, bake_space_transform=False)

lo, hi = part_bounds()
tris = 0
for o in part_objs:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print("FIT_OK")
print(json.dumps({
    "bone": bone.name,
    "bone_pos": [round(v, 4) for v in bone_pos],
    "target_center": [round(v, 4) for v in target_center],
    "target_size_m": [round(v, 4) for v in target_size],
    "part_before": before,
    "triangles_before": tris_before,
    "part_after_size_m": [round(v, 4) for v in (hi - lo)],
    "scale_applied": round(scale, 4),
    "origin_is_bone": True,
    "triangles": tris,
    "out": os.path.basename(out_fbx),
}, ensure_ascii=False, indent=2))
