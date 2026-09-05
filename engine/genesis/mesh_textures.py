"""GLB 에서 PBR 맵을 꺼내 유니티가 먹는 모양으로 바꾼다.

2026-09-05 22:40 발견: Meshy 의 원본 GLB 에는 baseColor·normal·metallicRoughness 가
있는데, 리깅된 FBX 에는 baseColor 하나만 온다. 같은 메시·같은 UV 라 원본의 맵을
리깅 캐릭터의 재질에 그대로 붙이면 생성 AI 를 다시 돌리지 않고도 디테일이 산다
(사장님 22:37: "캐릭터 생성 AI 는 최대한 쓰지 말고, 생성된 캐릭터에 디테일을").

유니티 Standard/URP Lit 은 금속·매끄러움을 한 장에 담는다: R = metallic, A = smoothness
(= 1 − roughness). glTF 는 G = roughness, B = metallic. 여기서 바꿔 준다.
"""
from __future__ import annotations

import io
import json
import struct
from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class PbrMaps:
    base_color_png: bytes | None
    normal_png: bytes | None
    metallic_smoothness_png: bytes | None
    occlusion_png: bytes | None
    note: str


def _parse_glb(data: bytes) -> tuple[dict, bytes]:
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError("GLB 가 아니다")
    off = 12
    gltf: dict | None = None
    binary = b""
    while off < len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + chunk_len]
        off += chunk_len
        if chunk_type == 0x4E4F534A:  # JSON
            gltf = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942:  # BIN
            binary = chunk
    if gltf is None:
        raise ValueError("JSON 청크가 없다")
    return gltf, binary


def _image_bytes(gltf: dict, binary: bytes, image_index: int) -> bytes:
    img = gltf["images"][image_index]
    if "bufferView" not in img:
        raise ValueError("외부 uri 이미지는 지원하지 않는다")
    bv = gltf["bufferViews"][img["bufferView"]]
    start = bv.get("byteOffset", 0)
    return binary[start:start + bv["byteLength"]]


def _texture_image(gltf: dict, binary: bytes, tex_ref: dict | None) -> Image.Image | None:
    if not tex_ref:
        return None
    tex = gltf["textures"][tex_ref["index"]]
    src = tex.get("source")
    if src is None:
        return None
    return Image.open(io.BytesIO(_image_bytes(gltf, binary, src)))


def _png(im: Image.Image | None) -> bytes | None:
    if im is None:
        return None
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _smoothness_from_base(base: Image.Image) -> np.ndarray | None:
    """베이스컬러의 색으로 재질 종류를 어림해 매끄러움을 준다. 어림이다 — 사람 캐릭터
    (피부·천·청바지·머리) 에 맞춘 규칙이고, 색이 그 범위 밖이면 0.25 다."""
    from PIL import ImageFilter
    hsv = np.asarray(base.convert("RGB").convert("HSV")).astype(np.float32) / 255.0
    h, sat, val = hsv[..., 0] * 360.0, hsv[..., 1], hsv[..., 2]
    out = np.full(h.shape, 0.25, dtype=np.float32)
    skin = (h < 40) & (sat > 0.12) & (sat < 0.65) & (val > 0.35) & (val < 0.97)
    denim = (h > 190) & (h < 250) & (sat > 0.2)
    white = (sat < 0.12) & (val > 0.72)
    hair = (val < 0.36) & (h < 45)
    out[skin] = 0.45
    out[denim] = 0.20
    out[white] = 0.12
    out[hair] = 0.30
    img = Image.fromarray((out * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(max(1, base.size[0] // 512)))
    return np.asarray(img).astype(np.float32) / 255.0


def extract_pbr_maps(data: bytes, material_index: int = 0) -> PbrMaps:
    gltf, binary = _parse_glb(data)
    mats = gltf.get("materials") or []
    if not mats:
        return PbrMaps(None, None, None, None, "재질이 없다")
    m = mats[min(material_index, len(mats) - 1)]
    pbr = m.get("pbrMetallicRoughness", {})

    base = _texture_image(gltf, binary, pbr.get("baseColorTexture"))
    normal = _texture_image(gltf, binary, m.get("normalTexture"))
    mr = _texture_image(gltf, binary, pbr.get("metallicRoughnessTexture"))
    occ = _texture_image(gltf, binary, m.get("occlusionTexture"))

    packed = None
    if mr is not None:
        # Meshy 의 거칠기 맵은 얼룩덜룩하다(AI 노이즈). 그대로 붙이면 셔츠에 네모난
        # 하이라이트 얼룩이 진다(09-06 00:46 정면 사진). 넓게 흐리고(2048 기준 반지름 10)
        # 매끄러움 범위를 0.1~0.55 로 눌러 하이라이트가 튀지 않게 한다 — 생성기를 다시
        # 돌리지 않고 되는 일.
        from PIL import ImageFilter
        blur_r = max(2, mr.size[0] // 200)
        mr_s = mr.convert("RGB").filter(ImageFilter.GaussianBlur(blur_r))
        arr = np.asarray(mr_s).astype(np.float32) / 255.0
        rough = arr[..., 1] * float(pbr.get("roughnessFactor", 1.0))
        metal = arr[..., 2] * float(pbr.get("metallicFactor", 1.0))
        smooth = 0.10 + 0.45 * (1.0 - rough)
        # 재질이 한 장이라 피부·옷·청바지·머리가 같은 광택이었다(09-06 15회차). 베이스컬러
        # 색으로 갈라 표준값을 준다: 피부 0.45, 흰 천 0.12, 청바지 0.2, 머리 0.3, 그 외 0.25.
        # Meshy 의 (흐린) 거칠기는 1/4 만 섞는다 — 얼룩은 줄이고 결은 남긴다. 생성 AI 없음.
        if base is not None and base.size == mr.size:
            cls = _smoothness_from_base(base)
            if cls is not None:
                smooth = 0.75 * cls + 0.25 * smooth
        out = np.zeros((*arr.shape[:2], 4), dtype=np.uint8)
        out[..., 0] = np.clip(metal * 255, 0, 255)
        out[..., 1] = out[..., 0]
        out[..., 2] = out[..., 0]
        out[..., 3] = np.clip(smooth * 255, 0, 255)
        packed = Image.fromarray(out, "RGBA")

    note = (
        f"base={'있음' if base else '없음'} normal={'있음' if normal else '없음'} "
        f"metallicRoughness={'있음' if mr else '없음'} occlusion={'있음' if occ else '없음'}; "
        "metallic_smoothness 는 유니티 묶음(R=metallic, A=1−roughness)"
    )
    return PbrMaps(_png(base), _png(normal), _png(packed), _png(occ.convert("L") if occ else None), note)
