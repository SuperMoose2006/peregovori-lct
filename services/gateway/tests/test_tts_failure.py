import asyncio
import pytest

from app.orchestrator import tts_manager
from app.providers.tts.base import Voice


@pytest.mark.asyncio
@pytest.mark.parametrize('failure', ['empty', 'error', 'hang'])
@pytest.mark.parametrize('lang', ['ru', 'en'])
async def test_failed_synthesis_reports_text_fallback_and_finishes(monkeypatch, failure, lang):
    monkeypatch.setattr(tts_manager, 'SYNTHESIS_TIMEOUT_S', 0.01)

    class Provider:
        def available(self): return True
        async def stream(self, text, voice):
            if failure == 'error': raise RuntimeError('private provider detail')
            if failure == 'hang': await asyncio.sleep(60)
            return
            yield b''

    events = []
    manager = tts_manager.TTSTaskManager(Provider(), events.append, Voice('', lang, True))
    manager.speak('Hello', generation_id='g', turn_id=1)
    try:
        await asyncio.wait_for(manager._sender, 0.5)
        failures = [e['error'] for e in events if e['type'] == 'error']
        assert len(failures) == 1
        assert failures[0]['code'] == 'tts_unavailable'
        assert ('Текст' if lang == 'ru' else 'text') in failures[0]['message']
        assert 'private provider detail' not in str(events)
        assert not any(e.get('kind') == 'audio' for e in events)
    finally:
        manager.clear()
