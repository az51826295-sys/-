# 캐릭터 하나를 앞·옆·뒤로 렌더한다. 유니티에 넣기 전에 눈으로 보려고(09-09).
import bpy, sys, os, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
fbx, out_dir = a[0], a[1]
os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
for m in meshes:
    for c in m.bound_box:
        w = m.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3))); hi = Vector((max(hi[i], w[i]) for i in range(3)))
ctr = (lo + hi) / 2; size = hi - lo
scn = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
    try: scn.render.engine = eng; break
    except Exception: continue
scn.render.resolution_x = 700; scn.render.resolution_y = 1100
w = bpy.data.worlds.new("W"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.10, 0.11, 0.13, 1)
ld = bpy.data.lights.new("L", type="SUN"); ld.energy = 4
lo2 = bpy.data.objects.new("L", ld); scn.collection.objects.link(lo2)
lo2.rotation_euler = (math.radians(55), 0, math.radians(35))
cd = bpy.data.cameras.new("C"); cd.lens = 60
cam = bpy.data.objects.new("C", cd); scn.collection.objects.link(cam); scn.camera = cam
dist = max(size) * 1.9
for name, d in (("front", Vector((0,-1,0))), ("side", Vector((1,0,0))), ("back", Vector((0,1,0)))):
    eye = ctr + d * dist + Vector((0,0,size.z*0.1))
    cam.location = eye
    cam.rotation_euler = (ctr - eye).normalized().to_track_quat("-Z","Y").to_euler()
    scn.render.filepath = os.path.join(out_dir, f"c_{name}.png")
    bpy.ops.render.render(write_still=True)
print("BODY_OK")
