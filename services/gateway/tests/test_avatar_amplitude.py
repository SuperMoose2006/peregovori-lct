import pytest
from app import engine
from app.realtime.session import RealtimeSession, Layers
from app.realtime.endpoint import _make_avatar, _created_payload


@pytest.mark.parametrize('voice,avatar,expected', [(True, True, True), (False, True, False), (True, False, False)])
def test_renderer_capability_is_explicit_and_gated(voice, avatar, expected):
    session = RealtimeSession('avatar', engine.create_session('supplier', 'ru'),
                              layers=Layers(voice=voice, avatar=avatar))
    caps = _created_payload(session, None)['capabilities']['avatar']
    assert caps['lipsync'] is expected
    if expected:
        assert caps['lipsync_mode'] == 'amplitude'
        assert caps['transport'] == 'local'


@pytest.mark.asyncio
async def test_local_provider_interrupt_and_state_do_not_claim_phonemes():
    session = RealtimeSession('avatar', engine.create_session('supplier', 'ru'),
                              layers=Layers(voice=True, avatar=True))
    avatar = _make_avatar(session)
    await avatar.set_state('warm', reaction='warmed')
    await avatar.speak(b'pcm', generation_id='test')
    await avatar.interrupt()
    session.bus.close()
    events = [event async for event in session.bus.drain()]
    assert [e['state'] for e in events] == ['warm', 'listening']
    assert all(e['lipsync_mode'] == 'amplitude' for e in events)


def test_optional_video_adapter_is_constructed_once_and_absence_falls_back(monkeypatch):
    from app.avatar import factory
    from app.avatar.amplitude import AmplitudeAvatar
    from app.avatar.base import AvatarCapabilities
    made = []

    class Video(AmplitudeAvatar):
        def __init__(self, *args):
            super().__init__(*args)
            made.append(self)

        def capabilities(self):
            return AvatarCapabilities(available=True, lipsync=True, lipsync_mode='video', transport='jpeg')

    monkeypatch.setitem(factory._PROVIDERS, 'test-video', Video)
    monkeypatch.setenv('NEGO_AVATAR_PROVIDER', 'test-video')
    session = RealtimeSession('video', engine.create_session('supplier', 'ru'), layers=Layers(voice=True, avatar=True))
    assert _make_avatar(session) is _make_avatar(session)
    assert _created_payload(session, None)['capabilities']['avatar']['lipsync_mode'] == 'video'
    assert len(made) == 1
    monkeypatch.setenv('NEGO_AVATAR_PROVIDER', 'missing-provider')
    assert factory.create_avatar('supplier', lambda e: None, voice=True).capabilities().lipsync_mode == 'amplitude'


def test_video_frame_contract_rejects_bad_data():
    from app.avatar.frames import avatar_frame
    frame = avatar_frame(b'\xff\xd8\xff\xd9', generation_id='g', pts_ms=20)
    assert frame['type'] == 'avatar.frame'
    assert frame['generation_id'] == 'g' and frame['pts_ms'] == 20
    for data, pts in [(b'not jpeg', 0), (b'\xff\xd8\xff\xd9', -1), (b'\xff\xd8\xff\xd9', float('nan'))]:
        with pytest.raises(ValueError):
            avatar_frame(data, generation_id='g', pts_ms=pts)


@pytest.mark.asyncio
@pytest.mark.parametrize('fails', [False, True])
async def test_provider_gets_exact_pcm_and_failure_never_loses_audio(fails):
    import asyncio
    import base64
    from app.orchestrator.tts_manager import TTSTaskManager
    from app.providers.tts.base import Voice
    chunks = [b'\x00\x00\x00\x3e', b'\x00\x00\x00\x00']

    class TTS:
        def available(self): return True
        async def stream(self, text, voice):
            for chunk in chunks: yield chunk

    events, received = [], []
    manager = TTSTaskManager(TTS(), events.append, Voice('', 'ru', True))

    async def accept(pcm, *, generation_id):
        received.append((pcm, generation_id))
        if fails: raise RuntimeError('renderer unavailable')

    manager.on_audio = accept
    manager.speak('Hello', generation_id='g', turn_id=1)
    await asyncio.wait_for(manager._sender, timeout=2)
    assert [base64.b64decode(e['audio']) for e in events if e.get('kind') == 'audio'] == chunks
    assert received == [(chunk, 'g') for chunk in (chunks[:1] if fails else chunks)]
    if fails:
        assert any(e.get('lipsync_mode') == 'amplitude' for e in events)
    manager.clear()


@pytest.mark.asyncio
async def test_failed_state_renderer_cannot_break_a_settled_turn():
    from app.avatar.presence import PresenceAvatar
    from app.orchestrator.negotiation import NegotiationOrchestrator

    class Broken(PresenceAvatar):
        async def set_state(self, *args, **kwargs):
            raise RuntimeError('video service failed')

    session = RealtimeSession('broken-face', engine.create_session('supplier', 'ru'),
                              layers=Layers(voice=True, avatar=True))
    orchestrator = NegotiationOrchestrator(session, avatar=Broken('supplier', session.bus.publish))
    await orchestrator.on_player_turn('Добрый день.')
    session.bus.close()
    events = [e async for e in session.bus.drain()]
    assert any(e['type'] == 'engine.state' for e in events)
    assert any(e['type'] == 'response.done' and e['text'] for e in events)
    assert orchestrator.avatar.capabilities().lipsync_mode == 'amplitude'
