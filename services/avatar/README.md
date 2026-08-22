# services/avatar — фотореалистичный оппонент с липсинком

Отдельный сервис: **LiveTalking** (Apache-2.0, `36837f90`) с вендоренным внутри
**MuseTalk** (MIT, `0a89dec4`). Поднимается там, где есть CUDA-GPU; гейтвей
говорит с ним по HTTP и WebRTC.

## Почему это отдельный сервис

LiveTalking тянет `torch` под конкретную версию CUDA, `diffusers`, `aiortc` и
несколько гигабайт весов. Гейтвей обязан подниматься за секунду на любой машине
и играть партию без единого из этих гигабайтов — движок, шкалы, реакции и
грейд от GPU не зависят вообще.

Поэтому граница проведена по HTTP: **есть воркер — включили одной переменной,
нет — слой лица честно говорит «недоступно»**, а на его месте работает
провайдер `presence` (состояния персонажа, `app/avatar/presence.py`).

Ровно то же правило, по которому в проекте живут остальные слои: состояния
«выглядит настоящим, а внутри пусто» не бывает.

## Требования

| | |
|---|---|
| GPU | NVIDIA с CUDA (проверялось на 12.8) |
| Python | 3.10–3.12 |
| Диск | ~8 ГБ под веса |
| ОЗУ видеокарты | от 8 ГБ для MuseTalk в 25 fps |

**На машине, где собиралась эта итерация, GPU нет** (`nvidia-smi` отсутствует),
поэтому воркер здесь не запускался. Интеграция написана и проверяется
контрактом со стороны гейтвея (`app/avatar/livetalking.py`), но заявлять
«липсинк работает» без прогона на GPU было бы неправдой — это помечено
`STUB(avatar-webrtc-signalling)` и `STUB(avatar-audio-feed)` в коде.

## Установка

```bash
git clone https://github.com/lipku/LiveTalking.git .
git checkout 36837f90f8db3f59e1d7fcdd111a7db3842515d0   # проверенный коммит

conda create -n livetalking python=3.12 && conda activate livetalking
pip install torch==2.9.1 torchvision==0.24.1 torchaudio==2.9.1 \
    --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt

# веса MuseTalk + вспомогательные модели
bash scripts/download_weights.sh
```

Аватар (внешность оппонента) готовится один раз из видео человека:
см. `docs/` в самом LiveTalking, раздел про `avatars/`.

## Запуск

```bash
python app.py --model musetalk --transport webrtc --listenport 8020
```

## Подключение к гейтвею

```bash
# в services/gateway/.env
NEGO_AVATAR_URL=http://<хост-с-gpu>:8020
```

Больше ничего менять не нужно: `_make_avatar()` в `app/realtime/endpoint.py`
выбирает провайдера по наличию этой переменной, и `capabilities.lipsync`
становится `true` — после чего клиент вправе показывать видеопоток вместо
картинки состояния.

## Что использует гейтвей

| Ручка LiveTalking | Зачем |
|---|---|
| `POST /offer` | согласование WebRTC (SDP) — видеопоток в браузер |
| `POST /human` | текст на озвучку и липсинк |
| `POST /interrupt_talk` | перебивание: погасить очередь звука |
| `POST /set_audiotype` | хореография: какое видео играть, когда молчит |
| `POST /is_speaking` | проверка живости воркера |

Отображение состояний лица на номера хореографии — в
`app/avatar/livetalking.py::STATE_TO_AUDIOTYPE`. Номера соответствуют роликам,
подготовленным в `custom_config` воркера.

## Хореография: какие ролики подготовить

Состояния приходят из **реакции детерминированного движка**
(`app/engine/engine.py`), а не из модели. Минимальный набор:

| Номер | Состояние | Когда |
|---|---|---|
| 0 | idle / listening | молчит, слушает |
| 1 | thinking | судья читает реплику игрока |
| 2 | nod / warm | движок засчитал `persuaded`, `warmed`, `collaborated` |
| 3 | shake_head / annoyed | `not_yet`, `hardened` |
| 4 | lean_back / offended | `pressured`, `offended` |
| 5 | lean_forward | `opened_up` |
| 6 | walk_out | `walked_out` — партия сорвана |

## Лицензии

LiveTalking — Apache-2.0. MuseTalk — MIT (TMElyralab). Оба требуют сохранения
копирайта; исходные заголовки не удаляются. Веса моделей распространяются по
своим условиям — см. их репозитории.
