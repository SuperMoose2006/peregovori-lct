// OpponentFace.tsx — лицо оппонента: сгенерированные состояния или рисованный портрет.
//
// ПОЧЕМУ ДВА ИСТОЧНИКА. Набор состояний генерируется офлайн
// (`services/gateway/tools/gen_avatar_states.py`) и лежит в
// `public/avatars/<сценарий>/<состояние>.webp`. Если его нет — для нового
// сценария, для «своей сделки», при обрезанной сборке — показываем прежний
// параметрический портрет из `Avatar.tsx`. Пустого прямоугольника не бывает.
//
// Локальный речевой режим рисует рот SVG по реально проигрываемому PCM.
// Это амплитудная анимация, не распознавание фонем и не фотореалистичное видео.
// CONTRACT(avatar-video): приём JPEG по часам PCM реализован, внешний адаптер не выбран.
//   Настоящим станет: выбранный провайдер и проверенная запись его кадров со звуком.
import { useEffect, useState } from "react";
import { Avatar, avatarMood, type Mood } from "./Avatar";
import type { StateView } from "../types";

/** Состояния, для которых есть отдельная картинка. Зеркало `BASE_STATES` генератора. */
const DRAWN_STATES = [
  "listening", "thinking", "speaking", "warm",
  "lean_forward", "lean_back", "annoyed", "offended", "walk_out",
] as const;

type DrawnState = (typeof DRAWN_STATES)[number];

/** Состояние → какую картинку показать. Зеркало `STATE_ALIASES` генератора. */
const ALIASES: Record<string, DrawnState> = {
  idle: "listening",
  hesitation: "thinking",
  nod: "warm",
  smile: "warm",
  shake_head: "annoyed",
};

export function resolveState(state: string | null): DrawnState {
  if (!state) return "listening";
  if ((DRAWN_STATES as readonly string[]).includes(state)) return state as DrawnState;
  return ALIASES[state] ?? "listening";
}

/** Когда живых событий лица нет (офлайн), состояние выводится из шкал движка. */
export function stateFromMood(mood: Mood): DrawnState {
  if (mood === "angry") return "annoyed";
  if (mood === "wary") return "lean_back";
  if (mood === "warm") return "warm";
  return "listening";
}

interface Props {
  scenarioId: string;
  /** Состояние из события `avatar.state`. Null — живых событий нет. */
  avatarState: string | null;
  state: StateView | null;
  exam: boolean;
  /** Оппонент сейчас говорит: рисуем честный индикатор речи, а не губы. */
  speaking?: boolean;
  getSpeechLevel?: () => number;
  getVideoFrame?: () => string | null;
  amplitudeAnimation?: boolean;
  animationLabel?: string;
  /** Размер рисованного запасного портрета. Картинку состояния масштабирует CSS. */
  size?: number;
  label?: string;
  /** Имя индикатора речи. Строкой в коде здесь стояло русское «говорит» —
   *  в английском интерфейсе диктор читал его по-русски (инвариант 4). */
  speakingLabel: string;
}

export function OpponentFace({
  scenarioId, avatarState, state, exam, speaking = false, size = 96, label, speakingLabel, getSpeechLevel, amplitudeAnimation = false, animationLabel, getVideoFrame,
}: Props) {
  const mood = avatarMood(state, exam);
  // В экзамене шкалы скрыты, и лицо не должно их выдавать: фиксируем нейтральное.
  const resolved = exam ? "listening" : (avatarState ? resolveState(avatarState) : stateFromMood(mood));
  const src = `/avatars/${scenarioId}/${resolved}.webp`;
  const clip = `/avatars/${scenarioId}/${resolved}.webm`;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [failedClip, setFailedClip] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [opening, setOpening] = useState(0);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);
  const [badVideoFrame, setBadVideoFrame] = useState<string | null>(null);
  const animated = amplitudeAnimation && !exam && !!getSpeechLevel;
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!animated) { setOpening(0); return; }
    let frame = 0;
    const tick = () => {
      setVideoFrame(getVideoFrame?.() ?? null);
      setOpening(Math.max(0, Math.min(1, getSpeechLevel?.() ?? 0)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, getSpeechLevel, getVideoFrame]);

  // Размер задаёт CSS (`.opp .face` меняет его по ширине экрана), поэтому
  // инлайновых width/height здесь нет: они перебили бы медиазапросы.
  return (
    <div className="face" data-motion-preference={reducedMotion ? "reduced" : "full"}
      title={animated && !videoFrame ? animationLabel : undefined} data-renderer={animated ? (videoFrame ? "video" : "amplitude") : "portrait"}>
      {animated && videoFrame && videoFrame !== badVideoFrame ? (
        <img className="face__img" src={videoFrame} alt={label ?? ""}
          onError={() => setBadVideoFrame(videoFrame)} />
      ) : animated || failedSrc === src ? (
        <Avatar scenarioId={scenarioId} mood={mood} size={size} label={label}
          mouthOpening={animated ? opening : 0} />
      ) : !exam && !reducedMotion && failedClip !== clip ? (
        <video key={clip} className="face__img" src={clip} poster={src}
          autoPlay loop muted playsInline preload="metadata" aria-label={label ?? ""}
          onError={() => setFailedClip(clip)} />
      ) : <img
        className="face__img"
        src={src}
        alt={label ?? ""}
        // Набора нет — молча уходим на рисованный портрет. Ошибка загрузки
        // картинки не повод показывать человеку сломанный экран.
        onError={() => setFailedSrc(src)}
        draggable={false}
      />}
      {speaking && !animated && (
        <span className="face__voice" aria-label={speakingLabel}>
          <i /><i /><i />
        </span>
      )}
    </div>
  );
}
