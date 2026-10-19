// CallView.tsx — созвон: голосовой режим партии, устроенный как видеовстреча.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ЭКРАН. Встреча раньше стояла над лентой и композером: можно
// было и говорить, и печатать в одну и ту же секунду, а на экране одновременно
// жили сцена, шкалы, лента, поле ввода и полоса живых слоёв. Теперь партия
// начинается чатом, а голос — это созвон (lib/layers.ts::textLayers): здесь
// нет поля ввода вовсе. Собеседник крупно, вы — плиткой в углу, субтитры, снизу
// панель звонка. «Завершить» возвращает в чат с тем же ходом — транспорт
// заходит в ту же партию по `resume`.
//
// ЧТО ВИДНО ВСЕГДА. Тонкая полоса сверху — четыре шкалы и цена: в созвоне
// «выигрываю ли я» не должно прятаться за кнопку. Всё остальное, что было в
// ленте (теги приёмов, советы тренера, реплики целиком), лежит в панели «Ход
// переговоров» — та же лента, тем же компонентом.
//
// ЧЕГО ЭКРАН НЕ ДЕЛАЕТ. Не считает и не показывает ничего, чего нет в партии:
// ход идёт тем же путём, что напечатанный (инвариант 7), экзамен и партии на
// зачёт сюда не попадают (lib/meeting.ts::callOffer).
//
// ПЛИТКА «ВЫ» ВИДНА ПО УМОЛЧАНИЮ — это решение владельца (макет «как в Zoom»,
// 19.10). Принцип «камера не показывает вас постоянно» (docs/modalities.md §2)
// держит кнопка «Скрыть себя»: видео прячется, но не размонтируется — иначе
// браузер заново спросил бы доступ к камере.
import { useEffect, useRef, useState } from "react";
import { OpponentFace } from "./OpponentFace";
import { ProbeCard } from "./Chat";
import { ScreenHeading } from "./ScreenHeading";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import type { ChatEntry } from "../api/useNegotiation";
import type { FaceRenderer } from "../lib/faceSource";
import type { MeetingStatus } from "../lib/meeting";
import { formatDeal } from "../lib/format";
import type { Strings } from "../i18n";
import type { Lang, ScenarioView, StateView } from "../types";

type HintEntry = Extract<ChatEntry, { kind: "hint" }>;
type ProbeEntry = Extract<ChatEntry, { kind: "probe" }>;

interface Props {
  t: Strings;
  lang: Lang;
  scenario: ScenarioView;
  state: StateView | null;
  status: MeetingStatus;
  avatarState: string | null;
  renderer: FaceRenderer;
  synthetic: boolean;
  /** Видео сервиса ещё не дошло — подпись поверх портрета (lib/meeting.ts). */
  videoPending: boolean;
  oppSpeaking: boolean;
  getSpeechLevel?: () => number;
  getVideoFrame?: () => string | null;
  getAudioBlocked?: () => boolean;
  onResumeAudio?: () => void;
  /** `capabilities.speech`: будет ли у собеседника голос. Null — сервер ещё
   *  не ответил, утверждать нечего. */
  speech: boolean | null;
  /** Последняя реплика собеседника, пока она звучит или печатается. */
  subtitle: string | null;
  /** Ваша фраза, пока она не стала ходом. */
  transcript: string | null;
  /** Микрофон поднят на сервере и на устройстве. */
  micAvailable: boolean;
  /** Почему микрофон не встал — или null. */
  micFail: string | null;
  micMuted: boolean;
  onToggleMic: () => void;
  /** Уровень входа 0..1 — «вас слышно» прямо на кнопке микрофона. */
  getMicLevel?: () => number;
  /** Последнее, что разглядела модель зрения. Открытый поток доказывает
   *  только браузер; что кадры дошли до модели — доказывают её слова. */
  observation?: string | null;
  /** `up` — слой камеры поднят в этом созвоне; `off` — выключен кнопкой;
   *  `reason` — почему поднять его нельзя (null — можно). */
  camera: { up: boolean; off: boolean; reason: string | null };
  onToggleCamera: () => void;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Полоса шкал — тот же `Meters`, что в чате. */
  hud: React.ReactNode;
  turnLabel: string;
  /** Лента целиком — для панели «Ход переговоров». */
  feed: React.ReactNode;
  /** Подсказка этого хода (после последней вашей реплики) — или null. */
  hint: HintEntry | null;
  hintEnabled: boolean;
  hintDisabled: boolean;
  onHint: () => void;
  /** Вопрос «Что с собеседником?» этого хода — или null. В созвоне он стоит
   *  на сцене рядом с лицом: ответ читают с него. */
  probe: ProbeEntry | null;
  probeTally?: string;
  registerProbe?: (id: number, el: HTMLDivElement | null) => void;
  onProbeAnswer?: (id: number, choice: number) => void;
  onInterrupt?: () => void;
  onHangUp: () => void;
  /** «Завершить» нажато, пока ход в полёте: созвон закроется после ответа. */
  hangupPending: boolean;
  /** Стол закрыт — итог партии поверх сцены. */
  outcome: React.ReactNode | null;
}

export function CallView({
  t, lang, scenario, state, status, avatarState, renderer, synthetic, videoPending, oppSpeaking,
  getSpeechLevel, getVideoFrame, getAudioBlocked, onResumeAudio, speech, subtitle, transcript,
  micAvailable, micFail, micMuted, onToggleMic, getMicLevel, observation, camera, onToggleCamera, videoRef, canvasRef,
  hud, turnLabel, feed, hint, hintEnabled, hintDisabled, onHint, probe, probeTally, registerProbe,
  onProbeAnswer, onInterrupt, onHangUp, hangupPending, outcome,
}: Props) {
  const c = t.call;
  const [captions, setCaptions] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const feedButton = useRef<HTMLButtonElement | null>(null);
  // Панель закрывается и Esc — как любая выезжающая панель; фокус
  // возвращается на кнопку, которая её открыла, а не падает в <body>.
  useEffect(() => {
    if (!feedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFeedOpen(false);
      feedButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedOpen]);
  const [selfHidden, setSelfHidden] = useState(false);
  const [dismissedHint, setDismissedHint] = useState<number | null>(null);

  // Браузер мог не пустить звук без жеста. Опрашиваем редко: это не анимация,
  // а состояние, которое меняется раз за партию.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!getAudioBlocked) return;
    const timer = setInterval(() => setBlocked(getAudioBlocked()), 400);
    return () => clearInterval(timer);
  }, [getAudioBlocked]);

  const offline = status === "reconnecting" || status === "lost" || status === "connecting";

  // Уровень микрофона — ~12 раз в секунду, не rAF: полоске на кнопке больше
  // не нужно, а перерисовки стоят реально.
  const [level, setLevel] = useState(0);
  const listening = micAvailable && !micMuted && !!getMicLevel;
  useEffect(() => {
    if (!listening) { setLevel(0); return; }
    const id = window.setInterval(() => setLevel(getMicLevel!()), 80);
    return () => window.clearInterval(id);
  }, [listening, getMicLevel]);
  const finished = !!outcome;
  const unit = scenario.headline_unit;
  const shownHint = hint && hint.id !== dismissedHint ? hint : null;

  return (
    <section className="call" aria-label={c.title} data-status={status}>
      <ScreenHeading as="h1" className="sr-only">
        {`${c.title}: ${scenario.counterpart_name}`}
      </ScreenHeading>

      <header className="call-top">
        {hud}
        {state ? (
          <div className="call-price">
            <span>{c.theirOffer}</span> <b>{formatDeal(state.offer_opp, unit, lang)}</b>
            {state.offer_player != null ? (
              <><span>{c.yourOffer}</span> <b>{formatDeal(state.offer_player, unit, lang)}</b></>
            ) : null}
          </div>
        ) : null}
        <span className="call-turn">{turnLabel}</span>
      </header>

      <div className={`call-body${feedOpen ? " with-feed" : ""}`}>
        <div className="call-stage">
          <div className="call-face">
            <OpponentFace
              scenarioId={scenario.id}
              avatarState={avatarState}
              state={state}
              exam={false}
              speaking={oppSpeaking}
              getSpeechLevel={getSpeechLevel}
              getVideoFrame={getVideoFrame}
              renderer={renderer}
              animationLabel={t.a11y.amplitudeAnimation}
              speakingLabel={t.a11y.speaking}
              label={scenario.counterpart_name}
              size={320}
            />
          </div>
          <div className="mt-who">
            <b>{scenario.counterpart_name}</b>
            <span title={scenario.counterpart_persona}>{scenario.counterpart_persona}</span>
            {synthetic ? <span className="mt-test">{t.meeting.testStream}</span> : null}
            {videoPending ? <span className="mt-pending" role="status">{t.meeting.videoConnecting}</span> : null}
          </div>
          {/* Одна живая строка на экран: что происходит в созвоне. */}
          <span className={`mt-status ${status}`} role="status">
            <i aria-hidden="true" />
            {hangupPending ? c.ending : t.meeting.status[status]}
          </span>

          {/* Плитка «Вы». Видео живёт здесь весь созвон: провайдер медиа
              привязывает поток один раз. */}
          <div className={`call-self${selfHidden ? " hidden" : ""}${camera.up && !camera.off ? " live" : ""}`}>
            {camera.up && videoRef ? <video ref={videoRef} muted playsInline autoPlay /> : null}
            {camera.up && canvasRef ? <canvas ref={canvasRef} hidden /> : null}
            {!camera.up || camera.off ? (
              <span className="cs-off"><Icon name="camoff" /> {c.cameraOffTile}</span>
            ) : null}
            <span className="cs-name">{c.you}{micMuted ? <Icon name="micoff" /> : null}</span>
            {camera.up && observation ? (
              <span className="cs-seen" title={observation}><b>{t.live.seen}</b> {observation}</span>
            ) : null}
            <button type="button" className="cs-hide" aria-pressed={selfHidden}
              onClick={() => setSelfHidden((h) => !h)}>
              {selfHidden ? c.showSelf : c.hideSelf}
            </button>
          </div>

          {/* Строки об отказах и карточки хода — одной стопкой: на телефоне
              она колонкой встаёт под строку состояния, на большом экране
              каждая часть стоит на своём месте (styles.css, `.call-over`). */}
          <div className="call-over">
            {speech === false || micFail ? (
              <div className="call-notes" role="status">
                {speech === false ? <p>{c.noSpeech}</p> : null}
                {micFail ? <p>{c.noMic.replace("{reason}", micFail)}</p> : null}
              </div>
            ) : null}

            {/* Подсказка и вопрос о реакции — на сцене, а не в панели: в
                созвоне ленту никто не читает, а пропущенный вопрос держал бы ход. */}
            <div className="call-cards">
              {shownHint && !finished ? (
                <div className={`call-hint${shownHint.pending ? " pending" : ""}`} role="status">
                  <Icon name="bulb" />
                  {shownHint.pending ? (
                    <span>{t.hintPending}</span>
                  ) : (
                    <span>
                      {shownHint.text}
                      {shownHint.line ? <><br /><b>{c.hintSay}</b> «{shownHint.line}»</> : null}
                    </span>
                  )}
                  {!shownHint.pending ? (
                    <button type="button" className="ch-x" onClick={() => setDismissedHint(shownHint.id)}
                      aria-label={c.dismiss}>×</button>
                  ) : null}
                </div>
              ) : null}
              {probe && !finished ? (
                <ProbeCard entry={probe} probeLabels={t.probe} probeTally={probeTally}
                  registerProbe={registerProbe} onProbeAnswer={onProbeAnswer} />
              ) : null}
            </div>
          </div>

          {/* Субтитры — копия реплики из ленты; диктору её читает лента в
              панели, здесь дубль был бы вторым объявлением того же. */}
          {captions && !offline && (subtitle || transcript) ? (
            <div className="call-cc" aria-hidden="true">
              {subtitle ? <p>{subtitle}</p> : null}
              {transcript ? <p className="mine"><b>{c.youSaid}</b> {transcript}</p> : null}
            </div>
          ) : null}

          {blocked && onResumeAudio ? (
            <button type="button" className="mt-sound" onClick={onResumeAudio}>
              <Icon name="sound" /> {t.meeting.soundOn}
              <span className="sr-only"> — {t.meeting.soundBlocked}</span>
            </button>
          ) : null}

          {outcome}
        </div>

        {feedOpen ? (
          <aside className="call-feed" id="call-feed" aria-label={c.feed}>
            <div className="cf-head">
              <b>{c.feed}</b>
              <button type="button" className="cf-x" aria-label={c.feedClose}
                onClick={() => { setFeedOpen(false); feedButton.current?.focus(); }}>×</button>
            </div>
            {feed}
          </aside>
        ) : null}
      </div>

      <div className="call-bar" role="toolbar" aria-label={c.controls}>
        <CallButton
          icon={micAvailable && !micMuted ? "mic" : "micoff"}
          // Недоступная кнопка подписана коротко, а причина — в подсказке:
          // абзац причины растягивал кнопку на полпанели.
          label={!micAvailable ? c.mic : micMuted ? t.meeting.micOn : t.meeting.micOff}
          title={!micAvailable ? (micFail ? c.noMic.replace("{reason}", micFail) : t.meeting.noMic) : undefined}
          off={!micAvailable || micMuted}
          disabled={!micAvailable || offline || finished}
          level={listening ? level : undefined}
          onClick={onToggleMic}
        />
        <CallButton
          icon={camera.up && !camera.off ? "camera" : "camoff"}
          label={camera.reason ? c.camera : !camera.up ? c.camOn : camera.off ? c.camOn : c.camOff}
          title={camera.reason ? c.camNa.replace("{reason}", camera.reason) : !camera.up ? c.camStart : undefined}
          off={!camera.up || camera.off}
          // Поднять камеру — это смена сокета (как вход в звонок), а сокет
          // меняется только между ходами: во время хода или речи кнопка
          // заперта, а не нажимается вхолостую (найдено ревью).
          disabled={!!camera.reason || offline || finished || (!camera.up && status !== "listening")}
          onClick={onToggleCamera}
        />
        <CallButton icon="cc" label={c.cc} pressed={captions} onClick={() => setCaptions((v) => !v)} />
        {hintEnabled ? (
          <CallButton icon="bulb" label={c.hint} disabled={hintDisabled || finished} onClick={onHint} />
        ) : null}
        <CallButton icon="chat" label={c.feed} expanded={feedOpen} controls={feedOpen ? "call-feed" : undefined}
          buttonRef={feedButton}
          onClick={() => setFeedOpen((v) => !v)} />
        {oppSpeaking && onInterrupt ? (
          <CallButton icon="bolt" label={t.meeting.interrupt} className="cut" onClick={onInterrupt} />
        ) : null}
        <CallButton icon="phone" label={c.end} title={c.endHint} className="end"
          disabled={hangupPending} onClick={onHangUp} />
      </div>
    </section>
  );
}

/** Кнопка панели звонка: значок крупно, подпись под ним (на телефоне — только
 *  диктору). `pressed` — только у переключателя с неизменной подписью
 *  (субтитры): у микрофона и камеры подпись сама называет действие, и
 *  «нажато» поверх неё читалось бы диктору двойным отрицанием. */
function CallButton({ icon, label, title, pressed, expanded, controls, off, disabled, className, level, buttonRef, onClick }: {
  icon: IconName;
  label: string;
  title?: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  off?: boolean;
  disabled?: boolean;
  className?: string;
  /** Уровень входа 0..1 — полоска под значком микрофона. */
  level?: number;
  buttonRef?: React.MutableRefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cb${off ? " off" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {level !== undefined ? (
        <i className="cb-level" aria-hidden="true" style={{ transform: `scaleX(${Math.min(1, level)})` }} />
      ) : null}
    </button>
  );
}
