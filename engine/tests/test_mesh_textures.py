"""GLB 에서 PBR 맵 꺼내기 — 사람 캐릭터의 원본 GLB 가 있으면 그것으로, 없으면 건너뛴다."""
import os
import pytest
from genesis import mesh_textures as mt

GLB = "C:/Users/az518/RookeryFarm/Assets/Rookery/20~30대_사실적_남성_캐릭터/model.glb"


@pytest.mark.skipif(not os.path.exists(GLB), reason="사람 캐릭터 GLB 가 이 PC 에 없다")
def test_extracts_normal_and_packed_metallic_smoothness():
    maps = mt.extract_pbr_maps(open(GLB, "rb").read())
    assert maps.base_color_png and maps.normal_png and maps.metallic_smoothness_png
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(maps.metallic_smoothness_png))
    assert im.mode == "RGBA" and im.size[0] >= 1024


def test_rejects_non_glb():
    with pytest.raises(ValueError):
        mt.extract_pbr_maps(b"not a glb at all")
