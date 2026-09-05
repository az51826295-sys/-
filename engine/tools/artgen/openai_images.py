"""OpenAI 이미지 생성 (`gpt-image-1`) — GPT로 도트를 뽑는 경로.

  python -X utf8 tools/artgen/openai_images.py --check          # 키·모델 확인
  python -X utf8 tools/artgen/openai_images.py --dry            # 본문만
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/openai_images.py \
      --prompt-id witch_gpt_1 --n 4

2026-08-27 사장님: *"도트는 지피티가 더 잘할 수 있어. 아예 지피티로 만들자."*
→ *"API로 안 돼?"*

된다. 그리고 API가 손으로 붙여넣는 것보다 낫다 — **`n` 으로 여러 장을 한 번에
뽑을 수 있어서** 오디션(뽑기→거르기→고르기)이 그대로 돈다. 손으로는 n=1로
되돌아간다.

**단가를 가정하지 않는다** (measurement-rules §10, 오늘 만든 규칙).
PixelLab에서 타일셋 1건을 1회로 가정했다가 실제 3회여서 잔량 보고가 틀렸다.
여기서는 응답의 `usage` 를 그대로 원장에 적고, **모르면 모른다고 적는다.**

**배경은 API가 투명하게 준다** (`background: "transparent"`). 그래서 크로마키가
필요 없다 — 사장님께 "마젠타로 그려 달라고 하세요"라고 부탁드릴 필요도 없어진다.
그래도 `gpt_intake` 의 격자·팔레트·규격·화면 판정은 그대로 거친다. 1024px 그림은
아직 진짜 도트가 아니다.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import prompt_book as pb                          # noqa: E402

API = "https://api.openai.com/v1/images/generations"
# 2026-08-27 실측: 계정에 gpt-image-2(2026-04-21)까지 있다. 최신을 쓴다.
# gpt-image-1 / 1.5 / 2 / 2-mini 가 다 보인다 - 목록은 --check 로 확인한다.
MODEL = "gpt-image-2"
KEY_FILE = os.path.join(".secrets", "openai.key")
LEDGER = os.path.join("data", "openai_image_ledger.jsonl")
OUT = os.path.join("audition", "gpt_raw")
# 1024가 최소다. 우리 목표는 48px이므로 어차피 축소한다 - 큰 쪽이 축소 여유가 있다.
SIZE = "1024x1024"


def key(root: str = ROOT) -> str:
    v = os.environ.get("OPENAI_API_KEY", "").strip()
    if v:
        return v
    p = os.path.join(root, KEY_FILE)
    if os.path.exists(p):
        v = open(p, encoding="ascii").read().strip()
        if v:
            return v
    raise SystemExit(
        f"OpenAI 키가 없다. {KEY_FILE} 에 넣거나 OPENAI_API_KEY 로 준다. "
        f"(ai-workforce/.env.local 의 OPENAI_API_KEY 는 **비어 있다**)")


def _post(url: str, body: dict, root: str = ROOT, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        url, method="POST",
        headers={"Authorization": f"Bearer {key(root)}",
                 "Content-Type": "application/json"},
        data=json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:600]}")


def check(root: str = ROOT) -> dict:
    req = urllib.request.Request(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {key(root)}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        ids = [m["id"] for m in json.load(r)["data"]]
    return {"has_key": True, "image_models": sorted(
        i for i in ids if "image" in i or "dall" in i)}


def body(prompt: str, n: int, quality: str = "low") -> dict:
    return {"model": MODEL, "prompt": prompt, "n": n, "size": SIZE,
            "quality": quality,
            # 배경을 API가 투명하게 준다 - 크로마키 단계가 통째로 빠진다
            "background": "transparent", "output_format": "png"}


def record(row: dict, root: str = ROOT) -> None:
    p = os.path.join(root, LEDGER)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def generate(prompt: str, n: int, name: str, quality: str = "low",
             root: str = ROOT) -> dict:
    """n장을 한 번에 뽑는다. **n은 오디션이 요구하는 만큼이다(§15).**"""
    d = os.path.join(root, OUT, name)
    os.makedirs(d, exist_ok=True)
    doc = _post(API, body(prompt, n, quality), root)
    paths = []
    for i, item in enumerate(doc.get("data", [])):
        b64 = item.get("b64_json")
        if not b64:
            continue
        p = os.path.join(d, f"{name}_{i}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(b64))
        paths.append(p)
    usage = doc.get("usage")
    record({"what": f"images.generate {name}", "model": MODEL, "n": n,
            "quality": quality, "size": SIZE, "got": len(paths),
            # **응답이 준 것만 적는다.** 단가를 계산해 넣지 않는다 - 모르는 것을
            # 아는 척하면 원장이 거짓말을 한다(§10).
            "usage": usage,
            "usd": None if usage is None else "usage로 계산 필요(단가 미확인)"},
           root)
    return {"name": name, "paths": paths, "n_requested": n,
            "usage": usage, "dir": d}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--prompt-id", help="data/prompts/<id>.json")
    ap.add_argument("--text", help="프롬프트를 직접 준다(검사는 그대로 받는다)")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--quality", default="low",
                    choices=["low", "medium", "high"])
    ap.add_argument("--name")
    a = ap.parse_args(argv)

    if a.check:
        print(json.dumps(check(), ensure_ascii=False, indent=1))
        return 0

    if a.prompt_id:
        doc = pb.load(a.prompt_id)
        text = doc["body"].get("description") or doc["body"].get("prompt")
        name = a.name or a.prompt_id
    elif a.text:
        text, name = a.text, a.name or "adhoc"
    else:
        print("--prompt-id 나 --text 가 필요하다")
        return 2

    lint = pb.lint(text)
    if not lint["ok"]:
        print("프롬프트가 검사에 걸렸다 (measurement-rules §12):")
        for b in lint["banned"]:
            print(f"  ✖ {b['found']!r} — {b['why']}")
        return 2
    for m in lint["missing"]:
        print(f"  ? 빠짐: {m}")

    if a.dry:
        print(json.dumps(body(text, a.n, a.quality), ensure_ascii=False,
                         indent=1)[:900])
        print(f"\n{a.n}장 요청. 실제 주문은 GENESIS_SPEND=i-approve.")
        print("단가는 **첫 호출의 usage 로 실측**한다 (§10: 가정하지 않는다).")
        return 0

    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2

    r = generate(text, a.n, name, a.quality)
    print(f"{len(r['paths'])}/{r['n_requested']}장 → {r['dir']}")
    print(f"usage: {r['usage']}")
    print(f"원장: {LEDGER}")
    return 0 if r["paths"] else 1


if __name__ == "__main__":
    sys.exit(main())
