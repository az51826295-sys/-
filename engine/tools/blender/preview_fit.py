# 몸에 조각을 씌우고 **그림을 뽑는다.** 유니티로 보내기 전에 눈으로 보려고.
#
# 09-09 사장님: "처음부터 하자 제대로."
# 그동안 나는 조각을 유니티에 넣고 **판을 하나 사서**(돈·몇 분) 사진을 본 다음에야 틀린 걸 알았다.
# 확인을 돈 드는 자리에서 하고 있었다. 블렌더는 몇 초, 0원이다. **여기서 보고 여기서 고친다.**
#
# 하는 일: 몸 + 조각을 같이 놓고, 앞·옆·뒤 세 장을 렌더한다. 조각은 fit_part.py 와 같은 규칙으로 앉힌다
# (뼈가 잡은 덩어리 중심, 얼굴 방향 정렬). 유니티에 보내는 것과 **같은 계산**이어야 그림이 의미가 있다.
#
# 실행:
#   blender.exe --background --python preview_fit.py -- <몸.fbx> <조각.fbx> <나갈폴더> [뼈=Head] [여유=1.08]
import bpy, sys, os, math, json
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index("--") + 1:]
body_fbx, part_fbx, out_dir = a[0], a[1], a[2]
bone_name = a[3] if len(a) > 3 else "Head"
fit = float(a[4]) if len(a) > 4 else 1.08
# 09-09: 자동 정렬만으로는 안 되는 조각이 있다(뒤 볏이 제일 높은 투구 등).
# 모델러가 하듯 **조금 밀어 보고 눈으로 정한다.** 단위는 머리 크기 대비 비율이라 캐릭터가 바뀌어도 뜻이 같다.
nudge_fwd = float(a[5]) if len(a) > 5 else 0.0   # + 면 얼굴 쪽으로
nudge_up  = float(a[6]) if len(a) > 6 else 0.0   # + 면 위로
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=body_fbx)
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if arm is None:
    print("PREVIEW_FAIL: 몸에 아마추어가 없다"); sys.exit(1)
bone = next((b for b in arm.data.bones if b.name.lower() == bone_name.lower()), None)
if bone is None:
    print("PREVIEW_FAIL: 뼈 없음 " + bone_name); sys.exit(1)
bone_pos = arm.matrix_world @ bone.head_local

# 얼굴이 어디를 보나 — `headfront` 같은 뼈가 있으면 그 방향이 앞이다.
face_dir = Vector((0, -1, 0))
fb = next((b for b in arm.data.bones if "front" in b.name.lower()), None)
if fb:
    d = (arm.matrix_world @ fb.tail_local) - (arm.matrix_world @ fb.head_local)
    d.z = 0
    if d.length > 1e-6:
        face_dir = d.normalized()

# 뼈가 잡은 덩어리(= 머리)
pts = []
for m in [o for o in bpy.data.objects if o.type == "MESH"]:
    gi = m.vertex_groups.get(bone.name)
    if gi is None: continue
    for v in m.data.vertices:
        for g in v.groups:
            if g.group == gi.index and g.weight > 0.5:
                pts.append(m.matrix_world @ v.co); break
if not pts:
    print("PREVIEW_FAIL: 뼈에 물린 정점 없음"); sys.exit(1)
mn = Vector((min(p[i] for p in pts) for i in range(3)))
mx = Vector((max(p[i] for p in pts) for i in range(3)))
head_center = (mn + mx) / 2
head_size = mx - mn

body_objs = list(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=part_fbx)
part_objs = [o for o in bpy.data.objects if o not in body_objs and o.type == "MESH"]
if not part_objs:
    print("PREVIEW_FAIL: 조각에 메시 없음"); sys.exit(1)

def pbounds():
    lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
    for o in part_objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi

lo, hi = pbounds()
s = (max(head_size) * fit) / max(hi - lo)
for o in part_objs: o.scale = o.scale * s
bpy.context.view_layer.update()
lo, hi = pbounds()
# 09-09: **중심끼리 맞추면 안 된다.** 이 투구는 뒤통수를 덮는 긴 판이 달려서 바운딩 박스 중심이
# 뒤·아래로 끌린다 — 중심을 맞추니 돔이 뒤로 밀리고 정수리가 드러났다(렌더로 확인).
# 쓰는 물건은 **정수리를 맞춘다**: 좌우는 머리 가운데, 앞뒤는 머리 가운데, 위는 머리 꼭대기에 살짝 여유.
pc = (lo + hi) / 2
d = Vector((head_center.x - pc.x, head_center.y - pc.y, (mx.z + head_size.z * 0.02) - hi.z))
d = d + face_dir * (nudge_fwd * head_size.y) + Vector((0, 0, nudge_up * head_size.z))
for o in part_objs: o.location = o.location + d
bpy.context.view_layer.update()
lo, hi = pbounds()

# ── 그림 ─────────────────────────────────────────────────────
scn = bpy.context.scene
# 4.5 는 EEVEE Next. 안 되면 Workbench(면만 칠하는 가장 단순한 것)로 물러선다.
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
    try:
        scn.render.engine = eng
        break
    except Exception:
        continue
scn.render.resolution_x = 800
scn.render.resolution_y = 1000
scn.render.film_transparent = False
world = bpy.data.worlds.new("W"); scn.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.08, 0.09, 0.11, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

light_data = bpy.data.lights.new("L", type="SUN"); light_data.energy = 4
light = bpy.data.objects.new("L", light_data); scn.collection.objects.link(light)
light.rotation_euler = (math.radians(55), 0, math.radians(35))

cam_data = bpy.data.cameras.new("C"); cam_data.lens = 85
cam = bpy.data.objects.new("C", cam_data); scn.collection.objects.link(cam); scn.camera = cam

target = head_center
right = Vector((face_dir.y, -face_dir.x, 0)).normalized()
# 얼굴이 향하는 쪽(face_dir)에 카메라를 두어야 **얼굴을 본다**. 09-09 첫 판에 이름을 뒤집어 붙였다.
views = {
    "front": face_dir,
    "side": right,
    "back": -face_dir,
}
dist = max(head_size) * 4.5
shots = []
for name, dirv in views.items():
    eye = target + dirv * dist + Vector((0, 0, max(head_size) * 0.25))
    cam.location = eye
    look = (target - eye).normalized()
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    path = os.path.join(out_dir, f"fit_{name}.png")
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    shots.append(os.path.basename(path))

print("PREVIEW_OK")
print(json.dumps({
    "head_center": [round(v, 4) for v in head_center],
    "head_size_m": [round(v, 4) for v in head_size],
    "face_dir": [round(v, 3) for v in face_dir],
    "part_size_m": [round(v, 4) for v in (hi - lo)],
    "part_center": [round(v, 4) for v in ((lo + hi) / 2)],
    "bone_pos": [round(v, 4) for v in bone_pos],
    "shots": shots,
}, ensure_ascii=False, indent=2))
