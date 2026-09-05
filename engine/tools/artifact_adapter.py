"""심판대 어댑터 — 심판을 실제 산출물에 물린다. 설계: docs/judge-design.md §7

심판대 v1(tools/judge_bench.py)은 사람이 손으로 적은 샘플 dict만 채점했다.
`{"measured": {"bytes_before": 940000}}`의 940000은 아무도 잰 적 없는 숫자다.
이 층은 **실제 파일을 읽어 그 숫자를 만든다.**

세 이름공간(§7.2) — 값의 출처가 곧 경로 접두사다:
    spec.*      설계도. 사장님이 정한 규칙(요구 태그·금지어·임계). 신뢰.
    measured.*  어댑터가 산출물에서 **직접 잰 값**. 기계 측정.
    claim.*     후보(생성 AI)가 **스스로 낸 보고**. 안 믿는다 — 대조 대상.

Proposer/Validator 경계의 연장이다. 제안을 격리했듯 **보고도 격리한다**:
심판이 claim.*만 읽으면 통과해도 `pass_on_claim`이고, 자율 근거가 못 된다.

어댑터는 읽기 전용·결정적·모델 호출 0. 산출물을 고치지 않는다.

  python -X utf8 tools/artifact_adapter.py --atom cache_cleanup \\
      --source '{"adapter":"dir_bytes_pair","params":{...},"claim":{...}}'
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

try:
    from tools import judge_bench as jb
except ModuleNotFoundError:                     # 스크립트로 직접 실행 시
    sys.path.insert(0, ROOT)
    from tools import judge_bench as jb


class AdapterError(Exception):
    """산출물을 읽지 못했다(없는 경로, 읽기 실패 등)."""


ADAPTERS: dict = {}
PROVIDES: dict = {}


def adapter(name: str, provides: tuple = ()):
    """어댑터를 등록한다. 원자 이름으로 분기하지 않기 위한 장치.

    provides = 이 어댑터가 measured.* 아래 채우는 키. 결합 검사(binding_report)가
    "측정한다고 선언했지만 그 값을 낼 도구가 없는" 원자를 이걸로 잡는다.
    """
    def deco(fn):
        ADAPTERS[name] = fn
        PROVIDES[name] = tuple(provides)
        return fn
    return deco


def _require_dir(path: str) -> str:
    if not os.path.isdir(path):
        raise AdapterError(f"디렉터리가 없다: {path}")
    return path


def _walk(root: str) -> list:
    out = []
    for base, _dirs, names in os.walk(root):
        for n in sorted(names):
            full = os.path.join(base, n)
            rel = os.path.relpath(full, root).replace("\\", "/")
            out.append((rel, full))
    return sorted(out)


def _sha1(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


@adapter("dir_files", provides=("files", "hashes", "count"))
def _dir_files(params: dict) -> dict:
    """디렉터리의 파일별 크기·내용 해시를 잰다.

    measured.files    [{path, size, sha1}, ...]  (경로 오름차순)
    measured.hashes   {path: sha1}               (중복 대조용)
    """
    root = _require_dir(params["path"])
    files, hashes = [], {}
    for rel, full in _walk(root):
        size = os.path.getsize(full)
        digest = _sha1(full)
        files.append({"path": rel, "size": size, "sha1": digest})
        hashes[rel] = digest
    files.sort(key=lambda f: (-f["size"], f["path"]))   # 크기 내림차순
    return {"files": files, "hashes": hashes, "count": len(files)}


@adapter("dir_bytes_pair", provides=("bytes_before", "bytes_after"))
def _dir_bytes_pair(params: dict) -> dict:
    """정리 전/후 두 디렉터리의 총 바이트를 잰다.

    measured.bytes_before / measured.bytes_after
    """
    def total(path: str) -> int:
        return sum(os.path.getsize(full)
                   for _rel, full in _walk(_require_dir(path)))

    return {"bytes_before": total(params["before"]),
            "bytes_after": total(params["after"])}


@adapter("text_file", provides=("text", "chars"))
def _text_file(params: dict) -> dict:
    """텍스트 파일의 실제 내용을 읽는다. measured.text / measured.chars"""
    path = params["path"]
    if not os.path.isfile(path):
        raise AdapterError(f"파일이 없다: {path}")
    try:
        with open(path, encoding=params.get("encoding", "utf-8")) as f:
            text = f.read()
    except (OSError, UnicodeDecodeError) as exc:
        raise AdapterError(f"읽기 실패 {path}: {exc}") from exc
    return {"text": text, "chars": len(text)}


@adapter("image_probe", provides=("width", "height", "colors", "grid_ok"))
def _image_probe(params: dict) -> dict:
    """이미지의 실제 폭·높이·색 수를 잰다(Pillow 있을 때만).

    후보가 붙인 태그가 아니라 **픽셀에서 나온 사실**이다. 없으면 정직하게
    실패한다 — 못 재면서 잰 척하지 않는다.
    """
    try:
        from PIL import Image
    except ImportError as exc:                  # 못 재면 measured가 아니다
        raise AdapterError(f"Pillow 없음 - 이미지를 잴 수 없다: {exc}") from exc
    path = params["path"]
    if not os.path.isfile(path):
        raise AdapterError(f"파일이 없다: {path}")
    with Image.open(path) as img:
        img = img.convert("RGBA")
        w, h = img.size
        colors = img.getcolors(maxcolors=1 << 24) or []
    grid = params.get("grid")
    out = {"width": w, "height": h, "colors": len(colors)}
    if grid:
        out["grid_ok"] = (w % grid == 0 and h % grid == 0)
    return out


_SVG_KEYS = ("bytes", "elements", "path_count", "shape_count",
             "command_count",
             "stroke_widths", "fills", "colors", "off_grid", "viewbox",
             "min_padding", "linecaps", "linejoins", "error",
             "structure_hash")


@adapter("svg_file", provides=_SVG_KEYS)
def _svg_file(params: dict) -> dict:
    """SVG 파일을 열어 격자·획·팔레트·패스 수·여백을 **직접 잰다**.

    아이콘 레인의 Validator J (docs/icon-lane-design.md). 후보가 "격자 맞췄어요"
    라고 말하는 걸 읽지 않는다 — 좌표를 우리가 센다.
    """
    path = params["path"]
    if not os.path.isfile(path):
        raise AdapterError(f"파일이 없다: {path}")
    with open(path, encoding=params.get("encoding", "utf-8")) as f:
        return _svg_code({"svg": f.read(), "snap": params.get("snap", 0.5)})


@adapter("svg_code", provides=_SVG_KEYS)
def _svg_code(params: dict) -> dict:
    """이미 손에 든 SVG 문자열을 잰다(파이프라인 안에서 바로 쓰는 경로)."""
    from genesis import icon_lane

    svg = params.get("svg", "")
    snap = params.get("snap", 0.5)
    out = icon_lane.measure(svg, snap=snap)
    out["structure_hash"] = icon_lane.structure_hash(svg, snap=snap)
    return out


_SVG_RASTER_KEYS = ("optical_weight", "roundtrip_diff", "render_px",
                    "rasterizer_available", "error")


@adapter("svg_raster", provides=_SVG_RASTER_KEYS)
def _svg_raster(params: dict) -> dict:
    """SVG를 실제로 **그려서** 재는 값들(설계: docs/icon-raster-rules-design.md).

    파서로 재는 svg_code와 일부러 분리했다. 렌더는 비싸고, 무엇보다 이 값들은
    "우리 해석"이 아니라 "그려진 그림"에서 나온다 - 둘을 대조하는 것이
    roundtrip의 존재 이유이므로 같은 어댑터에 섞으면 안 된다.
    """
    from genesis import svg_raster as sr

    svg = params.get("svg")
    if svg is None:
        path = params["path"]
        if not os.path.isfile(path):
            raise AdapterError(f"파일이 없다: {path}")
        with open(path, encoding=params.get("encoding", "utf-8")) as f:
            svg = f.read()
    px = int(params.get("render_px", sr.RENDER_PX))
    if not sr.available():
        return {"optical_weight": None, "roundtrip_diff": None,
                "render_px": px, "rasterizer_available": False,
                "error": "래스터 경로 미설치(svglib+reportlab+pypdfium2)"}
    return {"optical_weight": sr.optical_weight(svg, px),
            "roundtrip_diff": sr.roundtrip_diff(svg, px),
            "render_px": px, "rasterizer_available": True, "error": None}


_IMAGE_ASSET_KEYS = ("error", "format", "width", "height", "mode",
                     "has_alpha", "edge_alpha_max", "opaque_margin",
                     "color_count", "visible_pixels", "palette_outside_ratio",
                     "bytes")
_WAV_ASSET_KEYS = ("error", "duration_s", "sample_rate", "channels",
                   "sample_width", "sample_peak_dbfs", "rms_dbfs",
                   "dc_offset", "lead_silence_s", "tail_silence_s",
                   "max_dropout_s", "seam_jump",
                   "seam_spectral", "seam_reason",
                   "true_peak_dbtp", "true_peak_reason",
                   "integrated_lufs", "lufs_reason",
                   "silence_dbfs_convention", "bytes")


@adapter("image_asset", provides=_IMAGE_ASSET_KEYS)
def _image_asset(params: dict) -> dict:
    """그림 자산의 기계적 사실(초안 §2 image.mechanical). 판정하지 않는다."""
    from genesis import asset_probe

    return asset_probe.measure_image(params["path"],
                                     palette=params.get("palette"))


@adapter("wav_asset", provides=_WAV_ASSET_KEYS)
def _wav_asset(params: dict) -> dict:
    """음악 자산의 기계적 사실(초안 §2 audio.mechanical 중 잴 수 있는 것).

    BPM·조성·LUFS·true peak는 여기서 내지 않는다 — 없는 도구를 흉내내지 않는다.
    """
    from genesis import asset_probe

    return asset_probe.measure_wav(
        params["path"],
        silence_dbfs=params.get("silence_dbfs", asset_probe._SILENCE_DBFS))


_IMAGE_SET_KEYS = ("n", "n_measured", "eligible", "hue_dispersion",
                   "value_median", "saturation_median",
                   "value_outside_ratio", "saturation_outside_ratio",
                   "thickness_cv", "thickness_mean", "outlier_ranking",
                   "errors")


@adapter("image_set", provides=_IMAGE_SET_KEYS)
def _image_set(params: dict) -> dict:
    """그림 **세트**의 일관성(초안 §3). 표본 5개 미만이면 지표를 내지 않는다(E6).

    tolerance 값은 동결된 스펙에서 넘어온다 — 없으면 이탈 비율이 None이고
    심판은 undefined가 된다.
    """
    from genesis import asset_set

    paths = params.get("paths")
    if not paths:
        root = params.get("dir")
        if not root or not os.path.isdir(root):
            raise AdapterError(f"세트 경로가 없다: {root!r}")
        exts = tuple(params.get("ext", (".png", ".webp", ".jpg", ".jpeg")))
        paths = sorted(os.path.join(root, n) for n in sorted(os.listdir(root))
                       if n.lower().endswith(exts))
    if not paths:
        raise AdapterError("세트에 이미지가 없다")
    return asset_set.measure_set(
        paths, value_tolerance=params.get("value_tolerance"),
        saturation_tolerance=params.get("saturation_tolerance"))


_PIXEL_ART_KEYS = ("error", "width", "height", "color_count",
                   "alpha_binary", "has_transparent", "block_size",
                   "logical_width", "logical_height")


_AUDIO_SET_KEYS = ("n", "min_set_n", "loudness", "duplication",
                   "transitions", "max_transition_seam", "worst_transition",
                   "tempo_cv", "tempo_cv_reason",
                   "key_conflict", "key_conflict_reason", "backends")


@adapter("audio_set", provides=_AUDIO_SET_KEYS)
def _audio_set(params: dict) -> dict:
    """음악 **세트**의 일관성(초안 §3 layer_set.audio, 설계
    docs/audio-set-layer-v0-design.md).

    읽기는 `audio_io` 로더 하나로 모은다(설계 부록 A): WAV는 표준 라이브러리로,
    그 밖은 soundfile로. 어느 경로로 읽었는지 `backends`에 같이 낸다.
    순서는 **주어진 순서**를 쓴다(재생 순서는 스펙의 몫).
    """
    from genesis import audio_io
    from genesis import audio_set
    from genesis import loudness

    paths = params.get("paths")
    if not paths:
        root = params.get("dir")
        if not root or not os.path.isdir(root):
            raise AdapterError(f"세트 경로가 없다: {root!r}")
        exts = tuple(params.get("ext", (".wav", ".flac", ".ogg", ".mp3",
                                        ".aiff", ".au")))
        paths = sorted(os.path.join(root, n) for n in sorted(os.listdir(root))
                       if n.lower().endswith(exts))
    if not paths:
        raise AdapterError("세트에 오디오가 없다")

    tracks, lufs, names, backends = [], [], [], {}
    for path in paths:
        loaded = audio_io.load_mono(path)
        if loaded["error"]:
            raise AdapterError(f'{os.path.basename(path)}: {loaded["error"]}')
        # 라우드니스는 채널을 접으면 안 된다(표준의 채널 합은 제곱의 합).
        row = loudness.integrated(loaded["channels"], loaded["sample_rate"])
        tracks.append(loaded["mono"])
        lufs.append(row["lufs"])
        names.append(os.path.basename(path))
        backends[os.path.basename(path)] = loaded["backend"]
    out = audio_set.measure_set(tracks, lufs, names)
    out["backends"] = backends          # 어느 경로로 읽었는지 항상 같이 낸다
    return out


@adapter("pixel_art_asset", provides=_PIXEL_ART_KEYS)
def _pixel_art_asset(params: dict) -> dict:
    """도트 자산의 사실: 논리 해상도(격자 블록)·색 수·알파 이진 여부."""
    from genesis import asset_probe

    return asset_probe.measure_pixel_art(params["path"])


_TILE_KEYS = ("error", "seam_dx", "interior_dx", "seam_dy", "interior_dy",
              "seam_ratio_x", "seam_ratio_y", "logical_size")


@adapter("tile_asset", provides=_TILE_KEYS)
def _tile_asset(params: dict) -> dict:
    """타일의 사실: 이어 붙였을 때의 이음새가 내부 변화에 비해 얼마나 큰가.

    한 장짜리 속성은 pixel_art_asset이 잰다. 여기서 재는 것은 **이어 붙임**이다.
    """
    from genesis import tile_probe

    return tile_probe.tile_seam(params["path"])


_TILESET_KEYS = ("error", "count", "logical_sizes", "sizes_uniform",
                 "palette_union", "seam_ratio_max", "seam_ratio_median",
                 "worst_tile", "unmeasured")


@adapter("tile_set", provides=_TILESET_KEYS)
def _tile_set(params: dict) -> dict:
    """타일 여러 장의 사실 — 같이 깔 수 있는가(크기 균일·세트 팔레트·최악 이음새)."""
    from genesis import asset_set_probe

    return asset_set_probe.tile_set(params["paths"])


_CHARGROUP_KEYS = ("error", "count", "heights", "height_spread",
                   "palette_union", "frame_counts", "frame_counts_uniform",
                   "unmeasured")


@adapter("character_group", provides=_CHARGROUP_KEYS)
def _character_group(params: dict) -> dict:
    """캐릭터 여러 명의 사실 — 같은 마을 사람으로 보이는가(키·프레임·팔레트)."""
    from genesis import asset_set_probe

    return asset_set_probe.character_group(params["paths"])


_CHARSET_KEYS = ("error", "dirs_found", "frame_counts", "bbox_heights",
                 "frame_count_equal", "bbox_height_spread",
                 "palette_overlap_min", "missing")


@adapter("character_set", provides=_CHARSET_KEYS)
def _character_set(params: dict) -> dict:
    """캐릭터 폴더의 사실: 방향들끼리 프레임 수·키·팔레트가 맞는가."""
    from genesis import tile_probe

    return tile_probe.character_set(params["path"])


_STYLE_KEYS = ("error", "width", "height", "palette_outside_ratio",
               "color_count", "median_saturation", "median_value",
               "dominant_hue", "edge_alpha_max", "bytes")
_MUSIC_KEYS = ("error", "duration_s", "sample_rate", "channels",
               "sample_peak_dbfs", "rms_dbfs", "lead_silence_s",
               "tail_silence_s", "max_dropout_s", "bpm", "bpm_confidence",
               "bpm_candidates", "onset_count")
_TESTS_KEYS = ("error", "tests_passed", "tests_failed", "tests_total",
               "returncode", "duration_s")


@adapter("image_style_asset", provides=_STYLE_KEYS)
def _image_style_asset(params: dict) -> dict:
    """그림이 설계도 **규격**에 맞는지 재는 값들(태그 자기신고 대체).

    분위기(mood)는 여기서 재지 않는다 — 그건 art_mood_fit(사람 눈)으로 분리했다.
    """
    from genesis import asset_probe, asset_set

    out = asset_probe.measure_image(params["path"],
                                    palette=params.get("palette"))
    if out.get("error") is None:
        feat = asset_set.measure_asset(params["path"])
        for k in ("median_saturation", "median_value", "dominant_hue"):
            out[k] = feat.get(k)
    return out


@adapter("music_asset", provides=_MUSIC_KEYS)
def _music_asset(params: dict) -> dict:
    """음악의 기술 규격 + 추정 템포. 분위기·악기는 재지 않는다(music_mood_fit)."""
    from genesis import asset_probe

    out = asset_probe.measure_wav(params["path"])
    if out.get("error") is None:
        out.update({k: v for k, v in asset_probe.measure_tempo(
            params["path"]).items() if k != "error"})
    return out


_MUSIC_EXT_KEYS = ("error", "backend", "format", "duration_s", "sample_rate",
                   "channels", "bpm", "bpm_candidates", "beat_count", "key",
                   "key_correlation", "key_runner_up", "key_gap",
                   "true_peak_dbtp", "lufs")


@adapter("music_asset_ext", provides=_MUSIC_EXT_KEYS)
def _music_asset_ext(params: dict) -> dict:
    """음악 확장 측정(librosa/soundfile). 없으면 값을 만들지 않고 error에 적는다.

    BPM·조성·참피크는 여기서 온다. LUFS는 여전히 미측정이다 - 이름만 있고
    값은 None이며, 그 이유가 lufs_reason에 남는다.
    """
    from genesis import audio_probe

    return audio_probe.measure_audio(params["path"])


@adapter("pytest_run", provides=_TESTS_KEYS)
def _pytest_run(params: dict) -> dict:
    """명세 테스트를 **우리가 직접 돌린다**. 후보가 낸 성적표를 읽지 않는다.

    읽기 전용 원칙의 예외 — 테스트 실행은 관측 행위다. 대신 작업 디렉터리와
    시간 상한을 호출자가 정하고, 결과는 stdout 요약줄에서 기계적으로 뽑는다.
    """
    import re as _re
    import subprocess
    import time as _time

    target = params.get("path")
    if not target or not os.path.exists(target):
        raise AdapterError(f"테스트 경로가 없다: {target!r}")
    cmd = [sys.executable, "-X", "utf8", "-m", "pytest", target, "-q",
           "-p", "no:cacheprovider"]
    started = _time.time()
    try:
        proc = subprocess.run(cmd, cwd=params.get("cwd") or ROOT,
                              capture_output=True, text=True,
                              timeout=params.get("timeout", 300))
    except subprocess.TimeoutExpired:
        return {"error": "시간 초과 - 미측정", "tests_passed": None,
                "tests_failed": None, "tests_total": None,
                "returncode": None, "duration_s": None}
    tail = (proc.stdout or "") + (proc.stderr or "")
    passed = failed = 0
    m = _re.search(r"(\d+) failed", tail)
    if m:
        failed = int(m.group(1))
    m = _re.search(r"(\d+) passed", tail)
    if m:
        passed = int(m.group(1))
    err = None
    if passed == 0 and failed == 0:
        err = "pytest 요약줄을 못 읽었다 - 미측정"
    return {"error": err, "tests_passed": passed, "tests_failed": failed,
            "tests_total": passed + failed, "returncode": proc.returncode,
            "duration_s": round(_time.time() - started, 3)}


# ------------------------------------------------------------ 결합

def build_sample(source: dict) -> dict:
    """산출물 → 심판이 먹는 샘플. spec/measured/claim 세 칸으로 조립한다.

    source = {"adapter": 이름, "params": {...},
              "spec": {...},      # 설계도(사장님이 정한 규칙)
              "claim": {...}}     # 후보의 자기 보고(안 믿는다)
    """
    name = source.get("adapter")
    fn = ADAPTERS.get(name)
    if fn is None:
        raise AdapterError(f"모르는 어댑터: {name!r}")
    measured = fn(source.get("params", {}))
    return {"spec": copy.deepcopy(source.get("spec", {})),
            "measured": measured,
            "claim": copy.deepcopy(source.get("claim", {}))}


def judge_artifacts(atom: dict, source: dict) -> dict:
    """실제 산출물을 그 원자의 심판에 물려 채점한다.

    판정(§7.3): 이빨과 증거 등급은 독립 축이다.
      passed          이빨 있는 심판 + 측정값 재료 + 통과 → 자율 근거
      pass_on_claim   통과했지만 재료가 후보 자기신고 → 사람 눈 게이트
      failed          심판이 떨어뜨렸다
      undefined       문턱이 아직 동결되지 않았다/사람 눈 게이트 — 3값의 셋째
      no_judge        심판대를 통과 못 한 원자(이빨 없음/사람 눈)
      adapter_error   산출물을 못 읽었다 — 통과로 세지 않는다
    """
    bench = jb.bench_atom(atom)
    spec = atom.get("judge") or {}
    out = {"atom": atom.get("id"), "bench": bench["verdict"],
           "evidence": bench["evidence"], "kind": spec.get("kind"),
           "teeth": bench["teeth"]}
    if bench["verdict"] == "unfrozen":
        return {**out, "verdict": "undefined", "reason": bench["reason"]}
    if bench["verdict"] != "teeth":
        return {**out, "verdict": "no_judge",
                "reason": f'심판대 판정 {bench["verdict"]}: {bench["reason"]}'}
    try:
        sample = build_sample(source)
    except (AdapterError, KeyError, OSError) as exc:
        return {**out, "verdict": "adapter_error", "reason": str(exc)}
    try:
        passed = jb.run_judge(spec, sample)
    except jb.Unjudgeable as exc:
        # 문턱 미동결·사람 눈 게이트 - 통과도 탈락도 아니다(3값 계약)
        return {**out, "verdict": "undefined", "sample": sample,
                "reason": str(exc)}
    except jb.JudgeError as exc:
        return {**out, "verdict": "adapter_error",
                "reason": f"심판이 이 샘플을 못 읽었다: {exc}"}
    if not passed:
        return {**out, "verdict": "failed", "sample": sample,
                "reason": "심판이 이 산출물을 거절했다"}
    if bench["evidence"] != "measured":
        return {**out, "verdict": "pass_on_claim", "sample": sample,
                "reason": ("통과했지만 재료가 후보의 자기신고다 — "
                           "사람 눈 게이트로 보낸다")}
    return {**out, "verdict": "passed", "sample": sample,
            "reason": f'측정값으로 통과 (읽은 경로: '
                      f'{", ".join(jb.decisive_paths(spec))})'}


def binding_status(atom: dict) -> dict:
    """이 원자 하나가 실제로 측정 가능한가 (§7.4의 결합 검사).

      bound    측정 선언 + 어댑터 등록 + 필요한 키를 전부 제공 → 진짜 측정
      no_tool  측정 선언인데 어댑터 미선언/미등록 → 아직 잴 수 없다
      key_gap  어댑터는 있는데 심판이 읽는 키를 못 만든다 → 오결합
      n/a      애초에 measured.*를 읽지 않는 심판(자기신고·사람 눈)
    """
    spec = atom.get("judge") or {}
    if jb.evidence_grade(spec) != "measured":
        return {"atom": atom.get("id"), "status": "n/a", "adapter": None,
                "needs": [], "reason": "measured.*를 읽지 않는 심판"}
    need = sorted({p.split(".")[1] for p in jb.decisive_paths(spec)
                   if p.startswith("measured.") and "." in p})
    name = atom.get("adapter")
    if not name or name not in ADAPTERS:
        return {"atom": atom.get("id"), "status": "no_tool", "adapter": name,
                "needs": need,
                "reason": ("측정한다고 선언했지만 그 값을 낼 어댑터가 없다 "
                           "- 아직 실제로는 못 잰다")}
    gap = [k for k in need if k not in PROVIDES.get(name, ())]
    if gap:
        return {"atom": atom.get("id"), "status": "key_gap", "adapter": name,
                "needs": need, "missing": gap,
                "reason": f'{name}이(가) 못 만드는 키: {gap}'}
    return {"atom": atom.get("id"), "status": "bound", "adapter": name,
            "needs": need, "reason": f'{name}로 실제 측정 가능'}


def binding_report(registry: list | None = None) -> dict:
    """"측정한다"고 선언한 원자에 **실제로 잴 도구가 있는가.**

    경로 접두사만 보면 `measured.*`라고 쓰기만 해도 측정으로 보인다 — 그건
    또 하나의 자기신고다. 그래서 원자는 어떤 어댑터가 그 값을 채우는지
    (`adapter` 필드) 선언하고, 여기서 그 어댑터의 provides와 대조한다.

      bound         측정 선언 + 어댑터 등록 + 필요한 키를 전부 제공 → 진짜 측정
      no_tool       측정 선언인데 어댑터 미선언/미등록 → 아직 잴 수 없다
      key_gap       어댑터는 있는데 심판이 읽는 키를 못 만든다 → 오결합
    """
    reg = registry if registry is not None else jb.load_registry()
    rows = [binding_status(a) for a in reg
            if jb.evidence_grade(a.get("judge") or {}) == "measured"]
    counts = {k: sum(1 for r in rows if r["status"] == k)
              for k in ("bound", "no_tool", "key_gap")}
    return {"rows": rows, "summary": {
        "declared_measured": len(rows), **counts,
        "really_measurable": (round(counts["bound"] / len(rows), 4)
                              if rows else 0.0)}}


def _print_bindings(res: dict) -> None:
    mark = {"bound": "결합", "no_tool": "도구없음", "key_gap": "오결합"}
    print("=" * 68)
    print("어댑터 결합 검사 — '측정한다'는 선언에 잴 도구가 있는가")
    print("=" * 68)
    for r in res["rows"]:
        print(f'  [{mark.get(r["status"]):^5}] {r["atom"]:<28} '
              f'어댑터={r["adapter"] or "-"}  필요키={",".join(r["needs"])}')
        print(f'          ↳ {r["reason"]}')
    s = res["summary"]
    print("-" * 68)
    print(f'  측정 선언 {s["declared_measured"]}건 중 실제 측정 가능 '
          f'{s["bound"]}건 ({s["really_measurable"]:.0%}), '
          f'도구없음 {s["no_tool"]} / 오결합 {s["key_gap"]}')


def main(argv=None):
    ap = argparse.ArgumentParser(description="심판대 어댑터")
    ap.add_argument("--bindings", action="store_true",
                    help="측정 선언 원자에 잴 도구가 있는지 검사")
    ap.add_argument("--atom", help="레지스트리 원자 id")
    ap.add_argument("--source",
                    help="산출물 명세 JSON(adapter/params/spec/claim) 또는 파일 경로")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    reg = jb.load_registry()
    if args.bindings:
        res = binding_report(reg)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            _print_bindings(res)
        return 0
    if not args.atom or not args.source:
        ap.error("--atom과 --source가 필요하다 (또는 --bindings)")
    atom = next((a for a in reg if a["id"] == args.atom), None)
    if atom is None:
        print(f"그런 원자 없음: {args.atom}")
        return 2
    raw = args.source
    if os.path.isfile(raw):
        with open(raw, encoding="utf-8") as f:
            raw = f.read()
    res = judge_artifacts(atom, json.loads(raw))
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        mark = {"passed": "통과(측정)", "pass_on_claim": "통과(자기신고)",
                "failed": "거절", "no_judge": "심판없음",
                "adapter_error": "측정불가"}.get(res["verdict"], res["verdict"])
        print(f'[{mark}] {res["atom"]}  심판={res["kind"]} '
              f'반례={res["teeth"]} 재료={res["evidence"]}')
        print(f'  ↳ {res["reason"]}')
    return 0 if res["verdict"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
