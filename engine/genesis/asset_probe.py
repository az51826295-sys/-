"""자산 측정기 — 그림·음악 산출물에서 기계가 잴 수 있는 것만 잰다.

설계: docs/asset-judge-v0-inheritance.md / data/asset_specs/asset_judge_v0.rules.yaml
(초안 §2 layer_single의 mechanical 항목).

**측정은 판정이 아니다.** 이 모듈은 숫자를 낼 뿐 통과/탈락을 말하지 않는다.
문턱(THRESH_*)은 사장님이 동결하기 전까지 비어 있고, 비어 있으면 심판은
`undefined`를 낸다(초안 §6 never: 문턱을 산출물 본 뒤에 조정하지 않는다).

정직 조항 — **못 재는 것은 재지 않는다**:
- BPM·조성: numpy/librosa 없이는 못 잰다. 근사치를 그 이름으로 부르지 않는다.
- **LUFS는 2026-08-26부터 여기서 잰다.** `genesis/loudness.py`가 BS.1770-4의
  K-가중 + 게이팅을 표준 라이브러리만으로 구현한다(docs/lufs-v0-design.md).
  RMS를 LUFS라고 부르지 않는다는 조항은 그대로다 — 이건 진짜 게이트된 값이다.
  문턱은 여전히 미동결이라 값만 내고 판정하지 않는다.
- **참피크(dBTP)도 2026-08-26부터 여기서 잰다**(genesis/true_peak.py, 4배
  오버샘플). 표본 피크와 **다른 값**이므로 이름을 계속 나눠 쓴다:
  `sample_peak_dbfs`(우리가 가진 점들의 최대) vs `true_peak_dbtp`(점 사이를
  복원했을 때의 최대). numpy가 있으면 빠른 경로를 쓰되 값은 같다.
- **스펙트럼 이음새는 2026-08-26부터 잰다**(genesis/loop_seam.py,
  설계 docs/loop-seam-v0-design.md). 값만 내고 판정하지 않는다 — THRESH_SEAM은
  미동결이고, 루프가 아닌 곡에는 애초에 적용하지 않는다.
- 화풍 임베딩: 미구현(초안 status_unbuilt 그대로).
- WAV만 연다. mp3/ogg/flac은 디코더가 없어 미측정이다.
"""
from __future__ import annotations

import array
import math
import os
import wave

from genesis import loop_seam
from genesis import true_peak
from genesis import loudness

# ------------------------------------------------------------------ 이미지


def measure_image(path: str, palette: list | None = None,
                  max_colors: int = 1 << 18) -> dict:
    """이미지 하나에서 기계적 사실을 잰다(Pillow). 스펙과 대조하지 않는다."""
    out = {"error": None, "format": None, "width": None, "height": None,
           "mode": None, "has_alpha": None, "edge_alpha_max": None,
           "opaque_margin": None, "color_count": None,
           "visible_pixels": None, "palette_outside_ratio": None,
           "bytes": None}
    try:
        from PIL import Image
    except ImportError as exc:
        out["error"] = f"Pillow 없음: {exc}"
        return out
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        return out
    out["bytes"] = os.path.getsize(path)
    try:
        with Image.open(path) as probe:
            probe.verify()                      # 손상 여부(디코드 전 검사)
        with Image.open(path) as img:
            out["format"] = img.format
            out["mode"] = img.mode
            out["width"], out["height"] = img.size
            rgba = img.convert("RGBA")
    except Exception as exc:                    # 손상·미지원 포맷
        out["error"] = f"디코딩 실패: {type(exc).__name__}: {exc}"
        return out

    w, h = rgba.size
    px = rgba.load()
    out["has_alpha"] = ("A" in img.mode) or ("transparency" in img.info)

    edge_max = 0
    for x in range(w):
        edge_max = max(edge_max, px[x, 0][3], px[x, h - 1][3])
    for y in range(h):
        edge_max = max(edge_max, px[0, y][3], px[w - 1, y][3])
    out["edge_alpha_max"] = round(edge_max / 255, 6)

    bbox = rgba.getbbox()                       # 알파 0이 아닌 영역
    if bbox:
        left, top, right, bottom = bbox
        out["opaque_margin"] = min(left, top, w - right, h - bottom)

    # 색 계산은 **불투명 픽셀만** 센다(측정 관례): 투명 배경을 색으로 세면
    # 팔레트 이탈률이 배경 면적에 좌우된다. 알파 0은 색이 아니다.
    rgba_colors = rgba.getcolors(maxcolors=max_colors)
    if rgba_colors is None:
        rgba_colors = _count_colors(rgba)
    visible = [(n, c[:3]) for n, c in rgba_colors if c[3] > 0]
    seen: dict = {}
    for n, rgb in visible:
        seen[rgb] = seen.get(rgb, 0) + n
    out["color_count"] = len(seen)
    out["visible_pixels"] = sum(seen.values())

    if palette:
        want = {_hex_to_rgb(c) for c in palette}
        total = out["visible_pixels"] or 1
        outside = sum(n for rgb, n in seen.items() if rgb not in want)
        out["palette_outside_ratio"] = round(outside / total, 6)
    return out


def _hex_to_rgb(value) -> tuple:
    if isinstance(value, (list, tuple)):
        return tuple(int(v) for v in value[:3])
    s = str(value).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def _count_colors(rgba) -> list:
    counts: dict = {}
    for c in rgba.getdata():
        counts[c] = counts.get(c, 0) + 1
    return [(n, c) for c, n in counts.items()]


# ------------------------------------------------------------------ 오디오

_SILENCE_DBFS = -60.0        # 측정 관례(문턱 아님): 무음으로 셀 레벨
_WINDOW_MS = 10


def measure_wav(path: str, silence_dbfs: float = _SILENCE_DBFS) -> dict:
    """WAV 하나에서 기계적 사실을 잰다(표준 라이브러리만).

    silence_dbfs는 **측정 관례**다 — "무음"을 어느 레벨 아래로 볼지의 정의이며
    통과/탈락 문턱이 아니다. 관례를 바꾸면 측정값이 달라지므로 리포트에 같이 낸다.
    """
    out = {"error": None, "duration_s": None, "sample_rate": None,
           "channels": None, "sample_width": None,
           "sample_peak_dbfs": None, "rms_dbfs": None, "dc_offset": None,
           "lead_silence_s": None, "tail_silence_s": None,
           "max_dropout_s": None, "seam_jump": None,
           "seam_spectral": None, "seam_reason": None,
           "true_peak_dbtp": None, "true_peak_reason": None,
           "integrated_lufs": None, "lufs_reason": None,
           "silence_dbfs_convention": silence_dbfs, "bytes": None}
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        return out
    out["bytes"] = os.path.getsize(path)
    try:
        with wave.open(path, "rb") as wf:
            ch, width, sr = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
            nframes = wf.getnframes()
            raw = wf.readframes(nframes)
    except (wave.Error, OSError, EOFError) as exc:
        out["error"] = f"WAV 디코딩 실패: {type(exc).__name__}: {exc}"
        return out
    if width != 2:
        out["error"] = f"16비트 PCM만 잰다(현재 {width * 8}비트) - 미측정"
        return out

    samples = array.array("h")
    samples.frombytes(raw[:len(raw) - (len(raw) % 2)])
    if not samples:
        out["error"] = "표본이 0개다"
        return out
    mono = ([sum(samples[i:i + ch]) / ch for i in range(0, len(samples), ch)]
            if ch > 1 else list(samples))
    n = len(mono)
    full = 32768.0

    out.update(sample_rate=sr, channels=ch, sample_width=width,
               duration_s=round(n / sr, 6))
    peak = max(abs(v) for v in mono) / full
    out["sample_peak_dbfs"] = round(_dbfs(peak), 3)
    out["rms_dbfs"] = round(_dbfs(math.sqrt(sum(v * v for v in mono) / n) / full), 3)
    out["dc_offset"] = round(sum(mono) / n / full, 6)

    win = max(1, int(sr * _WINDOW_MS / 1000))
    levels = []
    for i in range(0, n, win):
        chunk = mono[i:i + win]
        levels.append(_dbfs(math.sqrt(sum(v * v for v in chunk) / len(chunk)) / full))
    quiet = [lv <= silence_dbfs for lv in levels]
    out["lead_silence_s"] = round(_run(quiet) * win / sr, 4)
    out["tail_silence_s"] = round(_run(quiet[::-1]) * win / sr, 4)
    out["max_dropout_s"] = round(_longest_run(quiet) * win / sr, 4)
    out["seam_jump"] = round(abs(mono[-1] - mono[0]) / full, 6)

    # 참피크(docs/true-peak-v0-design.md). 표본 피크와 **다른 값**이고 이름도
    # 다르다 - 오버샘플해서 표본 사이에 숨은 봉우리까지 본다.
    peak_row = true_peak.measure([v / full for v in mono])
    out["true_peak_dbtp"] = peak_row["true_peak_dbtp"]
    out["true_peak_reason"] = peak_row["reason"]

    # 루프 이음새(docs/loop-seam-v0-design.md). 값만 낸다 — 이 곡이 루프인지는
    # 스펙이 선언하는 것이고, 루프가 아니면 **적용하지 않는다**(초안: 미적용).
    seam = loop_seam.measure([v / full for v in mono], sr)
    out["seam_spectral"] = seam["seam_spectral"]
    out["seam_reason"] = seam["reason"]

    # 게이트된 라우드니스(BS.1770-4). 채널을 **모노로 접지 않고** 그대로 넣는다 —
    # 표준의 채널 합은 채널별 제곱을 더하는 것이라, 미리 평균 내면 값이 달라진다.
    per_channel = [[samples[i] / full for i in range(c, len(samples), ch)]
                   for c in range(ch)]
    loud = loudness.integrated(per_channel, sr)
    out["integrated_lufs"] = loud["lufs"]
    out["lufs_reason"] = loud["reason"]
    return out


def _load_wav(path: str):
    """(모노 표본, 샘플레이트). 16비트 PCM WAV만. 실패는 예외 대신 (None, 사유)."""
    if not os.path.isfile(path):
        return None, f"파일이 없다: {path}"
    try:
        with wave.open(path, "rb") as wf:
            ch, width, sr = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
            raw = wf.readframes(wf.getnframes())
    except (wave.Error, OSError, EOFError) as exc:
        return None, f"WAV 디코딩 실패: {type(exc).__name__}: {exc}"
    if width != 2:
        return None, f"16비트 PCM만 잰다(현재 {width * 8}비트) - 미측정"
    samples = array.array("h")
    samples.frombytes(raw[:len(raw) - (len(raw) % 2)])
    if not samples:
        return None, "표본이 0개다"
    mono = ([sum(samples[i:i + ch]) / ch for i in range(0, len(samples), ch)]
            if ch > 1 else list(samples))
    return (mono, sr), None


_HOP = 512
_BPM_RANGE = (50, 220)


def measure_tempo(path: str) -> dict:
    """에너지 포락선의 자기상관으로 BPM을 추정한다(순수 파이썬, numpy 없음).

    **정직 조항**: 이것은 추정이며 배수 오검출(0.5x·2x)이 구조적으로 존재한다 —
    초안 §6 boundary_rules가 그 경우를 fail이 아니라 undefined로 보내라고 한 그
    현상이다. 그래서 후보 배수를 함께 돌려주고, 확신도(자기상관 정점 비율)를 붙인다.
    골든: tests/test_tempo.py가 합성 클릭트랙(90·120·150 BPM)으로 검증한다.
    """
    out = {"error": None, "bpm": None, "bpm_confidence": None,
           "bpm_candidates": [], "onset_count": None}
    loaded, err = _load_wav(path)
    if err:
        out["error"] = err
        return out
    mono, sr = loaded
    env = []
    for i in range(0, len(mono) - _HOP, _HOP):
        chunk = mono[i:i + _HOP]
        env.append(math.sqrt(sum(v * v for v in chunk) / _HOP))
    if len(env) < 16:
        out["error"] = "너무 짧다(포락선 프레임 16 미만) - 미측정"
        return out
    flux = [max(0.0, env[i] - env[i - 1]) for i in range(1, len(env))]
    mean = sum(flux) / len(flux)
    flux = [f - mean for f in flux]
    out["onset_count"] = sum(1 for f in flux if f > 0)

    fps = sr / _HOP
    lo = max(2, int(round(fps * 60 / _BPM_RANGE[1])))
    hi = min(len(flux) - 1, int(round(fps * 60 / _BPM_RANGE[0])))
    if hi <= lo:
        out["error"] = "구간이 짧아 템포 자기상관 불가 - 미측정"
        return out
    scores = {}
    for lag in range(lo, hi + 1):
        acc = sum(flux[i] * flux[i + lag] for i in range(len(flux) - lag))
        scores[lag] = acc / (len(flux) - lag)
    best = max(scores, key=scores.get)
    peak = scores[best]
    others = sorted((v for k, v in scores.items() if abs(k - best) > 2),
                    reverse=True)
    runner = others[0] if others else 0.0
    bpm = 60 * fps / best
    out["bpm"] = round(bpm, 2)
    out["bpm_confidence"] = round(
        0.0 if peak <= 0 else min(1.0, max(0.0, 1 - (runner / peak))), 4)
    out["bpm_candidates"] = [round(bpm / 2, 2), round(bpm, 2), round(bpm * 2, 2)]
    return out


def _dbfs(ratio: float) -> float:
    return -math.inf if ratio <= 0 else round(20 * math.log10(ratio), 6)


def _run(flags: list) -> int:
    i = 0
    while i < len(flags) and flags[i]:
        i += 1
    return i


def _longest_run(flags: list) -> int:
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def measure_pixel_art(path: str, max_block: int = 64) -> dict:
    """'진짜 도트인가'를 잰다. LLM이 낸 '픽셀 아트'의 흔한 거짓은 1024px 이미지가
    픽셀처럼 **보이기만** 하는 것이다 - 격자에 안 맞고 색이 무한하다.

    block_size = w,h를 모두 나누면서 S×S 블록이 전부 단색인 최대 S(정수배 업스케일).
    logical_* = 그 격자에서의 실제 해상도. 반투명 픽셀은 도트에 없다(알파 이진).
    한계: 이미지가 크면 비싸므로 max_block까지만 본다. tools/artgen/pixelize.py의
    반입 오라클과 같은 성질을 재되, 크기를 미리 알 필요가 없다.
    """
    out = {"error": None, "width": None, "height": None, "color_count": None,
           "alpha_binary": None, "has_transparent": None,
           "block_size": None, "logical_width": None, "logical_height": None}
    try:
        from PIL import Image
    except ImportError as exc:
        out["error"] = f"Pillow 없음: {exc}"
        return out
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        return out
    try:
        with Image.open(path) as probe:
            probe.verify()
        with Image.open(path) as img:
            rgba = img.convert("RGBA")
    except Exception as exc:
        out["error"] = f"디코딩 실패: {type(exc).__name__}: {exc}"
        return out

    w, h = rgba.size
    px = rgba.load()
    out["width"], out["height"] = w, h
    alphas = {px[x, y][3] for y in range(h) for x in range(w)}
    out["alpha_binary"] = alphas <= {0, 255}
    out["has_transparent"] = 0 in alphas
    out["color_count"] = len({px[x, y][:3] for y in range(h) for x in range(w)
                              if px[x, y][3] > 0})

    block = 1
    for s in range(min(max_block, w, h), 1, -1):
        if w % s or h % s:
            continue
        if _blocks_uniform(px, w, h, s):
            block = s
            break
    out["block_size"] = block
    out["logical_width"] = w // block
    out["logical_height"] = h // block
    return out


def _blocks_uniform(px, w: int, h: int, s: int) -> bool:
    for by in range(0, h, s):
        for bx in range(0, w, s):
            first = px[bx, by]
            for y in range(by, by + s):
                for x in range(bx, bx + s):
                    if px[x, y] != first:
                        return False
    return True
