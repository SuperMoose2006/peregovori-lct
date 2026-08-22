#!/usr/bin/env bash
# run.sh — поднять avatar-воркер (LiveTalking + MuseTalk). Нужен CUDA-GPU.
#
# Сам LiveTalking сюда НЕ вкоммичен: это несколько гигабайт весов и жёсткая
# привязка к версии CUDA. Клонируется на GPU-хосте — см. README.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM="${LIVETALKING_DIR:-$HERE/livetalking}"
PORT="${AVATAR_PORT:-8020}"
MODEL="${AVATAR_MODEL:-musetalk}"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "GPU не найден: липсинк требует CUDA." >&2
  echo "Без воркера гейтвей работает на провайдере presence — это штатный режим," >&2
  echo "а не поломка. См. services/avatar/README.md." >&2
  exit 2
fi

if [ ! -d "$UPSTREAM" ]; then
  echo "LiveTalking не установлен в $UPSTREAM." >&2
  echo "Установка описана в services/avatar/README.md." >&2
  exit 2
fi

cd "$UPSTREAM"
exec python app.py --model "$MODEL" --transport webrtc --listenport "$PORT"
