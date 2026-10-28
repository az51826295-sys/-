"""도트 크기 자 — "픽셀 아트인 척하는 그림"을 잡는다.

2026-10-28. 사장님 기획안이 짚은 칸이다: *픽셀 아트의 도트 크기 비율 불일치
(Texel Density 문제, 믹스드 픽셀)*. 지금 자들(`character_judge`·`context_view`)은
색·명암·바닥 대비를 재는데, **도트가 도트인지는 아무도 안 본다.**

그래서 생기는 일: 1024×1024 로 뽑은 "픽셀 아트"가 색 20개·명암폭 180 으로
전부 통과한다. 그런데 화면에 깔면 32×32 스프라이트 옆에서 혼자 매끈해서 뜬다.
반대도 있다 — 투구는 도트 16, 몸은 도트 12 면 같은 캐릭터로 안 보인다.

## 무엇을 재나

**도트 크기(texel)** 논리 화소 하나가 실제 화소 몇 개인가. 경계가 어디 서는지로
  찾는다. 16배로 키운 도트 그림은 색이 바뀌는 자리가 **전부 16의 배수**에 있다.

**격자 일치율(align)** 경계 중 그 격자에 앉은 것의 비율. 깨끗한 도트는 1.0 이다.

**격자 흔적(trace)** 그 격자가 **우연일 확률 대비 몇 배**인가 — `일치율 × 격자`.
  도트가 없는 그림에서도 아무 격자나 집으면 `1/s` 쯤은 맞는다. 그래서 1.0 이
  우연이고, 16 이면 격자가 확실히 있다. **이 칸이 자의 눈이다** — 비정수 배율로
  늘린 그림은 일치율이 0.48 로 떨어지지만 흔적은 14.75 라, "격자가 있는데
  흐트러졌다"를 "격자가 없다"와 가를 수 있다.

**도트 순도(purity)** 도트 한 칸이 **한 색**인 비율. 1.0 이 깨끗한 도트다.
  1.0 이 아니면 그만큼이 **믹스드 픽셀** — 안티에일리어싱으로 생긴 중간색이다.
  **알파도 색으로 센다.** 실루엣 가장자리의 반투명이 제일 흔한 고장이고,
  투명 배경만 보던 자들은 그걸 못 봤다.

**세트 일치(match)** 여러 장이 **같은 도트 크기**인가. 투구 16·몸 12 를 잡는 칸.

## 문턱을 어디서 가져왔나

align·purity 는 **지어낼 필요가 없다.** 진짜 도트 그림은 정의상 둘 다 1.0 이다.
`MIN_TRACE` 하나만 가를 수가 필요했고, 그건 **먼저 재고 적었다**
(`tools/texel_basis.py`, 09-21 규율: 잠그기 전에 돌려 본다):

    깨끗한 16배 확대      흔적 16.00   일치율 1.000   ← 격자 있음
    한 번 줄였다 늘림      흔적  6.18   일치율 0.386   ← 격자 있음, 흐트러짐
    비정수 15.5배         흔적 14.75   일치율 0.476   ← 격자 있음, 흐트러짐
    ─────────────────── 빈 구간 (2.6 ~ 6.2) ───────────────────
    원본 해상도 도트       흔적  2.37                  ← 격자 없음(정상)
    안티에일리어싱 16배     흔적  1.05                  ← 격자 없음(뭉개짐)

4.0 은 그 빈 구간 가운데다. 양쪽으로 1.5배 넘는 여유가 있다.

## 이 자가 못 재는 것 — **고치려 들지 마라**

- **격자가 아예 뭉개진 그림.** 바이큐빅으로 늘린 384×384 는 흔적 1.05 로
  원본 해상도 도트 그림과 **구별되지 않는다.** 둘 다 "격자 없음"이다.
  그때는 `want_texel` 을 줘야 잡힌다(도트 1 ≠ 주문 16). 안 주면 **못 잼**이고,
  논리 해상도와 색 수를 같이 적어 둔다 — 384×384 논리에 색 4천이면 사람이 안다.
- **도트 1 짜리 그림의 순도.** 격자가 없으면 "한 칸이 한 색"이 물음이 안 된다.
- **예쁜가.** 안 본다. 거르기만 한다. 마지막 칸은 사람이 고른다.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

# 색이 "바뀌었다"고 부를 최소 차이. 어떤 채널이든 이만큼 벌어지면 경계로 센다.
# 0 으로 두면 무손실 PNG 에서도 1 짜리 잡티가 경계가 되고, 크게 두면 부드러운
# 그라데이션 경계를 놓친다. 12 는 8비트 한 단(16)보다 작다.
EDGE_DELTA = 12

# 격자를 찾을 최대 도트 크기. 64 를 넘는 도트는 우리 쓰임에 없고,
# 크게 열면 짧은 그림에서 주기 하나만 보고 "그게 주기다" 하게 된다.
MAX_TEXEL = 64

# 주기를 믿기 위해 필요한 최소 경계 수. 이보다 적으면 **못 잼**이다 —
# 단색 네모 하나에서 "도트 16" 을 읽어 내는 쪽이 더 위험하다.
MIN_EDGES = 32

# 격자 하나를 "깨끗하다"고 부를 일치율. 여기서 가장 큰 s 를 고른다.
ALIGN_BAR = 0.98

# 판정 문턱 — 실측 뒤에 적었다(위 표).
MIN_ALIGN = 0.98
MIN_PURITY = 0.98
MIN_TRACE = 4.0          # 이보다 크면 "격자가 있다" 고 부른다


def _rgba(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.int16)


def _edge_counts(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """세로·가로 경계의 위치별 개수.

    알파를 네 번째 채널로 **같이** 센다. 실루엣 가장자리가 제일 흔한 고장인데,
    RGB 만 보면 투명한 칸의 쓰레기 색까지 보게 되고 반투명 테두리는 놓친다.
    """
    dx = np.abs(np.diff(a, axis=1)).max(axis=2)          # H x (W-1)
    dy = np.abs(np.diff(a, axis=0)).max(axis=2)          # (H-1) x W
    return (dx > EDGE_DELTA).sum(axis=0), (dy > EDGE_DELTA).sum(axis=1)


def _period(edge: np.ndarray, limit: int) -> dict:
    """경계가 어느 격자에 앉나.

    두 가지를 같이 낸다 —

    `clean` 일치율이 `ALIGN_BAR` 를 넘는 **가장 큰** 격자. s 의 약수도 같은
      일치율을 내므로(16의 배수는 8의 배수이기도 하다) 작은 쪽을 집으면 늘 1 이나
      2 가 나온다. 큰 쪽이 실제 도트 크기다.

    `trace` 우연 대비(`일치율 × 격자`)가 제일 큰 격자. 깨끗하지 않아도 격자가
      **있기는 한** 경우를 여기서 본다. 이 칸 없이는 비정수 배율로 늘린 그림이
      "격자 없음"으로 조용히 통과한다.
    """
    total = float(edge.sum())
    if total < MIN_EDGES:
        return {"clean": None, "align": None, "offset": None, "trace": None,
                "why": f"경계가 {int(total)}개뿐이라 주기를 못 읽는다 (최소 {MIN_EDGES})"}
    pos = np.arange(1, len(edge) + 1)
    clean = {"texel": 1, "align": 1.0, "offset": 0}
    trace = {"texel": None, "align": None, "offset": None, "trace": 1.0}
    curve = {}
    for s in range(2, limit + 1):
        sums = np.bincount(pos % s, weights=edge.astype(float), minlength=s)
        o = int(sums.argmax())
        frac = float(sums[o] / total)
        curve[s] = round(frac, 4)
        if frac >= ALIGN_BAR:
            clean = {"texel": s, "align": round(frac, 4), "offset": o}
        if frac * s > trace["trace"]:
            trace = {"texel": s, "align": round(frac, 4), "offset": o,
                     "trace": round(frac * s, 2)}
    return {"clean": clean, "trace": trace, "curve": curve}


def _purity(a: np.ndarray, s: int, ox: int, oy: int) -> dict:
    """도트 한 칸이 한 색인 비율. 알파를 포함한 네 채널이 전부 같아야 한다."""
    if s < 2:
        return {"purity": None,
                "why": "도트 1 이라 격자가 없다 — 칸 안을 못 본다"}
    h, w, _ = a.shape
    x0, y0 = ox % s, oy % s
    nbx, nby = (w - x0) // s, (h - y0) // s
    if nbx < 2 or nby < 2:
        return {"purity": None, "why": f"도트 {s} 로 자르면 칸이 {nbx}x{nby} 뿐이다"}
    cut = a[y0:y0 + nby * s, x0:x0 + nbx * s, :].astype(np.uint32)
    key = (cut[..., 0] << 24) | (cut[..., 1] << 16) | (cut[..., 2] << 8) | cut[..., 3]
    blocks = (key.reshape(nby, s, nbx, s)
                 .transpose(0, 2, 1, 3)
                 .reshape(nby, nbx, s * s))
    uniform = (blocks == blocks[:, :, :1]).all(axis=2)
    return {"purity": round(float(uniform.mean()), 4),
            "dots": int(nbx * nby),
            "mixed_dots": int((~uniform).sum()),
            "logical": [int(nbx), int(nby)]}


def measure_one(path: str) -> dict:
    a = _rgba(path)
    h, w, _ = a.shape
    limit = max(1, min(MAX_TEXEL, w // 4, h // 4))
    ex, ey = _edge_counts(a)
    px, py = _period(ex, limit), _period(ey, limit)
    out: dict = {"path": path, "size": [int(w), int(h)], "why": []}

    # 투명하지 않은 화소의 색 수. 판정에 안 쓴다 — "격자 없음"이 정상 도트인지
    # 뭉개진 그림인지 사람이 가늠할 재료로 적어 둔다(그 둘을 자는 못 가른다).
    op = a[a[..., 3] > 0].astype(np.uint32)
    out["colors"] = int(np.unique(
        (op[:, 0] << 16) | (op[:, 1] << 8) | op[:, 2]).size) if op.size else 0

    for p in (px, py):
        if p.get("why"):
            out["why"].append(p["why"])
    if px["clean"] is None or py["clean"] is None:
        out.update({"texel": None, "align": None, "purity": None, "grid": "못 잼"})
        return out

    cx, cy = px["clean"], py["clean"]
    tx, ty = px["trace"], py["trace"]

    if cx["texel"] > 1 and cy["texel"] > 1:
        out["grid"] = "깨끗"
        out["square"] = cx["texel"] == cy["texel"]
        s, ox, oy = min(cx["texel"], cy["texel"]), cx["offset"], cy["offset"]
        out["align"] = round(min(cx["align"], cy["align"]), 4)
        out["trace"] = round(min(tx["trace"] or 0, ty["trace"] or 0), 2)
    elif (tx["trace"] or 0) >= MIN_TRACE and (ty["trace"] or 0) >= MIN_TRACE:
        # 격자는 있는데 경계가 흘렀다. **이 가지가 비정수 배율·재리샘플을 잡는다.**
        out["grid"] = "흐트러짐"
        out["square"] = tx["texel"] == ty["texel"]
        s, ox, oy = min(tx["texel"], ty["texel"]), tx["offset"], ty["offset"]
        out["align"] = round(min(tx["align"], ty["align"]), 4)
        out["trace"] = round(min(tx["trace"], ty["trace"]), 2)
    else:
        out["grid"] = "없음"
        out["texel"] = 1
        out["align"] = None
        out["purity"] = None
        out["trace"] = round(min(tx["trace"] or 0, ty["trace"] or 0), 2)
        out["logical"] = [int(w), int(h)]
        out["why"].append(
            f"도트 격자가 없다(흔적 {out['trace']} < {MIN_TRACE}) — 원본 해상도 "
            f"도트 그림이거나 아예 도트가 아니다. 논리 {w}x{h} · 색 {out['colors']}개")
        return out

    out["texel"] = s
    out.update({k: v for k, v in _purity(a, s, ox, oy).items() if k != "why"})
    w2 = _purity(a, s, ox, oy).get("why")
    if w2:
        out["why"].append(w2)
    out.setdefault("logical", [int(w // s), int(h // s)])
    return out


def measure(paths: list, want_texel: int | None = None) -> dict:
    """세트가 판정 단위다 — 낱장이 멀쩡해도 서로 다른 도트면 고장이다."""
    per = [measure_one(p) for p in paths]
    got = [d["texel"] for d in per if d.get("texel")]
    aligns = [d["align"] for d in per if d.get("align") is not None]
    purities = [d["purity"] for d in per if d.get("purity") is not None]
    # 격자가 "없음"인 장은 도트 1 로 세는데, 그걸 세트 일치에 섞으면 깨끗한 8 짜리
    # 옆에서 "1~8 로 다르다"가 된다. 그건 맞는 말이지만 **원인이 다른 고장**이라
    # 따로 센다.
    gridded = [d["texel"] for d in per if d.get("grid") in ("깨끗", "흐트러짐")]
    return {"n": len(per), "per_image": per,
            "texels": got,
            "texel": min(gridded) if gridded else (min(got) if got else None),
            "texel_min": min(gridded) if gridded else None,
            "texel_max": max(gridded) if gridded else None,
            "match": (len(set(gridded)) == 1) if len(gridded) >= 2 else None,
            "align": round(min(aligns), 4) if aligns else None,
            "purity": round(min(purities), 4) if purities else None,
            "grids": [d.get("grid") for d in per],
            "square": all(d.get("square") for d in per) if gridded else None,
            "no_grid": [d["path"] for d in per if d.get("grid") == "없음"],
            "mixed_dots": sum(d.get("mixed_dots") or 0 for d in per),
            "want_texel": want_texel}


def judge(paths: list, want_texel: int | None = None) -> dict:
    """3값. **못 잼은 실패가 아니다** — 격자가 없으면 칸 안을 물을 수 없다.

    못 잼을 두 가지로 가른다. 이 구분이 없으면 이 자의 판정이 **늘 못 잼**이다 —
    한 장을 주면 세트 일치를 못 재고, 주문 크기를 안 주면 '맞냐'를 못 재니까.
    늘 같은 답을 내는 자는 정보가 0 이다(09-16 죽은 줄 9가지).

    `blind`  **자가 눈이 없는 것.** 격자가 뭉개져 정상 도트와 구별이 안 되는 칸.
             이건 통과를 막는다 — 못 본 채로 PASS 를 주면 열린 채 고장이다.
    `안 물음` **caller 가 재료를 안 준 것.** 한 장만 줬거나 주문 크기를 안 줬다.
             화면에는 적지만 통과를 막지 않는다. 막으면 "더 달라"가 아니라
             "너 틀렸다"로 읽히고, 그게 09-15 에 5건을 헛되이 떨어뜨린 그 일이다.
    """
    m = measure(paths, want_texel)
    if m["n"] == 0:
        return {"verdict": "UNDEFINED", "fail": [], "undefined": ["그림이 없다"],
                **_strip(m)}
    fail, undef, blind = [], [], []

    흐트러진 = [d for d in m["per_image"] if d.get("grid") == "흐트러짐"]
    if 흐트러진:
        d = 흐트러진[0]
        fail.append(f"도트 격자가 흐트러졌다 — 도트 {d['texel']} 로 보이는데 경계의 "
                    f"{int(d['align'] * 100)}%만 격자에 앉았다(흔적 {d['trace']}). "
                    f"비정수 배율로 늘리거나 줄였다 다시 늘린 그림이다")
    elif m["align"] is not None and m["align"] < MIN_ALIGN:
        fail.append(f"격자 일치율 {m['align']} < {MIN_ALIGN} — 도트 경계가 흘렀다")

    if m["purity"] is None:
        없는것 = m["no_grid"]
        if 없는것:
            d = next(x for x in m["per_image"] if x["path"] == 없는것[0])
            blind.append(f"도트 격자가 없어 믹스드 픽셀을 못 잼 — 논리 "
                         f"{d['logical'][0]}x{d['logical'][1]} · 색 {d['colors']}개. "
                         f"원본 해상도 도트면 정상이고, 뭉개진 그림이면 고장인데 "
                         f"**자가 그 둘을 못 가른다**. 주문 크기(want_texel)를 주면 잡힌다")
        else:
            blind.append("칸 안을 못 잼 — 격자를 아예 못 읽었다")
    elif m["purity"] < MIN_PURITY:
        fail.append(f"도트 순도 {m['purity']} < {MIN_PURITY} — 칸 {m['mixed_dots']}개가 "
                    f"한 색이 아니다(믹스드 픽셀). 안티에일리어싱을 끄고 뽑아야 한다")

    if m["square"] is False:
        fail.append("가로와 세로 도트 크기가 다르다 — 도트가 네모가 아니라 직사각이다")

    if m["match"] is None:
        undef.append("격자가 읽힌 그림이 한 장뿐이라 세트 안의 도트 크기 일치는 "
                     "못 잼 — 안 물은 것이다(두 장 이상 주면 잰다)")
    elif m["match"] is False:
        fail.append(f"세트 안에서 도트 크기가 다르다 {m['texel_min']}~{m['texel_max']} — "
                    f"같은 세계의 자산으로 안 보인다")

    if want_texel is None:
        undef.append("주문한 도트 크기를 안 줘서 '맞냐'는 못 잼 — '같으냐'만 봤다")
    elif m["texel"] is not None and m["texel"] != want_texel:
        fail.append(f"도트 크기 {m['texel']} ≠ 주문 {want_texel}")

    verdict = "FAIL" if fail else ("UNDEFINED" if blind else "PASS")
    return {"verdict": verdict, "fail": fail,
            "undefined": blind + undef, "blind": blind, "not_asked": undef,
            "thresholds": {"align": MIN_ALIGN, "purity": MIN_PURITY,
                           "trace": MIN_TRACE, "edge_delta": EDGE_DELTA,
                           "min_edges": MIN_EDGES},
            "basis": "도트 그림의 정의 — 진짜 도트는 일치율·순도가 1.0 이다. "
                     "흔적 문턱 4.0 은 실측 빈 구간(2.6~6.2) 가운데 "
                     "(tools/texel_basis.py)",
            **_strip(m)}


def _strip(m: dict) -> dict:
    """응답에서 무거운 칸(격자 곡선)을 뺀다. 판정에 필요한 것만 남긴다."""
    out = {k: v for k, v in m.items() if k != "per_image"}
    out["images"] = [{k: v for k, v in d.items() if k not in ("curve", "curve_x")}
                     for d in m.get("per_image", [])]
    return out
