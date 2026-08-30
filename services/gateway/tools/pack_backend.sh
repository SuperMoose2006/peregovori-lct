#!/usr/bin/env bash
# pack_backend.sh <каталог> — собрать артефакт БЭКЕНДА: всё, что нужно шлюзу,
# и ничего, что нужно фронтенду.
#
# ЗАЧЕМ. Шлюз и фронтенд разворачиваются на разных серверах: статика лежит
# отдельно, шлюз отдаёт только API и сокет. «Скопируйте репозиторий» для этого
# не годится дважды: на бэкенд-сервер уезжает `frontend/` целиком (и вместе с
# ним `node_modules`, если копировали rsync'ом), а вопрос «что именно нужно
# шлюзу» остаётся без ответа, пока однажды не выяснится опытным путём.
# Здесь ответ записан списком, и его можно проверить: развернуть в пустой
# каталог и поднять.
#
# ЧТО КОПИРУЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО:
#   services/gateway/app            сам шлюз: движок, курс, протокол, слои
#   services/gateway/requirements.txt зависимости
#   services/gateway/.env.example   образец файла секретов (сам .env НЕ копируется)
#   services/gateway/tools          приборы; часть из них монорепозиторные — см. ниже
#   adapters/                       шов OpenTalking; без него main.py пишет
#                                   предупреждение в лог и работает дальше
#
# ЧЕГО В АРТЕФАКТЕ НЕТ НАМЕРЕННО:
#   frontend/                       он и есть второй сервер
#   services/gateway/tests          набор читает документы, фикстуры и зеркала
#                                   во `frontend/` — в отдельном дереве он не
#                                   прогоняется, и делать вид, что прогоняется,
#                                   нельзя. Тесты гоняются в монорепозитории
#                                   (`make test`), до сборки артефакта.
#   .env, .venv, certs/             секреты и локальное окружение. Гарантия не
#                                   в аккуратности: список берётся из
#                                   `git ls-files`, а всё перечисленное лежит
#                                   вне истории.
#
# Приборы `preflight.py`, `bench_latency.py` и генераторы читают `frontend/` —
# в артефакте они лежат, но работают только в монорепозитории. Здоровье
# отдельного шлюза спрашивают у `/api/health`, слушателей — у
# `tools/listeners_check.py`, нагрузку — у `tools/bench_load.py`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEST="${1:-}"

if [ -z "$DEST" ]; then
  echo "usage: services/gateway/tools/pack_backend.sh <каталог>" >&2
  exit 2
fi

git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || {
  echo "pack_backend.sh: $ROOT — не git-репозиторий, а список файлов берётся из истории" >&2
  exit 2
}

PATHS=(
  services/gateway/app
  services/gateway/tools
  services/gateway/requirements.txt
  services/gateway/.env.example
  adapters
)

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

count=0
while IFS= read -r -d '' rel; do
  install -D -m "$(test -x "$ROOT/$rel" && echo 755 || echo 644)" \
    "$ROOT/$rel" "$DEST/$rel"
  count=$((count + 1))
done < <(git -C "$ROOT" ls-files -z -- "${PATHS[@]}")

# Секрет, уехавший в артефакт, — это тот же ключ из .env, только теперь ещё и на
# втором сервере. Проверяем РЕЗУЛЬТАТ, а не намерение.
#
# `.venv` из проверки исключён, и это не поблажка: пересборка в тот же каталог —
# обычное дело, а виртуальное окружение целевой машины законно несёт чужие
# сертификаты (`certifi/cacert.pem`). Первая редакция этого не учла и на втором
# запуске останавливалась, обвиняя артефакт в чужом файле.
if find "$DEST" -name .venv -prune -o \
     \( -name ".env" -o -name "*.pem" -o -name "*.key" \) -print | grep -q .; then
  echo "pack_backend.sh: в артефакте оказался файл секретов — остановлено" >&2
  exit 1
fi

head_sha="$(git -C "$ROOT" rev-parse --short HEAD)"
dirty=""
git -C "$ROOT" diff --quiet -- "${PATHS[@]}" || dirty=" + НЕЗАКОММИЧЕННЫЕ правки рабочего дерева"

cat <<TXT
артефакт бэкенда: $DEST
файлов: $count · дерево: $head_sha$dirty
фронтенда внутри нет — шлюз поднимется в режиме «только API»

дальше на целевой машине:
  python3 -m venv $DEST/services/gateway/.venv
  $DEST/services/gateway/.venv/bin/pip install -r $DEST/services/gateway/requirements.txt
  cp $DEST/services/gateway/.env.example $DEST/services/gateway/.env   # и вписать ключи
  cd $DEST/services/gateway && set -a && . ./.env && set +a && \\
    PYTHONPATH=$DEST ./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010
TXT
