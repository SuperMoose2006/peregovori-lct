import asyncio

import pytest

from app.avatar.live.adapter import LiveVideoAvatar
from app.avatar.live.config import load as load_config
from app.avatar.live.driver import Persona
from app.avatar.live.stub import StubDriver


def config(**extra):
    return load_config({"NEGO_LIVE_VIDEO": "stub", "NEGO_LIVE_VIDEO_IDLE_TIMEOUT_S": "5",
                        "NEGO_LIVE_VIDEO_MAX_SESSION_S": "20", **extra})


@pytest.mark.asyncio
@pytest.mark.parametrize("input_mode", ["audio", "text"])
@pytest.mark.parametrize("budget,elapsed", [("idle_budget", 6), ("session_budget", 21)])
async def test_video_budget_stops_driver_without_closing_game(budget, elapsed, input_mode):
    cfg = config(NEGO_LIVE_VIDEO_INPUT=input_mode)
    now = [100.0]
    persona = Persona("supplier")
    events = []
    driver = StubDriver(cfg, persona)
    avatar = LiveVideoAvatar(persona, events.append, lambda: driver, cfg, now=lambda: now[0])
    avatar.start()
    try:
        for _ in range(50):
            if avatar.link == "ready": break
            await asyncio.sleep(0.01)
        assert avatar.link == "ready"
        now[0] += elapsed
        avatar._watchdog(now[0])
        assert avatar.link == "dead", "idle/total budget left the paid service connected"
        assert avatar.mode == "amplitude"
        assert any(e.get("detail") == budget for e in events)
        assert any(e.get("error", {}).get("code") == "live_video_budget" for e in events)
        for _ in range(10): await asyncio.sleep(0)
        assert avatar._driver is None
        # New mood changes must not buy another session after budget exhaustion.
        await avatar.set_state("thinking")
        assert avatar.link == "dead"
    finally:
        await avatar.close()


def test_invalid_budget_settings_cannot_disable_the_limits():
    cfg = config(NEGO_LIVE_VIDEO_IDLE_TIMEOUT_S="nan", NEGO_LIVE_VIDEO_MAX_SESSION_S="0")
    assert cfg.idle_timeout_s == 300
    assert cfg.max_session_s == 1800
    assert len(cfg.warnings) == 2


@pytest.mark.asyncio
async def test_activity_extends_idle_but_never_total_budget():
    cfg = config()
    now = [100.0]
    persona = Persona("supplier")
    avatar = LiveVideoAvatar(persona, lambda e: None, lambda: StubDriver(cfg, persona), cfg, now=lambda: now[0])
    avatar.start()
    try:
        avatar._last_activity_at = 104.0
        now[0] = 106.0
        avatar._watchdog(now[0])
        assert avatar.link != "dead"
        avatar._last_activity_at = 120.0
        now[0] = 121.0
        avatar._watchdog(now[0])
        assert avatar.link == "dead"
    finally:
        await avatar.close()
