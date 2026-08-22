// Mascot.tsx — ворон Карл (тренер) и слон Тихон (память).
//
// ПОЧЕМУ ВОРОН, А НЕ СОВА. Сова читается как мудрая и добрая. Нам нужен тот,
// кто заметит, что вы уступили после первого «нет», — умный, наблюдательный,
// чуть язвительный. Для переговоров это правильный характер.
//
// ГЛАВНОЕ ПРАВИЛО: Карл НЕ ДОБАВЛЯЕТ НИ ОДНОГО НОВОГО СООБЩЕНИЯ. Строка
// тренера в ленте существует и без него; он даёт ей лицо и постоянное место,
// но текст берёт тот же самый. Маскот, который говорит своё, — это второй
// источник правды рядом с движком, а второго источника у нас не бывает.
//
// И состояние он берёт из ДВИЖКА, а не из собственных догадок: одобряет, когда
// выросло доверие, настораживается, когда выросло напряжение. Никакой
// самодеятельности про то, «как у вас дела».
import type { Deltas } from "../types";

/** Состояния Карла. Каждое соответствует СОБЫТИЮ партии, а не настроению. */
export type KarlState =
  | "idle"        // ход идёт, сказать нечего
  | "think"       // судья читает реплику
  | "cheer"       // приём сработал: доверие/информация выросли
  | "concern"     // напряжение выросло
  | "point"       // игрок нажал 💡
  | "celebrate"   // сделка закрыта на A или B
  | "sad";        // переговоры сорваны

export type TikhonState = "idle" | "remember" | "exam";

/**
 * Состояние Карла из того, что уже посчитал движок.
 *
 * Порядок веток — это приоритет: конец партии важнее хода, ход важнее
 * ожидания. Ничего не подошло — молчит и наблюдает.
 */
export function karlState(input: {
  phase?: "judging" | "replying" | null;
  busy?: boolean;
  hintPending?: boolean;
  deltas?: Deltas | null;
  grade?: string | null;
  status?: "active" | "agreement" | "breakdown" | null;
}): KarlState {
  const { phase, busy, hintPending, deltas, grade, status } = input;

  if (status === "breakdown") return "sad";
  if (status === "agreement") return grade === "A" || grade === "B" ? "celebrate" : "idle";
  if (hintPending) return "point";
  if (busy && phase === "judging") return "think";

  if (deltas) {
    // Порог в 5 пунктов, а не любое движение: шкалы дрожат почти каждый ход,
    // и ворон, реагирующий на ±1, мигал бы без остановки.
    if (deltas.tension >= 5) return "concern";
    if (deltas.trust >= 5 || deltas.info >= 8) return "cheer";
  }
  return "idle";
}

const KARL_ALT: Record<KarlState, string> = {
  idle: "Карл наблюдает",
  think: "Карл думает",
  cheer: "Карл одобряет",
  concern: "Карл насторожен",
  point: "Карл подсказывает",
  celebrate: "Карл празднует",
  sad: "Карл расстроен",
};

interface KarlProps {
  state: KarlState;
  /** Что он говорит. Пусто — пузыря нет вовсе: молчание это нормальное состояние. */
  line?: string | null;
  /** Компактный вид для телефона: значок рядом с репликой вместо фигуры в рост. */
  compact?: boolean;
  name: string;
}

export function Karl({ state, line, compact, name }: KarlProps) {
  if (compact) {
    return (
      <span className="karl-mini">
        <img src={`/mascots/karl/${state}.png`} alt={KARL_ALT[state]} width={34} height={34} />
        {line ? <span className="karl-mini-t"><b>{name}:</b> {line}</span> : null}
      </span>
    );
  }

  return (
    <div className={`karl karl--${state}`}>
      {line ? (
        // key по тексту: смена реплики пере-монтирует пузырь, и он всплывает
        // заново. Без этого новая подсказка молча подменяет старую, и человек
        // не замечает, что ему вообще что-то сказали.
        <div className="karl-bub" key={line}>{line}</div>
      ) : null}
      <div className="karl-row">
        <img src={`/mascots/karl/${state}.png`} alt={KARL_ALT[state]} width={92} height={92} />
        <span className="karl-nm">{name}</span>
      </div>
    </div>
  );
}

interface TikhonProps {
  state?: TikhonState;
  title: string;
  children: React.ReactNode;
}

/** Слон Тихон — память. Появляется только там, где есть что вспомнить. */
export function Tikhon({ state = "remember", title, children }: TikhonProps) {
  return (
    <div className="tikhon">
      <img src={`/mascots/tikhon/${state}.png`} alt="Тихон помнит" width={76} height={76} />
      <div className="tikhon-bd">
        <h4>{title}</h4>
        <p>{children}</p>
      </div>
    </div>
  );
}
