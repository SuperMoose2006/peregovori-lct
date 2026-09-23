#!/usr/bin/env bash
# Snapshot the reviewed working tree, including uncommitted/new source files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:?usage: deploy/pack-release.sh /absolute/new/directory}"
test ! -e "$DEST" || { echo "Destination must not exist: $DEST" >&2; exit 2; }
test -f "$ROOT/frontend/dist/index.html"
bash "$ROOT/services/gateway/tools/pack_backend.sh" "$DEST"
mkdir -p "$DEST/frontend" "$DEST/deploy"
cp -R "$ROOT/frontend/dist" "$DEST/frontend/dist"
cp "$ROOT"/deploy/{Caddyfile,dialog.service,dialog.env.example,activate-release.sh} "$DEST/deploy/"
python3 - "$DEST" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
files = {}
for path in sorted(root.rglob('*')):
    if path.is_symlink():
        raise SystemExit(f'Symlink is not allowed in a release: {path}')
    if not path.is_file():
        continue
    if path.name == '.env' or path.suffix in {'.pem', '.key'}:
        raise SystemExit(f'Secret file is not allowed in a release: {path}')
    files[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
(root / 'release-manifest.json').write_text(json.dumps(files, indent=2) + '\n')
print(f'Release: {root}, {len(files)} files, manifest saved')
PY
