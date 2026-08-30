#!/usr/bin/env bash
# test_committed.sh — прогнать набор по ЗАПИСАННОМУ дереву, а не по рабочему.
#
# ЗАЧЕМ. `make test` гоняется по рабочему каталогу — то есть проверяет то, что
# лежит на диске, а не то, что записано в историю. Разница не теоретическая: за
# одни сутки она дважды оказалась настоящей.
#
#   · коммит про три зеркальных стола не нёс ни списка их идентификаторов, ни
#     протокольной части — на диске они были, в коммите нет;
#   · тест, требующий разбора «семьдесят тысяч», лежал в истории ЧАСАМИ, а код
#     к нему — только в рабочем дереве.
#
# И третий случай другого рода: шов без ключа падал необработанной ошибкой.
# Рабочее дерево этого не показывало, потому что рядом лежит файл секретов, а
# на чистой машине его нет — там продукт и разворачивают.
#
# Прогон намеренно БЕЗ `.env`: отдельное дерево его не получает (файл вне
# истории), и это не потеря, а суть проверки. Тесты, которым нужен ключ,
# честно пропускаются — их число печатается.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${TMPDIR:-/tmp}/dialog-committed-$$"
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"

cleanup() { git -C "$ROOT" worktree remove --force "$WORK" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "дерево коммита: $(git -C "$ROOT" log --oneline -1)"
git -C "$ROOT" worktree add -q --detach "$WORK" "$HEAD_SHA"

ln -sfn "$ROOT/services/gateway/.venv" "$WORK/services/gateway/.venv"
ln -sfn "$ROOT/frontend/node_modules" "$WORK/frontend/node_modules"

echo
echo "─── бэкенд ───"
(cd "$WORK/services/gateway" && "$ROOT/services/gateway/.venv/bin/python" -m pytest tests -q | tail -2)

echo
echo "─── фронтенд ───"
(cd "$WORK/frontend" && npm test 2>&1 | grep -E "^# (tests|pass|fail)")
