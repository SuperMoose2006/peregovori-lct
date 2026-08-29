#!/usr/bin/env python3
"""listeners_check.py — кто на этой машине раздаёт наш продукт и кому.

ДВА СЛУЧАЯ, И ОБА УЖЕ БЫЛИ.

ПЕРВЫЙ: чужая сборка на нужном порту. `probes/README.md` велит поднимать
офлайн-сборку на 5199 и ходить по ней обходчиком. Если порт занят другим
сервером — вчерашним `vite preview`, например, — команда запуска тихо не
сработает, а обходчик исправно отчитается «ноль замечаний» по СОВЕРШЕННО
ДРУГОЙ сборке. Именно так в этой сессии несколько прогонов подряд проверяли
код трёхдневной давности.

ВТОРОЙ: наша раздача, смотрящая наружу. Рецепт в README привязывает сервер к
`127.0.0.1`. Достаточно забыть `--bind`, чтобы копия интерфейса уехала в
интернет мимо пароля, которым закрыт стенд. Один такой прожил два часа.

    .venv/bin/python tools/listeners_check.py
    .venv/bin/python tools/listeners_check.py --json

Код возврата: 0 — чисто, 1 — есть замечания.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time

REPO = "/root/LCT"

#: Порты, которым наружу смотреть ПОЛОЖЕНО: публичный стенд. Всё остальное
#: наше и внешнее — ошибка, а не настройка.
SANCTIONED_EXTERNAL = {443, 8443}

#: Порты из рецептов проб. Занял их кто-то посторонний — обход будет ходить не
#: туда и молчать об этом.
PROBE_PORTS = {5199: "офлайн-сборка dist-mock (probes/README.md)"}


def _listeners() -> list[dict]:
    out = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines()[1:]:
        m = re.search(r"\s(\S+):(\d+)\s+\S+\s+users:\(\((.*)\)\)", line)
        if not m:
            continue
        addr, port, users = m.group(1), int(m.group(2)), m.group(3)
        pid_m = re.search(r"pid=(\d+)", users)
        if not pid_m:
            continue
        pid = int(pid_m.group(1))
        rows.append({"addr": addr, "port": port, "pid": pid,
                     "external": addr in ("0.0.0.0", "*", "::"),
                     **_about(pid)})
    return rows


def _about(pid: int) -> dict:
    def read(path: str) -> str:
        try:
            with open(path, "rb") as fh:
                return fh.read().decode("utf-8", "replace").replace("\0", " ").strip()
        except OSError:
            return ""
    cwd = ""
    try:
        cwd = os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        pass
    cmd = read(f"/proc/{pid}/cmdline")
    # Возраст процесса — из 22-го поля `/proc/<pid>/stat` (момент старта в
    # тиках от загрузки машины), а не из `st_ctime` каталога `/proc/<pid>`.
    # Первая редакция брала именно его и показывала «0.0 ч» для процесса,
    # запущенного неделю назад: у этого каталога время меняется само. Прибор,
    # который занижает возраст, обесценивает собственную находку — «висит 0.0 ч»
    # читается как «только что подняли, наверное, по делу».
    age_h = 0.0
    try:
        ticks = float(read(f"/proc/{pid}/stat").rsplit(") ", 1)[1].split()[19])
        uptime = float(read("/proc/uptime").split()[0])
        age_h = max(0.0, uptime - ticks / os.sysconf("SC_CLK_TCK")) / 3600
    except (OSError, IndexError, ValueError):
        pass
    return {"cwd": cwd, "cmd": cmd[:120], "age_h": round(age_h, 1),
            "ours": cwd.startswith(REPO) or REPO in cmd}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rows = _listeners()
    problems: list[str] = []

    for r in rows:
        if r["ours"] and r["external"] and r["port"] not in SANCTIONED_EXTERNAL:
            problems.append(
                f"НАРУЖУ МИМО ПАРОЛЯ: порт {r['port']} слушает {r['addr']}, это наш "
                f"({r['cmd']}), живёт {r['age_h']} ч. Рецепт требует --bind 127.0.0.1.")

    for port, what in PROBE_PORTS.items():
        here = [r for r in rows if r["port"] == port]
        if not here:
            continue
        r = here[0]
        expected = "http.server" in r["cmd"] and "dist-mock" in (r["cwd"] + r["cmd"])
        if not expected:
            problems.append(
                f"ЧУЖОЙ НА ПОРТУ ПРОБЫ: {port} — это {what}, а занят «{r['cmd']}» "
                f"уже {r['age_h']} ч. Обход пойдёт по чужой сборке и промолчит.")

    if args.json:
        print(json.dumps({"listeners": rows, "problems": problems}, ensure_ascii=False))
        return 1 if problems else 0

    ours = [r for r in rows if r["ours"]]
    print(f"\nслушают всего: {len(rows)}, из них наши: {len(ours)}\n")
    for r in sorted(ours, key=lambda x: x["port"]):
        mark = "НАРУЖУ" if r["external"] else "локально"
        print(f"  {r['port']:6} {mark:9} {r['age_h']:6.1f} ч  {r['cmd'][:70]}")

    if problems:
        print("\n─── замечания ───")
        for p in problems:
            print(f"  ✗ {p}")
        return 1
    print("\n  ✓ ничего лишнего наружу, порты проб свободны или заняты по делу")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
