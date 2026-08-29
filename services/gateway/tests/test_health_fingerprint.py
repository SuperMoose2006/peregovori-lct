"""Отпечаток сборки обязан замечать правку кода, а не только контента.

ЗАЧЕМ ЭТОТ ФАЙЛ. Шлюз — долгоживущий процесс. Тот, что раздавал демо, крутился
двое с половиной суток и отвечал кодом позавчерашнего дня, а обходчик исправно
рапортовал «сборка свежая». Тогда в `/api/health` появился отпечаток — и он
считал упражнения, сценарии и кампании, то есть СОДЕРЖИМОЕ.

За один день правок судьи, голоса и лицензионных шапок все три числа остались
прежними: 90, 9, 2. Прибор, поставленный ловить старый код, кода не видел.
Здесь проверяется, что теперь видит.
"""
from __future__ import annotations

import importlib
import os

import app.main as main


def _fresh_digest() -> str:
    """Отпечаток заново: он кэшируется на процесс, иначе тест мерил бы кэш."""
    main._CODE_DIGEST = None
    return main._code_digest()


def test_the_digest_notices_a_change_the_counters_cannot_see(tmp_path):
    """Правка строки в `app/` меняет отпечаток, а счётчики — нет."""
    before = main._build_fingerprint()
    target = os.path.join(os.path.dirname(os.path.abspath(main.__file__)),
                          "engine", "campaigns.py")
    original = open(target, "rb").read()
    try:
        with open(target, "ab") as fh:
            fh.write("\n# проба отпечатка\n".encode("utf-8"))
        main._CODE_DIGEST = None
        after = main._build_fingerprint()
    finally:
        with open(target, "wb") as fh:
            fh.write(original)
        main._CODE_DIGEST = None

    assert after["code"] != before["code"], (
        "отпечаток не заметил правку кода — он снова ловит только контент")
    for key in ("exercises", "scenarios", "campaigns"):
        assert after[key] == before[key], (
            f"счётчик {key} изменился — тест перестал доказывать своё утверждение")


def test_the_digest_is_stable_across_repeated_reads():
    """Дважды подряд — одно и то же.

    Первая редакция считала хеш по `sys.modules`, и он зависел от того, что
    успел импортировать спрашивающий: ленивые импорты внутри обработчиков
    попадают туда только после первого вызова. Два процесса с ОДНИМ И ТЕМ ЖЕ
    кодом давали разные отпечатки — то есть прибор был генератором ложных
    тревог. Обход каталога так не умеет, и вот доказательство.
    """
    first = _fresh_digest()
    importlib.import_module("app.perception.vision")   # что-нибудь ленивое
    importlib.import_module("app.orchestrator.judge")
    assert _fresh_digest() == first, "отпечаток поехал от чужого импорта"


def test_health_carries_the_digest():
    """Отпечаток обязан доезжать до ответа, а не только существовать в коде."""
    build = main.health()["build"]
    assert isinstance(build.get("code"), str) and len(build["code"]) == 12, build
