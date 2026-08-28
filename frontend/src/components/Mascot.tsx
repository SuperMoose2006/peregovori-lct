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

/** Подписи к картинкам по состояниям — приходят из словаря, см. `KarlProps.alt`. */
export type KarlAlt = Record<KarlState, string>;

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
  // Грейд приходит вместе с разбором, а разбор доезжает уже ПОСЛЕ закрытия
  // сделки — стол держит паузу как раз ради этого. Пока его нет, радоваться
  // нечему: сделка бывает и на D. Приехал A/B — Карл празднует прямо за столом.
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

/**
 * Картинка маскота.
 *
 * ПОЧЕМУ НЕ ПРОСТО <img src=png>. Исходники — PNG 512×512 по 150–240 КБ, весь
 * набор тянул около двух мегабайт ради значка ростом 92 px (а в ленте — 34 px).
 * Рядом лежат те же кадры в webp: полный и уменьшенный до 192 px. `sizes`
 * называет реальный размер слота, поэтому браузер берёт мелкий файл, а PNG
 * остаётся последним запасным вариантом для браузера без webp.
 */
export function MascotImg({ dir, state, alt, size, className }: {
  dir: "karl" | "tikhon";
  state: string;
  /** Пусто — картинка декоративная: имя маскота стоит рядом текстом. */
  alt: string;
  /** Размер слота в CSS-пикселях. Влияет только на выбор файла: рисует CSS. */
  size: number;
  className?: string;
}) {
  const base = `/mascots/${dir}/${state}`;
  return (
    <picture className={className}>
      <source type="image/webp" srcSet={`${base}-192.webp 192w, ${base}.webp 512w`} sizes={`${size}px`} />
      <img src={`${base}.png`} alt={alt} width={size} height={size} decoding="async" />
    </picture>
  );
}

interface KarlProps {
  state: KarlState;
  /** Что он говорит. Пусто — пузыря нет вовсе: молчание это нормальное состояние. */
  line?: string | null;
  /** Компактный вид для телефона: значок рядом с репликой вместо фигуры в рост. */
  compact?: boolean;
  name: string;
  /** Подписи к картинке из словаря. Их читает вслух диктор, поэтому они
   *  переводятся вместе со всем остальным (инвариант 4). Не передали — берём
   *  имя, оно локализовано на каждом вызове; русского в разметке не остаётся. */
  alt?: KarlAlt;
}

export function Karl({ state, line, compact, name, alt }: KarlProps) {
  const altText = alt ? alt[state] : name;
  if (compact) {
    return (
      <span className="karl-mini">
        <MascotImg dir="karl" state={state} alt={altText} size={34} />
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
        <MascotImg dir="karl" state={state} alt={altText} size={92} />
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
      {/* alt пустой намеренно: заголовок справа уже называет Тихона по имени, и
          подпись к картинке диктор прочитал бы вторым эхом. Заодно исчезает
          последняя строка на одном языке в разметке. */}
      <MascotImg dir="tikhon" state={state} alt="" size={76} />
      <div className="tikhon-bd">
        {/* h3: карточки рейла — h2, и прыжок через уровень ломает навигацию
            по разделам у экранного диктора. */}
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
