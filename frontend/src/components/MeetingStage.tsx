// MeetingStage.tsx — встреча с крупным собеседником (тренировка с голосом).
//
// РАБОЧАЯ РЕАЛИЗАЦИЯ ПО ТРЕБОВАНИЯМ, А НЕ ПЕРЕНОС МАКЕТА. Экспорт страниц
// Claude Design (A/B/C) пока не получен; компоновка собрана по передаточной
// записке и будет сверена с экспортом. Лицо — те же 512-px портреты и ролики
// состояний, что и в рельсе: фотореалистичных ассетов и живой модели видео
// ещё нет, и экран этого не изображает.
//
// ЧТО ЭКРАН НЕ ДЕЛАЕТ. Он не считает и не показывает ничего, чего нет в
// партии: шкалы, цена и лента остаются на своих местах, ход идёт тем же путём
// (голос или композер), экзамен сюда не попадает вовсе (lib/meeting.ts).
import { useEffect, useState } from "react";
import { OpponentFace } from "./OpponentFace";
import { Icon } from "./Icon";
import type { FaceRenderer } from "../lib/faceSource";
import type { MeetingStatus } from "../lib/meeting";
import type { Strings } from "../i18n";
import type { ScenarioView, StateView } from "../types";

interface Props {
  t: Strings["meeting"];
  speakingLabel: string;
  animationLabel: string;
  scenario: ScenarioView;
  state: StateView | null;
  avatarState: string | null;
  renderer: FaceRenderer;
  synthetic: boolean;
  status: MeetingStatus;
  /** Последняя реплика собеседника — субтитр. Доступный текст живёт в ленте. */
  subtitle: string | null;
  oppSpeaking: boolean;
  micAvailable: boolean;
  micMuted: boolean;
  onToggleMic?: () => void;
  onInterrupt?: () => void;
  onTextMode: () => void;
  onEnd: () => void;
  getSpeechLevel?: () => number;
  getVideoFrame?: () => string | null;
  getAudioBlocked?: () => boolean;
  onResumeAudio?: () => void;
}

export function MeetingStage({
  t, speakingLabel, animationLabel, scenario, state, avatarState, renderer, synthetic, status, subtitle,
  oppSpeaking, micAvailable, micMuted, onToggleMic, onInterrupt, onTextMode, onEnd,
  getSpeechLevel, getVideoFrame, getAudioBlocked, onResumeAudio,
}: Props) {
  // Браузер мог не пустить звук без жеста. Опрашиваем редко: это не анимация,
  // а состояние, которое меняется раз за партию.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!getAudioBlocked) return;
    const timer = setInterval(() => setBlocked(getAudioBlocked()), 400);
    return () => clearInterval(timer);
  }, [getAudioBlocked]);

  const offline = status === "reconnecting" || status === "lost" || status === "connecting";

  return (
    <section className="meeting" aria-label={t.title} data-status={status}>
      <div className="mt-stage">
        <div className="mt-face">
          <OpponentFace
            scenarioId={scenario.id}
            avatarState={avatarState}
            state={state}
            exam={false}
            speaking={oppSpeaking}
            getSpeechLevel={getSpeechLevel}
            getVideoFrame={getVideoFrame}
            renderer={renderer}
            animationLabel={animationLabel}
            speakingLabel={speakingLabel}
            label={scenario.counterpart_name}
            size={280}
          />
        </div>
        <div className="mt-who">
          <b>{scenario.counterpart_name}</b>
          {/* Полная характеристика — в рельсе; на сцене одна строка, чтобы не
              ложиться на лицо. */}
          <span title={scenario.counterpart_persona}>{scenario.counterpart_persona}</span>
          {synthetic ? <span className="mt-test">{t.testStream}</span> : null}
        </div>
        {/* Одна живая строка на экран: что происходит во встрече. */}
        <span className={`mt-status ${status}`} role="status">
          <i aria-hidden="true" />
          {t.status[status]}
        </span>
        {/* Субтитр — копия последней реплики из ленты; диктору её читает лента,
            здесь дубль был бы вторым объявлением того же. */}
        {subtitle && !offline ? <p className="mt-sub" aria-hidden="true">{subtitle}</p> : null}
        {blocked && onResumeAudio ? (
          <button type="button" className="mt-sound" onClick={onResumeAudio}>
            <Icon name="sound" /> {t.soundOn}
            <span className="sr-only"> — {t.soundBlocked}</span>
          </button>
        ) : null}
      </div>
      <div className="mt-controls">
        {micAvailable ? (
          <button type="button" className={`mt-btn${micMuted ? " off" : ""}`} aria-pressed={micMuted}
            onClick={onToggleMic} disabled={!onToggleMic || offline}>
            <Icon name={micMuted ? "mute" : "mic"} />
            <span>{micMuted ? t.micOn : t.micOff}</span>
          </button>
        ) : (
          <span className="mt-nomic">{t.noMic}</span>
        )}
        {oppSpeaking && onInterrupt ? (
          <button type="button" className="mt-btn cut" onClick={onInterrupt}>
            <Icon name="bolt" /><span>{t.interrupt}</span>
          </button>
        ) : null}
        <button type="button" className="mt-btn" onClick={onTextMode}>
          <Icon name="chat" /><span>{t.text}</span>
        </button>
        <button type="button" className="mt-btn end" onClick={onEnd}>
          <Icon name="door" /><span>{t.end}</span>
        </button>
      </div>
    </section>
  );
}
