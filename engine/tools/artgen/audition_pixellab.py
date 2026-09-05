"""PixelLab 오디션: 채용 과제 3종을 주문하고 결과를 저장한다.

과제 (docs/game-design-v0.md §1b의 채용 절차):
  icon      검 아이콘 (pixflux, 동기)
  character 상인 캐릭터 4방향 (비동기 job)
  tileset   풀->흙길 Wang 타일셋 16px (비동기 job)

  python tools/artgen/audition_pixellab.py icon
  python tools/artgen/audition_pixellab.py character
  python tools/artgen/audition_pixellab.py tileset
결과: audition/pixellab/ 에 PNG + 원본 응답 JSON.
"""

import base64
import json
import os
import sys
import time
import urllib.request

BASE = "https://api.pixellab.ai/v2"
OUT = os.path.join("audition", "pixellab")


def key() -> str:
    with open(os.path.join(".secrets", "pixellab.key"),
              encoding="ascii") as f:
        return f.read().strip()


def call(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        BASE + path, method=method,
        headers={"Authorization": f"Bearer {key()}",
                 "Content-Type": "application/json"})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:800]
        raise SystemExit(f"HTTP {e.code} {path}: {detail}")


def save_b64(name: str, b64: str) -> str:
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, "wb") as f:
        f.write(base64.b64decode(b64))
    print("저장:", p)
    return p


def dump(name: str, obj: dict) -> None:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def images_in(obj, found=None) -> list[str]:
    """응답 어디에 있든 base64 이미지를 걷어온다 (형식 방어)."""
    found = found if found is not None else []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("base64", "image") and isinstance(v, str) \
                    and len(v) > 500:
                found.append(v)
            else:
                images_in(v, found)
    elif isinstance(obj, list):
        for v in obj:
            images_in(v, found)
    return found


def task_icon() -> None:
    r = call("POST", "/create-image-pixflux", {
        "description": ("a single fantasy short sword game item icon, "
                        "steel blade, leather grip, simple readable "
                        "silhouette"),
        "image_size": {"width": 64, "height": 64},
        "no_background": True,
    })
    dump("icon_response.json", r)
    imgs = images_in(r)
    for i, b in enumerate(imgs):
        save_b64(f"icon_{i}.png", b)
    print(f"이미지 {len(imgs)}개")


def poll_job(job_id: str, minutes: float = 8.0) -> dict:
    t0 = time.time()
    while time.time() - t0 < minutes * 60:
        r = call("GET", f"/background-jobs/{job_id}")
        st = r.get("status", r.get("state", "?"))
        print(f"  job {st} ({int(time.time() - t0)}s)", flush=True)
        if st in ("completed", "finished", "done", "success"):
            return r
        if st in ("failed", "error", "cancelled"):
            dump("job_failed.json", r)
            raise SystemExit(f"job 실패: {json.dumps(r)[:400]}")
        time.sleep(10)
    raise SystemExit("job 시간 초과")


def task_character() -> None:
    r = call("POST", "/create-character-with-4-directions", {
        "description": ("friendly village merchant, plump middle-aged "
                        "man, brown apron, small mustache, warm smile, "
                        "carrying a coin pouch"),
        "image_size": {"width": 32, "height": 32},
        "view": "low top-down",
    })
    dump("character_started.json", r)
    print(json.dumps(r, ensure_ascii=False)[:400])
    job = r.get("background_job_id") or r.get("job_id")
    cid = r.get("character_id")
    if job:
        poll_job(job)
    if cid:
        c = call("GET", f"/characters/{cid}")
        dump("character_result.json", c)
        for i, b in enumerate(images_in(c)):
            save_b64(f"character_{i}.png", b)


def task_tileset() -> None:
    r = call("POST", "/create-tileset", {
        "lower_description": "lush green grass meadow",
        "upper_description": "packed dirt village path",
        "tile_size": {"width": 16, "height": 16},
        "view": "low top-down",
    })
    dump("tileset_started.json", r)
    print(json.dumps(r, ensure_ascii=False)[:400])
    tid = r.get("tileset_id") or r.get("id")
    job = r.get("background_job_id") or r.get("job_id")
    if job:
        poll_job(job)
    if tid:
        for _ in range(60):
            t = call("GET", f"/tilesets/{tid}")
            if images_in(t):
                dump("tileset_result.json", t)
                for i, b in enumerate(images_in(t)):
                    save_b64(f"tileset_{i}.png", b)
                return
            print("  tileset 대기...", flush=True)
            time.sleep(10)


def task_walk() -> None:
    """합격한 상인에게 걷기 애니메이션 (템플릿 모드, 4방향)."""
    with open(os.path.join(OUT, "character_started.json"),
              encoding="utf-8") as f:
        cid = json.load(f)["character_id"]
    tpl = sys.argv[2] if len(sys.argv) > 2 else "walking"
    r = call("POST", "/characters/animations", {
        "character_id": cid,
        "mode": "template",
        "template_animation_id": tpl,
        "animation_name": "walk",
    })
    dump("walk_started.json", r)
    print(json.dumps(r, ensure_ascii=False)[:400])
    job = r.get("background_job_id") or r.get("job_id")
    if job:
        poll_job(job)
    c = call("GET", f"/characters/{cid}")
    dump("walk_character.json", c)
    print(json.dumps(c, ensure_ascii=False)[:1200])


def _b64_file(path: str) -> dict:
    with open(path, "rb") as f:
        return {"type": "base64",
                "base64": base64.b64encode(f.read()).decode()}


def task_protagonist() -> None:
    """주인공 생성 - 상인의 팔레트를 스타일 닻으로 사용."""
    ref = os.path.join("game", "assets", "characters", "merchant",
                       "rotations", "south.png")
    r = call("POST", "/create-character-with-4-directions", {
        "description": ("young traveler protagonist, short dark hair, "
                        "green tunic, small leather backpack, "
                        "determined friendly expression"),
        "image_size": {"width": 32, "height": 32},
        "view": "low top-down",
        "color_image": _b64_file(ref),
    })
    dump("hero_started.json", r)
    print(json.dumps(r, ensure_ascii=False)[:300])
    job = r.get("background_job_id")
    cid = r.get("character_id")
    if job:
        poll_job(job)
    # 걷기 4방향
    r2 = call("POST", "/characters/animations", {
        "character_id": cid,
        "mode": "template",
        "template_animation_id": "walking",
        "animation_name": "walk",
    })
    dump("hero_walk_started.json", r2)
    for j in r2.get("background_job_ids", []):
        poll_job(j)
    print("완료 - character_id:", cid)


def main() -> None:
    task = sys.argv[1] if len(sys.argv) > 1 else "icon"
    print("잔액:", json.dumps(call("GET", "/balance")))
    {"icon": task_icon, "character": task_character,
     "tileset": task_tileset, "walk": task_walk,
     "protagonist": task_protagonist}[task]()
    print("잔액:", json.dumps(call("GET", "/balance")))


if __name__ == "__main__":
    main()
