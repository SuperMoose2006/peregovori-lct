// Table.tsx — the negotiation screen. Left: counterpart card, offers board,
// BATNA, deal terms, interests tracker. Right: the meter strip, chat log and
// composer. Шкалы стоят в правой карточке, а не на рельсе: рельс — вложенный
// скроллер, и «выигрываю ли я» уезжало за его край.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Deltas, Lang, Mode, ScenarioView, StateView } from "../types";
import type { TransportKind } from "../api/transport";
import type { ChatEntry } from "../api/useNegotiation";
import type { Strings } from "../i18n";
import { isTutorialDone, markTutorialDone, shouldRunTutorial } from "../lib/progress";
import { teachingPlaceholder, formatDeal } from "../lib/format";
import { haptic, play } from "../lib/sound";
import { OpponentFace } from "./OpponentFace";
import { ScreenHeading } from "./ScreenHeading";
import { scrollTo } from "../lib/motion";
import { Meters } from "./Meters";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { LiveBar } from "./LiveBar";
import { Karl, karlState } from "./Mascot";
import { DealTracker } from "./DealTracker";
import { DealTerms } from "./DealTerms";
import { Onboarding, type CoachStep } from "./Onboarding";
import type { Layers } from "../lib/layers";

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  kind: TransportKind | null;
  scenario: ScenarioView;
  state: StateView | null;
  log: ChatEntry[];
  busy: boolean;
  disconnected?: boolean;
  // Which half of the wait we're in; null when the server never said (mock,
  // judge disabled). See NegotiationState.phase.
  phase?: "judging" | "replying" | null;
  // Whether the live semantic judge scored this session (drives the "graded by
  // meaning" badge on coach lines). False offline/mock — nothing to claim.
  judgeActive: boolean;
  /** `capabilities.cloud_ai` из `session.created`. Сервер поднялся, но ключа у
   *  него нет → реплики оппонента шаблонные, и об этом обязана быть строка на
   *  экране. `null` — сессии ещё нет, утверждать нечего (принцип 2: пока
   *  сервер не ответил, «нет ИИ» такая же неправда, как «ИИ есть»). */
  cloudAi?: boolean | null;
  onSend: (text: string) => void;
  onHint: () => void;
  onQuit: () => void;
  // The negotiation's last beat. When the table closes we hold here for a moment
  // instead of swapping straight to the scorecard: the handshake (or the walk-out)
  // IS the climax, and the hold also covers the AI mentor still composing its
  // closing word. `debriefReady` false → the button waits and says so.
  debriefReady?: boolean;
  onSeeDebrief?: () => void;
  /** Грейд закрытой партии — он приезжает вместе с разбором, пока стол ещё
   *  держит паузу после рукопожатия. Нужен ровно затем, чтобы Карл праздновал
   *  сделку A/B и не праздновал сделку на D. Null — разбора ещё нет. */
  grade?: string | null;
  // Realtime-слои. Все необязательные: партия обязана рисоваться, даже если ни
  // одного такого события не пришло (офлайн, текстовый режим).
  /** Состояние лица из `avatar.state`. Null — живых событий нет, лицо выводится из шкал. */
  avatarState?: string | null;
  /** Оппонент звучит: честный индикатор речи, а не имитация губ. */
  oppSpeaking?: boolean;
  getSpeechLevel?: () => number;
  getVideoFrame?: () => string | null;
  amplitudeAnimation?: boolean;
  /** Какие слои подняты В ЭТОЙ партии. Выключенные не оставляют следов на экране. */
  layers?: Layers;
  /** Открыть шторку слоёв. Полноэкранный экран подготовки перед партией убран —
   *  слои выбираются отсюда, изнутри стола. Саму шторку рисует App: смена слоя
   *  до первого хода перезапускает сессию, а Table на это время размонтируется
   *  и унёс бы шторку с собой. */
  onOpenLayers?: () => void;
  layersOpen?: boolean;
  /** Слой просили, но устройство не встало. Ключ есть — слой мёртв, и об этом
   *  обязана быть строка на экране, а не пустой чип живого слоя. */
  layerFail?: { voice?: string; camera?: string };
  /** Сколько кадров камеры реально ушло, и что на них разглядела модель. */
  framesSent?: number;
  observations?: string[];
  /** Игрок говорит прямо сейчас — по VAD сервера. */
  userSpeaking?: boolean;
  /** Промежуточная расшифровка: видна ДО того, как стала ходом. */
  transcript?: string | null;
  getMicLevel?: () => number;
  onInterrupt?: () => void;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  // "Read her face" layer: a running "n of m" and the answer callback. Both
  // absent when the layer is off, and the chat then renders no question at all.
  probeTally?: string;
  onProbeAnswer?: (id: number, choice: number) => void;
}

/** Какая подсветка сейчас на столе. `first` — гарантированная: см. эффект №3. */
type TutMark = null | "interest" | "deal" | "first";

/** Текст гарантированной подсказки. Чистая функция — числа и тема в ней
 *  настоящие, поэтому она проверяется тестом, а не глазами: «спросите про
 *  «Производство»» обязано называть тему С ЭТОГО стола, а не любую. */
export function firstMoveBody(o: Strings["onboarding"], infoDelta: number, topic: string): string {
  const n = Math.round(infoDelta);
  const gain = n > 0 ? o.firstGain.replace("{n}", String(n)) : o.firstGainNone;
  return o.firstBody.replace("{gain}", gain).replace("{topic}", topic);
}

export function Table({ t, lang, mode, kind, scenario, state, log, busy, disconnected = false, phase, judgeActive, cloudAi = null, onSend, onHint, onQuit, debriefReady, onSeeDebrief, grade = null, probeTally, onProbeAnswer, avatarState = null, oppSpeaking = false, getSpeechLevel, getVideoFrame, amplitudeAnimation = false, layers, onOpenLayers, layersOpen = false, layerFail, framesSent = 0, observations, userSpeaking = false, transcript = null, getMicLevel, onInterrupt, videoRef, canvasRef }: Props) {
  // The coach's worked example travels from a hint bubble down into the
  // composer. A monotonic nonce (not the text) is what makes re-tapping the
  // same suggestion refill the box after the player edited it away.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const prefillNonce = useRef(1);
  // On a phone the rail stacks above the chat, so the closing strip mounts far
  // below the fold — the climax of the negotiation rendered where nobody was
  // looking, and the hold expires before they find it. Bring it into view.
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  // Focus follows the question: opening one disables the composer under the
  // player's cursor, which would otherwise drop focus to <body> mid-turn. When
  // it resolves, focus goes back to the composer so typing continues naturally.
  const probeEls = useRef(new Map<number, HTMLDivElement>());
  const focusedProbe = useRef<number | null>(null);
  const registerProbe = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) probeEls.current.set(id, el);
    else probeEls.current.delete(id);
  }, []);
  const st = state;
  const finished = !!st && st.status !== "active";
  // An unanswered question blocks the composer (but never the transcript): the
  // player has to commit to a reading before the negotiation moves on.
  const probeOpen = log.some((e) => e.kind === "probe" && e.picked === undefined);
  useEffect(() => {
    if (!finished) return;
    scrollTo(outcomeRef.current, { block: "nearest" });
  }, [finished]);

  const openProbeId = (() => {
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.kind === "probe") return e.picked === undefined ? e.id : null;
    }
    return null;
  })();
  useEffect(() => {
    if (openProbeId != null) {
      probeEls.current.get(openProbeId)?.focus({ preventScroll: false });
      focusedProbe.current = openProbeId;
    } else if (focusedProbe.current != null) {
      focusedProbe.current = null;
      composeRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }
  }, [openProbeId]);

  const iFound = st?.interests_found ?? 0;
  const iTotal = st?.interests_total ?? 0;
  // Слоты интересов: тема видна всегда, текст — только у вскрытых. Пустой список
  // (сервер постарше слотов не шлёт) не подменяется выдуманным: рельс остаётся
  // счётчиком без тем — слоя нет, и он честно не рисуется.
  const interestSlots = st?.interests ?? [];
  // Exam is an assessment: all live coaching feedback (meters, interests tracker,
  // technique chips/badges, meter deltas, hint) is withheld until the debrief.
  const exam = mode === "exam";
  // Первая партия человека: практика и флаг «вводную ещё не видел». Больше
  // ничего от неё не зависит — ни движок, ни оценка.
  const newcomer = useRef(shouldRunTutorial(mode, isTutorialDone()));

  // Turn 0 leaves a tall empty log. Exam withholds all coaching, so it keeps the
  // bare table; everywhere else the void carries the scene and three real first
  // lines — the point where a first-timer decides whether they know what to do.
  const showOpening = !exam && !!st && st.turn === 0;
  const unit = scenario.headline_unit;
  const openingCard = showOpening ? (
    // `lead` — та самая «подсветка одного элемента прямо на столе», которой
    // заменена модальная вводная. Ободок на карточке, которая и так лежит в
    // ленте: ничего не перекрывает и не требует ни одного лишнего клика.
    <div className={`opening${newcomer.current ? " lead" : ""}`} role="note">
      <h2>{t.opening.title}</h2>
      <p className="op-scene">
        {t.opening.scene
          .replace("{role}", scenario.role)
          .replace("{name}", scenario.counterpart_name)
          .replace("{offer}", formatDeal(st!.offer_opp, unit, lang))
          .replace("{target}", formatDeal(scenario.target, unit, lang))
          .replace("{red}", formatDeal(scenario.reservation, unit, lang))}
      </p>
      <p className="op-hint">{t.opening.hint}</p>
      <div className="op-lines">
        {t.opening.lines.map((l, i) => (
          <button
            key={i}
            type="button"
            className="op-line"
            // Fills the composer, never sends: the move stays the player's and
            // gets judged like anything they type themselves.
            onClick={() => setPrefill({ text: l.text, nonce: prefillNonce.current++ })}
          >
            <span className="op-tag">{l.tag}</span>
            <span className="op-text">{l.text}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // Обучающий плейсхолдер — со ВТОРОГО хода. На нулевом он повторял слово в
  // слово первую строку карточки «Стол накрыт» («спросите, ПОЧЕМУ это важно»),
  // стоявшей прямо над полем: одна подсказка, произнесённая дважды. Дальше он
  // единственный, кто называет следующий приём, и остаётся.
  const turnNow = st?.turn ?? 0;
  const placeholder = exam || turnNow === 0
    ? t.placeholder
    : teachingPlaceholder(turnNow, t.placeholder, t.placeholderNudges);
  // Latest turn's deltas (for the meter pulse cue) — read off the most recent
  // player line in the log. Never used in exam (meters are hidden there anyway).
  let lastDeltas: Deltas | null = null;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "me" && e.deltas) {
      lastDeltas = e.deltas;
      break;
    }
  }
  // КАРЛ БОЛЬШЕ НЕ ПОВТОРЯЕТ ТРЕНЕРА. Совет судьи приходил в ленту под репликой
  // и тем же текстом — в пузырь Карла на рельсе. Одна мысль, два места, и ни
  // одно из них не отменяло другое; на нулевом ходу к ним добавлялось ещё и его
  // приветствие. Текст остался в ленте, где стоит рядом со своим ходом, а
  // Карлу осталось лицо: оно и так меняется по дельтам движка. От ленты ему
  // нужно ровно одно — ждём ли мы сейчас подсказку.
  const hintPending = log.some((e) => e.kind === "hint" && e.pending);
  const karl = karlState({
    phase, busy, hintPending,
    deltas: lastDeltas,
    status: st?.status ?? null,
    grade,
  });

  // Typing indicator: show while a turn is in flight (busy) but the opponent's
  // reply hasn't begun. Once opponent_delta pushes a streaming "opp" bubble it
  // becomes the last entry, so the indicator yields to the live reply. Cleared
  // automatically when busy drops (opponent/error/debrief all reset it), and
  // never shown after the game is finished.
  const lastEntry = log[log.length - 1];
  // The judge's pass and the opponent's reply are both "busy", but they are
  // different waits and only the second one is anybody typing — see `phase`.
  const typing = busy && !finished && (!lastEntry || lastEntry.kind !== "opp");

  // Mobile: the briefing + BATNA collapse behind a toggle so the game side-strip
  // stays short and the chat/composer are reachable without endless scrolling.
  // On desktop this section is always expanded (the toggle is hidden by CSS).
  const [moreOpen, setMoreOpen] = useState(false);
  // Подпись раскрывающегося блока зависит от того, что в нём лежит: у сценария
  // без вторичных вопросов `DealTerms` не рисуется вовсе, и обещать «условия
  // сделки» было бы обещанием пустоты.
  const hasTerms = (scenario.secondary_issues ?? []).length > 0;
  // Раскрытый блок ВЫШЕ остатка рельса: 285 px содержимого против 40–100 px
  // свободных под кнопкой. Без подвода в поле зрения человек нажимает и видит
  // первую строку, а остальное остаётся ниже сгиба — то есть нажатие выглядит
  // как «ничего не произошло». `scrollTo` спрашивает про reduced-motion, а не
  // задаёт «плавно» константой.
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (moreOpen) scrollTo(moreRef.current, { block: "end" });
  }, [moreOpen]);
  // Interest-reveal delight: when the engine's interests_found ticks up, flash
  // the tracker and float a brief toast. Purely celebratory — we never reveal
  // the interest text the backend withheld, only that the COUNT rose. Suppressed
  // in exam (the tracker itself is hidden there). CSS honors reduced-motion.
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState(false);
  const prevFound = useRef(iFound);
  useEffect(() => {
    const rose = iFound > prevFound.current;
    prevFound.current = iFound;
    if (!rose || exam) return;
    // Celebratory cue for uncovering a hidden interest: a gentle rising chime
    // + a light haptic. Fires once per real count increase (this effect only
    // runs when `rose`), so no guard against re-render is needed.
    play("reveal");
    haptic();
    setFlash(true);
    setToast(true);
    const t1 = setTimeout(() => setFlash(false), 900);
    const t2 = setTimeout(() => setToast(false), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [iFound, exam]);

  // ---- Подсветка на столе вместо модальной вводной --------------------------
  // БЫЛО: три шага поверх стола, и первый — карточка «Добро пожаловать за стол»
  // по центру экрана. Она всплывала над первым ответом оппонента и закрывала
  // его вместе со строкой тренера, то есть ровно тот момент, ради которого
  // существует.
  //
  // СТАЛО: новичку подсвечивается ОДИН элемент за ход — и только когда движок
  // с ним что-то сделал: вскрыт интерес, поехала их цена, сделан первый ход.
  // Роль вводной на нулевом ходу играет карточка «Стол накрыт»: она уже лежит
  // в ленте и ничего не перекрывает. Подсветка ждёт, пока стол замрёт (`busy`),
  // поэтому поверх приходящего ответа не встаёт никогда.
  //
  // Третье событие — «первый ход» — существует потому, что первые два зависят
  // от удачи игрока, а вводная не имеет права её ждать: см. эффект №3 ниже.
  const [tutOn, setTutOn] = useState(newcomer.current);
  const [tutMark, setTutMark] = useState<TutMark>(null);
  const [tutQueue, setTutQueue] = useState<Exclude<TutMark, null>[]>([]);
  const tutOnRef = useRef(tutOn);
  tutOnRef.current = tutOn;
  const tutSeen = useRef({ interest: false, deal: false, first: false });
  const tutFirstOffer = useRef<number | null>(null);
  const tutFound = useRef(iFound);
  const tutDoneOnce = useRef(false);

  const dealRef = useRef<HTMLDivElement>(null);
  const interestsRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  // Persist the one-time flag the first moment the player engages an exit path
  // (dismisses a mark, skips, quits, finishes) — so a second game never
  // re-onboards, even if they leave mid-way. Idempotent.
  const commitTutDone = useCallback(() => {
    if (!tutDoneOnce.current) {
      tutDoneOnce.current = true;
      markTutorialDone();
    }
  }, []);

  // Queue an event-driven reveal, once each, only while the highlights are live.
  const queueTutMark = useCallback((ev: Exclude<TutMark, null>) => {
    if (!tutOnRef.current) return;
    if (tutSeen.current[ev]) return;
    tutSeen.current[ev] = true;
    setTutQueue((q) => [...q, ev]);
  }, []);

  // Real event #1: the engine's interests_found ticked up → an interest surfaced.
  useEffect(() => {
    const rose = iFound > tutFound.current;
    tutFound.current = iFound;
    if (rose) queueTutMark("interest");
  }, [iFound, queueTutMark]);

  // Real event #2: the opponent's offer moved off its opening (their price shifted).
  useEffect(() => {
    if (!st) return;
    if (tutFirstOffer.current === null) {
      tutFirstOffer.current = st.offer_opp;
      return;
    }
    if (st.offer_opp !== tutFirstOffer.current) queueTutMark("deal");
  }, [st, queueTutMark]);

  // Real event #3 — ГАРАНТИРОВАННОЕ: игрок сходил хотя бы раз. Два события выше
  // привязаны к УДАЧЕ: вопрос попал в тему, ход заработал движение цены. У
  // новичка, который жмёт наугад, за всю партию не случается ни одного — и
  // вводной он не видит вовсе (проверено прогоном: шесть ходов «ок / да /
  // сколько?» — ноль подсветок). Первый ход случается всегда, и подсказка на
  // нём говорит ровно то, чего человеку не хватило: интерес открывает не
  // вопрос, а вопрос ПО ТЕМЕ, и темы лежат вот здесь.
  //
  // Стоит ПОСЛЕ двух эффектов выше не случайно: они успевают пометить свои
  // события в том же коммите, и удачный первый ход получает свою — «вы вскрыли
  // интерес», — а не эту. Двух подсказок на один ход не бывает.
  useEffect(() => {
    if (!st || st.turn < 1) return;
    if (tutSeen.current.interest || tutSeen.current.deal) return;
    // Показывать не на что: рельс тем не нарисован (экзамен, старый сервер без
    // слотов) — а подсказка без цели у нас не живёт.
    if (exam || !interestSlots.some((slot) => !slot.text)) return;
    queueTutMark("first");
  }, [st, exam, interestSlots, queueTutMark]);

  // Показываем по одной — и ТОЛЬКО когда стол замер. Пока идёт ответ оппонента
  // или открыт вопрос «прочтите лицо», подсветка ждёт: перекрывать реплику,
  // которую человек ещё не прочитал, она не имеет права.
  //
  // ОДНА НА ХОД, а не одна на экран. Удачный первый ход умеет вскрыть интерес и
  // сдвинуть цену разом — и очередь выкладывала обе подсказки подряд: «Понятно»
  // по первой мгновенно поднимало вторую. Человек, сходивший ОДИН раз, получал
  // два всплывших окна; ровно от этого вводную здесь и сокращали.
  const tutShownTurn = useRef(-1);
  useEffect(() => {
    if (!tutOn || tutMark !== null) return;
    if (busy || finished || probeOpen) return;
    if (tutQueue.length === 0) return;
    if (turnNow <= tutShownTurn.current) return;
    tutShownTurn.current = turnNow;
    setTutMark(tutQueue[0]);
    setTutQueue((q) => q.slice(1));
  }, [tutOn, tutMark, tutQueue, busy, finished, probeOpen, turnNow]);

  // Игрок пошёл дальше — подсветка снимается сама. Висеть до клика по «Понятно»
  // она не имеет права: это подсказка, а не шлагбаум.
  useEffect(() => {
    if (busy) setTutMark(null);
  }, [busy]);

  // Партия дошла до конца — вводную считаем пройденной в любом случае.
  useEffect(() => {
    if (finished && tutOnRef.current) commitTutDone();
  }, [finished, commitTutDone]);

  const dismissTutMark = useCallback(() => {
    commitTutDone();
    setTutMark(null);
  }, [commitTutDone]);
  const skipTutorial = useCallback(() => {
    commitTutDone();
    setTutOn(false);
    setTutMark(null);
    setTutQueue([]);
  }, [commitTutDone]);

  // Quitting mid-tutorial still counts as "seen" — never re-onboard next game.
  const handleQuit = () => {
    if (newcomer.current) commitTutDone();
    onQuit();
  };

  // Какая подсветка активна сейчас (или ни одной). Обе привязаны к настоящему
  // событию движка, поэтому объясняют то, что уже произошло на глазах.
  const o = t.onboarding;
  const mark = { primaryLabel: o.gotIt, onPrimary: dismissTutMark, skipLabel: o.skip, onSkip: skipTutorial };
  let tutStep: CoachStep | null = null;
  if (tutMark === "interest") {
    tutStep = { stepKey: "m-interest", targetRef: interestsRef, title: o.interestTitle, body: o.interestBody, ...mark };
  } else if (tutMark === "deal") {
    tutStep = { stepKey: "m-deal", targetRef: dealRef, title: o.dealTitle, body: o.dealBody, ...mark };
  } else if (tutMark === "first") {
    tutStep = {
      stepKey: "m-first", targetRef: interestsRef, title: o.firstTitle,
      body: firstMoveBody(o, lastDeltas?.info ?? 0, interestSlots.find((slot) => !slot.text)?.topic ?? ""),
      ...mark,
    };
  }

  return (
    <section className="screen">
      {toast ? (
        <div className="toast" role="status">
          🎯 {t.interestToast}
        </div>
      ) : null}
      <div className="wrap">
        {/* Screen-reader heading + focus target for the game screen (visually the
            counterpart card carries the identity, so this stays sr-only).
            `h1`, а не `h2`: на столе других заголовков первого уровня нет, и
            «начать чтение с главного» диктору было не с чего. */}
        <ScreenHeading as="h1" className="sr-only">
          {t.a11y.gameHeading.replace("{name}", scenario.counterpart_name)}
        </ScreenHeading>
        <div className="table">
          <aside className="side">
            {/* ТЕЛО РЕЛЬСА — ОТДЕЛЬНЫЙ ЭЛЕМЕНТ, И ЭТО НЕ ОБЁРТКА РАДИ ОБЁРТКИ.
                Прокручивается ОНО, а «тренер + выход» стоят строкой ниже, вне
                скролла. Пока низ прилипал внутри общего скроллера, он не
                ограничивал прокрутку, а закрашивал собой карточки: на 1440×900
                72 px «Условий сделки» и кнопка брифинга целиком, на ×800 и ×720
                — BATNA и темы (числа и разбор — в styles.css у `.side`). */}
            <div className="side-scroll">
            {/* While a "read her face" question is open the portrait becomes the
                main object on screen — this is the one beat that justifies the
                parametric expressions, which otherwise work almost unnoticed. */}
            <div className={`opp${probeOpen ? " reading" : ""}`}>
              {probeOpen ? <div className="opp-cue">{t.probe.readFace}</div> : null}
              <OpponentFace
                scenarioId={scenario.id}
                avatarState={avatarState}
                state={st}
                exam={exam}
                speaking={oppSpeaking}
                getSpeechLevel={getSpeechLevel}
                getVideoFrame={getVideoFrame}
                amplitudeAnimation={amplitudeAnimation}
                animationLabel={t.a11y.amplitudeAnimation}
                speakingLabel={t.a11y.speaking}
                label={scenario.counterpart_name}
              />
              <div>
                <div className="nm">{scenario.counterpart_name}</div>
                <div className="ps">{scenario.counterpart_persona}</div>
              </div>
            </div>

            <div ref={dealRef} className="onb-anchor">
              <DealTracker scenario={scenario} state={st} t={t} lang={lang} />
            </div>

            {/* ТЕМЫ СТОЯТ ВЫШЕ BATNA — потому что иначе их не видно. Рельс это
                вложенный скроллер с прилипшим низом (Карл + выход, 134 px), и
                на первом же ходу карточка цены отращивает график динамики: всё,
                что лежало ниже, уезжает под прилипший низ. Замер на 1440×900:
                до хода чипы тем стояли на 684–747 при кромке низа 750, после
                хода — на 747–808, то есть за ней. Единственная строка на столе,
                отвечающая на вопрос «а о чём вообще спрашивать», пропадала
                ровно в тот момент, когда игрок начинал спрашивать. */}
            {/* ЗАНАВЕС, НАЧАТЫЙ ЗА СТОЛОМ. Здесь стояли три пустых кружка и
                счётчик «0/3»: цифра без единой зацепки, по которой можно понять,
                О ЧЁМ вообще спрашивать. Игрок был обязан УГАДАТЬ содержание
                секрета, чтобы секрет открылся. Теперь невскрытый слот показывает
                ТЕМУ — область, в которой интерес лежит, — и вопрос становится
                выбором; вскрытый разворачивается в сам интерес, тот же текст,
                который оппонент уже произнёс вслух. Второй принцип цел: тема
                секрета не выдаёт, а текста, которого движок не отдал, здесь нет
                (`text === null` рисует тему, а не заглушку под неё). */}
            {iTotal > 0 && !exam ? (
              <div ref={interestsRef} className={`interests-rail${flash ? " flash" : ""}`}>
                <div className="ir-head">
                  <span>{t.interests}</span>
                  <span className="ir-count">
                    {iFound}/{iTotal}
                  </span>
                </div>
                {interestSlots.length ? (
                <ul className="ir-chips">
                  {interestSlots.map((slot, i) => (
                    <li key={i} className={slot.text ? "on" : ""}>
                      <span className="ir-mark" aria-hidden="true">{slot.text ? "🔓" : "🔍"}</span>
                      <span className="ir-txt">{slot.text ?? slot.topic}</span>
                    </li>
                  ))}
                </ul>
                ) : null}
              </div>
            ) : null}

            {/* BATNA НАРУЖУ И ВЫСОКО, брифинг под кнопку. Раньше оба лежали в
                одной развёрнутой панели на 162 пикселя внизу рельса — то есть
                за краем окна. Брифинг из них — чистый повтор: цель и красную
                линию показывает шкала ZOPA прямо над ним, а «у второй стороны
                скрытые интересы, спрашивайте» стоит в карточке «Стол накрыт».
                BATNA не повторяется нигде, и её место в верхней половине
                рельса: сила уйти читается вместе с ценой, против которой она
                стоит, — темы между ними стоят ровно потому, что ниже их не
                видно (см. выше). */}
            <div className="batna">
              <b>🛡 {t.batna}</b>
              <span>{scenario.batna}</span>
            </div>

            {/* УСЛОВИЯ СДЕЛКИ УЕХАЛИ ПОД КНОПКУ — И ЭТО РЕШЕНИЕ ПО ЗАМЕРУ.
                Панель стояла здесь, между BATNA и брифингом, и «теряться
                первой» у неё выходило худшим из возможных способов: прилипший
                низ рельса непрозрачен, и на 1440×900 он ЗАКРАШИВАЛ её нижнюю
                часть — 10 px на нулевом ходу и 72 px со второго (панель
                668..822 при кромке 750), а кнопку брифинга под ней (340×42 на
                832..874) закрывал целиком. То есть панель не терялась, а
                показывалась наполовину, и человек не знал, что дальше что-то
                есть.

                Рельсу 665 px выше прилипшего низа, а содержимого было 789.
                Значит что-то обязано уйти, и уйти оно должно НАЗВАННЫМ, а не
                под полосу. Уходит именно эта панель, потому что она
                единственная в рельсе повторяет то, что уже написано рядом:
                строка переключается только после того, как игрок САМ произнёс
                размен, — его собственный пузырь стоит в ленте слева, — а урок
                про размен доносит разбор (`terms.debriefLabel` /
                `debriefNone`). Цена, темы, BATNA и лицо не написаны на столе
                больше нигде, поэтому остаются снаружи.

                Подпись кнопки называет ОБЕ вещи внутри: кнопка, обещающая
                брифинг и прячущая ещё и условия сделки, — это второй принцип
                наизнанку. */}
            <div ref={moreRef} className={`side-more${moreOpen ? " open" : ""}`}>
              <button
                className="side-more-toggle"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
              >
                <span>📋 {hasTerms ? `${t.moreLabel} · ${t.terms.title}` : t.moreLabel}</span>
                <span className="chev" aria-hidden="true">▾</span>
              </button>
              <div className="side-more-body">
                {/* Visible logrolling: the tradeable "package" forming. Renders
                    only for scenarios that carry secondary issues. */}
                <DealTerms scenario={scenario} state={st} t={t} />
                {/* СВОЯ карта на зеркальном столе. Три причины, по которым игрок
                    здесь держит цену, — это не секрет оппонента, а его
                    собственные интересы: он и есть та сторона, и знать их за
                    столом он обязан, а не только на входе. Ключ приходит с
                    сервера пустым на всех обычных столах, и тогда блока нет
                    вовсе. Занавес над ЧУЖИМИ интересами это не трогает: он
                    рядом, в панели «Скрытые интересы», и по-прежнему поднимается
                    только вопросами. */}
                {scenario.defending && scenario.defending.length > 0 ? (
                  <div className="brief-mine">
                    <h4>{t.otherSide.defendTitle}</h4>
                    <ul className="os-list">
                      {scenario.defending.map((d) => (
                        <li key={d.topic + d.text}>
                          <b>{d.topic}</b>
                          <span>{d.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="brief">{scenario.briefing}</div>
              </div>
            </div>
            </div>
            {/* Карл и выход стоят внизу рельса ВМЕСТЕ. Стоял внизу один Карл, а
                кнопка выхода — под ним, то есть за краем окна: уйти со стола
                можно было только прокрутив рельс. Выход не бывает «где-то
                ниже». В экзамене Карла нет — там подсказок не бывает. */}
            <div className="side-foot">
              {!exam ? <Karl state={karl} name={t.mascot.karl} alt={t.mascot.alt} /> : null}
              <div className="side-acts">
                <button className="quit" onClick={handleQuit}>
                  ← {t.quit}
                </button>
                {/* Слои переехали сюда с полноэкранного экрана подготовки. Кнопка
                    стоит и в экзамене: там шторка объясняет словами, ПОЧЕМУ они
                    погашены, — запрет обязан быть виден, а не подразумеваться. */}
                {onOpenLayers ? (
                  <button
                    className="lay-open"
                    onClick={onOpenLayers}
                    aria-haspopup="dialog"
                    aria-expanded={layersOpen}
                  >
                    🎛 {t.layers.head}
                  </button>
                ) : null}
              </div>
            </div>
          </aside>

          {/* Был `main`. Ориентир `main` теперь один на приложение (App.tsx), а
              двух на странице не бывает. Имени у раздела нет намеренно: свою
              живую область лента уже называет сама, и второй ориентир с тем же
              именем — лишний пункт в списке, а не помощь. */}
          <section className="chat">
            {/* Единственная панель шкал в игре: полные подписи, объяснение в
                подсказке, обрубки только там, где полное слово не влезает. */}
            {st && !exam ? (
              <Meters
                state={st}
                labels={t.meters}
                short={t.metersShort}
                info={t.meterInfo}
                groupLabel={t.a11y.hud}
                deltas={lastDeltas}
              />
            ) : null}
            <div className="ch">
              {/* The game skin turns the turn counter into a spent-budget bar:
                  the same honest framing (budget, not countdown), but visible at
                  a glance from the back of a room. */}
              {st ? (
                <div className="turnbar" aria-hidden="true">
                  <i style={{ width: `${Math.round(((st.turn ?? 0) / Math.max(1, st.max_turns)) * 100)}%` }} />
                </div>
              ) : null}
              <div className="turn">
                {/* Budget, not a countdown: before the first move show the turn
                    BUDGET ("12 ходов"); once play starts show "ход {n} из {max}"
                    — never "ход 0/12", which reads like a countdown-to-failure. */}
                {(st?.turn ?? 0) < 1
                  ? t.turnBudget.replace("{n}", String(st?.max_turns ?? 12))
                  : t.turnOf
                      .replace("{n}", String(st?.turn ?? 0))
                      .replace("{max}", String(st?.max_turns ?? 12))}
                {kind === "mock" ? <span className="conn mock">{t.usingMock}</span> : null}
                {/* ДВА РАЗНЫХ СОСТОЯНИЯ, ДВА РАЗНЫХ БЕЙДЖА. Соседний говорит
                    «сервера нет вовсе»; этот — «сервер есть, ключа модели нет»,
                    и реплики оппонента идут шаблонами движка. Без него партия
                    на голом шлюзе выглядит как живая — то самое четвёртое
                    состояние, которого не бывает. Рисуется только когда сервер
                    ОТВЕТИЛ (`kind !== "mock"`) и сказал прямо, что ИИ нет:
                    `undefined` и `null` бейджа не дают. */}
                {kind !== "mock" && cloudAi === false
                  ? <span className="conn noai" title={t.noAiWhy}>{t.noAiChip}</span> : null}
                {kind === null ? <span className="conn">{t.connecting}</span> : null}
              </div>
            </div>
            <Chat
              onUseLine={(text) => setPrefill({ text, nonce: prefillNonce.current++ })}
              useLineLabel={t.useLine}
              log={log}
              metersShort={t.metersShort}
              metersFull={t.meters}
              deltaAria={t.a11y.delta}
              logLabel={t.a11y.chatLog}
              argLabel={t.argLabel}
              argStrings={t.arg}
              deltaNone={t.deltaNone}
              deltaRepeat={t.deltaRepeat}
              exam={exam}
              coachLabel={t.coachLabel}
              dismissLabel={t.a11y.dismiss}
              judgeActive={judgeActive}
              judgeBadge={t.judgeBadge}
              judgeReject={t.judgeReject}
              typing={typing}
              tagLabels={t.tagLabels}
              typingLabel={phase === "judging" ? t.judgingLabel : t.typingLabel}
              typingJudging={phase === "judging"}
              opening={showOpening ? openingCard : undefined}
              hintPendingLabel={t.hintPending}
              probeLabels={t.probe}
              probeTally={probeTally}
              registerProbe={registerProbe}
              onProbeAnswer={onProbeAnswer}
            />
            {finished && onSeeDebrief ? (
              <div className={`outcome ${st!.status}`} role="status" ref={outcomeRef}>
                <div className="oc-stamp">
                  <span className="oc-mark" aria-hidden="true">
                    {st!.status === "agreement" ? "🤝" : "🚪"}
                  </span>
                  <span className="oc-title">
                    {st!.status === "agreement" ? t.outcome.agreement : t.outcome.breakdown}
                  </span>
                  {/* The settled price, never `offer_opp` — the deal closes at
                      the meeting point, so offer_opp would contradict the
                      opponent's own closing line by a rouble or two. */}
                  {st!.status === "agreement" && st!.deal != null ? (
                    <span className="oc-price">
                      {st!.deal}
                      {scenario.headline_unit}
                    </span>
                  ) : null}
                </div>
                <button className="primary oc-go" onClick={onSeeDebrief} disabled={!debriefReady}>
                  {debriefReady ? t.outcome.see : t.outcome.preparing}
                </button>
              </div>
            ) : null}
            <div ref={composeRef} className="onb-anchor" hidden={finished && !!onSeeDebrief}>
              <Composer
                hintLabel={t.hint}
                sendLabel={t.a11y.send}
                disabled={disconnected || busy || finished || probeOpen || !st}
                blocked={probeOpen}
                placeholder={probeOpen ? t.probe.blocked : placeholder}
                quickMoves={t.quickMoves}
                onSend={onSend}
                onHint={onHint}
                hintEnabled={!exam}
                showChips={!exam}
                limitNote={t.composerLimit}
                charForms={t.forms.chars}
                prefill={prefill}
              />
              {/* Слой рисуется живым, ТОЛЬКО если устройство действительно
                  поднялось. Иначе чип «микрофон активен» стоял бы над мёртвым
                  микрофоном — то самое четвёртое состояние. */}
              {layerFail?.voice || layerFail?.camera ? (
                <div className="karl-note">
                  {/* Лицо у отказа то же, что и у роста напряжения: слой просили,
                      слой не встал. Текста Карл сюда не добавляет — строка справа
                      существует и без него. */}
                  <Karl state="concern" compact name={t.mascot.karl} alt={t.mascot.alt} />
                  <p className="layer-off" role="status">
                    <b>{[layerFail.voice ? t.live.offVoice : null,
                         layerFail.camera ? t.live.offCamera : null].filter(Boolean).join(" · ")}</b>
                    {" — "}
                    {/* Причина у обоих слоёв чаще всего одна и та же — браузер
                        отказал разом. Повторять её дважды значит удваивать текст
                        и не добавлять ни бита. */}
                    {[...new Set([layerFail.voice, layerFail.camera].filter(Boolean))].join("; ")}
                    {". "}
                    {t.live.offHow}
                  </p>
                </div>
              ) : null}
              {videoRef && canvasRef && getMicLevel ? (
                <LiveBar
                  voice={!!layers?.voice && !layerFail?.voice}
                  camera={!!layers?.camera && !layerFail?.camera}
                  frames={framesSent}
                  observation={observations?.length ? observations[observations.length - 1] : null}
                  userSpeaking={userSpeaking}
                  oppSpeaking={oppSpeaking}
                  transcript={transcript}
                  getMicLevel={getMicLevel}
                  onInterrupt={onInterrupt}
                  videoRef={videoRef}
                  canvasRef={canvasRef}
                  labels={t.live}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
      {tutStep ? <Onboarding {...tutStep} /> : null}
    </section>
  );
}
