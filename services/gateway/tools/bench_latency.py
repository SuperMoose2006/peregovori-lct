#!/usr/bin/env python
"""bench_latency.py — замер задержек на живом пути.

Меряет не синтетику, а то, что чувствует человек: сколько проходит от его
реплики до первого звука оппонента, и сколько — от начала его речи до тишины
в колонках при перебивании.

Запуск (гейтвей уже поднят):
    python tools/bench_latency.py --turns 3
    python tools/bench_latency.py --turns 3 --json > /tmp/lat.json

Что печатается — то и уходит в docs/latency.md. Числа из этого файла нельзя
править руками: если они разошлись с реальностью, разошлась реальность.

ЧЕГО ЭТОТ ПРИБОР НЕ МЕРИТ. Он видит ПРОВОД, а не экран. Ушедшее событие не
доказывает нарисованного поля: `turn.analysis` уходил за 3 мс и раньше, а
клиент копил его до реплики оппонента — то есть «разбор через 3 мс» был правдой
про сервер и неправдой про игрока ровно на 1300 мс. Поэтому вехи «видно
игроку» ниже стоят у событий, на которых ОТГРУЖЕННЫЙ клиент рисует поле, и это
соответствие проверяет отдельный прибор — `frontend/test/analysis-latency.test.ts`
прогоняет записанный поток через настоящий транспорт и настоящий reducer.
Здесь — когда событие пришло; там — на каком событии поле появляется. Смешаешь
одно с другим — получишь четвёртую ошибку прибора, и она снова польстит.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import websockets  # noqa: E402

from app.providers.tts.base import Voice  # noqa: E402
from app.providers.tts.edge import EdgeTTS  # noqa: E402

LINES = [
    "Здравствуйте. Скажите, что для вас важнее всего при сдаче этой квартиры?",
    "Понял вас. А если мы возьмём на себя мелкий ремонт, вы сможете подвинуться по цене?",
    "По рынку такие квартиры идут дешевле — давайте опираться на объективные данные.",
    "Хорошо. Тогда фиксируем эту цифру и договор на год?",
]


def percentiles(values: list[float]) -> dict:
    if not values:
        return {}
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "min": round(ordered[0]),
        "median": round(statistics.median(ordered)),
        "max": round(ordered[-1]),
    }


async def measure_text_turns(url: str, turns: int) -> dict:
    """Текстовый ход: разбор → судья → движок → первый токен → первый звук."""
    marks: dict[str, list[float]] = {}

    def note(key: str, value: float) -> None:
        marks.setdefault(key, []).append(value)

    async with websockets.connect(url + "?mode=text", max_size=64 * 1024 * 1024) as ws:
        await ws.recv()  # queue_done
        await ws.send(json.dumps({"type": "session.init", "payload": {
            "scenarioId": "rent", "lang": "ru", "gameMode": "practice",
            "layers": {"voice": True, "avatar": True}}}))
        await ws.recv()  # created

        for i in range(turns):
            line = LINES[i % len(LINES)]
            started = time.perf_counter()
            seen: set[str] = set()
            await ws.send(json.dumps({"type": "input.append", "input": {"text": line}}))
            await ws.send(json.dumps({"type": "input.commit"}))

            done = False
            audio_deadline = None
            # ПОКОЛЕНИЕ ЖИВЁТ ДОЛЬШЕ ТЕКСТА (ARCHITECTURE.md, правило протокола 3):
            # `response.done` значит «модель дописала», а звук играет секундами
            # дольше. Прибор этого не знал: он обрывал ожидание через три
            # секунды после текста, звук предыдущего хода прилетал уже внутри
            # окна следующего — и засчитывался ему с задержкой в единицы
            # миллисекунд. Отсюда «медиана 1 мс при разбросе 0–4404»: два хода
            # из трёх мерили чужой звук.
            #
            # Ровно для этого в протоколе есть generation_id. Берём его из
            # первого текстового куска хода и звук чужого поколения не считаем.
            generation = None
            while True:
                timeout = 3.0 if done else 90.0
                try:
                    event = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                except asyncio.TimeoutError:
                    break
                elapsed = (time.perf_counter() - started) * 1000
                kind = event["type"]

                if kind == "turn.analysis" and "analysis" not in seen:
                    seen.add("analysis")
                    note("разбор движка (детерминированный)", elapsed)
                    # Теги приёмов клиент рисует на этом событии — см. шапку.
                    note("ТЕГИ ПРИЁМОВ ВИДНЫ ИГРОКУ", elapsed)
                elif kind == "engine.state" and "engine" not in seen:
                    seen.add("engine")
                    note("судья + движок посчитали ход", elapsed)
                    # Качество довода — только здесь: до судьи и до apply_move
                    # этого числа не существует, а черновик из turn.analysis не
                    # считал никто.
                    note("качество довода видно игроку", elapsed)
                elif kind == "response.output.delta":
                    gen = event.get("generation_id")
                    if event.get("kind") == "text" and "ttft" not in seen:
                        seen.add("ttft"); generation = gen
                        note("первый токен реплики (TTFT)", elapsed)
                    elif event.get("kind") == "audio" and "audio" not in seen:
                        # Звук РАНЬШЕ первого токена своего же хода невозможен:
                        # синтез идёт по написанному. Значит это хвост прошлого
                        # поколения — он и давал нули в замере.
                        if "ttft" not in seen or gen != generation:
                            continue
                        seen.add("audio"); note("ПЕРВЫЙ ЗВУК ОППОНЕНТА", elapsed)
                elif kind == "response.done":
                    note("текст реплики готов", elapsed)
                    # ТАК БЫЛО. До правки клиент держал весь разбор в буфере и
                    # выкладывал его вместе с репликой оппонента — то есть
                    # теги появлялись здесь, а не на turn.analysis.
                    note("(было) разбор виден игроку", elapsed)
                    done = True
                    # Ждём звук ДОЛЬШЕ текста, а не столько же: синтез начинает
                    # звучать уже после того, как модель дописала.
                    audio_deadline = time.perf_counter() + 8.0
                if done and "audio" in seen:
                    break                     # всё, что мерили, измерено
                if done and audio_deadline and time.perf_counter() > audio_deadline:
                    # Звука не дождались — НИЧЕГО не записываем. Ноль вместо
                    # пропуска врёт убедительнее, чем отсутствие числа.
                    break
            print(f"  ход {i + 1}/{turns} ✓", flush=True)

        await ws.send(json.dumps({"type": "session.close", "reason": "bench"}))
    return {k: percentiles(v) for k, v in marks.items()}


async def measure_barge_in(url: str) -> dict:
    """Перебивание: от начала речи игрока до подтверждённой отмены поколения."""
    tts = EdgeTTS()
    voice = Voice(id="", lang="ru", female=False)

    async def player_pcm(text: str) -> np.ndarray:
        raw = b""
        async for chunk in tts.stream(text, voice):
            raw += chunk
        samples = np.frombuffer(raw, dtype=np.float32)
        resampled = np.interp(np.arange(0, len(samples), 24000 / 16000),
                              np.arange(len(samples)), samples)
        return (np.clip(resampled, -1, 1) * 32767).astype(np.int16)

    opener = await player_pcm(LINES[0])
    cutin = await player_pcm("Секунду, я вас перебью.")

    async with websockets.connect(url + "?mode=voice", max_size=64 * 1024 * 1024) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "session.init", "payload": {
            "scenarioId": "rent", "lang": "ru", "gameMode": "practice",
            "layers": {"voice": True, "avatar": True}}}))
        await ws.recv()

        events: asyncio.Queue = asyncio.Queue()

        async def reader() -> None:
            """Отметка времени снимается ПОСЛЕ `recv()`, а не в том же выражении.

            Здесь стояло `events.put((time.perf_counter(), json.loads(await
            ws.recv())))`. Python вычисляет кортеж слева направо: часы
            считывались ДО ожидания сообщения, то есть каждое событие получало
            время прихода ПРЕДЫДУЩЕГО. Пока события идут очередью (аудиочанки)
            ошибка невелика, но первая веха после паузы смещалась на всю паузу —
            и именно так родилось «VAD заметил начало речи: 0 мс». Ноль был не
            замером, а отметкой, поставленной до того, как ушёл первый кадр
            звука: при исправленном порядке те же клипы дают ~0.99 с и на
            realtime-сессии, и на своём VAD.
            """
            try:
                while True:
                    raw = await ws.recv()
                    await events.put((time.perf_counter(), json.loads(raw)))
            except Exception:
                pass

        pump = asyncio.create_task(reader())

        async def send(pcm: np.ndarray, realtime: bool = True) -> None:
            step = 16000 * 120 // 1000
            for i in range(0, len(pcm), step):
                await ws.send(json.dumps({"type": "input.append", "input": {
                    "audio": base64.b64encode(pcm[i:i + step].tobytes()).decode()}}))
                if realtime:
                    await asyncio.sleep(0.12)

        # 1. Обычный голосовой ход, чтобы оппонент начал говорить.
        speech_started = None
        partial_ms = None      # первая ГИПОТЕЗА — может прийти ещё во время речи
        asr_ms = None          # ОКОНЧАТЕЛЬНАЯ расшифровка
        turn_ms = None
        audio_ms = None
        voice_start = time.perf_counter()
        await send(opener)
        # Момент, когда человек ЗАМОЛЧАЛ. Всё, что после, — это задержка системы;
        # всё, что до, — длительность самой реплики, и мешать их нельзя.
        speech_end = time.perf_counter()
        await send(np.zeros(16000 * 2, dtype=np.int16))

        speaking = False
        deadline = time.perf_counter() + 90
        while time.perf_counter() < deadline:
            try:
                stamp, event = await asyncio.wait_for(events.get(), timeout=20)
            except asyncio.TimeoutError:
                break
            if event["type"] == "user.speech.started" and speech_started is None:
                speech_started = (stamp - voice_start) * 1000
            elif event["type"] == "user.transcript":
                # Realtime-конвейер шлёт гипотезы ПО ХОДУ речи, поэтому частичную
                # и окончательную нельзя мерить одной вехой: первая показывает,
                # когда текст появился на экране, вторая — когда ход можно судить.
                if not event.get("final"):
                    if partial_ms is None:
                        partial_ms = (stamp - voice_start) * 1000
                elif asr_ms is None:
                    asr_ms = (stamp - speech_end) * 1000
            elif event["type"] == "turn.analysis" and turn_ms is None:
                turn_ms = (stamp - speech_end) * 1000
            elif event["type"] == "response.output.delta" and event.get("kind") == "audio":
                if audio_ms is None:
                    audio_ms = (stamp - speech_end) * 1000
                speaking = True
                break

        # 2. Перебивание.
        barge_ms = None
        leaked = 0
        cancelled_gen = None
        if speaking:
            while not events.empty():
                events.get_nowait()
            cut_start = time.perf_counter()
            await send(cutin)
            deadline = time.perf_counter() + 25
            while time.perf_counter() < deadline:
                try:
                    stamp, event = await asyncio.wait_for(events.get(), timeout=8)
                except asyncio.TimeoutError:
                    break
                if event["type"] == "generation.cancelled":
                    barge_ms = (stamp - cut_start) * 1000
                    cancelled_gen = event["generation_id"]
                elif (cancelled_gen and event["type"] == "response.output.delta"
                      and event.get("kind") == "audio"
                      and event.get("generation_id") == cancelled_gen):
                    leaked += 1
                elif event["type"] == "user.transcript" and barge_ms is not None:
                    break

        pump.cancel()
        await ws.send(json.dumps({"type": "session.close", "reason": "bench"}))

    return {
        "длительность реплики игрока": round((speech_end - voice_start) * 1000),
        "VAD: речь замечена (от её начала)": round(speech_started) if speech_started is not None else None,
        "первая гипотеза на экране (от начала речи)": round(partial_ms) if partial_ms else None,
        "расшифровка готова (от конца речи)": round(asr_ms) if asr_ms else None,
        "ПЕРВЫЙ ЗВУК ОТВЕТА (от конца речи)": round(audio_ms) if audio_ms else None,
        "ход дошёл до движка (от конца речи)": round(turn_ms) if turn_ms else None,
        "ПЕРЕБИВАНИЕ: отмена подтверждена": round(barge_ms) if barge_ms else None,
        "чанков просочилось после отмены": leaked,
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="ws://127.0.0.1:8010/v1/realtime")
    parser.add_argument("--turns", type=int, default=3)
    parser.add_argument("--skip-voice", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    print("текстовые ходы…", flush=True)
    text = await measure_text_turns(args.url, args.turns)

    voice: dict = {}
    if not args.skip_voice:
        print("голос и перебивание…", flush=True)
        voice = await measure_barge_in(args.url)

    result = {"turn_ms": text, "voice_ms": voice}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print("\n─── ход (мс от отправки реплики) ───")
    for key, stats in text.items():
        if stats:
            print(f"  {key:42s} медиана {stats['median']:>6}  ({stats['min']}–{stats['max']}, n={stats['n']})")
    if voice:
        print("\n─── голос ───")
        for key, value in voice.items():
            print(f"  {key:42s} {value}")


if __name__ == "__main__":
    asyncio.run(main())
