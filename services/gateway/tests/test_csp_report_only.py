"""CSP стенда — пока только отчёт, но он обязан быть совместим с продуктом.

Аудит 17.10, R03: «нет Content-Security-Policy; ввести совместимую CSP через
Report-Only». Политика в deploy/Caddyfile разрешает встроенный скрипт
страницы проверки оборудования по хешу — и хеш устаревает при любой правке
check.html. Тогда отчёты пошли бы на каждую проверку, а при переводе в
боевую CSP страница перестала бы работать. Здесь хеш пересчитывается.
"""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _policy() -> str:
    caddy = (ROOT / "deploy" / "Caddyfile").read_text(encoding="utf-8")
    m = re.search(r'Content-Security-Policy-Report-Only "([^"]+)"', caddy)
    assert m, "в Caddyfile нет CSP в режиме отчёта"
    return m.group(1)


def test_the_policy_is_report_only_and_has_no_enforcing_twin():
    caddy = (ROOT / "deploy" / "Caddyfile").read_text(encoding="utf-8")
    assert not re.search(r"^\s*Content-Security-Policy\s", caddy, re.M), (
        "боевая CSP появилась раньше, чем стенд прожил с отчётами")


def test_every_inline_script_of_check_html_is_allowed_by_hash():
    html = (ROOT / "frontend" / "public" / "check.html").read_text(encoding="utf-8")
    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    assert scripts, "встроенных скриптов нет — хеш в политике лишний"
    policy = _policy()
    for body in scripts:
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        assert f"'sha256-{digest}'" in policy, "check.html изменился — пересчитайте хеш в deploy/Caddyfile"


def test_the_built_page_has_no_inline_script():
    """Приложение грузит скрипты только файлами: встроенный скрипт в
    index.html нарушил бы script-src 'self' на каждой загрузке."""
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html)
