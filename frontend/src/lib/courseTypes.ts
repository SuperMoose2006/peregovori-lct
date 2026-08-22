// courseTypes.ts — контракт курса. Форма данных, которую генерирует бэкенд.
//
// Источник данных: services/gateway/app/course/{blocks,bank}.py, зеркало
// генерируется `tools/sync_course.py` в data/course.generated.ts. Здесь только
// типы — их правка обязана идти вместе с правкой Python-схемы.
//
// CONTRACT(course): формы упражнений продуманы и проверены тестами банка на
//   обеих сторонах, но в protocol.py (Pydantic) не заведены — курс сейчас
//   считается целиком на клиенте тем же движком-зеркалом, что и офлайновая
//   партия. Настоящим станет: секция course в protocol.py + серверная выдача
//   экзаменационной выборки, когда экзамен начнёт учитываться в сертификате.

/** Билингвальная строка. Как везде в продукте. */
export interface L {
  ru: string;
  en: string;
}

export interface CourseLesson {
  idx: number;
  title: L;
  body: L;
}

export interface CourseBlock {
  id: string;
  title: L;
  skill: L;
  icon: string;
  scenario_id: string;
  lessons: CourseLesson[];
}

export type ExerciseType =
  | "choice" | "spot_error" | "order" | "match"
  | "numeric" | "freeform" | "reaction" | "meters" | "drill";

export interface FreeformCheck {
  require_moves?: string[];
  require_any?: string[];
  forbid_moves?: string[];
  min_arg?: number;
  min_words?: number;
  require_number?: boolean;
  require_secondary?: string;
}

export interface OptionWithKey extends L {
  key: string;
}
export interface ItemWithId extends L {
  id: string;
}

export interface PassCondition {
  field: string;
  op: "==" | "!=" | ">=" | "<=" | ">" | "<";
  value: number | string;
}

/** Одно упражнение. Поля сверх общих зависят от `type` — см. bank.py.
 *
 *  `block`/`lesson`/`difficulty` необязательны: партии экзамена мастера
 *  (`master.py`) не принадлежат ни блоку, ни уроку — они и есть финальная
 *  проверка поверх всех блоков. */
export interface Exercise {
  id: string;
  block?: string;
  lesson?: number;
  type: ExerciseType;
  difficulty?: number;
  xp: number;
  prompt: L;
  explain: L;
  scenario_id?: string;

  options?: (L | OptionWithKey)[];
  answer?: unknown;
  expect_moves?: string[];

  bad_line?: L;
  fault_key?: string;

  items?: ItemWithId[];
  left?: ItemWithId[];
  right?: ItemWithId[];

  unit?: L;
  derive?: string;

  check?: FreeformCheck;
  reference?: L;

  opponent_line?: L;
  player_line?: L;
  seed_turn?: number;
  state?: { trust: number; tension: number; info: number; leverage: number; turn: number };
  ask?: string;

  max_turns?: number;
  goal?: L;
  pass?: PassCondition[];
}
