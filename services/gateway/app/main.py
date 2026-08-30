"""main.py — FastAPI app: WebSocket turn protocol (+ REST fallback).

Wires together the three isolated layers behind the protocol contract:
  engine (deterministic state + scoring)  →  source of truth
  ai.graph.run_opponent (LangGraph)        →  in-character line, or None
  protocol (Pydantic schemas)              →  wire format

Engine↔protocol adaptation lives in app.views (the ONLY place coupled to engine
internals), so this file stays stable as the engine evolves.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path


def _load_dotenv() -> None:
    """Load backend/.env (gitignored) so secrets like OPENAI_API_KEY stay out of
    shell history and command lines. Existing env vars always win."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import engine
from app.session import store
from app import views
from app.protocol import CourseCoachMsg, ScenarioView, StateView, WhatIfMsg

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Пул соединений к OpenRouter живёт столько же, сколько процесс.

    Держать его открытым — не микрооптимизация: холодное TLS-рукопожатие к
    OpenRouter стоит сотни миллисекунд, и они видны напрямую в критическом пути
    судьи. Закрываем на shutdown, иначе `uvicorn --reload` течёт сокетами.
    """
    yield
    from app.providers.openrouter import chat as orchat
    await orchat.aclose()


def _voice_describe() -> str:
    """Кто РЕАЛЬНО распознаёт речь в голосовом режиме.

    В `models.asr` лежит модель запасного пути (chat-completions через
    OpenRouter). После перевода голоса на realtime-сессию OpenAI это поле стало
    ложным: health называл gemini, а слушал gpt-4o-mini-transcribe. Слой,
    который «выглядит настоящим, а внутри другой», — ровно то состояние,
    которого в продукте не бывает; на демо должно быть видно, кто слушает.
    """
    import os

    from app.perception.realtime_voice import MODEL as RT_MODEL, VAD_SILENCE_MS
    from app.providers.routing import model_for

    if os.getenv("NEGO_VOICE", "").strip().lower() == "classic":
        return f"classic (ASR {model_for('asr')} файлом, VAD свой)"
    if os.getenv("OPENAI_REALTIME_KEY", "").strip():
        return f"openai-realtime ({RT_MODEL}, VAD {VAD_SILENCE_MS} мс, потоком)"
    return f"classic (ASR {model_for('asr')} файлом, VAD свой) — ключа realtime нет"


def _tts_describe() -> str | None:
    """Кто сейчас говорит. Тот же порядок, что в endpoint.py — иначе health
    рассказывал бы про одного провайдера, а звучал бы другой."""
    from app.providers.tts.edge import EdgeTTS
    from app.providers.tts.openai_speech import OpenAISpeechTTS
    for provider in (OpenAISpeechTTS(), EdgeTTS()):
        if provider.available():
            return provider.describe()
    return None


app = FastAPI(title="Диалог — Negotiation Simulator API", lifespan=_lifespan)

# --------------------------------------------------------------------- доступ
#
# ПОЧЕМУ ЗАМОК ВООБЩЕ ЕСТЬ. На localhost гейтвей открыт — и это правильно: так
# он и разрабатывается. Но у машины публичный адрес, и как только он выставлен
# наружу по HTTPS, любой прохожий может жечь ключ OpenRouter, который лежит в
# .env рядом. Поэтому: пароль задан переменной → внешние запросы просят его,
# переменная пуста → поведение ровно прежнее, ничего не ломается.
#
# Локальные обращения НЕ проверяются: через них ходят OpenTalking (:8210),
# скриншотные прогоны и сам фронтенд при разработке. Замок стоит на входе с
# улицы, а не между комнатами.
_HTTP_PASSWORD = os.getenv("NEGO_HTTP_PASSWORD", "").strip()
# Список локальных адресов один на весь продукт: его же исключают пределы на
# число партий и на число взглядов (app/realtime/limits.py). Две копии значили
# бы, что однажды одну дверь откроют, а вторую забудут.
from app.realtime.limits import LOCAL_HOSTS as _LOCAL_HOSTS


@app.middleware("http")
async def _gate(request, call_next):
    if _HTTP_PASSWORD and (request.client.host if request.client else "") not in _LOCAL_HOSTS:
        import base64 as _b64
        import hmac as _hmac
        header = request.headers.get("authorization", "")
        ok = False
        if header.startswith("Basic "):
            try:
                # СРАВНИВАЕМ БАЙТЫ, А НЕ СТРОКИ. `compare_digest` на строках
                # отказывается работать с не-ASCII (TypeError), и отказ здесь
                # ловился общим `except` — то есть пароль с русской буквой в
                # `.env` не пускал НИКОГО, отвечая всем честным на вид 401.
                # Заодно исчезает вопрос, что делать с телом, которое вообще не
                # разбирается как UTF-8: до `.decode()` дело не доходит.
                _, _, given = _b64.b64decode(header[6:]).partition(b":")
                ok = _hmac.compare_digest(given, _HTTP_PASSWORD.encode("utf-8"))
            except Exception:
                ok = False
        if not ok:
            from starlette.responses import Response as _Resp
            return _Resp(status_code=401, headers={"WWW-Authenticate": 'Basic realm="Dialog"'})
        # HTTP-middleware НЕ ВИДИТ веб-сокет: у него другой scope, и `/v1/realtime`
        # остался бы открытым настежь — а это самый дорогой вход, он ходит в
        # модели. Браузер не умеет слать заголовок Authorization при рукопожатии
        # сокета, зато шлёт куки того же origin. Поэтому успешная проверка
        # оставляет метку, а сокет проверяет её.
        response = await call_next(request)
        # `secure` ставится по СХЕМЕ ЗАПРОСА, а не константой. Кука `dlg_ok` —
        # это ключ от сокета, то есть предъявитель пароля; без флага браузер
        # отправил бы её и по обычному http на тот же хост, где её видит любой
        # посредник. Жёстко прописать `secure=True` нельзя: стенд с паролем
        # можно поднять и без TLS, и тогда куки не было бы вовсе, а сокет
        # отказывал бы всем.
        response.set_cookie("dlg_ok", _ws_ticket(), httponly=True, samesite="lax",
                            max_age=86400, secure=request.url.scheme == "https")
        return response
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def _validation_error(_request: Request, exc: RequestValidationError):
    """Чем плох запрос: поле и причина. Без присланного значения и без ссылок.

    ПОЧЕМУ ОБРАБОТЧИК СВОЙ. Стандартный ответ FastAPI на 422 кладёт в тело поле
    `input` — то самое, что прислали. Четыреста килобайт мусора в `moves`
    возвращались восемьюстами килобайтами ответа: один кривой запрос покупает
    вдвое больший ответ, и это работает без всякой партии, на голом REST.

    Форма ответа та же, что у сокета (`realtime/endpoint.py::_why`): три первых
    ошибки, `поле: причина`. Правило одно на весь продукт — наружу едет код, а
    не пересказ наших типов и не эхо чужой строки.
    """
    parts = [".".join(str(x) for x in e.get("loc", ())) + ": " + str(e.get("msg", ""))
             for e in exc.errors()[:3]]
    return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "invalid request"})


def _ws_ticket() -> str:
    """Метка «этот браузер уже назвал пароль». Производная от пароля, а не он сам."""
    import hashlib
    return hashlib.sha256(("dlg|" + _HTTP_PASSWORD).encode()).hexdigest()[:32]


# ------------------------------------------------- билет для сокета с ЧУЖОГО origin
#
# ПОЧЕМУ КУКИ МАЛО. Кука `dlg_ok` ставится с `samesite="lax"` и работает ровно
# до тех пор, пока страница и шлюз — один origin. Разведённое развёртывание
# (фронтенд статикой на одном сервере, шлюз на другом) этого условия не
# выполняет: браузер не приложит куку шлюза к сокету, открытому со страницы
# другого домена, — ни при каком CORS. То есть комментарий выше («браузер не
# шлёт Authorization на рукопожатии, зато шлёт куки того же origin») остаётся
# верным только в первой половине: заголовка нет по-прежнему, а куки больше
# нет тоже. Остаётся единственное место, куда браузер пустит наш секрет на
# рукопожатии, — АДРЕС сокета.
#
# Поэтому: страница, уже назвавшая пароль по HTTP, берёт на `/api/auth/ticket`
# короткоживущий билет и предъявляет его в `?ticket=`. Кука никуда не делась и
# проверяется первой — совмещённое развёртывание работает без единой настройки.
#
# ЧТО МЕШАЕТ ПЕРЕИСПОЛЬЗОВАТЬ БИЛЕТ ЧУЖОМУ — честный ответ: только его срок.
# Это ключ на предъявителя, как и `resume`-идентификатор партии. Привязать его
# к адресу нельзя (в метро адрес меняется, и переподключение — главный сценарий
# продукта), к браузеру — нечем: второго секрета у страницы нет. Одноразовым он
# тоже не сделан осознанно: это потребовало бы общей памяти на процесс, а шлюз
# обязан подниматься в нескольких экземплярах и переживать перезапуск, при
# котором живые партии возвращаются через `resume`. Значит защита ровно одна и
# названа числом: билет живёт две минуты — этого хватает открыть сокет сразу
# после проверки пароля и не хватает, чтобы утёкшая строка пригодилась завтра.
# Вторая половина защиты — билет НЕ ПОПАДАЕТ В ЛОГ (см. `_TicketScrubber`):
# адрес сокета uvicorn печатает целиком, и без чистки секрет лежал бы в журнале
# открытым текстом ровно там, где его никто не ищет.
_TICKET_TTL_S = 120


def _ticket_sig(exp: int) -> str:
    """Подпись срока ключом, производным от пароля.

    Срок ВНУТРИ подписи, а не рядом с ней: иначе предъявитель просто переписал
    бы `exp` на год вперёд, и «короткоживущий» билет стал бы вечным.
    """
    import hashlib
    import hmac as _hmac
    return _hmac.new(("dlg-ticket|" + _HTTP_PASSWORD).encode(),
                     str(exp).encode(), hashlib.sha256).hexdigest()[:32]


def mint_ws_ticket() -> str:
    """Билет: срок и подпись. Секрета в нём нет — только производная от него."""
    import time
    exp = int(time.time()) + _TICKET_TTL_S
    return f"{exp}.{_ticket_sig(exp)}"


def _ticket_valid(raw: str) -> bool:
    import hmac as _hmac
    import time
    exp_s, _, sig = (raw or "").partition(".")
    if not sig or not exp_s.isdigit():
        return False
    exp = int(exp_s)
    if exp < time.time():
        return False
    return _hmac.compare_digest(sig.encode("utf-8", "surrogateescape"),
                                _ticket_sig(exp).encode())


class _TicketScrubber(logging.Filter):
    """Билет не должен оставаться в журнале.

    uvicorn печатает адрес сокета целиком (`"WebSocket /v1/realtime?ticket=…"`,
    логгер `uvicorn.error`), а журнал живёт дольше двух минут жизни билета и
    читается людьми, которым пароль не называли. Фильтр правит и `msg`, и
    `args`: строка собирается форматированием уже после нас.
    """
    _RE = re.compile(r"(ticket=)[^&\s\"'\]]+")

    def _clean(self, value):
        return self._RE.sub(r"\1<скрыт>", value) if isinstance(value, str) else value

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._clean(record.msg)
        if isinstance(record.args, dict):
            record.args = {k: self._clean(v) for k, v in record.args.items()}
        elif isinstance(record.args, tuple):
            record.args = tuple(self._clean(a) for a in record.args)
        return True


#: Ставится на логгеры, которые печатают адрес запроса. Фильтр логгера
#: срабатывает там, где запись РОЖДАЕТСЯ, поэтому имена перечислены явно, а не
#: навешаны на корень: до корня запись доезжает уже мимо его фильтров.
for _name in ("uvicorn", "uvicorn.error", "uvicorn.access", "websockets",
              "websockets.server"):
    _logger = logging.getLogger(_name)
    # По имени класса, а не isinstance: перезагрузка модуля (так его проверяют
    # тесты) заводит НОВЫЙ класс, и фильтры копились бы на том же логгере.
    if not any(type(f).__name__ == "_TicketScrubber" for f in _logger.filters):
        _logger.addFilter(_TicketScrubber())


@app.get("/api/auth/ticket")
def ws_ticket_handle() -> dict:
    """Билет на один сокет для страницы с ЧУЖОГО origin.

    Ручка стоит ЗА замком: до неё запрос доходит, только если middleware выше
    уже сверил пароль (или адрес локальный). Своего пароля она не спрашивает и
    не знает.

    Замка нет — билета нет, и это говорится прямо: слой, которого нет, отвечает
    «не требуется», а не выдуманной строкой, которую сокет всё равно не спросит.
    """
    if not _HTTP_PASSWORD:
        return {"required": False, "ticket": None, "expires_in": 0}
    return {"required": True, "ticket": mint_ws_ticket(), "expires_in": _TICKET_TTL_S}


def ws_allowed(websocket: "WebSocket") -> bool:
    """Пускать ли соединение. Локальные — всегда: через них ходит OpenTalking."""
    if not _HTTP_PASSWORD:
        return True
    host = websocket.client.host if websocket.client else ""
    if host in _LOCAL_HOSTS:
        return True
    import hmac as _hmac
    # Байты, а не строки: значение куки приходит с улицы, и `compare_digest`
    # на не-ASCII строке роняет рукопожатие TypeError'ом вместо честного отказа.
    cookie = websocket.cookies.get("dlg_ok", "").encode("utf-8", "surrogateescape")
    if _hmac.compare_digest(cookie, _ws_ticket().encode()):
        return True     # один origin: кука доехала, как и раньше
    return _ticket_valid(websocket.query_params.get("ticket", ""))


# CORS РАЗНЫЙ ДЛЯ СТЕНДА И ДЛЯ РАЗРАБОТКИ, и это не перестраховка.
#
# `allow_origins=["*"]` заводили ради vite на другом порту — и он же уезжал на
# стенд, смотрящий в интернет. Куки там `samesite=lax`, а `allow_credentials` в
# этих двух режимах не включён, поэтому браузер чужого сайта аутентифицированный
# запрос и так не отправит; но разрешение «любому origin читать наши ответы» на
# стенде не нужно НИКОМУ, а объяснять, почему оно безопасно, придётся каждому,
# кто посмотрит.
#
# Пароль задан → стенд: пускаем только свои origin. Пароль пуст → разработка:
# как было. `NEGO_ALLOWED_ORIGINS` перекрывает оба случая — см. ниже.
_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173",
                "http://localhost:5199", "http://127.0.0.1:5199",
                "http://localhost:8010", "http://127.0.0.1:8010"]

#: Origin'ы фронтенда при РАЗВЕДЁННОМ развёртывании: статика на своём сервере,
#: шлюз на своём. Пусто — поведение ровно прежнее (совмещённое развёртывание не
#: требует ни одной настройки), непусто — отвечаем этим адресам поимённо.
#:
#: `allow_credentials=True` идёт в паре с ИМЕНАМИ и только с ними: браузер
#: отвергает учётные данные при `Access-Control-Allow-Origin: *`, поэтому
#: «звёздочка плюс учётные данные» — это не «пошире», а неработающая
#: конфигурация. А учётные данные здесь нужны по-настоящему: страница с чужого
#: домена берёт билет для сокета за паролем.
_ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in
                    os.getenv("NEGO_ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS or (_DEV_ORIGINS if _HTTP_PASSWORD else ["*"]),
    allow_credentials=bool(_ALLOWED_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_TURNS = 12


#: Отпечаток КОДА снимается один раз, при импорте — то есть в момент, когда
#: процесс поднялся с этих файлов. Именно это и спрашивают у здоровья: не «что
#: лежит на диске сейчас» (диск с тех пор мог уехать вперёд), а «с чего этот
#: долгоживущий процесс стартовал».
_CODE_DIGEST: str | None = None


def _code_digest() -> str:
    """Хеш всех `.py` пакета `app`, снятый при старте процесса.

    Считаем ОБХОДОМ КАТАЛОГА, а не по `sys.modules`. Разница решающая: набор
    загруженных модулей зависит от того, что успел импортировать тот, кто
    спрашивает, — ленивые импорты внутри обработчиков попадают в него только
    после первого вызова. Хеш от такого набора расходился бы у двух процессов
    с ОДНИМ И ТЕМ ЖЕ кодом, то есть был бы генератором ложных тревог. Обход
    каталога даёт один и тот же ответ всегда.
    """
    global _CODE_DIGEST
    if _CODE_DIGEST is None:
        import hashlib

        root = os.path.dirname(os.path.abspath(__file__))
        h = hashlib.sha256()
        for path in sorted(_p for _p in __import__("glob").glob(
                os.path.join(root, "**", "*.py"), recursive=True)):
            try:
                with open(path, "rb") as fh:
                    h.update(os.path.relpath(path, root).encode())
                    h.update(fh.read())
            except OSError:
                continue        # файл исчез между обходом и чтением — не повод
                                # ронять здоровье; такой отпечаток просто иной
        _CODE_DIGEST = h.hexdigest()[:12]
    return _CODE_DIGEST


def _build_fingerprint() -> dict:
    """Отпечаток кода, который отвечает ПРЯМО СЕЙЧАС, а не лежит на диске.

    ПОЧЕМУ ОДНИХ СЧЁТЧИКОВ МАЛО. Первая редакция считала только упражнения,
    сценарии и кампании — то есть СОДЕРЖИМОЕ. За один день правок судьи,
    голоса и лицензионных шапок все три числа остались прежними: 90, 9, 2.
    Отпечаток, поставленный ловить «шлюз отвечает позавчерашним кодом», сам
    код и не видел. Поэтому рядом со счётчиками стоит хеш загруженных модулей:
    он меняется от любой правки строки в `app/`.
    """
    from app.course.bank import BANK
    from app.engine.scenarios import SCENARIOS
    from app.engine.campaigns import CAMPAIGNS
    return {
        "exercises": len(BANK),
        "scenarios": len(SCENARIOS),
        "campaigns": len(CAMPAIGNS),
        "code": _code_digest(),
    }


@app.get("/api/health")
def health() -> dict:
    """Проба живости. Фронтенд по ней решает: realtime или офлайн-ядро.

    Раскладка моделей по ролям здесь не для красоты: на демо всегда должно быть
    видно, какой моделью сейчас говорит оппонент. Молчаливая подмена — самый
    неприятный способ узнать, что реплики стали хуже.
    """
    from app.orchestrator.judge import judge_enabled
    from app.providers.openrouter import chat as orchat
    from app.providers.routing import describe as describe_models
    from app.providers.tts.edge import EdgeTTS

    return {
        "ok": True,
        # ЧЕМ ЭТО ОКУПАЕТСЯ. Шлюз — долгоживущий процесс: тот, что раздавал
        # демо, крутился двое с половиной суток и отвечал кодом позавчерашнего
        # дня. Обходчик исправно ходил по нему и рапортовал про сборку, которой
        # уже не существовало. Отпечаток курса — самая быстрая улика: банк
        # растёт почти каждый день, и число упражнений мгновенно показывает,
        # свежий ли процесс. Сверять его — работа прибора, а не человека.
        "build": _build_fingerprint(),
        "cloud_ai": orchat.available(),
        "judge": judge_enabled(),
        "models": describe_models(),
        # Правда о синтезе: на демо должно быть видно, чей это голос.
        "tts": _tts_describe(),
        # Кто слушает: realtime-сессия или запасной путь файлом.
        "voice": _voice_describe(),
    }


@app.get("/api/scenarios")
def scenarios(lang: str = "ru") -> dict:
    lang = "en" if lang == "en" else "ru"
    return {"scenarios": [views.scenario_view(s, lang).model_dump() for s in engine.SCENARIOS]}


@app.get("/api/campaigns")
def campaigns(lang: str = "ru") -> dict:
    from app.engine.campaigns import CAMPAIGNS
    lang = "en" if lang == "en" else "ru"
    return {"campaigns": [views.campaign_view(c, lang).model_dump() for c in CAMPAIGNS]}


@app.get("/api/daily")
def daily(lang: str = "ru", day: str = "") -> dict:
    """Стол дня — один и тот же у всех, каждый день новый.

    `day` (ISO-дата) принимается ЧУЖИМ: часовой пояс знает браузер, а не
    сервер. Без него сервер отвечает по своему UTC-сегодня, и это осознанно
    хуже: игрок в Владивостоке получил бы вчерашний стол. Дату из запроса не
    проверяем на «сегодняшность» — стол дня чистая функция от даты, поэтому
    запрос про прошлый вторник законен и полезен (так его смотрит тест).
    """
    from datetime import date as _date
    from app.engine.daily import daily_table

    lang = "en" if lang == "en" else "ru"
    try:
        d = _date.fromisoformat(day) if day else _date.today()
    except ValueError:
        d = _date.today()

    table = daily_table(d)
    sc = engine.by_id(table.scenario_id)
    return {
        "day": table.day,
        "scenario": views.scenario_view(sc, lang).model_dump(),
        "modifier": {
            "id": table.modifier.id,
            "label": table.modifier.label[lang],
            "note": table.modifier.note[lang],
            "max_turns": table.modifier.max_turns,
            "trust": table.modifier.trust,
            "tension": table.modifier.tension,
        },
    }


#: Предел на кадр, знаков base64. Общий с сокетом: и калибровка, и `input.append`
#: принимают кадры с улицы, и уезжают они в одну и ту же платную модель, — держать
#: два разных числа значит однажды закрыть одну дверь и забыть про вторую.
from app.realtime.session import MAX_FRAME_B64


@app.post("/api/vision/check")
async def vision_check(request: Request, body: dict) -> dict:
    """Годится ли этот кадр для игры: человек в кадре, лицо целиком, света хватает.

    ЗАЧЕМ ОТДЕЛЬНАЯ РУЧКА. Страница проверки оборудования умеет доказать, что
    браузер отдал поток и кадр нарисовался. Она не может доказать главного —
    что модель на этом кадре что-то видит. А жалоба «камера не работает» чаще
    всего означает именно это: поток есть, а в кадре темно или лицо срезано.

    Без ключа — честное «недоступно», а не выдуманный чек-лист: слой, которого
    нет, не притворяется (принцип 2).
    """
    from app.perception.vision import VisionSampler
    from app.providers.openrouter import chat as orchat
    from app.realtime import limits

    lang = "en" if str(body.get("lang")) == "en" else "ru"
    frame = str(body.get("frame") or "")
    if not frame:
        raise HTTPException(status_code=400, detail="no frame")
    if len(frame) > MAX_FRAME_B64:
        raise HTTPException(status_code=413, detail="frame too large")
    if not orchat.available():
        return {"available": False, "reason": "no_key"}
    # Ведро зрения общее с сокетом: обе двери ведут в одну платную модель, и
    # держать два бюджета значило бы закрыть одну и оставить открытой вторую.
    # Отказ отвечает в той же форме, что и «нет ключа», — страница проверки
    # оборудования уже умеет говорить «недоступно» словами.
    if not limits.vision_allowed(request.client.host if request.client else ""):
        return {"available": False, "reason": "rate_limited"}

    sampler = VisionSampler(lang, lambda _e: None, lambda _t: None)
    try:
        result = await sampler.calibrate(frame)
    except Exception:
        # Зрение — украшение, а не механика: не ответило, так и скажем.
        return {"available": False, "reason": "vision_failed"}
    return {"available": True, **result}


# ---- "А что если…" deterministic what-if replay -----------------------------
# The engine is a pure function of (scenario, ordered moves): identical inputs
# give byte-identical state. So we can re-run one pivotal turn with a BETTER line
# and show exactly how the future diverges. No LLM here — the templated
# render_line keeps it instant and reproducible (NEGO_AI=off style), regardless
# of the configured AI backend.

MAX_WHATIF_MOVES = 24     # cap replay length (a game is <= 12 turns anyway)
# Предел реплики в «что если». Меньше, чем предел хода по сокету
# (realtime.session.MAX_TURN_CHARS): там накапливается целый ход, здесь приходит
# одна переписанная реплика.
MAX_WHATIF_TEXT = 800


def _whatif_branch(scenario_id: str, lang: str, prefix: list[str], branch_text: str) -> dict:
    """Replay `prefix` on a FRESH session, then apply one `branch_text` move and
    capture the outcome. Replaying from scratch per branch guarantees the two
    branches share no state — determinism by construction.

    The per-turn sequence mirrors the WS loop exactly (increment turn → analyze →
    apply_move) so a branch that re-uses the original text reproduces the real
    play bit-for-bit, including render_line's turn-seeded line pick."""
    sess = engine.create_session(scenario_id, lang)
    for t in prefix:
        sess.turn += 1
        engine.apply_move(sess, engine.analyze(t), t)
    sess.turn += 1
    analysis = engine.analyze(branch_text)
    result = engine.apply_move(sess, analysis, branch_text)
    line = engine.render_line(sess, result.reaction, result.closed)
    return {
        "text": branch_text,
        "analysis": views.analysis_view(analysis).model_dump(),
        "deltas": views.deltas_view(result).model_dump(),
        "state": views.state_view(sess).model_dump(),
        "opponent_line": line,
    }


@app.post("/api/course/coach")
async def course_coach(request: Request, body: CourseCoachMsg) -> dict:
    """Комментарий тренера к свободному ответу упражнения.

    ЧТО ЭТО НЕ ДЕЛАЕТ: не решает, зачтено ли упражнение. Зачёт — детерминированный
    предикат над `analyze()`, он уже отработал на клиенте. Здесь ИИ добавляет одну
    подсказку по смыслу — то же самое, что судья делает в партии, и через тот же
    промпт, оплаченный живым бейк-оффом.

    Судья выключен, ключа нет, сеть легла, модель ответила мусором → `note: null`,
    и экран просто не показывает карточку тренера. Курс от этого не ломается.
    """
    from app.course.bank import BY_ID as COURSE_BY_ID
    from app.orchestrator.judge import judge_turn
    from app.realtime import limits

    item = COURSE_BY_ID.get(body.exerciseId)
    if item is None or item.get("type") != "freeform":
        raise HTTPException(status_code=400, detail="unknown exercise")

    lang = "en" if body.lang == "en" else "ru"
    text = (body.text or "")[:MAX_WHATIF_TEXT]
    if not text.strip():
        return {"note": None, "techniques": []}

    # Ведро то же, что у хода: кошелёк один, адрес один. Ручка звала судью без
    # единого предела — курс проходят из браузера, значит и жать её можно из
    # браузера в цикле. Отказ выглядит ровно как «модель не ответила», который
    # экран уже умеет показывать: карточки тренера просто нет.
    if not limits.paid_slot(request.client.host if request.client else ""):
        return {"note": None, "techniques": []}

    sc = engine.by_id(item.get("scenario_id") or "") if item.get("scenario_id") else None
    context = item["prompt"][lang]
    if sc is not None:
        context = f"{sc.briefing[lang]} — {context}"
    interests = sc.hidden_interests[lang] if sc is not None else None
    secondary = ([(s.id, s.label[lang]) for s in sc.secondary_issues]
                 if sc is not None and sc.secondary_issues else None)

    # Что от игрока требовалось — берём из САМОГО БАНКА, а не с клиента: клиент
    # присылает только свой вердикт, и подменить требования он не может.
    check = item.get("check") or {}
    require = list(check.get("require_moves") or [])
    task = None
    if body.ok is not None:
        task = {"prompt": item["prompt"][lang], "ok": bool(body.ok), "require": require}

    judgement = await judge_turn(context, text, lang, interests, secondary, task)
    if not judgement:
        return {"note": None, "techniques": []}
    return {"note": judgement.get("note") or None,
            "techniques": judgement.get("techniques") or []}


@app.post("/api/whatif")
def whatif(body: WhatIfMsg) -> dict:
    lang = "en" if body.lang == "en" else "ru"
    if engine.by_id(body.scenarioId) is None:
        raise HTTPException(status_code=400, detail="unknown scenario")

    # Truncate player text like the live turn loop does (defensive, deterministic).
    moves = [(m or "")[:MAX_WHATIF_TEXT] for m in body.moves][:MAX_WHATIF_MOVES]
    alt_text = (body.altText or "")[:MAX_WHATIF_TEXT]

    if not (0 <= body.turnIndex < len(moves)):
        raise HTTPException(status_code=400, detail="turnIndex out of range")

    prefix = moves[: body.turnIndex]          # moves 0..turnIndex-1 (shared pre-turn state)
    original = _whatif_branch(body.scenarioId, lang, prefix, moves[body.turnIndex])
    alternative = _whatif_branch(body.scenarioId, lang, prefix, alt_text)
    return {"turnIndex": body.turnIndex, "original": original, "alternative": alternative}




# ---------------------------------------------------------------------------
# Единственная дверь в партию. Прежняя ручка `/ws` («запрос-ответ») удалена
# вместе с графом LangGraph, который её обслуживал: её покрытие переехало в
# tests/test_realtime_integration.py, а сам протокол — в realtime/events.py.
# ---------------------------------------------------------------------------

# ---- OpenTalking: движок как OpenAI-совместимая модель -----------------------
# Тонкий шов к upstream-стеку (.upstream/opentalking). Он берёт ответы у
# OpenAI-совместимого LLM — значит достаточно им прикинуться, и весь его
# realtime (STT, TTS, WebRTC, перебивание, аватар) работает поверх нашего
# движка БЕЗ единой правки в его коде. См. adapters/opentalking_negotiation.py
# и docs/upstream-patches.md.
_ADAPTERS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ADAPTERS not in sys.path:
    sys.path.insert(0, _ADAPTERS)


def _local_only(request: Request) -> None:
    """Пускать в шов OpenTalking только с этой машины.

    ЧТО ЗДЕСЬ БЫЛО ОТКРЫТО. Две ручки шва — `/v1/chat/completions` и
    `/v1/audio/speech` — не отвечают сами: они ПЕРЕСЫЛАЮТ запрос в OpenRouter
    нашим ключом и возвращают ответ провайдера как есть. Модель и содержимое
    берутся из тела запроса, то есть с улицы. Значит это был не «шов к
    соседнему процессу», а открытый прокси к платному API: любая модель, любой
    промпт, ответ обратно. Замер на живом стенде подтвердил обе ручки.
    Ни `NEGO_AI=off`, ни пределы `realtime/limits.py` их не касались вовсе —
    те стоят на партии, а тут партии нет.

    Единственной защитой оставался пароль. Пароль на показе знают все, кому его
    назвали, а ключ — не их; и ровно этот же пароль обходится любым локальным
    прокси (docs/hosting.md). Дверь, которой пользуется ТОЛЬКО процесс на этой
    машине, не должна быть открыта улице ни при каком пароле.

    404, а не 403: снаружи о существовании шва знать незачем.
    """
    host = request.client.host if request.client else ""
    if host not in _LOCAL_HOSTS:
        raise HTTPException(status_code=404, detail="Not Found")


try:
    from adapters.opentalking_negotiation import router as _opentalking_router
    app.include_router(_opentalking_router, dependencies=[Depends(_local_only)])
except Exception as _exc:  # адаптер опционален: без него продукт работает как раньше
    logging.getLogger(__name__).warning("OpenTalking adapter not mounted: %s", _exc)


@app.websocket("/v1/realtime")
async def realtime(websocket: WebSocket) -> None:
    if not ws_allowed(websocket):
        await websocket.close(code=4401)   # 4401: «назовите пароль на странице»
        return
    from app.realtime.endpoint import realtime_ws
    await realtime_ws(websocket)


# ---- Production: serve the built SPA (single-process deploy) -----------------
# In dev the Vite server serves the frontend and proxies /ws here, so this mount
# is a no-op until `frontend/dist` exists. API/WS routes above always win.
# Корень монорепо: app/ → services/gateway/ → services/ → LCT/.
# Считаем от файла, а не от cwd: uvicorn запускают из разных мест, а
# после переезда backend/ → services/gateway/ путь стал на уровень глубже.
#
# РАЗДАЧА СТАТИКИ — НЕ ОБЯЗАННОСТЬ ШЛЮЗА. Каталога сборки может не быть вовсе:
# бэкенд разворачивают отдельным артефактом, а фронтенд лежит статикой на
# другом сервере (docs/hosting.md). Тогда шлюз поднимается ровно так же и
# обслуживает API — а на `/` отвечает честным «здесь только API», а не
# пятисоткой и не выдуманной страницей. `NEGO_FRONTEND_DIST` позволяет назвать
# каталог сборки явно: в раздельном артефакте `frontend/` рядом нет, а положить
# статику куда-то ещё — законный способ развернуть всё одним процессом.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_DIST = os.path.abspath(os.getenv("NEGO_FRONTEND_DIST", "").strip()
                        or os.path.join(_REPO_ROOT, "frontend", "dist"))
_DIST_REAL = os.path.realpath(_DIST)
SERVES_SPA = os.path.isdir(_DIST)
if SERVES_SPA:
    _ASSETS = os.path.join(_DIST, "assets")
    if os.path.isdir(_ASSETS):
        # Каталог проверяется, а не предполагается: StaticFiles на отсутствующем
        # падает ПРИ ИМПОРТЕ, то есть недособранный фронтенд уносил бы и API.
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # SPA fallback for client-side routes
        # ПУТЬ ОБЯЗАН ОСТАТЬСЯ ВНУТРИ dist. `full_path` приходит с улицы, и
        # `os.path.join(_DIST, "../../services/gateway/.env")` — это настоящий
        # файл: гейтвей раздавал наружу ключ OpenRouter (и `/etc/passwd` тем же
        # запросом). Замок на HTTP спрашивает пароль, но пароль на показе знают
        # все, кому его назвали, а ключ в .env — не их.
        #
        # Проверяем ПОСЛЕ realpath, а не отсечением «..» в строке: символьная
        # ссылка внутри dist ведёт наружу без единой точки в пути.
        #
        # ПОЧЕМУ ЦЕЛИКОМ В try. Сам разбор пути умеет падать: нулевой байт в
        # адресе (`/index.html%00/../..`) роняет `realpath` через
        # ValueError('embedded null byte'), и обстрел получал 500 с
        # питоновским стеком в логе вместо страницы. Утечки не было, но
        # необработанное исключение на внешней поверхности — это ответ «здесь
        # что-то не предусмотрено», приглашающий искать дальше. Любой путь,
        # который не удалось даже разобрать, — просто не файл: отдаём SPA.
        try:
            candidate = os.path.realpath(os.path.join(_DIST, full_path))
            inside = candidate == _DIST_REAL or candidate.startswith(_DIST_REAL + os.sep)
            if full_path and inside and os.path.isfile(candidate):
                return FileResponse(candidate)
        except (ValueError, OSError):
            pass
        return FileResponse(os.path.join(_DIST, "index.html"))


else:

    @app.get("/")
    def api_only() -> dict:
        """Что отвечает шлюз, развёрнутый БЕЗ фронтенда.

        Не 404 и не 500: и то, и другое читается как «сервер сломан», а он
        здоров — просто раздача статики живёт на другом сервере. Ответ называет
        себя и говорит, куда идти дальше; проба живости остаётся там же, где
        была, и `make preflight` от разделения не меняется.

        Остальные пути в этом режиме отвечают обычной 404 FastAPI: SPA-фолбэка
        нет, потому что нет и SPA — четвёртого состояния «выглядит настоящим, а
        внутри пусто» не существует (принцип 2).
        """
        return {
            "ok": True,
            "service": "dialog-gateway",
            "spa": False,          # раздача статики — не на этом сервере
            "health": "/api/health",
            "realtime": "/v1/realtime",
        }
