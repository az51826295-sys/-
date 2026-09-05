"""그림(풍경) 레인 — **다른 회사 AI**가 그리고, 심판은 우리 것 그대로.

2026-08-26 사장님: "풍경 같은 것도 해봐. 다른 AI 불러들여서, 챗지피티나."

아이콘 레인이 증명한 골격을 매체만 바꿔 그대로 쓴다:

    생성(외부 AI, 교체 가능) → 후처리(격자 정합) → 기계 심판(하드 스펙)
    → **사람이 고름**(--defer-pick) → 그 선택이 다음 심판의 재료

바뀌는 것은 생성자뿐이다. 이 파일이 그 사실의 증거다 — Proposer가 Anthropic에서
OpenAI로 갈아끼워져도 심판(`genesis/asset_probe.measure_pixel_art` + 레지스트리
원자 `pixel_art_style`)은 한 줄도 안 바뀐다. **우리 자산은 심판뿐**이다.

숫자의 출처: `data/image_specs/pixel-bg-v1.yaml` → 전부 사장님이 08-07에 동결한
아트 기준(docs/game-design-v0.md §1b). 내가 고른 값은 없다.

후처리에 대하여: 생성 AI의 고해상도 출력은 그대로는 '가짜 도트'다(격자에 안 맞고
색이 무한). `tools/artgen/pixelize.py`로 격자에 강제 정합시킨 뒤 심판한다. 이건
레지스트리가 이미 선언한 공정이다(`worker_role`: 이미지 생성 AI + 자체 도트 변환).
**원본도 함께 남긴다** — 후처리가 심판을 통과시킨 것인지 원본이 좋았던 것인지
나중에 갈라볼 수 있어야 한다.

지출: GENESIS_SPEND=i-approve + --max-usd + OPENAI_API_KEY 셋 다 있어야 실 호출.
기본은 목이다. 비용은 공용 원장(data/proposer_ledger.jsonl, tool=image_lane).

  python -X utf8 tools/image_lane_run.py --scenes data/image_sets/rpg-bg-v1.json
  python -X utf8 tools/image_lane_run.py --scenes ... --provider openai \\
      --max-usd 0.20 --n 3 --out out/images/bg-v1
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import yaml                                              # noqa: E402

from genesis import asset_probe                          # noqa: E402
from tools import judge_bench as jb                      # noqa: E402
from tools import proposer as pz                         # noqa: E402

SPEC_PATH = os.path.join(ROOT, "data", "image_specs", "pixel-bg-v1.yaml")
ATOM_ID = "pixel_art_style"
DEFAULT_MODEL = "gpt-image-1"
DEFAULT_N = 3

# 장당 단가(USD). OpenAI 이미지 가격표(2026-06 기준)를 자리표시로 적는다 —
# 실제 청구와 다르면 **원장이 아니라 이 표를 고친다**. 원장은 부른 대로 남긴다.
IMAGE_PRICING = {
    ("gpt-image-1", "low"): 0.016,
    ("gpt-image-1", "medium"): 0.063,
    ("gpt-image-1", "high"): 0.25,
}

PROMPT = """{scene}

{meaning}

스타일: {reference}. 게임 배경(풍경) 한 장.
- 색은 {max_colors}색 이하의 제한 팔레트로 보이게.
- 글자·로고·워터마크·UI를 넣지 마라.
- 캐릭터를 주인공처럼 크게 넣지 마라. 배경이다.
- 가로로 넓은 구도(16:9)."""


class BudgetExhausted(RuntimeError):
    """이번 실행 예산이 끊겼다. 후보의 결격이 아니므로 판정은 미정의로 간다."""


def load_spec(path: str = SPEC_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def spec_for_judge(doc: dict) -> dict:
    """문서(public/hidden) → 심판이 읽는 평평한 spec.*  (아이콘 레인과 같은 꼴)"""
    return {"max_logical_size": doc["hidden"]["max_logical_size"],
            "max_colors": doc["public"]["max_colors"],
            "alpha_binary": doc["hidden"]["alpha_binary"]}


def build_prompt(scene: str, meaning: str, doc: dict) -> str:
    p = doc["public"]
    return PROMPT.format(scene=scene, meaning=meaning,
                         reference=p["reference"], max_colors=p["max_colors"])


def assert_no_hidden_leak(prompt: str, doc: dict) -> None:
    """hidden 값이 프롬프트에 들어가면 던진다(아이콘 레인 §0과 같은 규율)."""
    leaked = [k for k in doc.get("hidden", {}) if k.lower() in prompt.lower()]
    if leaked:
        raise ValueError(f"hidden 항목이 프롬프트로 샜다: {leaked}")


# ------------------------------------------------------------------ 제공자

class MockImageProposer:
    """결정적 목 — PNG를 직접 그려 낸다. 지출 0.

    실 모델을 흉내 내지 않는다. 두 종류를 낸다: 격자에 맞는 '진짜 도트'와
    그라데이션이 들어간 '가짜 도트'(색이 무한). 후자가 심판에 걸려야 한다.
    """

    name = "mock"
    model = "mock"

    def __init__(self):
        self.calls = 0

    def generate(self, prompt: str, n: int) -> list:
        from PIL import Image

        self.calls += 1
        out = []
        for k in range(n):
            if k % 2 == 0:                      # 진짜 도트(블록 8, 색 몇 개)
                small = Image.new("RGBA", (80, 45))
                px = small.load()
                for y in range(45):
                    for x in range(80):
                        px[x, y] = [(40, 60, 90, 255), (70, 110, 80, 255),
                                    (200, 190, 140, 255)][(x // 8 + y // 8) % 3]
                img = small.resize((640, 360), Image.NEAREST)
            else:                               # 가짜 도트(연속 그라데이션)
                img = Image.new("RGBA", (640, 360))
                px = img.load()
                for y in range(360):
                    for x in range(640):
                        px[x, y] = (x % 256, y % 256, (x + y) % 256, 255)
            out.append(img)
        return out


class OpenAIImageProposer:
    """실 제공자 — ChatGPT 쪽(OpenAI) 이미지 모델. 키는 사장님이 파일에 넣는다.

    우리는 키를 받아 적지 않는다: 환경변수나 ai-workforce/.env.local의
    `OPENAI_API_KEY=` 줄을 읽을 뿐이고, 값은 어디에도 출력하지 않는다.
    """

    name = "openai"

    def __init__(self, model: str = DEFAULT_MODEL, max_usd: float = 0.20,
                 size: str = "1536x1024", quality: str = "low"):
        if os.environ.get("GENESIS_SPEND") != "i-approve":
            raise RuntimeError("유료 경로 잠김: GENESIS_SPEND=i-approve 필요")
        self.api_key = load_openai_key()
        if not self.api_key:
            raise RuntimeError(
                "OPENAI_API_KEY 없음 — ai-workforce/.env.local에 "
                "OPENAI_API_KEY=... 한 줄을 사장님이 추가하셔야 한다")
        self.model, self.size, self.quality = model, size, quality
        self.max_usd, self.spent_here = max_usd, 0.0
        self.calls = 0
        self.images = 0

    def unit_price(self) -> float:
        price = IMAGE_PRICING.get((self.model, self.quality))
        if price is None:
            raise RuntimeError(
                f"단가표에 없는 조합: {self.model}/{self.quality} — "
                "가격을 모르는 채로 부르지 않는다")
        return price

    def generate(self, prompt: str, n: int) -> list:
        import urllib.error
        import urllib.request

        from PIL import Image

        price = self.unit_price()
        if self.spent_here + price * n > self.max_usd:
            raise BudgetExhausted(
                f"이번 실행 예산 ${self.max_usd:.4f} 초과 예상 "
                f"(현재 ${self.spent_here:.4f} + {n}장×${price}) - 호출 중단")
        body = json.dumps({"model": self.model, "prompt": prompt, "n": n,
                           "size": self.size, "quality": self.quality}).encode()
        req = urllib.request.Request(
            "https://api.openai.com/v1/images/generations", data=body,
            headers={"Authorization": f"Bearer {self.api_key}",
                     "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise RuntimeError(f"OpenAI {exc.code} - {detail}") from None
        import io
        images = []
        for item in data.get("data", []):
            raw = base64.b64decode(item["b64_json"])
            images.append(Image.open(io.BytesIO(raw)).convert("RGBA"))
        self.calls += 1
        self.images += len(images)
        self.spent_here += price * len(images)
        record_image_call(self.model, self.quality, self.size, len(images),
                          price * len(images), prompt)
        return images


def load_openai_key() -> str:
    """환경변수 우선, 없으면 ai-workforce/.env.local. 값은 절대 출력하지 않는다."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    path = os.path.join(os.path.expanduser("~"), "Desktop", "ai-workforce",
                        ".env.local")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("OPENAI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def record_image_call(model: str, quality: str, size: str, images: int,
                      usd: float, prompt: str, path: str = None) -> dict:
    """이미지 호출을 공용 원장에 적는다. 토큰이 아니라 장수로 센다."""
    path = path or pz.LEDGER
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "tool": "image_lane",
           "model": model, "want": prompt.splitlines()[0][:60],
           "images": images, "quality": quality, "size": size,
           "input_tokens": 0, "output_tokens": 0,
           "usd": round(usd, 6), "krw": round(usd * pz.USD_TO_KRW, 2)}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


def make_provider(name: str, model: str = DEFAULT_MODEL,
                  max_usd: float = 0.20, quality: str = "low"):
    if name == "openai":
        return OpenAIImageProposer(model=model, max_usd=max_usd,
                                   quality=quality)
    return MockImageProposer()


# ------------------------------------------------------------------ 후처리·심판

def crop_16_9(img):
    """가운데를 잘라 16:9로. 늘이지 않는다 — 비율을 왜곡하면 그림이 상한다."""
    w, h = img.size
    want = w * 9 / 16
    if abs(want - h) < 1:
        return img
    if want < h:                                  # 너무 높다 → 위아래를 자른다
        top = int((h - want) / 2)
        return img.crop((0, top, w, top + int(want)))
    want_w = int(h * 16 / 9)                      # 너무 넓다 → 좌우를 자른다
    left = int((w - want_w) / 2)
    return img.crop((left, 0, left + want_w, h))


def postprocess(img, doc: dict):
    """선언된 후처리: 16:9 크롭 → 격자 정합(pixelize). 새 공정이 아니다."""
    from tools.artgen import pixelize as pz_tool

    size = doc["postprocess"]["size"].split("x")
    return pz_tool.pixelize(crop_16_9(img), int(size[0]), int(size[1]),
                            colors=doc["postprocess"]["colors"])


def judge_image(path: str, doc: dict, registry: list | None = None) -> dict:
    """파일 하나를 레지스트리 원자로 채점한다. 채점 로직은 여기 없다."""
    reg = registry if registry is not None else jb.load_registry()
    atom = next(a for a in reg if a["id"] == ATOM_ID)
    measured = asset_probe.measure_pixel_art(path)
    sample = {"spec": spec_for_judge(doc), "measured": measured, "claim": {}}
    rows = jb.explain_conformance(atom["judge"]["params"], sample)
    if any(r["ok"] is None for r in rows):
        verdict = "UNDEFINED"
    elif all(r["ok"] for r in rows):
        verdict = "PASS"
    else:
        verdict = "FAIL"
    return {"verdict": verdict, "rules": rows, "measured": measured}


def report(result: dict) -> str:
    lines = [f'VERDICT: {result["verdict"]}']
    bad = [r for r in result["rules"] if r["ok"] is False]
    if bad:
        lines.append("violations:")
        for r in bad:
            lines += [f'  - rule: {r["rule"]}',
                      f'    got: {json.dumps(r["got"], ensure_ascii=False)}',
                      f'    want: {json.dumps(r["want"], ensure_ascii=False)}']
    ok = [r["rule"] for r in result["rules"] if r["ok"]]
    if ok:
        lines.append("passed:")
        lines += [f"  - {r}" for r in ok]
    return "\n".join(lines)


# ------------------------------------------------------------------ 루프

def run_scene(scene: dict, provider, doc: dict, out_dir: str, index: int,
              n: int = DEFAULT_N, registry=None) -> dict:
    """장면 하나 → 후보 n장. 심판은 거르기만 하고 고르지 않는다."""
    prompt = build_prompt(scene["scene"], scene.get("meaning", ""), doc)
    assert_no_hidden_leak(prompt, doc)
    slug = "{:02d}_{}".format(index, scene.get("slug", scene["scene"])[:24])
    raw_dir = os.path.join(out_dir, "raw", slug)
    cand_dir = os.path.join(out_dir, "candidates", slug)
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(cand_dir, exist_ok=True)
    try:
        images = provider.generate(prompt, n)
    except BudgetExhausted as exc:
        return {"scene": scene["scene"], "slug": slug, "verdict": "UNDEFINED",
                "why": str(exc), "candidates": [], "rejected": []}

    kept, rejected = [], []
    for k, img in enumerate(images, 1):
        raw_path = os.path.join(raw_dir, "r{:02d}.png".format(k))
        img.save(raw_path)                        # 원본을 남긴다(후처리 전)
        done = postprocess(img, doc)
        cand_path = os.path.join(cand_dir, "c{:02d}.png".format(k))
        done.save(cand_path)
        # **둘 다 잰다.** 후처리본은 우리가 격자에 맞춰 만든 것이라 이 심판을
        # 거의 항상 통과한다(공허). 생성기가 진짜 도트를 냈는지는 원본만 말한다.
        raw_res = judge_image(raw_path, doc, registry)
        res = judge_image(cand_path, doc, registry)
        row = {"raw": os.path.relpath(raw_path, ROOT).replace("\\", "/"),
               "path": os.path.relpath(cand_path, ROOT).replace("\\", "/"),
               "verdict": res["verdict"], "raw_verdict": raw_res["verdict"],
               "measured": res["measured"], "raw_measured": raw_res["measured"],
               "report": report(res), "raw_report": report(raw_res)}
        (kept if res["verdict"] == "PASS" else rejected).append(row)
        if res["verdict"] != "PASS":
            os.remove(cand_path)                  # 반입 오라클을 못 넘은 것만 뺀다
    return {"scene": scene["scene"], "slug": slug,
            "verdict": "PASS" if kept else "FAIL",
            "candidates": kept, "rejected": rejected,
            "raw_passed": sum(1 for r in kept + rejected
                              if r["raw_verdict"] == "PASS")}


def run(scenes: list, provider, doc: dict, out_dir: str, n: int = DEFAULT_N,
        registry=None) -> dict:
    started = time.time()
    results = [run_scene(s, provider, doc, out_dir, i, n, registry)
               for i, s in enumerate(scenes, 1)]
    return {"spec": doc["spec_id"], "provider": provider.name,
            "model": getattr(provider, "model", "mock"),
            "quality": getattr(provider, "quality", None),
            "results": results,
            "scenes": len(results),
            "kept": sum(len(r["candidates"]) for r in results),
            "rejected": sum(len(r["rejected"]) for r in results),
            "raw_passed": sum(r.get("raw_passed", 0) for r in results),
            "hard_judge_note": (
                "후처리(pixelize) 뒤의 반입 오라클은 거의 공허하다 — 우리가 격자·"
                "색 수·알파를 맞춰 만든 파일이기 때문이다. 생성기가 진짜 도트를 "
                "냈는지는 raw_verdict만 말한다. 후처리본의 진짜 관문은 사람 선별"
                "(그리고 아직 미동결인 마스터 팔레트)이다."),
            "images": getattr(provider, "images", 0),
            "usd": round(getattr(provider, "spent_here", 0.0), 6),
            "picked_by": None,                    # 고르는 것은 사람이다
            "seconds": round(time.time() - started, 2),
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}


def _print(out: dict) -> None:
    print("그림 레인 — 제공자 {}/{} · 스펙 {}".format(
        out["provider"], out["model"], out["spec"]))
    print("=" * 66)
    for r in out["results"]:
        print("{:9s} {:22s} 통과 {} / 거절 {}".format(
            r["verdict"], r["slug"], len(r["candidates"]), len(r["rejected"])))
        for bad in r["rejected"]:
            first = [ln.strip() for ln in bad["report"].splitlines()
                     if ln.strip().startswith("- rule:")]
            print("      거절 {}: {}".format(os.path.basename(bad["raw"]),
                                             ", ".join(first) or "-"))
        if r.get("why"):
            print("      → {}".format(r["why"]))
    print("=" * 66)
    print("장면 {} · 생성 {}장 · 선별판에 오른 후보 {} · 지출 ${:.6f}".format(
        out["scenes"], out["images"], out["kept"], out["usd"]))
    print("원본(후처리 전)이 진짜 도트였던 것: {}/{}".format(
        out["raw_passed"], out["images"] or out["kept"] + out["rejected"]))
    print("주의: " + out["hard_judge_note"])
    print("고른 사람: (없음) — 선택은 사람 몫으로 유보됨")


def main(argv=None):
    ap = argparse.ArgumentParser(description="그림(풍경) 레인")
    ap.add_argument("--scenes", required=True, help="[{scene, meaning, slug}]")
    ap.add_argument("--provider", default="mock", choices=["mock", "openai"])
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--quality", default="low",
                    choices=["low", "medium", "high"])
    ap.add_argument("--max-usd", type=float, default=0.20)
    ap.add_argument("--n", type=int, default=DEFAULT_N)
    ap.add_argument("--spec", default=SPEC_PATH)
    ap.add_argument("--out", default=os.path.join("out", "images", "bg-v1"))
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    doc = load_spec(args.spec)
    with open(args.scenes, encoding="utf-8") as f:
        scenes = json.load(f)
    provider = make_provider(args.provider, args.model, args.max_usd,
                             args.quality)
    out = run(scenes, provider, doc, args.out, n=args.n)
    if args.record:
        os.makedirs(os.path.dirname(args.record) or ".", exist_ok=True)
        with open(args.record, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        _print(out)
    return 0 if out["kept"] else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
