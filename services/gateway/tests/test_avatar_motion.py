from PIL import Image, ImageChops
from tools.gen_avatar_motion import motion_frame


def test_every_existing_portrait_has_a_small_webm_clip():
    from pathlib import Path
    root = Path(__file__).resolve().parents[3] / 'frontend/public/avatars'
    sources = list(root.glob('*/*.webp'))
    assert sources
    for source in sources:
        clip = source.with_suffix('.webm')
        assert clip.exists(), str(clip)
        data = clip.read_bytes()
        assert data.startswith(b'\x1a\x45\xdf\xa3'), str(clip)
        assert 500 < len(data) < 200000, str(clip)


def test_motion_changes_local_features_but_keeps_loop_and_background():
    image = Image.new('RGB', (256, 256), '#e8e2d0')
    # A grid makes subpixel feature motion observable without external assets.
    for y in range(30, 240, 7):
        for x in range(60, 200):
            image.putpixel((x, y), (30, 50, 70))
    first = motion_frame(image, 0)
    middle = motion_frame(image, .25)
    last = motion_frame(image, 1)
    assert ImageChops.difference(first, middle).getbbox() is not None
    assert first.tobytes() == last.tobytes(), 'the loop must return to the original pose'
    assert first.crop((0, 0, 30, 30)).tobytes() == middle.crop((0, 0, 30, 30)).tobytes()
    assert ImageChops.difference(first.crop((95, 80, 160, 110)),
                               middle.crop((95, 80, 160, 110))).getbbox() is not None
