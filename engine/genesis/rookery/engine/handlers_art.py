"""Alpha engine: art handler - the second AI employee.

The engine's institutions were designed to not care WHO works, only
whether the result verifies. This handler proves it: the proposer is
not an LLM but a specialist pixel-art service (PixelLab), and the
oracle is the asset intake spec (size, color budget, binary alpha -
the same checks as tools/artgen/pixelize.py).

Payload:
    asset        - "character" | "image"
    description  - what to draw (the order sheet)
    out_dir      - workspace-relative folder the files may land in
    spec         - {width, height, max_colors, require_alpha}
                   applied to EVERY delivered png
    palette_ref  - optional workspace-relative png whose colors anchor
                   the style (how style consistency is enforced)
    est_generations - billing estimate (character 2, image 1, walk 4)

Budget: every order runs reserve -> settle on the same ledger as LLM
calls. The artist client is created per task via ARTIST_FACTORY so
tests can swap in a fake without network or spend.
"""

from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.request

from genesis.rookery.engine.auditor import ValidatorVerdict, is_test_file
from genesis.rookery.engine.budget import Denied
from genesis.rookery.engine.isolation import IsolationError
from genesis.rookery.engine.worker import HandlerOutcome, TaskContext

PIXELLAB = "https://api.pixellab.ai/v2"
USD_PER_GENERATION = 0.03          # 보수적 추정 단가 (정산 시 동일)


class PixelLabArtist:
    """Minimal ordering client. Returns {relative_name: png_bytes}."""

    def __init__(self, api_key: str):
        self.key = api_key

    def _call(self, method: str, path: str,
              body: dict | None = None) -> dict:
        req = urllib.request.Request(
            PIXELLAB + path, method=method,
            headers={"Authorization": f"Bearer {self.key}",
                     "Content-Type": "application/json"})
        data = json.dumps(body).encode() if body is not None else None
        with urllib.request.urlopen(req, data=data, timeout=300) as r:
            return json.load(r)

    def _poll(self, job_id: str, minutes: float = 8.0) -> None:
        t0 = time.time()
        while time.time() - t0 < minutes * 60:
            r = self._call("GET", f"/background-jobs/{job_id}")
            st = r.get("status")
            if st in ("completed", "finished", "done", "success"):
                return
            if st in ("failed", "error", "cancelled"):
                raise RuntimeError(f"artist job failed: {st}")
            time.sleep(10)
        raise RuntimeError("artist job timed out")

    def order(self, payload: dict) -> dict[str, bytes]:
        asset = payload.get("asset", "image")
        if asset == "character":
            return self._order_character(payload)
        return self._order_image(payload)

    def _order_image(self, p: dict) -> dict[str, bytes]:
        spec = p["spec"]
        r = self._call("POST", "/create-image-pixflux", {
            "description": p["description"],
            "image_size": {"width": spec["width"],
                           "height": spec["height"]},
            "no_background": bool(spec.get("require_alpha", True)),
        })
        out: dict[str, bytes] = {}
        self._collect_b64(r, out)
        return out

    def _order_character(self, p: dict) -> dict[str, bytes]:
        body = {
            "description": p["description"],
            "image_size": {"width": 32, "height": 32},
            "view": "low top-down",
        }
        if p.get("palette_ref_b64"):
            body["color_image"] = {"type": "base64",
                                   "base64": p["palette_ref_b64"]}
        r = self._call("POST", "/create-character-with-4-directions",
                       body)
        if r.get("background_job_id"):
            self._poll(r["background_job_id"])
        cid = r["character_id"]
        if p.get("walk", True):
            r2 = self._call("POST", "/characters/animations", {
                "character_id": cid, "mode": "template",
                "template_animation_id": "walking",
                "animation_name": "walk"})
            for j in r2.get("background_job_ids", []):
                self._poll(j)
        req = urllib.request.Request(
            f"{PIXELLAB}/characters/{cid}/zip",
            headers={"Authorization": f"Bearer {self.key}"})
        with urllib.request.urlopen(req, timeout=300) as z:
            blob = z.read()
        return self._unzip(blob)

    @staticmethod
    def _unzip(blob: bytes) -> dict[str, bytes]:
        import zipfile
        out: dict[str, bytes] = {}
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            for name in zf.namelist():
                if name.lower().endswith(".png"):
                    rel = name.replace("Idle/", "", 1)
                    out[rel] = zf.read(name)
        return out

    @staticmethod
    def _collect_b64(obj, out: dict, n: int = 0) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("base64", "image") and isinstance(v, str) \
                        and len(v) > 500:
                    out[f"image_{len(out)}.png"] = base64.b64decode(v)
                else:
                    PixelLabArtist._collect_b64(v, out)
        elif isinstance(obj, list):
            for v in obj:
                PixelLabArtist._collect_b64(v, out)


def _default_factory():
    key = os.environ.get("PIXELLAB_API_KEY", "")
    if not key:
        raise RuntimeError("PIXELLAB_API_KEY not set")
    return PixelLabArtist(key)


ARTIST_FACTORY = _default_factory


# ---------------------------------------------------------- the oracle


def check_png(data: bytes, spec: dict) -> list[str]:
    """이미지 반입 오라클 - tools/artgen/pixelize.py 와 같은 규칙."""
    from PIL import Image
    problems: list[str] = []
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    w, h = int(spec["width"]), int(spec["height"])
    if img.size != (w, h):
        problems.append(f"size {img.size} != {(w, h)}")
    px = list(img.getdata())
    colors = {p[:3] for p in px if p[3] > 0}
    if len(colors) > int(spec.get("max_colors", 24)):
        problems.append(
            f"colors {len(colors)} > {spec.get('max_colors', 24)}")
    alphas = {p[3] for p in px}
    if not alphas <= {0, 255}:
        problems.append("semi-transparent pixels")
    if spec.get("require_alpha") and 0 not in alphas:
        problems.append("no transparent background")
    return problems


# --------------------------------------------------------- the handler


def art_handler(ctx: TaskContext) -> HandlerOutcome:
    p = ctx.task.payload
    ws = ctx.workspace
    out_dir = p["out_dir"].strip("/").replace("\\", "/")
    spec = p["spec"]

    def reject(reason: str) -> HandlerOutcome:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False, kind="art"),
            result={"reason": reason})

    if is_test_file(out_dir) or out_dir.startswith(".."):
        return reject(f"bad_out_dir: {out_dir}")

    payload = dict(p)
    if p.get("palette_ref"):
        try:
            ref = ws.resolve(p["palette_ref"])
            with open(ref, "rb") as f:
                payload["palette_ref_b64"] = \
                    base64.b64encode(f.read()).decode()
        except (OSError, IsolationError) as exc:
            return reject(f"palette_ref unreadable: {exc}")

    gens = int(p.get("est_generations", 2))
    res = ctx.guard.reserve(gens * USD_PER_GENERATION
                            * ctx.guard.policy.usd_krw,
                            task_id=ctx.task.id,
                            run_id=ctx.task.run_id)
    if isinstance(res, Denied):
        return reject(f"budget denied: {res.reason}")
    try:
        artist = ARTIST_FACTORY()
        files = artist.order(payload)
    except Exception as exc:                         # noqa: BLE001
        ctx.guard.release(res)
        return reject(f"artist_failed: {exc}"[:300])
    ctx.guard.settle(res, usd=gens * USD_PER_GENERATION)

    if not files:
        return reject("no files delivered")
    problems: dict[str, list[str]] = {}
    written: list[str] = []
    for rel, data in sorted(files.items()):
        rel_path = f"{out_dir}/{rel}".replace("//", "/")
        if is_test_file(rel_path):
            return reject(f"artist tried to write test file {rel_path}")
        abs_path = ws.resolve(rel_path)      # containment check
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as f:
            f.write(data)
        written.append(rel_path)
        bad = check_png(data, spec)
        if bad:
            problems[rel] = bad

    spec_ok = not problems
    accepted = spec_ok and bool(written)
    if not accepted:
        ws.reset()
    verdict = ValidatorVerdict(
        ctx.task.id, accepted, kind="art",
        changed_files=written,
        checks={"files_present": bool(written), "spec_ok": spec_ok})
    return HandlerOutcome(
        verdict=verdict,
        result={"files": len(written),
                "problems": {k: v for k, v in
                             list(problems.items())[:5]}},
        commit_message=f"rookery-art: {p.get('asset', 'image')} "
                       f"-> {out_dir}",
        open_pr=accepted)
