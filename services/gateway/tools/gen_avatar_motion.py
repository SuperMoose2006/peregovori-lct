"""Local procedural portrait loops. No model/API, no emotion inference.

Requires Pillow and an ffmpeg executable with libvpx-vp9. Example:
python tools/gen_avatar_motion.py --ffmpeg /path/to/ffmpeg --persona supplier
The gentle deformation is intentionally labelled procedural, not captured motion.
"""
import argparse
import math
from pathlib import Path
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
FPS, FRAMES, SIZE = 16, 64, 256


def motion_frame(image: Image.Image, phase: float) -> Image.Image:
    width, height = image.size
    breath = math.sin(phase * math.tau)
    expression = math.sin(phase * math.tau) ** 2

    def source(x, y):
        nx, ny = x / width, y / height
        # Torso expands around its own centre, not a camera zoom. Background
        # edges stay fixed. A smaller localized brow movement adds expression.
        torso = math.exp(-((nx - .5) / .30) ** 4) * max(0, (ny - .5) * 2)
        face = math.exp(-((nx - .5) / .19) ** 4 - ((ny - .36) / .06) ** 2)
        dx = breath * (nx - .5) * torso * width * .018
        dy = breath * torso * height * .003 + expression * face * height * .002
        return x + dx, y + dy

    mesh = []
    for y in range(0, height, 16):
        for x in range(0, width, 16):
            right, bottom = min(x + 16, width), min(y + 16, height)
            quad = (*source(x, y), *source(x, bottom), *source(right, bottom), *source(right, y))
            mesh.append(((x, y, right, bottom), quad))
    return image.transform(image.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)


def encode(source: Path, executable: str):
    image = Image.open(source).convert('RGB').resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    target = source.with_suffix('.webm')
    temporary = target.with_suffix('.motion-tmp.webm')
    command = [executable, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
               '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-',
               '-an', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-threads', '2',
               '-pix_fmt', 'yuv420p', str(temporary)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for index in range(FRAMES):
            process.stdin.write(motion_frame(image, index / FRAMES).tobytes())
        process.stdin.close()
        if process.wait(timeout=60):
            raise RuntimeError(f'encoding failed: {source.name}')
        # Decode every frame; an existing filename is not proof of a usable clip.
        decoded = subprocess.run([executable, '-v', 'error', '-i', str(temporary),
                                  '-f', 'framemd5', '-'], check=True, capture_output=True, text=True)
        hashes = [line.split(',')[-1].strip() for line in decoded.stdout.splitlines()
                  if line and not line.startswith('#')]
        if len(hashes) != FRAMES or len(set(hashes)) < 8:
            raise RuntimeError('motion clip must contain 64 decodable, changing frames')
        temporary.replace(target)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        if temporary.exists():
            temporary.unlink()
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--persona', default='*')
    args = parser.parse_args()
    for source in sorted((ROOT / 'frontend/public/avatars').glob(f'{args.persona}/*.webp')):
        print(encode(source, args.ffmpeg).relative_to(ROOT), flush=True)
