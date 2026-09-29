// i18n.ts — RU/EN string tables. Ported from legacy-node/public/i18n.js + demo.html.
// Engine/scenario content is localized at the data layer (see data/scenarios.ts).
import type { Lang, ScreenMode } from "./types";
import type { SkillId } from "./lib/progress";
import type { TourSection } from "./lib/tours";
import type { IconName } from "./components/Icon";

export interface QuickMove {
  /** Имя значка (`components/Icon.tsx`). Оно же — ключ, одинаковый для RU и EN:
   *  по нему `tests/test_suggested_lines.py` сверяет обещанный приём с тем, что
   *  видит движок. Раньше этим ключом служил эмодзи в начале ярлыка. */
  icon: IconName;
  label: string;
  text: string;
}

export interface MeterLabels {
  trust: string;
  tension: string;
  info: string;
  leverage: string;
}

export interface Strings {
  tagline: string;
  interruptedRun: string;
  // header sound toggle aria-labels (action-describing: what a tap will do)
  sound: { mute: string; unmute: string };
  eyebrow: string;
  heroTitle: string; // may contain <em> for the accented word
  heroLead: string;
  heroCta: string; // mobile hero primary button → jump to the opponent picker
  // "Why this teaches" — the proof-of-method scroll section under the hero.
  // Each panel grounds one principle in a concrete in-game micro-example; the
  // framing states the honesty guarantee (deterministic engine + scored debrief).
  teach: {
    head: string; // eyebrow above the section
    title: string; // serif headline
    panels: { tag: string; name: string; idea: string; example: string }[];
    framing: string; // one/two-sentence "why it works", confident not salesy
    demoCap: string; // caption under the price-dot micro-animation
  };
  pickHead: string;
  // Разделов навигатора четыре — `ScreenMode`. Пятого режима на проводе
  // (`drill`, капстоун курса) на экране не существует: он показывается
  // экраном курса, а не разделом оболочки.
  modes: Record<ScreenMode, { title: string; desc: string }>;
  theirOffer: string;
  yourTarget: string;
  meters: MeterLabels;
  metersShort: MeterLabels;
  // one-line explanations shown on meter hover/focus (accessible tooltips)
  meterInfo: MeterLabels;
  // deal-tracker (price scale) labels.
  //
  // КАЖДАЯ МЕТКА ШКАЛЫ НАЗВАНА ЧЬЯ ОНА. Раньше подписи были «цель», «красная
  // линия», «старт», и новичок не мог понять, чьё это ограничение — своё или
  // другой стороны. Теперь «ваша» и «их» стоят в каждом имени, а легенда под
  // шкалой перечисляет ВСЁ, что на ней нарисовано.
  tracker: {
    title: string;       // заголовок карточки
    key: string;         // заголовок легенды: «что означают метки»
    target: string;      // ваша цель
    redline: string;     // ваша красная линия
    redlineHint: string; // что она значит — в легенде рядом с именем
    zone: string;        // ваш коридор: от цели до красной линии
    theirOffer: string;  // их цена сейчас
    // headline label once the deal closes — the settled price, not their offer
    settled: string;
    yourOffer: string;   // ваше последнее предложение
    opening: string;     // их стартовая цена
    better: string;      // край шкалы, выгодный вам
    worse: string;       // край шкалы, выгодный им
    hiddenFloor: string; // чего на шкале нет и почему — граница второй стороны
    // Где их цена относительно ВАШИХ границ. Считает `priceStanding` — чистая
    // функция от целей игрока и цены на столе; скрытый floor не участвует.
    status: { beyond: string; zone: string; target: string; settled: string };
    // Путь их цены по ходам — СТРОКОЙ, а не графиком. Прежняя линия без подписи
    // «всё время снижалась», и что она значит, было не понять; строка с двумя
    // числами и направлением однозначна.
    history: string;      // «Их цена по ходам»
    historyMoved: string; // «{from} → {to}: они уступают»
    historyAway: string;  // «{from} → {to}: ушла от вашей цели»
    historyFlat: string;  // «{from}: пока ни шагу навстречу»
  };
  // deal-terms panel (visible logrolling / the "package") — game screen + debrief
  terms: {
    title: string; // panel heading — what the rows ARE, not the jargon
    lead: string; // what to do with the rows, in plain words
    example: string; // a sample line built from THIS table's first issue — {issue}
    howMarked: string; // when a row gets ticked
    onTable: string; // state of an offered issue
    notYet: string; // muted state for an untraded issue
    debriefLabel: string; // "Размен" line label in the debrief
    debriefNone: string; // gentle nudge when tradeable issues went unused
  };
  turn: string;
  // Turn counter framing (item 5b): a BUDGET before the first move ("12 ходов"),
  // then a positive "ход {n} из {max}" once play starts — never "ход 0/12".
  turnBudget: string; // "{n} ходов" — {n} substituted
  turnOf: string;     // "ход {n} из {max}" — {n},{max} substituted
  hint: string;
  // button on a coach hint that drops its worked example into the composer
  useLine: string;
  // placeholder text while the AI coach composes its answer
  hintPending: string;
  quit: string;
  interests: string;
  interestToast: string; // celebratory toast when a hidden interest is uncovered
  coachLabel: string; // inline "coach" tag on the judge's per-turn nudge
  // "graded by meaning" badge — shown beside coaching ONLY when the live semantic
  // judge scored the move (never offline/mock, where it'd overclaim). aria explains
  // the judge scores argumentation by meaning, not keywords.
  judgeBadge: { label: string; aria: string };
  // "judge-cam" chips (item 1): struck-through chip when the LIVE judge flags the
  // line as buzzword-spam / parroting (recognized a pattern, not real meaning).
  // Only ever shown when the live judge ran — the recognized-technique chips reuse
  // the already-localized labels the judge itself returns.
  judgeReject: string;
  typingLabel: string; // opponent "typing…" indicator while a reply is pending
  // Shown INSTEAD of typingLabel while the semantic judge is still reading the
  // player's line. During those seconds the opponent has not started composing —
  // calling it "typing…" would be false, and naming the judge turns the wait into
  // the moment the product's differentiator is visible.
  judgingLabel: string;
  // BATNA РАСШИФРОВАНА ПРИ ПЕРВОМ ПОЯВЛЕНИИ. Голая аббревиатура на столе
  // вызывала один вопрос — «что это?». Имя несёт человеческие слова, а
  // `batnaHint` — зачем это знать.
  batna: string;
  batnaHint: string;
  // mobile: label for the collapsible briefing/BATNA section in the game side strip
  moreLabel: string;
  // retention (localStorage profile): streak chip, card best-grade, debrief record
  streakLabel: string; // "{n}-day streak" ({n} substituted)
  notPlayed: string; // empty best-grade state on a scenario card
  personalBest: string; // debrief: "Personal best"
  newRecord: string; // debrief: "new record!" when the best is beaten
  placeholder: string;
  // Teaching placeholders shown in the composer for a new player's first few turns
  // (concrete technique nudges), then it settles to `placeholder`. RU/EN.
  placeholderNudges: string[];
  send: string;
  argLabel: string;
  // КАЧЕСТВО ДОВОДА ГОТОВО ПОЗЖЕ ТЕГОВ, И ЭТО НАДО СКАЗАТЬ ВСЛУХ.
  // Теги приёмов считает классификатор — они на экране через 3 мс. Число
  // переписывает судья и обрезает штраф за повтор, то есть до конца хода его
  // ПРОСТО НЕТ. `pending` подписывает эту паузу, остальные три называют, КТО
  // в итоге посчитал: подставлять словарный балл под видом судейского нельзя
  // (принцип 2). `{n}` — само число.
  arg: {
    pending: string;
    byJudge: string;
    byEngine: string;
    judgeSilent: string;
  };
  // Ход, от которого не сдвинулась ни одна шкала. Раньше строка дельт в этом
  // случае не рисовалась вовсе, и «движок меня не заметил» читалось так же,
  // как «движок сломан». Ноль — это результат, и он обязан быть подписан.
  deltaNone: string;
  // ДОСЛОВНЫЙ повтор своей же реплики. Движок за него откатывает всё, что ход
  // начислил, и добавляет напряжения: оппонент уже отвечал на эти слова. На
  // экране от этого была видна одна красная плашка «Напр +6» — без причины, да
  // ещё под похвалой судьи, который честно узнаёт в повторе тот же приём.
  // Подпись ставится ТОЛЬКО на посимвольное совпадение: это заведомо жёсткий
  // повтор по мерке движка, поэтому клиент здесь ничего не выдумывает.
  deltaRepeat: string;
  connecting: string;
  usingMock: string;
  // Сервер ОТВЕТИЛ, но ключа модели у него нет (`capabilities.cloud_ai === false`):
  // реплики оппонента приходят из шаблонов движка. Это НЕ то же, что `usingMock`
  // («сервера нет вовсе»), и молчать об этом нельзя — иначе получается четвёртое
  // состояние: выглядит как живая партия, а внутри шаблоны. Второй строкой —
  // почему пугаться нечего: счёт и грейд считает движок, они те же.
  noAiChip: string;
  noAiWhy: string;
  // gentle composer note as the input nears the length cap — "{n}" = chars left
  composerLimit: string;
  // mid-game connection health (reconnect banner / lost-connection panel)
  conn: {
    startFailed: string;
    startFailedBody: string;
    reconnecting: string; // non-blocking banner while retrying a dropped socket
    lostTitle: string; // heading once retries are exhausted
    lostBody: string; // calm explanation + reassurance progress is saved
    retry: string; // restart the scenario (reconnects, or continues offline)
    home: string; // bail to the home screen
    // `session.closed {reason:"taken_over"}` — партию забрал другой сокет
    // (вторая вкладка, второе устройство). Это НЕ обрыв связи, и говорить о ней
    // «переподключаемся» было бы неправдой: переподключаться некуда, партия
    // жива и идёт в другом окне.
    takenOver: string;
  };
  // custom ("Своя сделка") mode
  custom: {
    context: {
      head: string; help: string; sector: string; topic: string;
      opponent_role: string; opponent_goal: string; difficulty: string; style: string;
      styles: { analytical: string; relationship: string; tough: string };
    };
    head: string;
    placeholder: string;
    /** Что именно соберёт генератор и сколько это займёт. Замер бейк-оффа для
     *  дефолтной модели роли `reasoning` — 2.3 с (docs/model-bakeoff.md). */
    promise: string;
    /** Чем «Своя сделка» отличается от «Редактора». Два режима собирают
     *  переговоры, и без этой строки их путали: здесь играете вы сами. */
    vsEditor: string;
    examplesHead: string;
    /** Три готовых описания: заголовок на кнопке, текст — в поле. Конфликты
     *  разного типа (срыв обязательств · доля · цена), чтобы пример не читался
     *  как «сюда пишут только про скидки». */
    examples: { title: string; text: string }[];
    generate: string;
    generating: string;
    generatingSub: string;
    errorHead: string;
    errorSub: string; // reassuring sub-line under the failure head
    timeout: string; // message shown when generation runs past the client timeout
    orPickReady: string; // fallback link → jump to the ready-made scenario picker
    retry: string;
  };
  // exam mode ("Экзамен") — assessment framing
  exam: {
    eyebrow: string; // small "Certificate" kicker above the result
    resultTitle: string; // "Exam result"
    scenarioLabel: string; // "Scenario"
    // Named, printable certificate (passing runs only).
    nameLabel: string; // label above the pre-exam name field
    namePlaceholder: string; // placeholder / default when the field is left blank
    awardedTo: string; // "Выдан" — precedes the certified name on the certificate
    dateLabel: string; // "Дата" — precedes the (browser-side) date
    download: string; // "Скачать / Печать" — triggers window.print()
    certifies: string; // one-line credibility caption on the certificate
    /** Экзамен не сдан: сертификата нет, но результат записан. Говорит Тихон —
     *  он и есть память, а тренера на экзамене не бывает. */
    notAwarded: string;
  };
  // campaign mode ("Кампания") — narrative career arc
  campaign: {
    overviewHead: string; // section head above the arc
    begin: string; // "Begin the climb" (first act)
    continue: string; // "Continue the climb" (later acts)
    nextAct: string; // debrief primary action, non-final act
    seeResults: string; // debrief primary action, final act
    locked: string; // future-act badge
    current: string; // current-act badge
    done: string; // completed-act badge
    reputation: string; // running-reputation chip label
    startFlag: string;  // flag above the current node on the path
    actOf: string; // "Act {n} of {total}" — {n}/{total} substituted
    completeEyebrow: string; // kicker on the completion screen
    completeTitle: string;
    avgLabel: string; // "Average score"
    replay: string; // restart the campaign
    verdicts: Record<string, string>; // grade (A..F) → title
    // Переключатель кампаний: их две, и у каждой свой прогресс.
    pickHead: string;    // заголовок над строкой выбора
    notStarted: string;  // кампания ещё не начата
    finished: string;    // арка пройдена
  };
  // «Ваш следующий шаг» — первая карточка основной колонки. Что показывать,
  // решает chooseNextStep (lib/progress.ts); здесь только слова к пяти ответам.
  // {table} · {block} · {campaign} · {n}/{total} · {grade}/{score} · {diff} · {mod}
  route: {
    head: string;
    firstTitle: string; firstWhy: string; firstCta: string;
    courseTitle: string; courseWhy: string; courseWhyNew: string; courseCta: string;
    rematchTitle: string; rematchWhy: string; rematchCta: string;
    campaignTitle: string; campaignWhy: string; campaignCta: string;
    dailyTitle: string; dailyWhy: string; dailyCta: string;
  };
  // first-turn coach bubble (practice/campaign/custom; withheld in exam).
  // {name} = counterpart name, substituted at render.
  // The debrief's three beats. It used to be one 2750px document; now it is
  // Итог → Что вы упустили → Что сказал бы мастер, one action each.
  beats: { label: string; names: string[]; next: string; more: string; less: string };
  // Виджеты правого рейла оболочки. У каждого, кроме имени, — строка «что это и
  // что с этим делать»: одно имя («Цель дня 0/1») не отвечало ни на один вопрос.
  daily: { title: string; lead: string; best: string };   // best: {grade} {score}
  // Цель дня: поднять можно сразу, опустить — со следующего дня. `rule` стоит
  // рядом с выбором ВСЕГДА, чтобы запрет был виден до нажатия, а не после.
  goal: {
    title: string; count: string; hint: string;  // count: {done} {target}
    rule: string;      // правило выбора — до нажатия
    later: string;     // отложено понижение: {today} {later}
    setNow: string;    // подсказка на кнопке, которая действует сразу: {n}
    setLater: string;  // подсказка на кнопке, которая действует с завтра: {n}
  };
  rank: { title: string; toNext: string; hint: string };  // toNext: "{n} XP до «{rank}»"
  method: { title: string; lead: string; more: string };
  // Две группы рейла и раздел «другие форматы» на главной.
  rail: { progressHead: string; progressNote: string; formatsHead: string; formatsNote: string };
  // Общие слова туров по разделам (components/SectionTour.tsx, lib/tours.ts).
  tour: {
    stepOf: string;   // «Шаг {n} из {total}»
    next: string;
    done: string;
    skip: string;
    replay: string;   // кнопка «показать тур этого раздела»
    dontShow: string; // галочка в карточке тура: отключить ЭТОТ раздел
    // Карточка «Подсказки» в Профиле: общий переключатель и возврат отключённых.
    prefsTitle: string; prefsLead: string; prefsSwitch: string;
    prefsOff: string;     // «Отключены галочкой в разделах: {list}.»
    prefsRestore: string;
    names: Record<TourSection, string>;
  };
  // Туры по разделам (lib/tours.ts). Ключ шага совпадает с id шага в TOURS, и
  // test/tours.test.ts держит, что у каждого шага есть текст на обоих языках.
  tours: Record<TourSection, Record<string, { title: string; body: string }>>;
  // The optional modality layers: the pre-game setup screen, the in-log question
  // and its verdict. Reaction names double as the question's answer options.
  layers: {
    head: string;
    /** Что это вообще такое — первой строкой в профиле. */
    lead: string;
    /** ГДЕ слои работают. Без этой строки тумблер в профиле выглядел мёртвым:
     *  его включали, шли в кампанию — а там слои погашены всегда. */
    where: string;
    /** Что понадобится от браузера — вместо безликого «оценка та же». */
    needs: Record<"voice" | "camera", string>;
    /** Ответ устройства на включение слоя (lib/deviceCheck.ts). */
    check: Record<"voice" | "camera", Record<"checking" | "granted" | "denied" | "missing" | "busy" | "failed", string>>;
    /** Чего у лица собеседника НЕТ — и что это появится позже. */
    avatarLater: string;
    what: string;            // "[i] что это"
    sameGrade: string;       // caption on every toggle — the honesty guarantee
    unavailable: string;     // badge on a layer the environment cannot deliver
    /** Сводка над тумблерами: что здесь не поднимется. Перечисляет ИМЕНА слоёв
     *  и отсылает к причине под каждым — своей причины у неё нет. {list} */
    naSummary: string;
    /** Почему тумблеры заперты. Запрет обязан быть виден словами, а не
     *  отсутствием элемента: режим гасит слои — так и написано. */
    lockedMode: string;      // экзамен/кампания/капстоун/своя сделка
    lockedStarted: string;   // стол уже идёт — слои выбираются до первого хода
    close: string;           // aria-label крестика шторки
    /** Заголовок карточки наблюдений камеры в разборе. */
    seenHead: string;
    /** Подпись под заголовком ленты: зачем она и чего не делает. */
    seenNote: string;
    /** Отметка времени в ленте: наблюдение ДО первого хода. */
    seenStart: string;
    /** Отметка времени в ленте: «после хода {n}». Именно после — кадр приходит
     *  между ходами, и приписывать его следующему, которого ещё не было,
     *  значило бы датировать наблюдение будущим. */
    seenTurn: string;
    /** Отметка на строке ленты, где лицо несло явное выражение. */
    seenTell: string;
    /** «И ещё {n} раньше» — хвост ленты, не поместившийся в карточку. */
    seenMore: string;
    presets: string;
    start: string;
    back: string;
    names: Record<"probe" | "voice" | "camera" | "avatar" | "pokerface", string>;
    blurbs: Record<"probe" | "voice" | "camera" | "avatar" | "pokerface", string>;
    /** Подпись под подвыбором «покерфейса», пока камера выключена. Он считает
     *  по её кадрам, поэтому без неё включать нечего. */
    needsCamera: string;
    presetNames: Record<string, string>;
    /** «сорвались N раз из M кадров» — счётчик «покерфейса» в разборе. */
    tellsOf: string;
    explainHead: string;
    explain: string[];
  };
  // Маскоты. Карл ничего не придумывает — эти строки только про него самого,
  // а всё содержательное он берёт из строки тренера.
  mascot: {
    karl: string;
    tikhon: string;
    rememberTitle: string;   // заголовок карточки Тихона в разборе
    // Подписи к картинкам. Их читает вслух экранный диктор, поэтому они такой
    // же пользовательский текст, как и всё остальное, и переводятся (инвариант 4).
    alt: {
      idle: string; think: string; cheer: string; concern: string;
      point: string; celebrate: string; sad: string;
      /** Поза «изучает данные» — лента наблюдений камеры в разборе. */
      study: string;
      /** «Данных нет»: пустой профиль, недоступные слои. */
      shrug: string;
      /** Досада на ОДИН грубый ход — не срыв переговоров. */
      oops: string;
      /** Дремлет: серия жива, но сегодня за стол ещё не садились. */
      doze: string;
    };
  };
  /**
   * Карточка серии в рейле. Полоска «серии» в шапке говорит, сколько дней подряд
   * игрок возвращался, и молчит о единственном, что от него сейчас зависит:
   * засчитан ли СЕГОДНЯШНИЙ день. Строки ниже — по одной на каждый ответ
   * `streakView` (lib/progress.ts), другого источника у карточки нет.
   */
  streak: {
    title: string;
    hint: string;     // что именно считается днём серии
    kept: string;     // день уже засчитан — {n} {form}
    waiting: string;  // серия жива, сегодня партии не было — {n} {form}
    shielded: string; // пропуск покроет заморозка — {n} в запасе
    lost: string;     // серия прервана
    away: string;     // прервана, и перерыв длинный — {n} {form}
  };
  // Полоса живых слоёв под композером.
  /** Встреча с крупным собеседником: тренировка с голосом (lib/meeting.ts). */
  meeting: {
    title: string;
    status: Record<"connecting" | "reconnecting" | "lost" | "speaking" | "hearing" | "thinking" | "listening", string>;
    /** Стенд подписан как стенд: `capabilities.avatar.synthetic`. */
    testStream: string;
    micOff: string; micOn: string; micMuted: string; noMic: string;
    interrupt: string; text: string; end: string;
    soundBlocked: string; soundOn: string;
  };
  live: {
    micOn: string; hearing: string; interrupt: string;
    inFrame: string; outFrame: string; peekNote: string; peekOpen: string;
    seen: string;
    // Слой просили, но устройство не встало. Переключатель включён, а внутри
    // пусто — запрещённое состояние; поэтому у него есть свои слова.
    offVoice: string; offCamera: string; offHow: string;
  };
  probe: {
    ask: string;             // "Что с ним сейчас происходит?"
    readFace: string;        // label above the enlarged portrait
    blocked: string;         // composer placeholder while the question is open
    tally: string;           // "прочитано {n} из {m}"
    right: string;
    wrong: string;
    // reaction id -> the short label shown as an answer option
    reactions: Record<string, string>;
    // reaction id -> one line explaining why it was that, shown after a miss
    why: Record<string, string>;
    debriefHead: string;     // "Как вы читали оппонента"
    observation: string;     // shared badge: "наблюдение · не влияет на оценку"
  };
  // Режим «Чтение стола»: человек смотрит ЧУЖУЮ партию по ходам и отвечает, как
  // ответит вторая сторона. Ярлыков реакций здесь НЕТ намеренно — они живут в
  // `probe.reactions`, и вторая копия того же словаря разошлась бы с первой.
  /** Режим «Обратная сторона стола»: тот же стол, вторая сторона. */
  otherSide: {
    title: string;
    cardLead: string;
    cardCta: string;
    /* Плашка честности наоборот: этот режим В ГРЕЙД ВХОДИТ, и сказать об этом
       надо так же громко, как «Чтение стола» говорит обратное. */
    scored: string;
    sheetLead: string;
    youBecome: string;
    origin: string;
    defendTitle: string;
    defendLead: string;
    play: string;
    /* Разбор */
    debriefTitle: string;
    seat: string;
    blindTitle: string;
    windowsTitle: string;
    windowsNone: string;
    mascotAlt: string;
    close: string;
  };
  reading: {
    title: string;
    cardLead: string;
    cardProgress: string;
    cardCta: string;
    /* Плашка честности: режим не партия и в грейд не входит (инвариант 6). */
    notScored: string;
    gameOf: string;
    turnOf: string;
    turnsN: string;
    watching: string;
    /* Что именно читать в реплике — подсказка ДО ответа, без ответа. */
    lookFor: string;
    ask: string;
    askNone: string;
    exact: string;
    near: string;
    miss: string;
    yourAnswer: string;
    engineSaid: string;
    evidence: string;
    noTags: string;
    argq: string;
    effect: string;
    noMove: string;
    gate: string;
    revealed: string;
    next: string;
    tally: string;
    grade: string;
    endAgreement: string;
    endBreakdown: string;
    endOpen: string;
    missedHead: string;
    again: string;
    nextGame: string;
    close: string;
    tikhonTitle: string;
    best: string;
    a11y: { close: string; table: string };
  };
  // Левое меню оболочки. Только те пункты, что
  // correspond to something the product actually has — inventing a shop or a
  // leaderboard here would advertise what does not exist.
  nav: {
    admin: string;
    training: string;
    campaign: string;
    custom: string;
    course: string;
    exam: string;
    progress: string;
    profile: string;
  };
  // Курс приёмов: блоки, уроки, десять типов заданий, капстоун и экзамен блока.
  // Ярлыки приёмов и реакций берутся из тех же ключей, что и в движке, —
  // чтобы разбор упражнения говорил ровно то же, что чип под репликой.
  course: {
    title: string; lead: string; blocksDone: string; blockOf: string; toTable: string;
    /** Что внутри курса — строкой на карточке главной. */
    cardLead: string;
    /* Состояние узла — только для диктора: значок помечен aria-hidden. */
    blockDone: string; blockOpen: string; blockLocked: string;
    allBlocks: string; tasksN: string; taskForms: [string, string, string]; theory: string;
    examTitle: string; examLead: string; examBest: string; examPassed: string;
    examStart: string; examMode: string; examFinish: string; examPass: string;
    examFail: string; examResult: string;
    toTasks: string; lessonDone: string; lessonComplete: string; lessonScore: string;
    /* Заголовок набора заданий — только для диктора: на экране его место
       занимают полоса прогресса и счётчик «задание N из M». */
    tasksTitle: string;
    stepOf: string; next: string; checkIt: string; correct: string; wrong: string;
    /* Подписи стрелок в упражнении «порядок»: для диктора «↑» именем не является. */
    moveUp: string; moveDown: string;
    /* Частичный зачёт у «порядка» и «соответствия»: «3 из 5 уже на месте». */
    hits: string;
    /* Подпись к лицу в упражнении «face». НЕ описывает выражение: картинка
       выводится из ответа, и описание было бы подсказкой. */
    faceAlt: string;
    reference: string; freeformHint: string; matchHint: string; examQuit: string;
    /** Подсказка про цифровые клавиши над списком вариантов. */
    optKeys: string;
    recoveryTitle: string; nextUp: string; continue: string; actTeaches: string;
    coachNote: string;
    masterTitle: string; masterLead: string; masterLocked: string; masterStart: string;
    masterAgain: string; masterAbout: string; masterNext: string; masterPassed: string;
    masterPassedBody: string; masterKarlPass: string; masterKarlFail: string;
    masterProgress: string; masterDrillPass: string; masterDrillFail: string;
    warmupTitle: string; warmupSkip: string; warmupReady: string; warmupToTable: string;
    warmupKarl: string; warmupCta: string;
    redoTitle: string; redoDone: string; redoKarl: string; trainThis: string;
    drillStart: string; drillNote: string; drillPass: string; drillFail: string;
    backToCourse: string;
    karlTheory: string; karlPerfect: string; karlOk: string;
    karlExamPass: string; karlExamFail: string;
    tikhonTitle: string; tikhonBody: string;
    types: Record<string, string>;
    meters: Record<string, string>;
    // Ярлыков реакций здесь НЕТ намеренно: они живут в `probe.reactions` и
    // используются оттуда же. Две копии одного словаря разошлись бы — и урок
    // называл бы состояние иначе, чем подпись под портретом в партии.
    moves: Record<string, string>;
    why: { missing: string; missingAny: string; forbidden: string; missingTerm: string;
           tooShort: string; weak: string; noNumber: string; generic: string };
  };
  // "Table setting" card filling the empty chat at turn 0. The opening frame a
  // juror stares at longest, and the moment a first-timer decides whether they
  // know what to do — so it states the scene and offers three real first lines.
  opening: {
    title: string;
    // "{role} Напротив — {name}. Её цена: {offer}. …" — `role` is ALREADY a full
    // sentence in the player's voice ("Вы — менеджер по закупкам: …"), so the
    // template must not prefix it with another "Вы —".
    scene: string;
    hint: string;   // one line on what a strong opening does
    lines: { icon: IconName; tag: string; text: string }[];
  };
  // Подсветка одного элемента на столе (только практика и только первый раз).
  // Каждая подсказка привязана к НАСТОЯЩЕМУ событию движка. Модальной вводной
  // «Добро пожаловать за стол» больше нет — она всплывала поверх первого ответа
  // оппонента.
  onboarding: {
    skip: string;  // «пропустить» — доступно всегда
    gotIt: string; // закрыть подсказку
    interestTitle: string;
    interestBody: string;
    dealTitle: string;
    dealBody: string;
    // ГАРАНТИРОВАННЫЙ шаг. Два предыдущих ждут удачи игрока: интерес вскрыт,
    // цена поехала. У новичка, который жмёт наугад, за всю партию не случается
    // ни того, ни другого — и вводной он не видит вовсе. Этот шаг привязан к
    // событию, которое случается ВСЕГДА: первый ход сделан.
    firstTitle: string;
    // «{gain} … спросите про «{topic}»» — тема берётся из невскрытого слота на
    // рельсе, то есть из того, на что подсказка и показывает.
    firstBody: string;
    firstGain: string;     // «Информация +{n} — этого мало.»
    firstGainNone: string; // ни одна шкала не двинулась
  };
  // debrief
  turningPoints: { title: string; turn: string }; // "Ключевые ходы" / "Ход {n}"
  // «С той стороны стола»: ход за ходом глазами оппонента. ТЕКСТ РЕПЛИК СЮДА НЕ
  // ВХОДИТ — его собирает движок на языке партии (views.her_side и его зеркало
  // в mock/engine.ts), потому что он зависит от персоны и от того, что случилось
  // за столом. Здесь только рама: заголовок, подписи, ярлык хода.
  herSide: {
    title: string;
    // Одна строка под заголовком. {name} стоит ПЕРВЫМ и в именительном: «глазами
    // {name}» требовало бы родительного падежа, а склонять чужую строку нечем.
    lead: string;
    turn: string;        // "Ход"
    you: string;         // "Вы" — подпись над цитатой игрока
    missedTitle: string; // "Чего вы так и не узнали"
    mascotAlt: string;   // подпись к картинке Тихона для диктора
  };
  // "Что сказал бы мастер" (item 3): on the single weakest turning point, a
  // side-by-side of the player's line vs a principled master reformulation. The
  // SELECTION (weak turn + missing technique) is an engine fact; the reformulation
  // is a quality Harvard/SPIN template keyed to what the debrief shows was missing.
  // Move tags shown under the player's line. Both engines hardcode their labels
  // in ONE language (the backend in English, the mock in Russian), so the client
  // localizes by the tag's stable `key` and treats the server label as a
  // fallback for keys it does not know.
  tagLabels: {
    spinSituation: string;
    spinProblem: string;
    spinImplication: string;
    spinNeedPayoff: string;
    question: string;    // an open question that is not a SPIN stage
    interests: string;
    empathy: string;
    criteria: string;
    batna: string;
    tradeoff: string;
    threat: string;
    hostile: string;
    concession: string;
    anchor: string;
    accept: string;
    rapport: string;
    offer: string;
  };
  // Debrief reveal: what the counterpart was actually protecting. Deterministic,
  // shown offline too — unlike `mentor` below.
  reveal: {
    title: string;
    found: string;   // badge on an interest the player drew out
    missed: string;  // badge on one they never asked about
    allFound: string;  // line under a clean sweep
    noneFound: string; // line when they surfaced nothing
  };
  // The AI mentor's closing word on the debrief. Rendered only when the backend
  // sent one (live AI); offline the engine's tips carry the debrief alone.
  mentor: {
    title: string;     // "Слово наставника"
    strength: string;  // label above the one thing that worked
    growth: string;    // label above the one thing to change next time
  };
  master: {
    title: string;   // "Что сказал бы мастер"
    yours: string;   // "Ваша реплика"
    label: string;   // "Мастер" (the quoted reformulation's speaker)
    why: string;     // one-line rationale prefix under the master line
    // reformulations keyed to the missing technique (picked by priority)
    criteria: string;  // objective_criteria === 0 → cite a market criterion
    interest: string;  // interests_found < interests_total → probe an interest
    tradeoff: string;  // tradeoffs === 0 → propose a logroll
    threat: string;    // threats > 0 → reframe off the threat
    // rationale tails matching each reformulation
    whyCriteria: string;
    whyInterest: string;
    whyTradeoff: string;
    whyThreat: string;
  };
  // Technique-floor explanation (item 4): one honest line when a great price is
  // capped by thin method (technique < 45 & economic high) — the "price ≠ grade" rule.
  techniqueFloor: string;
  // "А что если…" — the what-if replay card in the debrief.
  whatIf: {
    title: string; // section heading
    teaser: string; // inviting one-liner at the hoisted top of the card ("Один ход решал всё →")
    intro: string; // "Вы надавили здесь. Смотрите, что было бы иначе."
    reveal: string; // button to run the replay
    loading: string; // in-flight label
    again: string; // reset to try a different alt line
    altLabel: string; // "Сильная альтернатива" (chooser label)
    customPlaceholder: string; // free-text alt input
    wasLabel: string; // column: "Как было"
    couldLabel: string; // column: "Как могло быть"
    opponentLabel: string; // "Ответ оппонента"
    offerLabel: string; // "Их цена"
    meters: { trust: string; tension: string; info: string };
    betterBanner: string; // shown when the alt is genuinely better
    neutralBanner: string; // honest fallback when it isn't clearly better
    insteadOf: string; // "вместо" — "tension −3 instead of +22"
    uncovered: string; // "вы бы вскрыли интерес"
    trustHigher: string; // "доверие выше"
    priceFurther: string; // "цена сдвинулась дальше"
    unavailable: string; // graceful note when the replay can't be computed
    presets: [string, string]; // two strong preset alternatives
    mobileCta: string; // mobile-only: tap-to-expand the collapsed what-if card
  };
  // «Переиграй партию против себя вчерашнего» — сравнение с ВАШЕЙ прошлой
  // попыткой за тем же столом. Считает движок; в экзамене этого нет вовсе.
  rematch: {
    // карточка-предложение в разборе
    offerTitle: string;
    offerBody: string;   // {grade} {score} {deal} — итог сохранённой партии
    offerSame: string;   // эта партия и стала соперником (первая за столом)
    cta: string;         // главное действие разбора
    // панель за столом
    title: string;
    open: string;        // подпись кнопки, открывающей панель
    close: string;
    then: string;        // «Вы тогда»
    now: string;         // «Вы сейчас»
    turn: string;        // «Ход {n}»
    resultThen: string;  // «Итог тогда»
    nextThen: string;    // «Тогда следующим ходом вы сказали»
    noMoveYet: string;   // ход ещё не сделан
    pastEnded: string;   // прошлая партия здесь уже кончилась
    price: string;
    ahead: string;       // «лучше, чем тогда»
    behind: string;      // «хуже, чем тогда»
    even: string;        // «как тогда»
    byTurns: string;     // заголовок нижней части: расхождение по ходам
    differentTable: string; // стартовые условия столов разошлись — честная оговорка
  };
  debriefTitle: string;
  coachTitle: string;
  // Тихон в разборе: сравнение с ВАШЕЙ прошлой попыткой на этом же столе.
  lastTime: string;
  retry: string;
  toHome: string;
  outcome: {
    agreement: string; breakdown: string; active: string;
    // The table's closing beat reuses agreement/breakdown above; `see` is the
    // primary action on it and `preparing` its waiting state while the debrief
    // (and the AI mentor's closing word) is still being built.
    see: string; preparing: string;
  };
  sb: { economic: string; relationship: string; technique: string };
  stat: {
    spin: string;
    criteria: string;
    empathy: string;
    interests: string;
    tradeoffs: string;
    threats: string;
    arg: string;
  };
  // Счётные формы [1, 2–4, 5+]. Родительный падеж под цифрой давал «1 критериев»
  // и «1 игр» — тренажёр, который учит формулировкам, так писать не может.
  // Английский передаёт две одинаковые формы множественного: вызывающая сторона
  // от языка не зависит.
  forms: {
    chars: [string, string, string];
    games: [string, string, string];
    days: [string, string, string];
    turns: [string, string, string];
  };
  statForms: {
    criteria: [string, string, string];
    empathy: [string, string, string];
    tradeoffs: [string, string, string];
    threats: [string, string, string];
  };
  footRight: string;
  quickMoves: QuickMove[];
  // gamification (localStorage): XP/ranks, daily goal, skill mastery, achievements
  gam: {
    rankLabel: string; // "rank" kicker
    toNext: string; // "{n} XP to «{name}»" ({n},{name} substituted)
    maxRank: string; // top-rank state instead of a "to next" line
    totalXp: string; // "{n} XP" total-xp chip
    levelUp: string; // "level up!" flourish on the debrief
    xpAwardLabel: string; // caption under the +XP count-up
    xpAwardFailed: string; // sober caption when the negotiation collapsed
    lowData: string; // skill bar shown before 2 games of data exist
    dailyGoal: string; // ring label
    dailyDone: string; // goal met today
    dailyTodo: string; // goal still open today
    dailyProgress: string; // "{done}/{target}" progress under the ring
    dailyTargetLabel: string; // aria/label for the 1/2/3 target selector
    dailyTargetSet: string; // "{n}/day" title on a target button ({n} substituted)
    freezeLabel: string; // "заморозка ×{n}" — the {word} in the chip
    freezeSaved: string; // gentle note the day a freeze saved the streak
    streakSkipped: string; // honest note: a D/F run didn't count toward the mastery streak
    // near-full-screen milestone celebration (7-day streak, rank-up)
    milestone: {
      kicker: string; // small eyebrow over the card
      dismiss: string; // primary "continue" button
      streakTitle: string; // "{n} days in a row" ({n} substituted)
      streakDetail: string; // supporting line under a streak milestone
      streakUnit: string; // word under the big count-up ("days")
      rankKicker: string; // "New rank"
      rankDetail: string; // supporting line under a rank-up
      rankUnit: string; // word under the big XP count-up ("XP")
    };
    skillsTitle: string; // profile screen heading
    skillsLink: string; // home entry point to the profile
    skillsSub: string; // profile screen subheading
    strongIn: string; // "Strong at"
    workOn: string; // "Work on"
    noGames: string; // empty-state on the profile
    back: string; // back to home
    gamesCount: string; // "{n} games" under a skill bar
    achievementsTitle: string;
    unlockedToast: string; // toast prefix when a badge unlocks
    locked: string; // aria/title for a not-yet-earned badge
    skillNames: Record<SkillId, string>;
    skillHints: Record<SkillId, string>;
  };
  // Рост во времени: история партий и вывод о тенденции (lib/growth.ts).
  // Отдельно от `gam`, потому что отвечает на другой вопрос: `gam` — «сколько у
  // меня сейчас», здесь — «стало ли лучше, чем было».
  growth: {
    title: string; // заголовок карточки
    sub: string; // одна строка о том, откуда числа
    lowTitle: string; // мало данных — заголовок
    lowBody: string; // «сыграно {played} из {need}» + почему не рисуем линию
    // Имя полоски «сколько уже есть». Роль `progressbar` без имени диктор
    // читает как «индикатор, 3» — число без единого слова о том, чего три.
    lowAria: string; // «Сыграно {played} из {need} партий»
    windowNote: string; // «последние {n} {form} · {from} — {to}»
    overallLabel: string; // подпись графика
    dirUp: string; // вердикт: растёт
    dirDown: string; // вердикт: просел
    dirFlat: string; // вердикт: без изменений
    thenNow: string; // «{before} → {after}»
    noise: string; // «разница {delta} не выходит за разброс {threshold}»
    grew: string; // «разница {delta} при разбросе {threshold}»
    movedUp: string; // «Сильнее всего вырос»
    movedDown: string; // «Просел»
    noMoves: string; // ни один навык не вышел за разброс
    chartAria: string; // описание графика для скринридера
    notScored: string; // история в оценку не входит
    skillsHead: string; // подзаголовок над шестью строками навыков
  };
  // Screen-reader labels for non-textual UI (meters/rings/scales/log). Templates
  // use {name}-style tokens substituted at render.
  a11y: {
    chatLog: string;      // aria-label for the chat-log live region
    gameHeading: string;  // sr-only game-screen heading — "{name}" substituted
    grade: string;        // debrief grade ring — "{grade}"/"{score}" substituted
    scoreBar: string;     // a score bar — "{label}"/"{v}" substituted
    deal: string;         // deal-tracker summary — target/redline/offer substituted
    delta: string;        // a per-turn meter delta chip — "{label}"/"{value}"
    nav: string;          // aria-label левого меню
    stats: string;        // aria-label полосы счётчиков
    hud: string;          // aria-label for the always-visible meter strip
    skip: string;         // ссылка «к содержимому» — первая остановка Tab
    speaking: string;     // индикатор речи оппонента рядом с лицом
    amplitudeAnimation: string;
    send: string;         // главная кнопка композера
    dismiss: string;      // крестик карточки тренера в ленте
    themeDark: string;    // переключатель темы, сейчас включена тёмная
    themeLight: string;   // переключатель темы, сейчас включена светлая
  };
}

export const I18N: Record<Lang, Strings> = {
  ru: {
    tagline: "тренажёр переговоров",
    interruptedRun: "Страница была закрыта во время партии. Эта партия не восстановлена и не засчитана как завершённая. Начните новую тренировку.",
    sound: { mute: "Выключить звук", unmute: "Включить звук" },
    eyebrow: "Гарвардский метод · SPIN · BATNA",
    heroTitle: "Учитесь <em>договариваться</em> — за столом, а не по учебнику.",
    heroCta: "Начать переговоры",
    heroLead:
      "Живой диалог с ИИ-оппонентом, у которого есть скрытые интересы, красная линия и характер. Исход зависит от вашей стратегии, формулировок и аргументов — каждая реплика разбирается в реальном времени.",
    teach: {
      head: "Почему это учит",
      title: "Не тренинг по слайдам — стол, где решает метод.",
      panels: [
        {
          tag: "SPIN",
          name: "Позиции ≠ интересы",
          idea: "За жёсткой позицией всегда стоит интерес. Найдите его вопросом — и появится, о чём договариваться.",
          example:
            "Не «дайте скидку», а «почему для вас важен объём?» → интерес вскрыт, шкала «Информация» растёт, и их цена двигается — без давления.",
        },
        {
          tag: "Гарвард",
          name: "Объективные критерии",
          idea: "Спор мнений выигрывает тот, кто громче. Спор по критерию — тот, кто прав.",
          example:
            "«По рыночным данным справедливая ставка — X» → это законный рычаг: шкала «Рычаг» растёт, а уступка не выглядит капитуляцией.",
        },
        {
          tag: "Гарвард",
          name: "Размен создаёт ценность",
          idea: "Уступайте то, что дёшево для вас, но ценно для них. Так из одной суммы получаются две победы.",
          example:
            "«Если подвинемся по срокам — сможете по цене?» → размен (логроллинг) двигает сделку там, где лобовой торг застревает.",
        },
        {
          tag: "BATNA",
          name: "Запасной вариант как рычаг",
          idea: "Ваша лучшая альтернатива — источник спокойствия, а не дубина.",
          example:
            "Знаете свой запасной вариант — торгуетесь увереннее. Но угроза «уйду» в лоб бьёт по доверию: BATNA — рычаг, а не таран.",
        },
      ],
      framing:
        "Здесь не победить общими словами: исход считает детерминированный движок, а каждую реплику разбирают по смыслу — по стратегии, формулировке и аргументу. В конце вы получаете честную, воспроизводимую оценку с грейдом и разбором ключевых ходов.",
      demoCap: "Вскрыли интерес — их цена поехала к вашей цели.",
    },
    pickHead: "Все ситуации для тренировки",
    modes: {
      practice: { title: "Практика", desc: "Один сценарий из библиотеки. Подсказки включены." },
      campaign: { title: "Кампания", desc: "Сюжетная карьерная арка, последствия переносятся." },
      custom: { title: "Своя сделка", desc: "Генерация сценария под вашу ситуацию." },
      exam: { title: "Экзамен", desc: "Без подсказок. Оценка, сертификат, рейтинг." },
    },
    theirOffer: "их цена",
    yourTarget: "ваша цель",
    meters: { trust: "Доверие", tension: "Напряжение", info: "Информация", leverage: "Рычаг" },
    metersShort: { trust: "Дов", tension: "Напр", info: "Инфо", leverage: "Рыч" },
    meterInfo: {
      trust: "Доверие: растёт от эмпатии и честной аргументации, падает от давления и угроз.",
      tension: "Напряжение: растёт от давления, угроз и грубости; спадает, когда вы признаёте интересы.",
      info: "Информация: растёт, когда вы вскрываете скрытые интересы вопросами (SPIN).",
      leverage: "Рычаг: растёт, когда вы опираетесь на объективные критерии и на свой запасной вариант (BATNA), а не на эмоции.",
    },
    tracker: {
      title: "Цена сделки",
      key: "Что означают метки",
      target: "Ваша цель",
      redline: "Ваша красная линия",
      redlineHint: "хуже этой цены не соглашайтесь",
      zone: "Ваш коридор: от цели до красной линии",
      theirOffer: "Их цена сейчас",
      settled: "Сделка",
      yourOffer: "Ваше последнее предложение",
      opening: "Их стартовая цена",
      better: "выгоднее вам",
      worse: "выгоднее им",
      hiddenFloor: "Границу другой стороны вам не показывают — её выясняют в разговоре.",
      status: {
        beyond: "Их цена хуже вашей красной линии ({red}). На таких условиях соглашаться не стоит — добивайтесь уступок.",
        zone: "Их цена уже в вашем коридоре: такая сделка вам выгодна. Можно дожимать к цели ({target}).",
        target: "Их цена не хуже вашей цели ({target}) — можно закрывать сделку.",
        settled: "Сделка закрыта по цене {deal}.",
      },
      history: "Их цена по ходам",
      historyMoved: "{from} → {to}: они уступают, цена идёт к вашей цели.",
      historyAway: "{from} → {to}: цена ушла дальше от вашей цели.",
      historyFlat: "{from}: пока ни шагу вам навстречу.",
    },
    terms: {
      title: "Что можно предложить взамен",
      lead: "Кроме цены, другой стороне важны и другие условия. Ниже — то, что вы можете им дать. Предложите что-то одно в обмен на уступку по цене: так цена двигается без давления.",
      example: "Например: «Если мы согласимся на {issue}, вы подвинетесь по цене?»",
      howMarked: "Строка отметится, когда вы сами предложите это в разговоре.",
      onTable: "предложено",
      notYet: "ещё не предлагали",
      debriefLabel: "Размен",
      debriefNone: "Вы не использовали размен — это упущенная ценность.",
    },
    turn: "ход",
    turnBudget: "{n} ходов",
    turnOf: "ход {n} из {max}",
    hint: "подсказка",
    useLine: "Вставить",
    hintPending: "Коуч подбирает реплику…",
    quit: "выйти",
    interests: "Скрытые интересы",
    interestToast: "Вы вскрыли интерес",
    coachLabel: "тренер",
    judgeBadge: {
      label: "судит ИИ по смыслу",
      // Точность названа числом, потому что балл хода игрок ВИДИТ («78/100»).
      // Замер: одна и та же реплика получает от модели разброс до 15 очков,
      // типично 10 (docs/judge-reproducibility.md). Молчать об этом и рядом
      // печатать точное число — то самое «заявить то, чего нет».
      aria: "Семантический ИИ-судья оценивает аргументацию по смыслу, а не по ключевым словам. Балл хода воспроизводим с точностью ±5: модель отвечает не дословно одинаково. На экзамене судья выключен — там счёт считает только движок.",
    },
    judgeReject: "распознал шаблон, не смысл",
    typingLabel: "печатает…",
    judgingLabel: "ИИ-судья разбирает вашу реплику…",
    batna: "Ваш запасной вариант (BATNA)",
    batnaHint: "Что вы сделаете, если не договоритесь. Чем он лучше, тем спокойнее можно торговаться.",
    moreLabel: "Брифинг",
    streakLabel: "{n} дн. подряд",
    notPlayed: "не пройдено",
    personalBest: "Личный рекорд",
    newRecord: "новый рекорд!",
    placeholder: "Ваша реплика своими словами…",
    placeholderNudges: [
      "Спросите по теме из панели «Скрытые интересы»: «что для вас важно в…»",
      "Сошлитесь на рыночные данные или объективный критерий…",
      "Предложите размен: «если…, то…»…",
    ],
    send: "Отправить",
    argLabel: "аргум.",
    arg: {
      pending: "движок считает качество довода…",
      byJudge: "качество довода {n} из 100 — оценил ИИ-судья по смыслу, точность ±5",
      byEngine: "качество довода {n} из 100 — посчитал движок по словарю приёмов",
      judgeSilent: "качество довода {n} из 100 — посчитал движок по словарю: ИИ-судья на этом ходу не ответил",
    },
    deltaNone: "шкалы не сдвинулись",
    deltaRepeat: "повтор — на эти слова уже ответили",
    connecting: "Соединение…",
    usingMock: "демо-режим (без сервера)",
    noAiChip: "реплики по шаблону",
    noAiWhy: "У сервера нет ключа модели, поэтому реплики оппонента берутся из шаблонов движка. Счёт, движение цены и грейд считаются как обычно.",
    composerLimit: "Осталось {n} {form}",
    conn: {
      startFailed: "Не удалось начать партию",
      startFailedBody: "Сервер не подтвердил запуск. Повторите попытку или выберите другой сценарий.",
      reconnecting: "Соединение потеряно — переподключаемся…",
      lostTitle: "Связь с сервером прервана",
      lostBody: "Не удалось переподключиться. Можно перезапустить сценарий — ваш прогресс и профиль сохранены.",
      retry: "Перезапустить сценарий",
      home: "На главную",
      takenOver: "Эту партию продолжили в другом окне — здесь она остановлена. Играйте там или перезапустите сценарий.",
    },
    custom: {
      context: {
        head: "Для организатора: настройки сценария",
        help: "Задайте учебный контекст. Сложность и тон применятся к сценарию; без сети используются шаблонные условия торга.",
        sector: "Сфера", topic: "Тема переговоров", opponent_role: "Роль оппонента",
        opponent_goal: "Цель оппонента", difficulty: "Сложность", style: "Тон оппонента",
        styles: { analytical: "Деловой, по фактам", relationship: "Ориентирован на отношения", tough: "Жёсткий" },
      },
      head: "Опишите вашу ситуацию",
      placeholder:
        "Опишите вашу переговорную ситуацию… Например: «Я фрилансер, клиент просит скидку 20% на проект, а я не готов опускаться ниже своей ставки. Нужно сохранить контракт и не обесценить работу.»",
      promise:
        "По описанию ИИ соберёт оппонента: характер и манеру речи, красную линию, за которую он не пойдёт, зону возможного согласия и три скрытых интереса — их придётся вскрывать вопросами. Обычно занимает 2-3 секунды.",
      vsEditor:
        "«Своя сделка» — для вас: опишите свою настоящую ситуацию, и за стол сядете вы сами. Если нужно подготовить переговоры для других — учеников или команды — по готовым настройкам, для этого есть «Редактор».",
      examplesHead: "Не с чего начать? Возьмите пример — он подставится в поле:",
      examples: [
        {
          title: "Подрядчик сорвал сроки",
          text: "Подрядчик сорвал ремонт офиса на три недели и просит доплату за материалы. Мне нужны компенсация и новый график с гарантией, но менять его посреди работ я не могу — переделка выйдет дороже.",
        },
        {
          title: "Партнёр хочет 50%",
          text: "Сооснователь требует половину компании: он вложил деньги на старте, продукт и команда — на мне. Долю отдать готов, контроль — нет. Разойтись нельзя, ключевые клиенты пришли через него.",
        },
        {
          title: "Клиент требует скидку 30%",
          text: "Крупный клиент требует скидку 30% при продлении годового контракта, иначе уходит к конкуренту. Ниже 15% мы работаем в убыток, но потерять этот логотип — потерять и половину входящих заявок.",
        },
      ],
      generate: "Сгенерировать сценарий →",
      generating: "Генерируем вашего оппонента…",
      generatingSub: "ИИ проектирует персону, скрытые интересы и зону торга под вашу ситуацию.",
      errorHead: "Не удалось сгенерировать сценарий",
      errorSub: "Иногда генерация не удаётся. Попробуйте ещё раз или начните с готового сценария.",
      timeout: "Генерация заняла слишком много времени. Возможно, сервер перегружен — попробуйте снова.",
      orPickReady: "…или выберите готовый сценарий",
      retry: "Попробовать снова",
    },
    exam: {
      eyebrow: "Учебный результат · экзамен",
      resultTitle: "Результат экзамена",
      scenarioLabel: "Сценарий",
      nameLabel: "Имя для учебного результата (не проверяется)",
      namePlaceholder: "Участник",
      awardedTo: "Указанное имя",
      dateLabel: "Дата просмотра",
      download: "Печать учебного результата",
      certifies: "Учебный результат тренажёра. Серверное свидетельство проверяется отдельно; квалификация и личность не удостоверены.",
      notAwarded: "Проходной грейд — C. Результат записан — эта попытка не последняя.",
    },
    campaign: {
      overviewHead: "Ваша карьерная арка",
      begin: "Начать восхождение →",
      continue: "Продолжить восхождение →",
      nextAct: "Следующий акт →",
      seeResults: "Итоги восхождения →",
      locked: "закрыто",
      current: "сейчас",
      done: "пройдено",
      reputation: "Репутация",
    startFlag: "Старт",
      actOf: "Акт {n} из {total}",
      completeEyebrow: "Восхождение · итог",
      completeTitle: "Путь пройден",
      avgLabel: "Средний балл",
      replay: "Пройти заново",
      verdicts: {
        A: "Мастер переговоров",
        B: "Уверенный переговорщик",
        C: "Крепкий середняк",
        D: "Есть над чем поработать",
        F: "Ещё учиться",
      },
      pickHead: "Кампании",
      notStarted: "не начата",
      finished: "пройдена",
    },
    route: {
      head: "Ваш следующий шаг",
      firstTitle: "Начните с «{table}»",
      firstWhy: "Сложность {diff} из 5 — самые простые переговоры в каталоге: торг только о цене, собеседник охотно идёт на контакт. Ошибиться нестрашно — партию можно переиграть.",
      firstCta: "Сесть за стол →",
      courseTitle: "Блок курса: «{block}»",
      courseWhy: "Приём начат и не закрыт. Доучите — и он ваш; в игре он засчитывается так же, как в задании.",
      courseWhyNew: "Приём, которого вы ещё не брали. Курс объясняет его заданиями, а не лекцией: правильный ответ здесь — правильный и за столом.",
      courseCta: "Продолжить блок →",
      rematchTitle: "Переиграйте «{table}»",
      rematchWhy: "Ваш рекорд за этим столом — {grade}, {score} из 100. Это стол, который вас пока обыграл; садиться за новый рано.",
      rematchCta: "Переиграть →",
      campaignTitle: "«{campaign}»: акт {n} из {total}",
      campaignWhy: "Впереди «{act}». Репутация прошлых актов едет с вами: оппонент уже наслышан.",
      campaignCta: "Продолжить кампанию →",
      dailyTitle: "Переговоры дня: «{table}»",
      dailyWhy: "Курс сдан, кампании пройдены, слабых столов не осталось. Держите форму: сегодня — {mod}.",
      dailyCta: "Играть →",
    },
    beats: {
      label: "Части разбора",
      names: ["Итог", "Что вы упустили", "Что сказал бы мастер"],
      next: "Дальше: {name} →",
      more: "Подробный разбор ▾",
      less: "Свернуть подробности ▴",
    },
    daily: {
      title: "Переговоры дня",
      lead: "Одна ситуация для всех, завтра будет новая. Условие на сегодня:",
      best: "Ваш лучший результат здесь: {grade}, {score} из 100.",
    },
    goal: {
      title: "Цель на сегодня",
      count: "{done} из {target}",
      hint: "Сколько переговоров провести сегодня. Засчитывается любая законченная партия.",
      rule: "Поднять цель можно сразу, опустить — только со следующего дня: обещание себе не отменяют посреди дня.",
      later: "Сегодня цель — {today}, с завтрашнего дня — {later}. Передумали — выберите {today} снова.",
      setNow: "{n} в день — с сегодняшнего дня",
      setLater: "{n} в день — с завтрашнего дня, сегодня цель не изменится",
    },
    rank: {
      title: "Ваш ранг",
      toNext: "{n} XP до «{rank}»",
      hint: "Растёт от опыта (XP). За законченную партию — столько XP, сколько баллов из 100 вы набрали, плюс бонус за сделку и за новый рекорд; задания курса тоже дают XP. На оценку партий ранг не влияет.",
    },
    method: {
      title: "Четыре главных приёма",
      lead: "На них держится оценка техники — 35% итоговой оценки партии. Нажмите на приём, чтобы увидеть пример.",
      more: "Разобрать в курсе",
    },
    rail: {
      progressHead: "Ваш прогресс",
      progressNote: "Считается по вашим партиям и хранится в этом браузере. На оценку партий не влияет.",
      formatsHead: "Другие форматы тренировки",
      formatsNote: "Когда освоитесь с обычными переговорами — попробуйте иначе.",
    },
    tour: {
      stepOf: "Шаг {n} из {total}",
      next: "Дальше",
      done: "Всё понятно",
      skip: "Пропустить",
      replay: "Как здесь всё устроено?",
      dontShow: "Больше не показывать в этом разделе",
      prefsTitle: "Подсказки",
      prefsLead: "При входе в раздел показывается короткий тур по его кнопкам и блокам — раз за посещение сайта. Вызвать его в любой момент можно кнопкой «Как здесь всё устроено?» вверху страницы.",
      prefsSwitch: "Показывать подсказки в разделах",
      prefsOff: "Отключены галочкой в разделах: {list}.",
      prefsRestore: "Вернуть во всех разделах",
      names: { home: "Тренировка", table: "Стол переговоров", debrief: "Разбор партии", course: "Курс", custom: "Своя сделка", admin: "Редактор", campaign: "Кампания", exam: "Экзамен", profile: "Профиль" },
    },
    tours: {
      home: {
        intro: { title: "Это тренажёр переговоров", body: "Вы ведёте переговоры с собеседником, которого играет ИИ: у него своя цена, граница, за которую он не пойдёт, и скрытые интересы. Задача — договориться выгодно и не испортить отношения. После партии — разбор ошибок и оценка от A до F." },
        start: { title: "Начните отсюда", body: "Мы подобрали первые переговоры — самые простые. Нажмите зелёную кнопку в этой карточке. Ошибиться не страшно: партию можно переиграть. За столом подсказывает ворон Карл — ваш тренер." },
        nav: { title: "Разделы", body: "Тренировка — любая ситуация из каталога. Кампания — серия переговоров, где репутация переходит дальше. Курс — короткие уроки с заданиями. Своя сделка — ИИ соберёт переговоры по вашему описанию. Экзамен — без подсказок, на оценку. Профиль — ваш прогресс и настройки, Редактор — для преподавателя. В каждом разделе — свои подсказки." },
        progress: { title: "Ваш прогресс", body: "Цель на сегодня, серия дней и ранг считаются по вашим партиям. На оценку конкретной партии они не влияют. Слон Тихон хранит ваши рекорды — вы встретите его в разборе после партии." },
      },
      table: {
        meters: { title: "Четыре шкалы разговора", body: "Доверие растёт от эмпатии и честных доводов. Напряжение растёт от давления и грубости: дойдёт до предела — собеседник встанет из-за стола. Информация — сколько вы узнали о его интересах, рычаг — сила ваших доводов. После каждой реплики видно, какая шкала сдвинулась." },
        price: { title: "Цена сделки", body: "Синяя точка — их цена сейчас, синее кольцо — с чего они начали. Зелёная черта — ваша цель, красная — ваша красная линия: хуже неё соглашаться не стоит, лучше уйти к запасному варианту. Штриховка между ними — ваш коридор. Строка сверху говорит, где их цена сейчас." },
        interests: { title: "Скрытые интересы", body: "У собеседника три скрытых интереса, здесь видны темы, в которых они лежат. Спросите по теме — интерес откроется, и цена сдвинется без давления." },
        batna: { title: "Ваш запасной вариант (BATNA)", body: "Что вы сделаете, если не договоритесь. Спокойная ссылка на него — рычаг. Угроза «уйду» в лоб бьёт по доверию." },
        terms: { title: "Брифинг и что предложить взамен", body: "Под этой кнопкой — условия задачи и то, что вы можете дать второй стороне в обмен на уступку по цене: например, срок контракта или предоплату. Это размен, и он двигает цену лучше торга." },
        composer: { title: "Ваша реплика", body: "Пишите своими словами и отправляйте. Кнопки под полем вставляют начало фразы под нужный приём, лампочка — подсказка тренера. Ходов в партии ограниченное число — счётчик вверху." },
        exit: { title: "Как закончить", body: "Сделка закрывается в разговоре: предложите итог — «Договорились: 86 за штуку, фиксируем?». Кнопка «выйти» прерывает партию без результата. «Слои» — голос, камера и другие добавки, выбираются до первого хода." },
      },
      debrief: {
        grade: { title: "Оценка партии", body: "Буква и число — итог, который поставил движок: 40% экономика сделки, 25% отношения, 35% техника. A и B — метод сработал, C — зачёт, D и F — есть над чем поработать." },
        parts: { title: "Из чего она сложилась", body: "Экономика — насколько выгодна цена сделки. Отношения — с каким доверием и напряжением вы расстались. Техника — вопросы, опора на факты, размены и отсутствие давления." },
        beats: { title: "Разбор по частям", body: "Итог, что вы упустили, что сказал бы мастер. Кнопка ведёт к следующей части, точки — переход между ними." },
        whatif: { title: "А что если…", body: "Ваш самый дорогой ход. Впишите другую реплику — движок покажет, как пошла бы партия с того же места." },
        next: { title: "Дальше", body: "Сыграть ещё раз — прошлая попытка пойдёт рядом ход за ходом — или вернуться к выбору. Каждая партия пополняет профиль навыков." },
      },
      course: {
        path: { title: "Карта курса", body: "Блоки идут от первого вопроса к сложной сделке. В каждом — короткие уроки с заданиями и экзамен в конце. Закрытые блоки откроются по мере прохождения." },
        current: { title: "Начните с отмеченного", body: "Это следующий блок по порядку. Внутри — теория на минуту, задания разных типов и капстоун: короткая настоящая партия на этот приём." },
        redo: { title: "Работа над ошибками", body: "Здесь собраны задания, в которых вы ошиблись. Переделать их — дешевле, чем повторить ту же ошибку за столом." },
        master: { title: "Экзамен мастера", body: "Три партии подряд на новых столах, без подсказок. Откроется, когда сданы все блоки курса." },
        why: { title: "Почему это учит", body: "Раскройте, чтобы увидеть четыре приёма метода с примерами из партий." },
      },
      custom: {
        vs: { title: "Своя сделка", body: "Здесь вы играете свою настоящую ситуацию: описываете её — ИИ собирает собеседника под неё. Подготовить переговоры для других — это «Редактор»." },
        text: { title: "Опишите ситуацию", body: "Кто вы, чего хотите, где ваша граница и что мешает договориться. Чем конкретнее описание, тем точнее соберётся собеседник." },
        examples: { title: "Не с чего начать?", body: "Нажмите пример — он подставится в поле, и его можно поправить под себя." },
        context: { title: "Для организатора", body: "Необязательные настройки: сфера, тема, роль и цель собеседника, сложность и тон. Нужны, если вы готовите сценарий для учебной группы." },
        go: { title: "Сгенерировать", body: "ИИ соберёт собеседника за несколько секунд: характер, красную линию, зону согласия и три скрытых интереса. Дальше — обычная партия с разбором." },
      },
      admin: {
        vs: { title: "Редактор — для того, кто учит", body: "Вы собираете переговоры для другого человека из готовых настроек и заранее видите, что он получит. Сыграть свою ситуацию — это «Своя сделка»." },
        presets: { title: "Готовые примеры", body: "Каждая кнопка заполняет настройки кейсом из своей сферы. Удобно начать с примера и поправить." },
        fields: { title: "Что делает каждая настройка", body: "Сфера — из какой области кейс. Тема встречи — о чём разговор. Роль собеседника — кто сидит напротив. Тон — насколько он открыт. Сложность — больше уступок или выше требования. Заявленные цели — что он защищает; от них зависят его позиция и ценность ваших уступок." },
        preview: { title: "Предпросмотр участника", body: "«Посмотреть условия» покажет роль участника, собеседника, условия встречи и то, как настройки на них повлияли. Отсюда же запускается тренировка." },
        actions: { title: "Черновик и сброс", body: "Черновик сохраняется в этом браузере. «Сбросить» возвращает пример закупок." },
      },
      campaign: {
        pick: { title: "Две кампании", body: "Две сюжетные серии переговоров. Прогресс у каждой свой, переключаться можно в любой момент." },
        arc: { title: "Путь кампании", body: "Акты идут по порядку. Итог каждого акта меняет вашу репутацию, а она — то, как вас встретят в следующем." },
        current: { title: "Текущий акт", body: "Описание акта и приём, который он тренирует. «Разминка» — два задания из курса перед партией; её можно пропустить." },
        rep: { title: "Репутация", body: "Сумма итогов прошлых актов. Высокая — вас встретят теплее, низкая — с настороженностью. На оценку акта она не влияет." },
        cta: { title: "За стол", body: "Кнопка сажает за стол текущего акта. В кампании голос, камера и другие слои выключены — так акты сравнимы между собой." },
      },
      exam: {
        intro: { title: "Экзамен", body: "Партия без подсказок: шкалы, тренер и подсветки скрыты до разбора. Оценку ставит только движок, поэтому результат воспроизводим." },
        name: { title: "Имя для результата", body: "Необязательно. Его напечатают на учебном результате, если партия сдана на C или выше." },
        catalog: { title: "Выберите ситуацию", body: "Любую из каталога. Знакомая — проверка навыка, новая — проверка на неожиданность." },
      },
      profile: {
        rank: { title: "Ранг и опыт", body: "Ранг растёт от опыта за партии и задания курса. На оценку партий он не влияет." },
        skills: { title: "Навыки", body: "Шесть навыков переговорщика — средняя по всем партиям. Видно, в чём вы сильны и что подтянуть." },
        growth: { title: "Как вы растёте", body: "История ваших партий. О тенденции здесь говорят с шести партий: по двум точкам линия показала бы уверенность, которой нет." },
        layers: { title: "Слои", body: "Голос, камера, выражение лица собеседника. Работают только в «Тренировке» и на оценку не влияют." },
        tips: { title: "Подсказки", body: "Здесь подсказки разделов выключаются везде — и сюда же возвращаются отключённые галочкой." },
      },
    },
    layers: {
      head: "Слои",
      lead: "Слои — необязательные добавки к партии: голос вместо клавиатуры, камера, выражение лица собеседника, вопросы о его реакции. Ни один не влияет на оценку.",
      where: "Работают только в разделе «Тренировка». В кампании, курсе, экзамене и своей сделке слои всегда выключены — так оценки остаются сравнимыми. Выбор отсюда достанется следующей тренировке.",
      needs: {
        voice: "нужен микрофон — браузер спросит разрешение, как только вы включите слой",
        camera: "нужна камера — браузер спросит разрешение, как только вы включите слой",
      },
      check: {
        voice: {
          checking: "Спрашиваем доступ к микрофону — ответьте в окне браузера.",
          granted: "Микрофон работает. Мы его сразу выключили — он включится, когда начнётся партия.",
          denied: "Доступ к микрофону запрещён. Разрешите его в настройках сайта (значок слева от адреса) и включите слой снова.",
          missing: "Микрофон не найден. Подключите его и включите слой снова.",
          busy: "Микрофон занят другой программой. Закройте её и включите слой снова.",
          failed: "Микрофон не включился. Попробуйте ещё раз или перезагрузите страницу.",
        },
        camera: {
          checking: "Спрашиваем доступ к камере — ответьте в окне браузера.",
          granted: "Камера работает. Мы её сразу выключили — она включится, когда начнётся партия.",
          denied: "Доступ к камере запрещён. Разрешите его в настройках сайта (значок слева от адреса) и включите слой снова.",
          missing: "Камера не найдена. Подключите её и включите слой снова.",
          busy: "Камера занята другой программой — например, видеозвонком. Закройте её там и включите слой снова.",
          failed: "Камера не включилась. Попробуйте ещё раз или перезагрузите страницу.",
        },
      },
      avatarLater: "Живое видео-лицо собеседника появится позже. Сейчас это нарисованные выражения лица.",
      what: "что это",
      sameGrade: "на оценку не влияет",
      lockedMode: "В этой партии слои выключены — её грейд обязан быть сравним с остальными",
      lockedStarted: "Стол уже идёт: слои выбираются до первого хода",
      close: "Закрыть слои",
      seenHead: "Что видела камера",
      seenNote: "Что происходило за столом — и что в это время происходило с вами. В грейд не входило ничего из этого.",
      seenStart: "до первого хода",
      seenTurn: "после хода {n}",
      seenTell: "лицо себя выдало",
      seenMore: "и ещё {n} раньше",
      unavailable: "недоступно",
      naSummary: "Здесь это не поднимется: {list}. Причина — под каждым переключателем.",
      presets: "Пресеты",
      start: "Начать переговоры",
      back: "к выбору оппонента",
      names: { probe: "Читай лицо", voice: "Голосом", camera: "Камера", avatar: "Лицо собеседника",
               pokerface: "Покерфейс" },
      blurbs: {
        probe: "После хода игра спросит, что сейчас чувствует собеседник",
        voice: "Говорите вслух — и слышите ответ. Можно перебивать",
        camera: "Сигналы присутствия: кто в кадре, куда смотрите",
        avatar: "Выражение лица меняется на каждый ваш ход, с голосом — ещё и в такт речи. Без слоя лицо показывает только общее настроение",
        pokerface: "Считает, сколько раз лицо выдало вас",
      },
      needsCamera: "включите камеру — считать нечего без её кадров",
      presetNames: { classic: "Классика", read: "Читай лицо", call: "Видеозвонок",
                     poker: "Покерфейс", full: "Полный контакт" },
      tellsOf: "раз лицо себя выдало — из {n} просмотренных кадров",
      explainHead: "Что это даёт",
      explain: [
        "Слои меняют состав разбора после партии, но никогда не влияют на оценку.",
        "Любой сценарий проходится с выключенными слоями.",
        "В экзамене слои выключены, чтобы сертификаты были сравнимы.",
      ],
    },
    mascot: {
      karl: "Карл",
      tikhon: "Тихон",
      rememberTitle: "Тихон помнит",
      alt: {
        idle: "Карл наблюдает",
        think: "Карл думает",
        cheer: "Карл одобряет",
        concern: "Карл насторожен",
        point: "Карл подсказывает",
        celebrate: "Карл празднует",
        sad: "Карл расстроен",
        study: "Карл изучает данные",
        shrug: "Карл разводит крыльями",
        oops: "Карл прикрыл глаза крылом",
        doze: "Карл дремлет",
      },
    },
    streak: {
      title: "Серия дней",
      hint: "Дни подряд, в которые вы закончили партию на C или выше.",
      kept: "{n} {form} подряд. Сегодняшний день уже засчитан.",
      waiting: "{n} {form} подряд. Сегодня вы ещё не играли — партия продлит серию.",
      shielded: "Пропуск покроет заморозка: их в запасе {n}.",
      lost: "Серия прервана. Сегодняшняя партия начнёт новую.",
      away: "Вас не было {n} {form}. Стол на месте.",
    },
    meeting: {
      title: "Встреча",
      status: {
        connecting: "Подключение…",
        reconnecting: "Связь прервалась — возвращаемся в ту же партию",
        lost: "Связь потеряна",
        speaking: "Говорит",
        hearing: "Слышит вас",
        thinking: "Думает",
        listening: "Слушает",
      },
      testStream: "Тестовый видеопоток — не видео собеседника",
      micOff: "Выключить микрофон",
      micOn: "Включить микрофон",
      micMuted: "Микрофон выключен",
      noMic: "Микрофона нет — отвечайте текстом",
      interrupt: "Перебить",
      text: "Ответить текстом",
      end: "Завершить",
      soundBlocked: "Браузер не включил звук",
      soundOn: "Включить звук",
    },
    live: {
      micOn: "микрофон активен",
      hearing: "слышу вас",
      interrupt: "перебить",
      // Не «в кадре»: детектора лица у нас нет, и обещать его чипом нельзя.
      // Чип говорит ровно то, что мы знаем — уходят кадры или нет.
      inFrame: "камера · кадры идут",
      outFrame: "камера · кадры не уходят",
      peekNote: "видно только вам",
      peekOpen: "проверить свет",
      seen: "модель видит:",
      offVoice: "Голос не включился",
      offCamera: "Камера не включилась",
      offHow: "Партия продолжается текстом. Разрешите доступ в браузере и начните заново.",
    },
    probe: {
      ask: "Что с ним сейчас происходит?",
      readFace: "Читайте лицо",
      blocked: "Ответьте на вопрос, чтобы продолжить",
      tally: "прочитано {n} из {m}",
      right: "Верно.",
      wrong: "Мимо.",
      // Формулировки НЕЙТРАЛЬНЫ по роду: за столом бывают и Наталья, и Виктор,
      // а «Закрылась» под портретом мужчины читается как недоделка.
      reactions: {
        warmed: "Теплеет", opened_up: "Приоткрывается", persuaded: "Принимает довод",
        collaborated: "Идёт навстречу", neutral: "Держит нейтралитет",
        not_yet: "Пока не соглашается", probe_vague: "Просит уточнить вопрос",
        pressured: "Под давлением",
        hardened: "Закрывается", offended: "Принимает на свой счёт",
        walked_out: "Встаёт из-за стола",
      },
      why: {
        warmed: "Доверие выросло — вы попали в интерес второй стороны.",
        opened_up: "Информация подскочила: вам рассказали то, что скрывали.",
        persuaded: "Рычаг вырос — убедил объективный критерий, а не нажим.",
        collaborated: "Напряжение упало, доверие выросло: вы предложили размен.",
        neutral: "Счётчики почти не двинулись — ход прошёл мимо.",
        not_yet: "Отказа нет, но и движения нет: закрывать рано.",
        probe_vague: "Вопрос слишком общий — интерес так не вскрыть. Назовите тему.",
        pressured: "Напряжение выросло — это восприняли как нажим.",
        hardened: "Напряжение выросло, доверие упало — вторая сторона закрылась.",
        offended: "Доверие обвалилось: резкий тон бьёт сильнее аргумента.",
        walked_out: "Оппонент встаёт из-за стола — напряжение дошло до предела.",
      },
      debriefHead: "Как вы читали оппонента",
      observation: "наблюдение · не влияет на оценку",
    },
    otherSide: {
      title: "Сыграть за другую сторону",
      cardLead: "Те же переговоры, но вы — на месте собеседника: у вас его цена, его красная линия и его скрытые интересы. Лучший способ понять, почему человек напротив упирается, — упереться самому и знать почему.",
      cardCta: "Выбрать переговоры",
      scored: "обычная партия · оценивается как всегда",
      sheetLead: "Три стола из библиотеки, которые можно сыграть с другой стороны. Оценка та же: та же формула, те же слои выключены, тот же потолок техники.",
      youBecome: "Вы играете за: {name}",
      origin: "Тот же стол с этой стороны: «{title}»",
      defendTitle: "Что вы защищаете",
      defendLead: "Три причины, по которым вы будете держать цену. Человек напротив их не видит — как не видели вы, когда сидели там.",
      play: "За стол →",
      debriefTitle: "Вы играли за другую сторону",
      seat: "За этим столом вы были — {seat}.",
      blindTitle: "Чего не видел человек напротив",
      windowsTitle: "Где вопрос вскрыл бы это",
      windowsNone: "Вы вскрыли всё, что напротив вас прятали. Спрашивать было больше не о чем.",
      mascotAlt: "Наставник разбирает партию с обратной стороны стола",
      close: "Закрыть выбор стола",
    },
    reading: {
      title: "Разбор чужой партии",
      cardLead: "Вы не играете, а смотрите готовые переговоры ход за ходом. На каждом ходу угадайте, как ответит собеседник, — и сразу увидите, правы ли вы и почему. Тренирует чутьё на реакцию.",
      cardProgress: "Разобрано партий: {n} из {total}",
      cardCta: "Разобрать партию",
      notScored: "упражнение · на оценку не влияет",
      gameOf: "Партия {n} из {total}",
      turnOf: "Ход {n} из {total}",
      turnsN: "ходов: {n}",
      watching: "С той стороны стола — {name}.",
      lookFor: "Читайте две вещи: какой приём несёт реплика — и готов ли стол его принять.",
      ask: "Как ответит {name} на этот ход?",
      askNone: "Тот же ответ, что и в прошлом вопросе, — этот ход просто смотрим.",
      exact: "Точно.",
      near: "Направление верное, сила — нет.",
      miss: "Мимо.",
      yourAnswer: "Вы ответили",
      engineSaid: "Движок ответил",
      evidence: "Что было в реплике",
      noTags: "Ни одного приёма: движку не за что зацепиться.",
      argq: "качество довода {n}",
      effect: "Что стало со столом",
      noMove: "Шкалы не двинулись, цена осталась прежней.",
      gate: "Доверие {trust} не выше порога {gate}: спросили по теме, а открываться ещё рано.",
      revealed: "Вскрыта тема: {topic}",
      next: "Дальше",
      tally: "Точно {exact} · направление {near} · мимо {miss}",
      grade: "Движок поставил этой партии {grade} — {overall} из 100.",
      endAgreement: "Ударили по рукам: {deal}.",
      endBreakdown: "Стол развалился, сделки нет.",
      endOpen: "Ходы кончились, сделки нет.",
      missedHead: "Что осталось закрытым",
      again: "Читать заново",
      nextGame: "Следующая партия",
      close: "Закрыть",
      tikhonTitle: "Тихон помнит",
      best: "Прошлый раз вы прочитали эту партию точно {n} из {total}.",
      a11y: { close: "Закрыть разбор чужой партии", table: "Стол глазами наблюдателя" },
    },
    nav: { admin: "Редактор", training: "Тренировка", campaign: "Кампания", custom: "Своя сделка",
           course: "Курс", exam: "Экзамен", progress: "Прогресс", profile: "Профиль" },
    course: {
      title: "Курс переговоров",
      lead: "{n} блоков: от первого вопроса до сложной сделки. Короткие уроки, задания и переговоры, в которых вы сразу применяете новый приём.",
      cardLead: "Короткие уроки с заданиями: как задавать вопросы, опираться на факты и меняться уступками. Каждый приём потом работает в партии.",
      blocksDone: "Сдано блоков: {n} из {total}",
      blockOf: "блок {n} из {total}",
      blockDone: "пройден",
      blockOpen: "открыт",
      blockLocked: "закрыт",
      toTable: "За стол →",
      allBlocks: "Все блоки",
      tasksN: "{n} заданий",
      taskForms: ["задание", "задания", "заданий"],
      theory: "теория",
      examTitle: "Экзамен блока",
      examLead: "{n} заданий, порог {pass} из {total} очков. Подсказки выключены, разбор — после сдачи.",
      examBest: "Лучший результат: {best} из {total}",
      examPassed: "сдан",
      examStart: "Сдавать экзамен",
      examMode: "экзамен",
      examFinish: "Завершить",
      examPass: "Экзамен сдан",
      examFail: "Экзамен не сдан",
      examResult: "{score} из {total} очков, порог — {pass}. Пересдать можно сразу: выборка будет другой.",
      toTasks: "К заданиям →",
      lessonDone: "Урок пройден",
      lessonComplete: "Урок пройден",
      lessonScore: "Верно: {n} из {total}",
      tasksTitle: "Задания · {lesson}",
      stepOf: "задание {n} из {total}",
      next: "Дальше",
      checkIt: "Проверить",
      faceAlt: "Лицо оппонента в этот момент разговора",
      hits: "{n} из {total} уже на месте",
      moveUp: "Переместить выше: {item}",
      moveDown: "Переместить ниже: {item}",
      correct: "Верно",
      wrong: "Не то",
      reference: "Как можно было",
      freeformHint: "Напишите реплику своими словами…",
      matchHint: "Выберите слева, затем справа — пара свяжется.",
      optKeys: "Клавиши 1–4 выбирают вариант, Enter подтверждает.",
      examQuit: "Прервать экзамен",
      recoveryTitle: "Повторить перед пересдачей",
      nextUp: "Дальше",
      continue: "Продолжить курс",
      actTeaches: "Приём этого акта",
      coachNote: "оценку поставил движок · это комментарий тренера",
      masterTitle: "Экзамен мастера",
      masterLead: "Три партии подряд на столах, которых не было в блоках. Слои выключены.",
      masterLocked: "Откроется, когда сданы все {n} блоков курса.",
      masterStart: "Начать",
      masterAgain: "Пройти снова",
      masterAbout: "{n} настоящие партии подряд, каждая со своим условием. Зачёт — от {pass} из {n}. Приёмы никто не подсказывает: реальные переговоры тоже не сообщают, какой из них сейчас нужен.",
      masterNext: "Партия {n} из {total} →",
      masterPassed: "Экзамен мастера сдан",
      masterPassedBody: "Три стола, ни одной подсказки, оценка тем же движком, что и всё остальное. Это и есть сравнимый результат.",
      masterKarlPass: "Сдано. Теперь то же самое — но за настоящим столом.",
      masterKarlFail: "Пока не сдано. Пройдите заново — партии те же, но играть их придётся иначе.",
      masterProgress: "Партия {n} из {total}",
      masterDrillPass: "Партия экзамена сдана",
      masterDrillFail: "Партия экзамена не сдана",
      warmupTitle: "Разминка",
      warmupSkip: "Пропустить",
      warmupReady: "Разминка пройдена",
      warmupToTable: "За стол",
      warmupKarl: "Теперь то же самое — но живьём, и цена будет двигаться по-настоящему.",
      warmupCta: "Разминка · 2 задания",
      redoTitle: "Работа над ошибками",
      redoDone: "Ошибки разобраны",
      redoKarl: "Исправленная ошибка стоит половину XP — и всё равно это лучшая сделка в продукте.",
      trainThis: "Потренировать это",
      drillStart: "Начать мини-переговоры",
      drillNote: "Настоящая партия на {n} {form}. Оценивает движок — как всегда.",
      drillPass: "Капстоун сдан",
      drillFail: "Капстоун не сдан",
      backToCourse: "← В курс",
      karlTheory: "Прочитали — теперь проверим на заданиях. Теория без применения выветривается за день.",
      karlPerfect: "Ни одной ошибки. Это и есть навык.",
      karlOk: "Нормально. Ошибка в тренажёре стоит дешевле, чем за столом.",
      karlExamPass: "Сдано. Следующий блок открыт.",
      karlExamFail: "Пока нет. Разберите промахи и заходите снова — выборка будет другой.",
      tikhonTitle: "Тихон помнит",
      tikhonBody: "Курс и партии живут в одном профиле: XP, ранги и стрик общие. Экзамен блока идёт без слоёв — чтобы результаты были сравнимы.",
      types: {
        choice: "Выбор реплики", spot_error: "Найти ошибку", order: "Порядок",
        match: "Соответствие", numeric: "Расчёт", freeform: "Своими словами",
        reaction: "Читай реакцию", meters: "Предскажи шкалы", face: "Прочитай лицо",
        drill: "Капстоун",
      },
      meters: { trust: "Доверие", tension: "Напряжение", info: "Информация",
                leverage: "Рычаг", up: "Вырастет", down: "Упадёт" },
      moves: {
        interests_probe: "вскрытие интереса", acknowledge: "активное слушание",
        objective_criteria: "объективный критерий", batna: "альтернатива",
        tradeoff: "размен", threat: "ультиматум", hostile: "грубость",
        accept: "закрытие", concession: "уступка", anchor: "якорь", offer: "предложение цены",
        spin_situation: "SPIN · ситуация", spin_problem: "SPIN · проблема",
        spin_implication: "SPIN · последствия", spin_needpayoff: "SPIN · выгода",
        open_question: "открытый вопрос", statement: "заявление", rapport: "контакт",
      },
      why: {
        missing: "Не хватает приёма: {move}",
        missingAny: "Нужен хотя бы один из: {moves}",
        forbidden: "Здесь нельзя: {move}",
        missingTerm: "Не назван вторичный вопрос, который вы разменивали",
        tooShort: "Слишком коротко — движку не из чего судить",
        weak: "Аргумент слабый: нет обоснования, цифры или источника",
        noNumber: "Нужна конкретная цифра",
        generic: "Ответ не подошёл",
      },
    },
    opening: {
      title: "Стол накрыт",
      scene: "{role} Напротив — {name}. Её цена: {offer}. Ваша цель: {target}, красная линия: {red}.",
      hint: "У второй стороны три скрытых интереса. Темы, в которых они лежат, перечислены в панели «Скрытые интересы» — спросите ПО ТЕМЕ, и интерес откроется. Пока не вскрыли — спор идёт только о цене, а там выигрывает тот, кто сильнее давит.",
      // ЗАЧАТКИ, а не готовые реплики — как чипы композера ниже. Готовая строка
      // не может знать стол: «что для вас важнее всего в этой сделке» по
      // построению не называет ни одной темы, а движок (правильно) требует
      // темы, — и продукт печатал новичку три реплики, подписывал их приёмами
      // и не засчитывал ни одну. Зачаток обрывается ровно там, где игрок
      // обязан подставить тему со своего же стола.
      lines: [
        { icon: "target", tag: "Интерес", text: "Что для вас важно в " },
        { icon: "chart", tag: "Критерий", text: "Давайте опираться на объективные данные: " },
        { icon: "refresh", tag: "Размен", text: "В обмен на движение по цене мы готовы " },
      ],
    },
    onboarding: {
      skip: "Пропустить",
      gotIt: "Понятно",
      interestTitle: "Вы вскрыли интерес",
      interestBody:
        "За позицией всегда стоит интерес. Вы спросили — и шкала «Информация» выросла. Так вы находите, о чём реально договариваться.",
      dealTitle: "Их цена поехала",
      dealBody:
        "Смотрите: их цена сдвинулась к вашей цели. Каждый удачный ход двигает её — следите за этой шкалой.",
      firstTitle: "Первый ход сделан",
      firstBody:
        "{gain} Интерес открывается, только если вопрос назвал ТЕМУ. Темы — вот они: спросите про «{topic}».",
      firstGain: "Шкала «Информация» +{n} — это мало.",
      firstGainNone: "Ни одна шкала не сдвинулась.",
    },
    turningPoints: { title: "Ключевые ходы", turn: "Ход" },
    herSide: {
      title: "С той стороны стола",
      lead: "{name} по ту сторону стола: что там происходило ход за ходом, пока вы играли по эту.",
      turn: "Ход",
      you: "Вы",
      missedTitle: "Чего вы так и не узнали",
      mascotAlt: "Тихон показывает на цифру",
    },
    tagLabels: {
      spinSituation: "SPIN · Ситуация",
      spinProblem: "SPIN · Проблема",
      spinImplication: "SPIN · Последствия",
      spinNeedPayoff: "SPIN · Выгода",
      question: "Открытый вопрос",
      interests: "Вскрытие интересов",
      empathy: "Активное слушание",
      criteria: "Объективный критерий",
      batna: "Запасной вариант (BATNA)",
      tradeoff: "Размен",
      threat: "Давление",
      hostile: "Грубость",
      concession: "Уступка",
      anchor: "Якорь",
      accept: "Закрытие",
      rapport: "Контакт",
      offer: "Оффер / число",
    },
    reveal: {
      title: "Что на самом деле было важно для второй стороны",
      found: "вы это вскрыли",
      missed: "вы не спросили",
      allFound: "Вы вскрыли всё, что от вас скрывали, — за столом вы играли с открытыми картами.",
      noneFound: "Вы вели переговоры вслепую — ни один из интересов так и не прозвучал.",
    },
    mentor: {
      title: "Слово наставника",
      strength: "Что сработало",
      growth: "Что изменить в следующий раз",
    },
    master: {
      title: "Что сказал бы мастер",
      yours: "Ваша реплика",
      label: "Мастер",
      why: "Почему сильнее:",
      criteria: "Давайте опираться не на позиции, а на объективный критерий: какая цена справедлива по рыночным данным для таких сделок?",
      interest: "Прежде чем говорить о цене — что для вас здесь важнее всего и почему? Хочу понять ваш интерес, а не только позицию.",
      tradeoff: "Давайте разменяем: если я уступлю в сроках, готовы ли вы двинуться по цене? Свяжем уступки в пакет.",
      threat: "Уберём давление со стола. Предлагаю решать по существу: какой критерий был бы честным для нас обоих?",
      whyCriteria: "объективный критерий убеждает сильнее позиционного торга (Гарвардский метод).",
      whyInterest: "интерес за позицией открывает пространство для сделки (Гарвардский метод, SPIN).",
      whyTradeoff: "размен по разным по ценности вопросам создаёт ценность, а не делит её (логроллинг).",
      whyThreat: "уход от угроз к критериям снижает напряжение и сохраняет отношения.",
    },
    techniqueFloor: "Отличная цена, но грейд ограничен: A/B нужно заслужить методом — интересы, критерии, размен, — а не только торгом.",
    whatIf: {
      title: "А что если…",
      teaser: "Один ход решал всё →",
      intro: "Ваш самый дорогой ход. Смотрите, что было бы, спроси вы иначе — с той же точки.",
      reveal: "Показать, что было бы иначе",
      loading: "Считаю развилку…",
      again: "Другая реплика",
      altLabel: "Сильная альтернатива",
      customPlaceholder: "…или впишите свою реплику",
      wasLabel: "Как было",
      couldLabel: "Как могло быть",
      opponentLabel: "Ответ оппонента",
      offerLabel: "Их цена",
      meters: { trust: "Доверие", tension: "Напряжение", info: "Информация" },
      betterBanner: "Так было бы лучше",
      neutralBanner: "Сравните исходы",
      insteadOf: "вместо",
      uncovered: "вы бы вскрыли интерес",
      trustHigher: "доверие выше",
      priceFurther: "цена сдвинулась дальше",
      unavailable: "Развилку для этого сценария посчитать не удалось.",
      presets: [
        "А что для вас важнее всего в этой сделке и почему?",
        "Давайте сверимся с рыночными данными — какая цена была бы справедливой?",
      ],
      mobileCta: "Показать развилку",
    },
    rematch: {
      offerTitle: "Переиграй против себя",
      offerBody: "За этим столом уже лежит ваша партия: {grade} ({score}) · {deal}. Сыграйте стол снова — она пойдёт рядом ход за ходом, а расхождение посчитает тот же движок.",
      offerSame: "Эта партия сохранена как ваш соперник. Сядьте за стол ещё раз — она пойдёт рядом с вами ход за ходом.",
      cta: "Переиграть против себя",
      title: "Вы тогда · вы сейчас",
      open: "Показать прошлую попытку",
      close: "Свернуть",
      then: "Вы тогда",
      now: "Вы сейчас",
      turn: "Ход {n}",
      resultThen: "Итог тогда",
      nextThen: "Тогда следующим ходом вы сказали",
      noMoveYet: "Ход за вами",
      pastEnded: "Тогда партия здесь уже кончилась",
      price: "Цена",
      ahead: "лучше, чем тогда",
      behind: "хуже, чем тогда",
      even: "как тогда",
      byTurns: "Расхождение по ходам",
      differentTable: "Стол тогда открывался иначе (условие дня или репутация акта). Сравнивайте с поправкой.",
    },
    debriefTitle: "Разбор переговоров",
    coachTitle: "Рекомендации коуча",
    lastTime: "В прошлый раз за этим столом вы закрыли на {grade} ({score}). Сейчас — {now}. Сравнивайте себя с собой: у стола, где вы уже были, изменилась только ваша игра.",
    retry: "Пройти снова",
    toHome: "К сценариям",
    outcome: {
      agreement: "Соглашение достигнуто",
      breakdown: "Переговоры сорваны",
      active: "Без соглашения",
      see: "Смотреть разбор →",
      preparing: "Готовим разбор…",
    },
    sb: { economic: "Экономика сделки", relationship: "Отношения", technique: "Техника переговоров" },
    stat: {
      spin: "этапов SPIN",
      criteria: "критериев",
      empathy: "слушания",
      interests: "интересов",
      tradeoffs: "разменов",
      threats: "угроз",
      arg: "аргументация",
    },
    forms: {
      chars: ["символ", "символа", "символов"],
      games: ["игра", "игры", "игр"],
      days: ["день", "дня", "дней"],
      turns: ["ход", "хода", "ходов"],
    },
    statForms: {
      criteria: ["критерий", "критерия", "критериев"],
      empathy: ["слушание", "слушания", "слушаний"],
      tradeoffs: ["размен", "размена", "разменов"],
      threats: ["угроза", "угрозы", "угроз"],
    },
    footRight: "исход зависит от вашей стратегии",
    gam: {
      rankLabel: "ранг",
      toNext: "{n} XP до «{name}»",
      maxRank: "высший ранг достигнут",
      totalXp: "{n} XP",
      levelUp: "уровень повышен!",
      xpAwardLabel: "опыт за переговоры",
      xpAwardFailed: "переговоры сорвались",
      lowData: "мало данных — сыграйте ещё",
      dailyGoal: "цель дня",
      dailyDone: "цель дня выполнена",
      dailyTodo: "проведите одну переговорку",
      dailyProgress: "{done}/{target}",
      dailyTargetLabel: "Цель на день",
      dailyTargetSet: "{n} в день",
      freezeLabel: "заморозка",
      freezeSaved: "Заморозка сохранила вашу серию — пропущенный день не в счёт.",
      streakSkipped: "Этот результат не засчитан в серию — она растёт за грейд C и выше.",
      milestone: {
        kicker: "Веха",
        dismiss: "Продолжить",
        streakTitle: "{n} {form} подряд",
        streakDetail: "Неделя за столом. Привычка договариваться закрепляется.",
        streakUnit: "дней",
        rankKicker: "Новый ранг",
        rankDetail: "Вы растёте как переговорщик — так держать.",
        rankUnit: "XP",
      },
      skillsTitle: "Профиль навыков",
      skillsLink: "Профиль навыков",
      skillsSub: "Средняя оценка по всем играм — так видно, где вы растёте.",
      strongIn: "Силён в",
      workOn: "Подтяни",
      noGames: "Сыграйте первую переговорку, чтобы увидеть, где вы растёте.",
      back: "← Назад",
      gamesCount: "{n} {form}",
      achievementsTitle: "Достижения",
      unlockedToast: "Достижение получено",
      locked: "ещё не получено",
      skillNames: {
        questions: "Вопросы / SPIN",
        interests: "Интересы",
        criteria: "Объективные критерии",
        listening: "Активное слушание",
        tradeoff: "Размен",
        tension: "Управление напряжением",
      },
      skillHints: {
        questions: "Вскрываете суть вопросами, а не давлением",
        interests: "Находите скрытые интересы за позицией",
        criteria: "Опираетесь на объективные критерии",
        listening: "Признаёте интересы другой стороны",
        tradeoff: "Создаёте ценность разменом уступок",
        tension: "Держите доверие и не даёте напряжению расти",
      },
    },
    growth: {
      title: "Как вы растёте",
      sub: "Каждая точка — законченная партия: тот самый счёт, из которого движок вывел букву.",
      lowTitle: "Данных пока мало",
      lowAria: "Сыграно {played} из {need} партий",
      lowBody: "Сыграно {played} из {need}. О тенденции говорим с шести партий: по двум точкам линию нарисовать можно всегда, а показывала бы она уверенность, которой нет.",
      windowNote: "Последние {n} {form} · {from} — {to}",
      overallLabel: "Общий счёт партии",
      dirUp: "растёт",
      dirDown: "просел",
      dirFlat: "без изменений",
      thenNow: "{before} → {after}",
      noise: "разница {delta} не выходит за разброс ±{threshold} — это шум",
      grew: "разница {delta} при разбросе ±{threshold}",
      movedUp: "Сильнее всего вырос",
      movedDown: "Просел",
      noMoves: "Ни один навык пока не вышел за собственный разброс. Это не «плохо» — это «слишком рано называть».",
      chartAria: "График общего счёта по {n} партиям: сначала {before}, в последних — {after}.",
      notScored: "История ничего не добавляет к оценке — грейд каждой партии уже поставлен движком.",
      skillsHead: "По навыкам",
    },
    a11y: {
      nav: "Разделы",
      stats: "Ваш прогресс",
      hud: "Счётчики переговоров",
      chatLog: "Ход переговоров",
      gameHeading: "Переговоры: {name}",
      grade: "Оценка {grade}, {score} из 100",
      scoreBar: "{label}: {v} из 100",
      deal: "Сделка. Ваша цель {target}, красная линия {redline}, их текущая цена {offer}.",
      delta: "{label}: {value}",
      skip: "К содержимому",
      speaking: "Оппонент говорит",
      amplitudeAnimation: "Рот по громкости речи · локальная анимация",
      send: "Отправить реплику",
      dismiss: "Скрыть подсказку тренера",
      themeDark: "Тёмная тема",
      themeLight: "Светлая тема",
    },
    // Stems, not finished moves: the chip drops a sentence STARTER into the box
    // that the player must complete in their own words (a full worked example
    // lives behind the подсказки hint). Leaving the scoring to the player, not the chip.
    quickMoves: [
      { icon: "question", label: "Вопрос SPIN", text: "Расскажите, как сейчас устроен " },
      { icon: "target", label: "Интерес", text: "Почему для вас важно именно " },
      { icon: "chart", label: "Критерий", text: "По рыночным данным справедливая величина — " },
      { icon: "handshake", label: "Эмпатия", text: "Я понимаю, что для вас важно " },
      { icon: "refresh", label: "Размен", text: "Если мы пойдём навстречу по срокам, сможете ли вы " },
    ],
  },
  en: {
    tagline: "negotiation trainer",
    interruptedRun: "The page closed during a negotiation. That run has not been restored or recorded as completed. Start a new practice run.",
    sound: { mute: "Mute sound", unmute: "Unmute sound" },
    eyebrow: "Harvard method · SPIN · BATNA",
    heroTitle: "Learn to <em>negotiate</em> — at the table, not from a textbook.",
    heroCta: "Start negotiating",
    heroLead:
      "A live dialogue with an AI counterpart who has hidden interests, a red line and a personality. The outcome depends on your strategy, wording and arguments — every line is analyzed in real time.",
    teach: {
      head: "Why this teaches",
      title: "Not a slide deck — a table where method decides.",
      panels: [
        {
          tag: "SPIN",
          name: "Positions ≠ interests",
          idea: "Behind every hard position sits an interest. Surface it with a question — and now there's something to negotiate.",
          example:
            "Not “give me a discount,” but “why does volume matter to you?” → the interest is uncovered, the Information meter rises, and their price moves — without pressure.",
        },
        {
          tag: "Harvard",
          name: "Objective criteria",
          idea: "A clash of opinions is won by the loudest. A clash of criteria, by whoever's right.",
          example:
            "“By market data, the fair rate is X” → that's legitimate leverage: the Leverage meter rises, and a concession doesn't read as surrender.",
        },
        {
          tag: "Harvard",
          name: "Trade-offs create value",
          idea: "Concede what's cheap for you but valuable to them. That turns one number into two wins.",
          example:
            "“If we move on timing, can you move on price?” → a trade-off (logrolling) advances the deal where head-on haggling stalls.",
        },
        {
          tag: "BATNA",
          name: "Your fallback as leverage",
          idea: "Your best alternative is a source of calm, not a club.",
          example:
            "Know your fallback and you bargain with confidence. But a blunt “I'll walk” hits trust: BATNA is leverage, not a battering ram.",
        },
      ],
      framing:
        "You can't win here with nice words: a deterministic engine owns the outcome and every line is analyzed on its merits — strategy, wording, argument. At the end you get an honest, reproducible score with a grade and a breakdown of your key moves.",
      demoCap: "Uncover an interest — their price slides toward your target.",
    },
    pickHead: "All practice situations",
    modes: {
      practice: { title: "Practice", desc: "A single scenario from the library. Hints on." },
      campaign: { title: "Campaign", desc: "A narrative career arc; consequences carry over." },
      custom: { title: "Custom deal", desc: "Generate a scenario for your own situation." },
      exam: { title: "Exam", desc: "No hints. Score, certificate, ranking." },
    },
    theirOffer: "their offer",
    yourTarget: "your target",
    meters: { trust: "Trust", tension: "Tension", info: "Information", leverage: "Leverage" },
    metersShort: { trust: "Trust", tension: "Tens", info: "Info", leverage: "Lev" },
    meterInfo: {
      trust: "Trust: rises with empathy and fair arguments, falls under pressure and threats.",
      tension: "Tension: rises with pressure, threats and rudeness; eases when you acknowledge interests.",
      info: "Information: grows as you surface the counterpart's hidden interests with questions (SPIN).",
      leverage: "Leverage: grows when you lean on objective criteria and on your fallback (BATNA), not on emotion.",
    },
    tracker: {
      title: "The price",
      key: "What the marks mean",
      target: "Your target",
      redline: "Your red line",
      redlineHint: "don't agree to anything worse",
      zone: "Your range: from target to red line",
      theirOffer: "Their price now",
      settled: "Settled at",
      yourOffer: "Your last offer",
      opening: "Their opening price",
      better: "better for you",
      worse: "better for them",
      hiddenFloor: "The other side's limit is hidden from you — you find it out by talking.",
      status: {
        beyond: "Their price is worse than your red line ({red}). Don't agree on these terms — push for concessions.",
        zone: "Their price is inside your range: this deal already works for you. You can push on toward your target ({target}).",
        target: "Their price is at or better than your target ({target}) — you can close the deal.",
        settled: "Deal closed at {deal}.",
      },
      history: "Their price, turn by turn",
      historyMoved: "{from} → {to}: they are giving ground toward your target.",
      historyAway: "{from} → {to}: the price has moved away from your target.",
      historyFlat: "{from}: not a step toward you yet.",
    },
    terms: {
      title: "What you can offer in return",
      lead: "Beyond the price, other terms matter to the other side too. Below is what you can give them. Offer one of these in exchange for movement on price: that moves the price without pressure.",
      example: "For example: “If we agree to {issue}, can you move on the price?”",
      howMarked: "A row is ticked once you offer it in the conversation yourself.",
      onTable: "offered",
      notYet: "not offered yet",
      debriefLabel: "Trade-offs",
      debriefNone: "You didn't use trade-offs — that's value left on the table.",
    },
    turn: "turn",
    turnBudget: "{n} turns",
    turnOf: "turn {n} of {max}",
    hint: "hint",
    useLine: "Use it",
    hintPending: "Your coach is picking a line…",
    quit: "leave",
    interests: "Hidden interests",
    interestToast: "Interest uncovered",
    coachLabel: "coach",
    judgeBadge: {
      label: "graded by meaning",
      aria: "A semantic AI judge scores your argumentation by meaning, not by keywords. The per-turn score is reproducible to within ±5 — the model does not answer identically twice. In exam mode the judge is off: the engine alone scores you.",
    },
    judgeReject: "recognized a pattern, not meaning",
    typingLabel: "typing…",
    judgingLabel: "the AI judge is reading your line…",
    batna: "Your fallback plan (BATNA)",
    batnaHint: "What you will do if there's no deal. The better it is, the calmer you can bargain.",
    moreLabel: "Briefing",
    streakLabel: "{n}-day streak",
    notPlayed: "not played",
    personalBest: "Personal best",
    newRecord: "new record!",
    placeholder: "Your line, in your own words…",
    placeholderNudges: [
      "Ask about a topic from the “Hidden interests” panel: “what matters to you in…”",
      "Cite market data or an objective criterion…",
      "Offer a trade: “if…, then…”…",
    ],
    send: "Send",
    argLabel: "arg.",
    arg: {
      pending: "the engine is scoring the argument…",
      byJudge: "argument quality {n} out of 100 — scored by the AI judge on meaning, ±5",
      byEngine: "argument quality {n} out of 100 — scored by the engine's technique lexicon",
      judgeSilent: "argument quality {n} out of 100 — scored by the engine's lexicon: the AI judge did not answer on this turn",
    },
    deltaNone: "no meter moved",
    deltaRepeat: "repeat — they already answered this",
    connecting: "Connecting…",
    usingMock: "demo mode (no server)",
    noAiChip: "scripted replies",
    noAiWhy: "The server has no model key, so the counterpart replies from engine templates. Scoring, price movement and the grade are unchanged.",
    composerLimit: "{n} {form} left",
    conn: {
      startFailed: "Could not start the game",
      startFailedBody: "The server did not confirm the game. Try again or choose another scenario.",
      reconnecting: "Connection lost — reconnecting…",
      lostTitle: "Lost connection to the server",
      lostBody: "We couldn't reconnect. You can restart the scenario — your progress and profile are saved.",
      retry: "Restart scenario",
      home: "Home",
      takenOver: "This game was taken over in another window — it is stopped here. Play there, or restart the scenario.",
    },
    custom: {
      head: "Describe your situation",
      context: {
        head: "For facilitators: scenario settings",
        help: "Set the learning context. Difficulty and tone apply to the scenario; offline mode uses template bargaining terms.",
        sector: "Industry", topic: "Negotiation topic", opponent_role: "Counterpart role",
        opponent_goal: "Counterpart goal", difficulty: "Difficulty", style: "Counterpart tone",
        styles: { analytical: "Businesslike, fact-based", relationship: "Relationship-focused", tough: "Tough" },
      },
      placeholder:
        "Describe your negotiation situation… e.g. “I'm a freelancer, a client wants a 20% discount on the project, but I can't go below my rate. I need to keep the contract without devaluing my work.”",
      promise:
        "From your description the AI builds a counterpart: character and voice, the red line they will not cross, the bargaining zone, and three hidden interests you'll have to surface with questions. Usually takes 2-3 seconds.",
      vsEditor:
        "“Your deal” is for you: describe your own real situation and you take the seat yourself. To prepare a negotiation for someone else — learners or your team — from ready-made settings, use the “Editor”.",
      examplesHead: "Not sure where to start? Take an example — it fills the box:",
      examples: [
        {
          title: "Contractor missed the deadline",
          text: "A contractor is three weeks late on our office refit and now wants extra money for materials. I need compensation and a guaranteed new schedule, but replacing him mid-job would cost more than finishing with him.",
        },
        {
          title: "Partner wants 50%",
          text: "My co-founder demands half the company: he put in the seed money, the product and the team are mine. I'll give up equity, not control. Walking away isn't an option — our key clients came through him.",
        },
        {
          title: "Client demands a 30% discount",
          text: "A major client demands a 30% discount to renew the annual contract, otherwise they go to a competitor. Below 15% we're losing money, but losing this logo also costs us half of our inbound leads.",
        },
      ],
      generate: "Generate scenario →",
      generating: "Generating your counterpart…",
      generatingSub: "The AI is designing a persona, hidden interests and a bargaining zone for your situation.",
      errorHead: "Couldn't generate a scenario",
      errorSub: "Generation sometimes fails. Try again, or start from a ready-made scenario.",
      timeout: "Generation took too long. The server may be busy — please try again.",
      orPickReady: "…or pick a ready-made scenario",
      retry: "Try again",
    },
    exam: {
      eyebrow: "Practice result · exam",
      resultTitle: "Exam result",
      scenarioLabel: "Scenario",
      nameLabel: "Name for the practice result (not verified)",
      namePlaceholder: "Candidate",
      awardedTo: "Entered name",
      dateLabel: "Viewing date",
      download: "Print practice result",
      certifies: "Simulator practice result. A server certificate is verified separately; neither qualification nor identity is certified.",
      notAwarded: "The passing grade is C. The result is recorded — this attempt is not your last.",
    },
    campaign: {
      overviewHead: "Your career arc",
      begin: "Begin the climb →",
      continue: "Continue the climb →",
      nextAct: "Next act →",
      seeResults: "See the summit →",
      locked: "locked",
      current: "now",
      done: "cleared",
      reputation: "Reputation",
    startFlag: "Start",
      actOf: "Act {n} of {total}",
      completeEyebrow: "The Climb · summary",
      completeTitle: "The climb is complete",
      avgLabel: "Average score",
      replay: "Climb again",
      pickHead: "Campaigns",
      notStarted: "not started",
      finished: "completed",
      verdicts: {
        A: "Master negotiator",
        B: "Confident negotiator",
        C: "Solid middleweight",
        D: "Room to grow",
        F: "Still learning",
      },
    },
    route: {
      head: "Your next step",
      firstTitle: "Start with “{table}”",
      firstWhy: "Difficulty {diff} of 5 — the easiest negotiation in the catalogue: you bargain over price only, and the counterpart is happy to talk. A misstep costs nothing — you can replay it.",
      firstCta: "Take the table →",
      courseTitle: "Course block: “{block}”",
      courseWhy: "A technique you started and never closed. Finish it — and it is yours; the game counts it exactly as the drill does.",
      courseWhyNew: "A technique you have not taken yet. The course teaches it with drills, not lectures: the right answer here is the right answer at the table.",
      courseCta: "Continue the block →",
      rematchTitle: "Replay “{table}”",
      rematchWhy: "Your record at this table is {grade}, {score} out of 100. This is the table that beat you — a new one can wait.",
      rematchCta: "Play it again →",
      campaignTitle: "“{campaign}”: act {n} of {total}",
      campaignWhy: "Next up: “{act}”. The reputation from earlier acts travels with you — they have heard about you.",
      campaignCta: "Continue the campaign →",
      dailyTitle: "Today's negotiation: “{table}”",
      dailyWhy: "The course is passed, the campaigns are done, no weak tables are left. Keep in form: today it is {mod}.",
      dailyCta: "Play →",
    },
    beats: {
      label: "Debrief sections",
      names: ["Outcome", "What you missed", "What a master would say"],
      next: "Next: {name} →",
      more: "Full breakdown ▾",
      less: "Hide details ▴",
    },
    daily: {
      title: "Today's negotiation",
      lead: "The same situation for everyone; tomorrow brings a new one. Today's twist:",
      best: "Your best here: {grade}, {score} out of 100.",
    },
    goal: {
      title: "Today's goal",
      count: "{done} of {target}",
      hint: "How many negotiations to finish today. Any finished game counts.",
      rule: "You can raise the goal right away; lowering it starts tomorrow — a promise to yourself isn't taken back halfway through the day.",
      later: "Today's goal is {today}; from tomorrow it's {later}. Changed your mind? Pick {today} again.",
      setNow: "{n} a day — starting today",
      setLater: "{n} a day — starting tomorrow; today's goal stays as it is",
    },
    rank: {
      title: "Your rank",
      toNext: "{n} XP to \u00ab{rank}\u00bb",
      hint: "Grows with experience (XP). A finished game earns as much XP as its score out of 100, plus a bonus for a deal and for a new record; course exercises earn XP too. Your rank never affects how games are scored.",
    },
    method: {
      title: "The four core techniques",
      lead: "Your technique score rests on these \u2014 35% of each game's final score. Tap a technique to see an example.",
      more: "Study them in the course",
    },
    rail: {
      progressHead: "Your progress",
      progressNote: "Counted from your games and kept in this browser. Does not affect how games are scored.",
      formatsHead: "Other ways to practise",
      formatsNote: "Once plain negotiations feel familiar, try a different angle.",
    },
    tour: {
      stepOf: "Step {n} of {total}",
      next: "Next",
      done: "Got it",
      skip: "Skip",
      replay: "How does this work?",
      dontShow: "Don't show in this section again",
      prefsTitle: "Tips",
      prefsLead: "When you enter a section, a short tour of its buttons and blocks appears — once per visit to the site. You can call it any time with “How does this work?” at the top of the page.",
      prefsSwitch: "Show section tips",
      prefsOff: "Turned off with the checkbox in: {list}.",
      prefsRestore: "Bring them back everywhere",
      names: { home: "Training", table: "Negotiation table", debrief: "Game breakdown", course: "Course", custom: "Your deal", admin: "Editor", campaign: "Campaign", exam: "Exam", profile: "Profile" },
    },
    tours: {
      home: {
        intro: { title: "This is a negotiation trainer", body: "You negotiate with a counterpart played by AI: they have their own price, a limit they won't go past, and hidden interests. Your job is to reach a good deal without damaging the relationship. After each game you get a breakdown of your moves and a grade from A to F." },
        start: { title: "Start here", body: "We picked your first negotiation — the easiest one. Press the green button on this card. Mistakes are fine: you can replay any game. At the table, Karl the raven is your coach." },
        nav: { title: "Sections", body: "Training — any situation from the catalogue. Campaign — a series of negotiations where your reputation carries over. Course — short lessons with exercises. Your deal — AI builds a negotiation from your description. Exam — no hints, graded. Profile — your progress and settings; Editor — for educators. Every section has its own tips." },
        progress: { title: "Your progress", body: "Today's goal, your day streak and your rank are counted from your games. They never change how a game is scored. Tikhon the elephant keeps your records — you'll meet him in the breakdown after a game." },
      },
      table: {
        meters: { title: "Four conversation meters", body: "Trust grows with empathy and fair arguments. Tension grows with pressure and rudeness: push it to the limit and the counterpart walks out. Information is how much you've learned about their interests; leverage is the strength of your arguments. After each line you see which meter moved." },
        price: { title: "The price", body: "The blue dot is their price now, the blue ring is where they started. The green mark is your target, the red one is your red line: don't agree to anything worse — your fallback is better. The hatched band between them is your range. The line on top says where their price stands." },
        interests: { title: "Hidden interests", body: "The counterpart has three hidden interests; here you see the topics they sit in. Ask about a topic and the interest opens up — and the price moves without pressure." },
        batna: { title: "Your fallback plan (BATNA)", body: "What you'll do if there's no deal. Mentioning it calmly is leverage. A blunt “I'll walk” hits trust." },
        terms: { title: "Brief and what to offer in return", body: "Behind this button: the task and what you can give the other side in exchange for movement on price — say, contract length or a deposit. That's a trade-off, and it moves the price better than haggling." },
        composer: { title: "Your line", body: "Write in your own words and send. The buttons under the box insert the start of a phrase for a technique; the bulb asks the coach for a hint. A game has a limited number of turns — see the counter on top." },
        exit: { title: "How to finish", body: "A deal closes in the conversation: propose the terms — “Agreed: 86 per unit, shall we lock it?”. The “leave” button ends the game without a result. “Layers” — voice, camera and other extras, chosen before the first move." },
      },
      debrief: {
        grade: { title: "The game's grade", body: "The letter and number are the result the engine gave: 40% deal economics, 25% relationship, 35% technique. A and B — the method worked, C — a pass, D and F — room to grow." },
        parts: { title: "What it's made of", body: "Economics — how good the price is. Relationship — the trust and tension you parted with. Technique — questions, facts, trade-offs and no pressure." },
        beats: { title: "The breakdown in parts", body: "Outcome, what you missed, what a master would say. The button leads to the next part; the dots switch between them." },
        whatif: { title: "What if…", body: "Your most costly move. Type a different line and the engine shows how the game would have gone from the same point." },
        next: { title: "What next", body: "Play again — your previous attempt runs alongside move by move — or go back to the list. Every game adds to your skills profile." },
      },
      course: {
        path: { title: "Course map", body: "Blocks go from your first question to a complex deal. Each has short lessons with exercises and an exam at the end. Locked blocks open as you progress." },
        current: { title: "Start with the marked one", body: "This is the next block in order. Inside: a one-minute theory, exercises of different kinds and a capstone — a short real game on this technique." },
        redo: { title: "Fix your mistakes", body: "Exercises you got wrong are collected here. Redoing them is cheaper than repeating the same mistake at the table." },
        master: { title: "Master exam", body: "Three games in a row on new tables, no hints. Opens once every block of the course is passed." },
        why: { title: "Why this teaches", body: "Expand to see the method's four techniques with examples from real games." },
      },
      custom: {
        vs: { title: "Your deal", body: "Here you play your own real situation: describe it and AI builds a counterpart for it. To prepare a negotiation for others, use the “Editor”." },
        text: { title: "Describe the situation", body: "Who you are, what you want, where your limit is and what stands in the way. The more specific, the more accurate the counterpart." },
        examples: { title: "Not sure where to start?", body: "Press an example — it fills the box and you can adjust it." },
        context: { title: "For facilitators", body: "Optional settings: field, topic, the counterpart's role and goal, difficulty and tone. Useful when you prepare a scenario for a group." },
        go: { title: "Generate", body: "AI builds the counterpart in a few seconds: character, red line, bargaining zone and three hidden interests. Then it's a regular game with a breakdown." },
      },
      admin: {
        vs: { title: "The Editor is for whoever teaches", body: "You build a negotiation for someone else from ready-made settings and see in advance what they'll get. To play your own situation, use “Your deal”." },
        presets: { title: "Ready-made examples", body: "Each button fills the settings with a case from its field. It's easiest to start from an example and adjust." },
        fields: { title: "What each setting does", body: "Context — which field the case comes from. Meeting topic — what the talk is about. Counterpart role — who sits across the table. Tone — how open they are. Difficulty — more concessions or higher expectations. Stated objectives — what they defend; they shape their position and the value of your concessions." },
        preview: { title: "Learner preview", body: "“Preview the terms” shows the learner's role, the counterpart, the meeting terms and how your settings shaped them. The practice is launched from here too." },
        actions: { title: "Draft and reset", body: "The draft is saved in this browser. “Reset” brings back the procurement example." },
      },
      campaign: {
        pick: { title: "Two campaigns", body: "Two story-driven series of negotiations. Each keeps its own progress; you can switch at any time." },
        arc: { title: "The campaign path", body: "Acts go in order. The result of each act changes your reputation, and your reputation changes how you're greeted in the next one." },
        current: { title: "Current act", body: "What the act is about and which technique it trains. “Warm-up” is two course exercises before the game; you can skip it." },
        rep: { title: "Reputation", body: "The sum of your earlier acts. High — they greet you warmly, low — with caution. It never changes an act's grade." },
        cta: { title: "To the table", body: "This button seats you at the current act. In the campaign voice, camera and other layers are off, so acts stay comparable." },
      },
      exam: {
        intro: { title: "Exam", body: "A game with no hints: meters, coach and highlights stay hidden until the breakdown. Only the engine scores it, so the result is reproducible." },
        name: { title: "Name for the result", body: "Optional. It is printed on the practice result if you pass with a C or better." },
        catalog: { title: "Pick a situation", body: "Any from the catalogue. A familiar one tests the skill, a new one tests how you handle surprises." },
      },
      profile: {
        rank: { title: "Rank and experience", body: "Your rank grows with experience from games and course exercises. It never changes how games are scored." },
        skills: { title: "Skills", body: "Six negotiator skills — the average across all your games. You can see what you're strong at and what to work on." },
        growth: { title: "How you're growing", body: "The history of your games. Trends are shown from six games on: with two points a line would suggest a certainty that isn't there." },
        layers: { title: "Layers", body: "Voice, camera, the counterpart's expressions. They only work in “Training” and never affect your grade." },
        tips: { title: "Tips", body: "Turn section tips off everywhere here — and bring back the ones you turned off with the checkbox." },
      },
    },
    layers: {
      head: "Layers",
      lead: "Layers are optional extras for a game: voice instead of typing, a camera, the counterpart's facial expressions, questions about how they react. None of them affects your grade.",
      where: "They work only in \u201cTraining\u201d. In the campaign, course, exam and \u201cYour deal\u201d layers are always off, so grades stay comparable. What you choose here applies to your next training game.",
      needs: {
        voice: "needs a microphone \u2014 the browser asks for permission as soon as you turn the layer on",
        camera: "needs a camera \u2014 the browser asks for permission as soon as you turn the layer on",
      },
      check: {
        voice: {
          checking: "Asking for the microphone \u2014 answer the browser prompt.",
          granted: "The microphone works. We switched it off right away \u2014 it turns on when the game starts.",
          denied: "Microphone access is blocked. Allow it in the site settings (the icon left of the address) and turn the layer on again.",
          missing: "No microphone found. Connect one and turn the layer on again.",
          busy: "The microphone is busy in another app. Close it there and turn the layer on again.",
          failed: "The microphone didn't start. Try again or reload the page.",
        },
        camera: {
          checking: "Asking for the camera \u2014 answer the browser prompt.",
          granted: "The camera works. We switched it off right away \u2014 it turns on when the game starts.",
          denied: "Camera access is blocked. Allow it in the site settings (the icon left of the address) and turn the layer on again.",
          missing: "No camera found. Connect one and turn the layer on again.",
          busy: "The camera is busy in another app \u2014 a video call, say. Close it there and turn the layer on again.",
          failed: "The camera didn't start. Try again or reload the page.",
        },
      },
      avatarLater: "A live video face for the counterpart is coming later. For now these are drawn expressions.",
      what: "what is this",
      sameGrade: "does not affect your grade",
      lockedMode: "This table runs with layers off — its grade has to stay comparable to the rest",
      lockedStarted: "The table is already running: layers are chosen before the first move",
      close: "Close layers",
      seenHead: "What the camera saw",
      seenNote: "What was happening at the table — and what was happening to you meanwhile. None of it counted towards the grade.",
      seenStart: "before the first move",
      seenTurn: "after move {n}",
      seenTell: "your face gave you away",
      seenMore: "and {n} more, earlier",
      unavailable: "unavailable",
      naSummary: "These will not come up here: {list}. The reason sits under each switch.",
      presets: "Presets",
      start: "Start the negotiation",
      back: "back to opponents",
      names: { probe: "Read the face", voice: "By voice", camera: "Camera", avatar: "Counterpart's face",
               pokerface: "Poker face" },
      blurbs: {
        probe: "After a move the game asks what your counterpart feels right now",
        voice: "Speak aloud — and hear the reply. You can cut in",
        camera: "Presence signals: who is in frame, where you look",
        avatar: "Their expression changes with each of your moves, and with voice it also moves as they speak. Without it the face shows only the overall mood",
        pokerface: "Counts how often your face gave you away",
      },
      needsCamera: "turn the camera on — there are no frames to count without it",
      presetNames: { classic: "Classic", read: "Read the face", call: "Video call",
                     poker: "Poker face", full: "Full contact" },
      tellsOf: "times your face gave you away — out of {n} frames seen",
      explainHead: "What this changes",
      explain: [
        "Layers change what the debrief shows — never the grade.",
        "Every scenario is playable with all layers off.",
        "The exam keeps them off so certificates stay comparable.",
      ],
    },
    mascot: {
      karl: "Karl",
      tikhon: "Tikhon",
      rememberTitle: "Tikhon remembers",
      alt: {
        idle: "Karl is watching",
        think: "Karl is thinking",
        cheer: "Karl approves",
        concern: "Karl is wary",
        point: "Karl is pointing something out",
        celebrate: "Karl is celebrating",
        sad: "Karl is downcast",
        study: "Karl is studying the data",
        shrug: "Karl spreads his wings — nothing to go on",
        oops: "Karl winces",
        doze: "Karl is dozing off",
      },
    },
    streak: {
      title: "Day streak",
      hint: "Days in a row on which you finished a game with a C or better.",
      kept: "{n} {form} in a row. Today is already counted.",
      waiting: "{n} {form} in a row. You have not played today — one session keeps it alive.",
      shielded: "A freeze will cover the gap — {n} left in reserve.",
      lost: "The streak is broken. Today's session starts a new one.",
      away: "You have been away {n} {form}. The table is still here.",
    },
    meeting: {
      title: "Meeting",
      status: {
        connecting: "Connecting…",
        reconnecting: "Connection dropped — returning to the same game",
        lost: "Connection lost",
        speaking: "Speaking",
        hearing: "Hearing you",
        thinking: "Thinking",
        listening: "Listening",
      },
      testStream: "Test video stream — not the counterpart's video",
      micOff: "Mute microphone",
      micOn: "Unmute microphone",
      micMuted: "Microphone off",
      noMic: "No microphone — reply by text",
      interrupt: "Cut in",
      text: "Reply by text",
      end: "End",
      soundBlocked: "The browser has not enabled sound",
      soundOn: "Turn sound on",
    },
    live: {
      micOn: "microphone live",
      hearing: "hearing you",
      interrupt: "cut in",
      inFrame: "camera · frames flowing",
      outFrame: "camera · no frames",
      peekNote: "only you can see this",
      peekOpen: "check your light",
      seen: "the model sees:",
      offVoice: "Voice did not start",
      offCamera: "Camera did not start",
      offHow: "The round continues in text. Allow access in the browser and start again.",
    },
    probe: {
      ask: "What is going on with them right now?",
      readFace: "Read the face",
      blocked: "Answer the question to continue",
      tally: "read {n} of {m}",
      right: "Correct.",
      wrong: "Missed.",
      reactions: {
        warmed: "Warmed up", opened_up: "Opened up", persuaded: "Persuaded by data",
        collaborated: "Ready to cooperate", neutral: "Staying neutral",
        not_yet: "Not ready yet", probe_vague: "Asks you to be specific",
        pressured: "Under pressure",
        hardened: "Closed off", offended: "Offended", walked_out: "Leaving the table",
      },
      why: {
        warmed: "Trust rose — you hit their actual interest.",
        opened_up: "Information jumped: they shared what they had been holding back.",
        persuaded: "Leverage rose — an objective criterion convinced them, not pressure.",
        collaborated: "Tension fell and trust rose: you offered a trade.",
        neutral: "The meters barely moved — the move passed them by.",
        not_yet: "No refusal, but no movement either: too early to close.",
        probe_vague: "The question was too broad to uncover an interest. Name the topic.",
        pressured: "Tension rose — they read that as a push.",
        hardened: "Tension rose and trust fell — they closed off.",
        offended: "Trust collapsed: a harsh tone hits harder than any argument.",
        walked_out: "They are getting up — tension hit its limit.",
      },
      debriefHead: "How well you read them",
      observation: "observation · does not affect the grade",
    },
    otherSide: {
      title: "Play the other side",
      cardLead: "The same negotiations, but you sit in the counterpart's chair: their price, their red line and their hidden interests are yours. The best way to see why the other side digs in is to dig in yourself — and know why.",
      cardCta: "Pick a negotiation",
      scored: "a regular game · scored as usual",
      sheetLead: "Three tables from the library you can play from the other side. The grade is the same: same formula, same layers off, same technique ceiling.",
      youBecome: "You play as: {name}",
      origin: "The same table from this side: “{title}”",
      defendTitle: "What you are defending",
      defendLead: "Three reasons you will hold your price. The person across the table cannot see them — just as you could not, when you sat there.",
      play: "Take a seat →",
      debriefTitle: "You played the other side",
      seat: "At this table you were {seat}.",
      blindTitle: "What the person across the table never saw",
      windowsTitle: "Where a question would have opened it",
      windowsNone: "You uncovered everything they were hiding. There was nothing left to ask.",
      mascotAlt: "The mentor goes over the round from the other side of the table",
      close: "Close the table picker",
    },
    reading: {
      title: "Study someone else's game",
      cardLead: "You don't play — you watch a finished negotiation move by move. At each move, guess how the counterpart will answer, and see straight away whether you were right and why. Trains your feel for reactions.",
      cardProgress: "Games studied: {n} of {total}",
      cardCta: "Study a game",
      notScored: "exercise · does not affect your grade",
      gameOf: "Round {n} of {total}",
      turnOf: "Turn {n} of {total}",
      turnsN: "turns: {n}",
      watching: "Across the table sits {name}.",
      lookFor: "Read two things: which technique the line carries — and whether the table can take it yet.",
      ask: "How will {name} answer this move?",
      askNone: "Same answer as the previous question — this turn we simply watch.",
      exact: "Spot on.",
      near: "Right direction, wrong strength.",
      miss: "Missed.",
      yourAnswer: "You said",
      engineSaid: "The engine answered",
      evidence: "What the line carried",
      noTags: "No technique at all: nothing for the engine to work with.",
      argq: "argument quality {n}",
      effect: "What it did to the table",
      noMove: "The meters did not move and the price stayed put.",
      gate: "Trust {trust} is not above the gate of {gate}: the topic was right, but it is too early to open up.",
      revealed: "Topic uncovered: {topic}",
      next: "Next",
      tally: "Exact {exact} · direction {near} · missed {miss}",
      grade: "The engine graded this round {grade} — {overall} out of 100.",
      endAgreement: "They shook on it: {deal}.",
      endBreakdown: "The table fell apart, no deal.",
      endOpen: "The turns ran out, no deal.",
      missedHead: "What stayed closed",
      again: "Read it again",
      nextGame: "Next round",
      close: "Close",
      tikhonTitle: "Tikhon remembers",
      best: "Last time you read this round exactly {n} of {total}.",
      a11y: { close: "Close the game study", table: "The table as an observer sees it" },
    },
    nav: { admin: "Editor", training: "Training", campaign: "Campaign", custom: "Your deal",
           course: "Course", exam: "Exam", progress: "Progress", profile: "Profile" },
    course: {
      title: "Negotiation course",
      lead: "{n} blocks: from your first question to a complex deal. Short lessons, exercises and negotiations where you put each new skill into practice.",
      cardLead: "Short lessons with exercises: how to ask questions, lean on facts and trade concessions. Every technique then works in real games.",
      blocksDone: "Blocks passed: {n} of {total}",
      blockOf: "block {n} of {total}",
      blockDone: "completed",
      blockOpen: "open",
      blockLocked: "locked",
      toTable: "To the table →",
      allBlocks: "All blocks",
      tasksN: "{n} tasks",
      taskForms: ["task", "tasks", "tasks"],
      theory: "theory",
      examTitle: "Block exam",
      examLead: "{n} tasks, pass mark {pass} of {total} points. Hints off, review after you finish.",
      examBest: "Best result: {best} of {total}",
      examPassed: "passed",
      examStart: "Take the exam",
      examMode: "exam",
      examFinish: "Finish",
      examPass: "Exam passed",
      examFail: "Exam not passed",
      examResult: "{score} of {total} points, pass mark {pass}. Retake right away — the draw will differ.",
      toTasks: "To the tasks →",
      lessonDone: "Lesson done",
      lessonComplete: "Lesson complete",
      lessonScore: "Correct: {n} of {total}",
      tasksTitle: "Tasks · {lesson}",
      stepOf: "task {n} of {total}",
      next: "Next",
      checkIt: "Check",
      faceAlt: "The opponent's face at this moment",
      hits: "{n} of {total} already in place",
      moveUp: "Move up: {item}",
      moveDown: "Move down: {item}",
      correct: "Correct",
      wrong: "Not quite",
      reference: "One way to say it",
      freeformHint: "Write the line in your own words…",
      matchHint: "Pick on the left, then on the right — the pair links.",
      optKeys: "Keys 1–4 pick an option, Enter confirms.",
      examQuit: "Leave the exam",
      recoveryTitle: "Revisit before the retake",
      nextUp: "Next up",
      continue: "Continue the course",
      actTeaches: "The technique this act trains",
      coachNote: "the engine decided · this is the coach's comment",
      masterTitle: "Master exam",
      masterLead: "Three negotiations in a row, on tables the blocks never used. Layers off.",
      masterLocked: "Unlocks once all {n} course blocks are passed.",
      masterStart: "Start",
      masterAgain: "Run it again",
      masterAbout: "{n} real negotiations in a row, each with its own condition. You pass at {pass} of {n}. Nobody names the technique for you: real negotiations do not either.",
      masterNext: "Negotiation {n} of {total} →",
      masterPassed: "Master exam passed",
      masterPassedBody: "Three tables, no hints, scored by the same engine as everything else. That is what makes the result comparable.",
      masterKarlPass: "Passed. Now the same thing — at a real table.",
      masterKarlFail: "Not passed yet. Run it again — same tables, but they will have to be played differently.",
      masterProgress: "Negotiation {n} of {total}",
      masterDrillPass: "Exam negotiation passed",
      masterDrillFail: "Exam negotiation not passed",
      warmupTitle: "Warm-up",
      warmupSkip: "Skip",
      warmupReady: "Warm-up done",
      warmupToTable: "To the table",
      warmupKarl: "Now the same thing — live, and the price will actually move.",
      warmupCta: "Warm-up · 2 tasks",
      redoTitle: "Fix your misses",
      redoDone: "Misses cleared",
      redoKarl: "A fixed mistake is worth half the XP — and it is still the best deal in this product.",
      trainThis: "Train this",
      drillStart: "Start the mini-negotiation",
      drillNote: "A real negotiation of {n} {form}. Scored by the engine, as always.",
      drillPass: "Capstone passed",
      drillFail: "Capstone not passed",
      backToCourse: "← Back to the course",
      karlTheory: "Read it — now let us test it. Theory without practice evaporates in a day.",
      karlPerfect: "Not a single miss. That is what a skill looks like.",
      karlOk: "Fine. A mistake here costs less than one at the table.",
      karlExamPass: "Passed. The next block is open.",
      karlExamFail: "Not yet. Read the misses and come back — the draw will differ.",
      tikhonTitle: "Tikhon remembers",
      tikhonBody: "Course and games share one profile: XP, ranks and the streak are the same. Block exams run with no layers, so results stay comparable.",
      types: {
        choice: "Pick the line", spot_error: "Spot the error", order: "Put in order",
        match: "Match pairs", numeric: "Compute", freeform: "In your own words",
        reaction: "Read the reaction", meters: "Predict the meters", face: "Read the face",
        drill: "Capstone",
      },
      meters: { trust: "Trust", tension: "Tension", info: "Information",
                leverage: "Leverage", up: "Rises", down: "Falls" },
      moves: {
        interests_probe: "interest probe", acknowledge: "active listening",
        objective_criteria: "objective criterion", batna: "alternative",
        tradeoff: "trade", threat: "ultimatum", hostile: "rudeness",
        accept: "closing", concession: "concession", anchor: "anchor", offer: "price offer",
        spin_situation: "SPIN · situation", spin_problem: "SPIN · problem",
        spin_implication: "SPIN · implication", spin_needpayoff: "SPIN · need-payoff",
        open_question: "open question", statement: "statement", rapport: "rapport",
      },
      why: {
        missing: "Missing move: {move}",
        missingAny: "At least one of these is needed: {moves}",
        forbidden: "Not allowed here: {move}",
        missingTerm: "The secondary issue you were trading is not named",
        tooShort: "Too short — the engine has nothing to judge",
        weak: "Weak argument: no grounding, number or source",
        noNumber: "A concrete number is required",
        generic: "That answer did not pass",
      },
    },
    opening: {
      title: "The table is set",
      scene: "{role} Across from you: {name}. Their price: {offer}. Your target: {target}, red line: {red}.",
      hint: "They have three hidden interests. The topics they sit in are listed in the \u201cHidden interests\u201d panel — ask ABOUT A TOPIC and the interest opens. Until you surface them the argument is only about price — and there the harder pusher wins.",
      lines: [
        { icon: "target", tag: "Interest", text: "What matters to you in " },
        { icon: "chart", tag: "Criterion", text: "Let's anchor on objective data: " },
        { icon: "refresh", tag: "Trade-off", text: "In exchange for movement on price, we can " },
      ],
    },
    onboarding: {
      skip: "Skip",
      gotIt: "Got it",
      interestTitle: "You uncovered an interest",
      interestBody:
        "Behind every position sits an interest. You asked — and the Information meter rose. That's how you find what's really worth negotiating over.",
      dealTitle: "Their price is moving",
      dealBody:
        "Look: their price slid toward your target. Every good move nudges it — keep an eye on this scale.",
      firstTitle: "Your first move is in",
      firstBody:
        "{gain} An interest only opens when the question names a TOPIC. Here they are — ask about \u201c{topic}\u201d.",
      firstGain: "The Information meter went +{n} — that is not much.",
      firstGainNone: "Not one meter moved.",
    },
    turningPoints: { title: "Turning points", turn: "Turn" },
    herSide: {
      title: "From their side of the table",
      lead: "{name}, on the other side of the table: what was happening there, turn by turn, while you played this side.",
      turn: "Turn",
      you: "You",
      missedTitle: "What you never found out",
      mascotAlt: "Tikhon points at the number",
    },
    tagLabels: {
      spinSituation: "SPIN · Situation",
      spinProblem: "SPIN · Problem",
      spinImplication: "SPIN · Implication",
      spinNeedPayoff: "SPIN · Need-payoff",
      question: "Open question",
      interests: "Probing interests",
      empathy: "Active listening",
      criteria: "Objective criteria",
      batna: "Fallback plan (BATNA)",
      tradeoff: "Trade-off",
      threat: "Pressure",
      hostile: "Hostile tone",
      concession: "Concession",
      anchor: "Anchoring",
      accept: "Closing",
      rapport: "Rapport",
      offer: "Offer / number",
    },
    reveal: {
      title: "What the other side actually cared about",
      found: "you drew this out",
      missed: "you never asked",
      allFound: "You surfaced everything they were protecting — you played that table with open cards.",
      noneFound: "You negotiated blind — not one of their interests ever came up.",
    },
    mentor: {
      title: "A word from your mentor",
      strength: "What worked",
      growth: "What to change next time",
    },
    master: {
      title: "What a master would say",
      yours: "Your line",
      label: "Master",
      why: "Why it's stronger:",
      criteria: "Let's anchor on an objective criterion rather than positions: what price is fair by market data for deals like this?",
      interest: "Before we talk price — what matters most to you here, and why? I want to understand your interest, not just your position.",
      tradeoff: "Let's trade: if I move on the timeline, could you move on price? Let's package the concessions together.",
      threat: "Let's take the pressure off the table and decide on the merits: what criterion would be fair to us both?",
      whyCriteria: "an objective criterion persuades better than positional bargaining (Harvard method).",
      whyInterest: "the interest behind the position opens room for a deal (Harvard method, SPIN).",
      whyTradeoff: "trading across issues of differing value creates value instead of splitting it (logrolling).",
      whyThreat: "moving from threats to criteria lowers tension and preserves the relationship.",
    },
    techniqueFloor: "Great price, but the grade is capped: an A/B is earned with method — interests, criteria, trade-offs — not by bargaining alone.",
    whatIf: {
      title: "What if…",
      teaser: "One move changed everything →",
      intro: "Your most costly move. See what would have happened had you asked differently — from the same moment.",
      reveal: "Show what would have happened",
      loading: "Replaying the branch…",
      again: "Try another line",
      altLabel: "A stronger line",
      customPlaceholder: "…or write your own line",
      wasLabel: "What happened",
      couldLabel: "What could have been",
      opponentLabel: "Opponent's reply",
      offerLabel: "Their price",
      meters: { trust: "Trust", tension: "Tension", info: "Info" },
      betterBanner: "This would have gone better",
      neutralBanner: "Compare the outcomes",
      insteadOf: "instead of",
      uncovered: "you'd have uncovered an interest",
      trustHigher: "trust higher",
      priceFurther: "the price moved further",
      unavailable: "Couldn't compute the branch for this scenario.",
      presets: [
        "What matters most to you in this deal, and why?",
        "Let's check the market data — what price would be fair?",
      ],
      mobileCta: "Show the branch",
    },
    rematch: {
      offerTitle: "Play against yourself",
      offerBody: "This table already holds a game of yours: {grade} ({score}) · {deal}. Play it again — that run walks beside you turn by turn, and the same engine computes the gap.",
      offerSame: "This run is saved as your opponent. Sit down at the table again and it will walk beside you turn by turn.",
      cta: "Play against yourself",
      title: "You then · you now",
      open: "Show your previous run",
      close: "Collapse",
      then: "You then",
      now: "You now",
      turn: "Turn {n}",
      resultThen: "Result then",
      nextThen: "Back then your next line was",
      noMoveYet: "Your move",
      pastEnded: "Back then the game ended here",
      price: "Price",
      ahead: "better than then",
      behind: "worse than then",
      even: "same as then",
      byTurns: "Divergence turn by turn",
      differentTable: "That table opened differently (a daily condition or an act's reputation). Read the gap with that in mind.",
    },
    debriefTitle: "Negotiation debrief",
    coachTitle: "Coach recommendations",
    lastTime: "Last time at this table you closed at {grade} ({score}). Now — {now}. Compare yourself with yourself: at a table you have played before, the only thing that changed is your play.",
    retry: "Try again",
    toHome: "To scenarios",
    outcome: {
      agreement: "Agreement reached",
      breakdown: "Talks broke down",
      active: "No agreement",
      see: "See the debrief →",
      preparing: "Building your debrief…",
    },
    sb: { economic: "Deal economics", relationship: "Relationship", technique: "Negotiation technique" },
    stat: {
      spin: "SPIN stages",
      criteria: "criteria",
      empathy: "listening",
      interests: "interests",
      tradeoffs: "trade-offs",
      threats: "threats",
      arg: "argumentation",
    },
    forms: {
      chars: ["character", "characters", "characters"],
      games: ["game", "games", "games"],
      days: ["day", "days", "days"],
      turns: ["turn", "turns", "turns"],
    },
    statForms: {
      criteria: ["criterion", "criteria", "criteria"],
      empathy: ["listen", "listens", "listens"],
      tradeoffs: ["trade-off", "trade-offs", "trade-offs"],
      threats: ["threat", "threats", "threats"],
    },
    footRight: "the outcome depends on your strategy",
    gam: {
      rankLabel: "rank",
      toNext: "{n} XP to “{name}”",
      maxRank: "top rank reached",
      totalXp: "{n} XP",
      levelUp: "level up!",
      xpAwardLabel: "earned this negotiation",
      xpAwardFailed: "talks broke down",
      lowData: "not enough data — play more",
      dailyGoal: "daily goal",
      dailyDone: "daily goal met",
      dailyTodo: "play one negotiation",
      dailyProgress: "{done}/{target}",
      dailyTargetLabel: "Daily goal",
      dailyTargetSet: "{n}/day",
      freezeLabel: "freeze",
      freezeSaved: "A freeze saved your streak — the missed day doesn't count.",
      streakSkipped: "This result didn't count toward your streak — it grows on a grade C or better.",
      milestone: {
        kicker: "Milestone",
        dismiss: "Continue",
        streakTitle: "{n} {form} in a row",
        streakDetail: "A week at the table. The habit of negotiating is sticking.",
        streakUnit: "days",
        rankKicker: "New rank",
        rankDetail: "You're growing as a negotiator — keep it up.",
        rankUnit: "XP",
      },
      skillsTitle: "Skill profile",
      skillsLink: "Skill profile",
      skillsSub: "Your average across every game — so you can see where you're growing.",
      strongIn: "Strong at",
      workOn: "Work on",
      noGames: "Play your first negotiation to see where you're growing.",
      back: "← Back",
      gamesCount: "{n} {form}",
      achievementsTitle: "Achievements",
      unlockedToast: "Achievement unlocked",
      locked: "not yet earned",
      skillNames: {
        questions: "Questions / SPIN",
        interests: "Interests",
        criteria: "Objective criteria",
        listening: "Active listening",
        tradeoff: "Trade-offs",
        tension: "Tension management",
      },
      skillHints: {
        questions: "Surface the substance with questions, not pressure",
        interests: "Find the hidden interests behind the position",
        criteria: "Ground your case in objective criteria",
        listening: "Acknowledge what matters to the other side",
        tradeoff: "Create value by trading concessions",
        tension: "Keep trust up and tension from rising",
      },
    },
    growth: {
      title: "How you are growing",
      sub: "Every dot is one finished negotiation — the very score the engine turned into a grade.",
      lowTitle: "Not enough data yet",
      lowAria: "{played} of {need} games played",
      lowBody: "{played} of {need} played. A trend needs six games: a line through two points can always be drawn, and it would show a confidence that isn't there.",
      windowNote: "Last {n} {form} · {from} — {to}",
      overallLabel: "Overall score per game",
      dirUp: "rising",
      dirDown: "slipping",
      dirFlat: "unchanged",
      thenNow: "{before} → {after}",
      noise: "a {delta} gap stays inside the ±{threshold} spread — that's noise",
      grew: "a {delta} gap against a ±{threshold} spread",
      movedUp: "Grew the most",
      movedDown: "Slipped",
      noMoves: "No skill has yet moved beyond its own spread. That isn’t “bad” — it’s “too early to call”.",
      chartAria: "Overall score across {n} games: {before} at the start, {after} in the latest ones.",
      notScored: "History adds nothing to your score — every grade was already set by the engine.",
      skillsHead: "By skill",
    },
    a11y: {
      nav: "Sections",
      stats: "Your progress",
      hud: "Negotiation meters",
      chatLog: "Negotiation transcript",
      gameHeading: "Negotiation: {name}",
      grade: "Grade {grade}, {score} out of 100",
      scoreBar: "{label}: {v} out of 100",
      deal: "Deal. Your target {target}, red line {redline}, their current offer {offer}.",
      delta: "{label}: {value}",
      skip: "Skip to content",
      speaking: "The counterpart is speaking",
      amplitudeAnimation: "Audio-driven mouth · local animation",
      send: "Send message",
      dismiss: "Dismiss coach note",
      themeDark: "Dark theme",
      themeLight: "Light theme",
    },
    // Stems, not finished moves — the player completes each in their own words
    // (the full worked example stays behind the подсказки hint button).
    quickMoves: [
      { icon: "question", label: "SPIN question", text: "Tell me about your current process for " },
      { icon: "target", label: "Interest", text: "Why is that important to you — " },
      { icon: "chart", label: "Criterion", text: "By the market rate, the fair value is " },
      { icon: "handshake", label: "Empathy", text: "I understand that what matters to you is " },
      { icon: "refresh", label: "Trade-off", text: "If we move on timing, can you move on " },
    ],
  },
};
