// OpponentFace.tsx — лицо оппонента: сгенерированные состояния или рисованный портрет.
//
// ПОЧЕМУ ДВА ИСТОЧНИКА. Набор состояний генерируется офлайн
// (`services/gateway/tools/gen_avatar_states.py`) и лежит в
// `public/avatars/<сценарий>/<состояние>.webp`. Если его нет — для нового
// сценария, для «своей сделки», при обрезанной сборке — показываем прежний
// параметрический портрет из `Avatar.tsx`. Пустого прямоугольника не бывает.
//
// ЧЕСТНОСТЬ. Липсинка здесь нет и не заявляется. Речь показана не движением
// губ, а отдельным индикатором — тремя полосками рядом с лицом. Это разница
// между «мы не умеем синхронизировать губы, и вот честный признак речи» и
// «мы делаем вид, что умеем». Второго в продукте не бывает по правилу проекта.
//
// STUB(avatar-lipsync): синхронизации губ с речью нет.
//   Настоящим станет: провайдер `livetalking` (MuseTalk на GPU-хосте) —
//   он отдаёт видеопоток по WebRTC, и `capabilities.lipsync` станет true,
//   после чего этот компонент уступит место видеоэлементу.
//   См. docs/upstream-code-map.md и services/avatar/README.md.
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
  /** Размер рисованного запасного портрета. Картинку состояния масштабирует CSS. */
  size?: number;
  label?: string;
}

export function OpponentFace({
  scenarioId, avatarState, state, exam, speaking = false, size = 96, label,
}: Props) {
  const mood = avatarMood(state, exam);
  // В экзамене шкалы скрыты, и лицо не должно их выдавать: фиксируем нейтральное.
  const resolved = exam ? "listening" : (avatarState ? resolveState(avatarState) : stateFromMood(mood));
  const [drawn, setDrawn] = useState(true);

  // Смена сценария — новый набор картинок: пробуем снова, даже если прошлый не нашёлся.
  useEffect(() => setDrawn(true), [scenarioId]);

  if (!drawn) {
    // Тот же `.face`, что и у картинки: размеры и скругления задаёт он, и
    // запасной портрет обязан садиться в ту же рамку, а не рядом с ней.
    return (
      <div className="face">
        <Avatar scenarioId={scenarioId} mood={mood} size={size} label={label} />
      </div>
    );
  }

  // Размер задаёт CSS (`.opp .face` меняет его по ширине экрана), поэтому
  // инлайновых width/height здесь нет: они перебили бы медиазапросы.
  return (
    <div className="face">
      <img
        className="face__img"
        src={`/avatars/${scenarioId}/${resolved}.webp`}
        alt={label ?? ""}
        // Набора нет — молча уходим на рисованный портрет. Ошибка загрузки
        // картинки не повод показывать человеку сломанный экран.
        onError={() => setDrawn(false)}
        draggable={false}
      />
      {speaking && (
        <span className="face__voice" aria-label="говорит">
          <i /><i /><i />
        </span>
      )}
    </div>
  );
}
