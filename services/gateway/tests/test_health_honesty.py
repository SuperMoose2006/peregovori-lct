"""Health не обещает того, чего нет, и называет того же распознавателя, что провод.

ДВА ТРЕБОВАНИЯ, КОТОРЫЕ ЗДЕСЬ ВСТРЕЧАЮТСЯ. Первое — принцип 2: без сети health
не имеет права говорить про голос так, будто он заработает. Второе — health
обязан называть ТОГО ЖЕ провайдера, который `endpoint._wire` поставит в
партию, иначе на показе видно одно, а слушает другое. При слиянии двух линий
эти требования уже разъезжались: одна ветка отвечала «unavailable» и молчала
про настройку, другая называла настройку без оговорки про сеть.
`main._voice_describe()` теперь делает и то и другое — сначала отказ, потом
настройка, — и эта форма держится здесь для каждого режима, а не для одного.

СОСЕДИ. `test_asr_selection.py` проверяет, что облачный ключ — не согласие на
отправку звука, и сверяет провод с health для parakeet. `test_admin_context.py`
проверяет, что строка без сети начинается с отказа. Здесь — остальное:
регистр и пробелы в переменных, выключенный распознаватель, каждый
`NEGO_VOICE`, health с сетью и сам ответ `/api/health`.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.providers.asr import DisabledASR, describe_voice, make_asr, voice_mode
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.asr.parakeet import ParakeetASR
from app.realtime import endpoint
from app.realtime.events import SessionInit
from app.session import store
from app.providers.tts.edge import EdgeTTS
from app.providers.tts.openai_speech import OpenAISpeechTTS

REFUSAL = "unavailable (NEGO_AI=off)"


def _env(monkeypatch, **values):
    for name, value in values.items():
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)


# ------------------------------------------------------------ выбор ASR

@pytest.mark.parametrize(("choice", "cls"), [
    (" OpenRouter ", OpenRouterASR), ("PARAKEET", ParakeetASR), ("Auto", ParakeetASR),
])
def test_asr_choice_ignores_case_and_spaces(monkeypatch, choice, cls):
    """Переменную пишет человек в `.env`. «OpenRouter» с большой буквы или
    «PARAKEET» не должны молча выключать голос: регистр — не отказ от распознавания."""
    _env(monkeypatch, NEGO_ASR=choice)
    assert isinstance(make_asr(), cls)


@pytest.mark.parametrize("choice", ["off", "whisper", "cloud", "local"])
def test_an_unknown_asr_choice_disables_voice_instead_of_guessing(monkeypatch, choice):
    _env(monkeypatch, NEGO_ASR=choice, NEGO_VOICE="classic")
    asr = make_asr()
    assert isinstance(asr, DisabledASR) and not asr.available()
    # Выключенный распознаватель не отвечает пустой строкой: пустую расшифровку
    # `VoicePipeline` молча выбрасывает, и реплика пропадала бы без следа.
    # Исключение же превращается в видимое `asr_unavailable` — «введите текст».
    with pytest.raises(RuntimeError):
        asyncio.run(asr.transcribe(None, 16000, "ru"))
    described = describe_voice()
    assert "NEGO_ASR" in described and "text" in described
    assert "parakeet" not in described and "openrouter" not in described, (
        "health называет распознаватель, которого в партии нет")


@pytest.mark.asyncio
async def test_a_disabled_asr_gives_the_game_no_microphone(monkeypatch):
    """Провод сходится с health и здесь: выключено в строке — выключено в партии."""
    _env(monkeypatch, NEGO_ASR="typo", NEGO_VOICE="classic")
    monkeypatch.setattr(OpenAISpeechTTS, "available", lambda self: False)
    monkeypatch.setattr(EdgeTTS, "available", lambda self: False)
    session, problem = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True}))
    assert problem is None
    try:
        _, voice, _ = endpoint._wire(session)
        assert voice is None
        assert "disabled" in main._voice_describe()
    finally:
        store.drop(session.session_id)


@pytest.mark.asyncio
async def test_wire_and_health_agree_on_the_cloud_provider_too(monkeypatch):
    """Сверка провода с health есть для parakeet; облачный путь — второй
    распознаватель, и расхождение на нём так же незаметно на глаз."""
    _env(monkeypatch, NEGO_ASR="openrouter", NEGO_VOICE="classic")
    # Доступность — без сети: сам распознаватель в этом тесте не зовётся.
    monkeypatch.setattr(OpenRouterASR, "available", lambda self: True)
    monkeypatch.setattr(OpenAISpeechTTS, "available", lambda self: False)
    monkeypatch.setattr(EdgeTTS, "available", lambda self: False)
    session, problem = await endpoint._build_session(SessionInit(
        scenarioId="supplier", mode="voice", layers={"voice": True}))
    assert problem is None
    _, voice, _ = endpoint._wire(session)
    try:
        assert isinstance(voice._asr, OpenRouterASR)
        assert voice._asr.describe() in main._voice_describe()
    finally:
        await voice.close()
        store.drop(session.session_id)


# ------------------------------------------------------ describe_voice

@pytest.mark.parametrize(("mode", "prefix"), [
    (None, "classic: parakeet"), ("", "classic: parakeet"), (" CLASSIC ", "classic: parakeet"),
    ("realtime", "openai-realtime"), ("Realtime", "openai-realtime"),
    ("off", "disabled (check NEGO_VOICE)"), ("typo", "disabled (check NEGO_VOICE)"),
])
def test_each_voice_mode_is_described_by_what_it_actually_wires(monkeypatch, mode, prefix):
    _env(monkeypatch, NEGO_VOICE=mode, NEGO_ASR=None)
    assert describe_voice().startswith(prefix)
    if voice_mode() != "classic":
        # Realtime-путь и выключенный голос не зовут `make_asr()` — называть
        # локальную модель в этих режимах значило бы описывать чужой конвейер.
        assert "parakeet" not in describe_voice()


# ----------------------------------------------------- _voice_describe

_SETUPS = [("classic", "parakeet"), ("classic", "openrouter"), ("classic", "typo"),
           ("realtime", None), ("typo", None)]


@pytest.mark.parametrize(("voice", "asr"), _SETUPS)
@pytest.mark.parametrize("off", ["off", "OFF", " off "])
def test_without_network_health_refuses_first_and_still_names_the_setup(monkeypatch, voice, asr, off):
    _env(monkeypatch, NEGO_AI=off, NEGO_VOICE=voice, NEGO_ASR=asr,
         OPENAI_REALTIME_KEY="configured-but-no-network")
    line = main._voice_describe()
    assert line.startswith(REFUSAL)
    assert line.endswith(describe_voice()), "настройка пропала из строки — health разошёлся с проводом"


@pytest.mark.parametrize(("voice", "asr"), _SETUPS)
def test_with_network_health_is_exactly_the_setup(monkeypatch, voice, asr):
    # Сеть «включена» только для строки: ни провайдер, ни модель здесь не зовутся.
    _env(monkeypatch, NEGO_AI=None, NEGO_VOICE=voice, NEGO_ASR=asr)
    assert main._voice_describe() == describe_voice()
    assert "unavailable" not in main._voice_describe()


# -------------------------------------------------------- /api/health

def test_offline_health_claims_no_cloud_layer_even_with_keys_configured(monkeypatch):
    """Ключи в `.env` лежат и на офлайн-показе. Без сети ни один из слоёв,
    которым сеть нужна, не должен выглядеть поднятым (принцип 2)."""
    _env(monkeypatch, NEGO_AI="off", NEGO_JUDGE=None,
         OPENAI_REALTIME_KEY="configured", OPENROUTER_API_KEY="configured")
    body = TestClient(main.app).get("/api/health").json()

    assert body["ok"] is True
    assert body["cloud_ai"] is False
    assert body["tts"] is None, "синтез обещан без сети"
    assert body["judge"] is False, "живой судья обещан без сети"
    assert body["voice"] == main._voice_describe() and body["voice"].startswith(REFUSAL)
    # Раскладка ролей видна всегда: по ней на показе узнают, кто сейчас говорит.
    assert set(body["models"]) == {"opponent", "judge", "vision", "reasoning", "asr"}


@pytest.mark.xfail(strict=True, reason=(
    "orchestrator/judge.py:67-70: NEGO_JUDGE=1 включает судью, не спрашивая сеть; "
    "при NEGO_AI=off health и capabilities говорят judge=True, а каждый ход "
    "шлёт judge.started и тут же judge.completed{semantic:false}"))
def test_forcing_the_judge_on_does_not_make_it_claimed_without_network(monkeypatch):
    from app.orchestrator.judge import judge_enabled_for

    _env(monkeypatch, NEGO_AI="off", NEGO_JUDGE="1", OPENROUTER_API_KEY="configured")
    assert TestClient(main.app).get("/api/health").json()["judge"] is False
    assert judge_enabled_for("practice") is False
