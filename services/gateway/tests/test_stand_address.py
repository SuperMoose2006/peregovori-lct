"""Предпоказ проверяет нынешний стенд, не исторический адрес из README."""
import io
from pathlib import Path

import pytest

from tools import preflight


@pytest.mark.parametrize('override', ['', 'https://example.invalid/'])
def test_stand_request_uses_current_address_or_explicit_override(monkeypatch, override):
    requested = []

    class Opener:
        def open(self, request, **kwargs):
            requested.append(request.full_url)
            return io.BytesIO(b'{"cloud_ai":true}')

    monkeypatch.setattr(preflight, '_secret', lambda key, default='':
                        (override or default) if key == 'NEGO_STAND_URL' else '')
    monkeypatch.setattr(preflight.urllib.request, 'build_opener', lambda *args: Opener())
    monkeypatch.setattr(preflight, 'compare_build', lambda *args: None)
    monkeypatch.setattr(preflight, 'warn', lambda *args: None)
    preflight.check_stand()
    expected = override.rstrip('/') or 'https://dialog.2-26-49-28.nip.io'
    assert requested == [expected + '/api/health']


def test_readme_names_service_managed_stand():
    text = (Path(__file__).resolve().parents[3] / 'README.md').read_text()
    assert 'https://dialog.2-26-49-28.nip.io' in text
    assert 'systemctl status dialog dialog-asr' in text
    assert 'kill $(ss' not in text, 'port-based kill is not a systemd deployment procedure'
