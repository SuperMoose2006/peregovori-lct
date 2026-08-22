// CourseScreen.tsx — курс приёмов: карта блоков, уроки, экзамен блока.
//
// ЗАЧЕМ ОН РЯДОМ С КАМПАНИЕЙ. Кампания учит играть партию целиком; курс учит
// одному приёму за раз и проверяет его девятью типами заданий. Одно без другого
// не работает: партия без разбора приёмов — угадайка, а курс без партии —
// теория.
//
// ЧЕСТНОСТЬ ЗДЕСЬ ТА ЖЕ, ЧТО В ИГРЕ. Ни один ответ не оценивает ИИ: вердикт
// выносит движок (lib/course.ts), правильность каждого пункта доказана тестами
// против настоящего analyze()/apply_move() на обоих языках. Поэтому курс
// работает офлайн — как и партия.
import { useMemo, useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import type { Exercise as Ex } from "../lib/courseTypes";
import {
  COURSE_BLOCKS, blockById, drawExam, exercisesOf, exercisesOfLesson, type ExamDraw,
} from "../lib/course";
import {
  blockCompletion, getBlockProgress, markLessonDone, recordExam, recordExercise,
  type Profile,
} from "../lib/progress";
import { Exercise } from "./Exercise";
import { Karl, Tikhon } from "./Mascot";
import { AchievementToasts } from "./Gamification";
import { ScreenHeading } from "./ScreenHeading";

interface Props {
  t: Strings;
  lang: Lang;
  profile: Profile;
  onProfile: (p: Profile) => void;
  /** Капстоун играется настоящей партией — её открывает App. */
  onStartDrill: (ex: Ex, ctx: { blockId: string; exam?: ExamCtx }) => void;
  /** Куда вернуться из курса «на стол». */
  onExit: () => void;
  /** Открыть сразу нужный блок: домашняя кнопка ведёт в конкретное место. */
  startAt?: { blockId: string; lesson: number | null } | null;
}

export interface ExamCtx {
  attempt: number;
  score: number;
  total: number;
  passMark: number;
}

type View =
  | { kind: "map" }
  | { kind: "block"; id: string }
  | { kind: "lesson"; id: string; lesson: number }
  | { kind: "exam"; id: string };

export function CourseScreen({ t, lang, profile, onProfile, onStartDrill, onExit, startAt }: Props) {
  const [view, setView] = useState<View>(() =>
    startAt
      ? (startAt.lesson === null
          ? { kind: "block", id: startAt.blockId }
          : { kind: "lesson", id: startAt.blockId, lesson: startAt.lesson })
      : { kind: "map" });

  if (view.kind === "lesson") {
    return (
      <LessonRunner
        t={t} lang={lang} profile={profile} onProfile={onProfile}
        blockId={view.id} lesson={view.lesson}
        onStartDrill={(ex) => onStartDrill(ex, { blockId: view.id })}
        onBack={() => setView({ kind: "block", id: view.id })}
      />
    );
  }
  if (view.kind === "exam") {
    return (
      <ExamRunner
        t={t} lang={lang} profile={profile} onProfile={onProfile} blockId={view.id}
        onStartDrill={(ex, ctx) => onStartDrill(ex, { blockId: view.id, exam: ctx })}
        onLesson={(n) => setView({ kind: "lesson", id: view.id, lesson: n })}
        onBack={() => setView({ kind: "block", id: view.id })}
      />
    );
  }
  if (view.kind === "block") {
    return (
      <BlockView
        t={t} lang={lang} profile={profile} blockId={view.id}
        onLesson={(n) => setView({ kind: "lesson", id: view.id, lesson: n })}
        onExam={() => setView({ kind: "exam", id: view.id })}
        onBack={() => setView({ kind: "map" })}
      />
    );
  }

  return <CourseMap t={t} lang={lang} profile={profile} onOpen={(id) => setView({ kind: "block", id })} onExit={onExit} />;
}

// ------------------------------------------------------------------ карта

function CourseMap({ t, lang, profile, onOpen, onExit }: {
  t: Strings; lang: Lang; profile: Profile; onOpen: (id: string) => void; onExit: () => void;
}) {
  // Блок открыт, если предыдущий сдан ИЛИ хотя бы наполовину пройден: жёсткая
  // блокировка на демо злит быстрее, чем учит, а совсем без порядка курс
  // перестаёт быть лестницей.
  const unlocked = useMemo(() => {
    const out: Record<string, boolean> = {};
    let allow = true;
    for (const b of COURSE_BLOCKS) {
      out[b.id] = allow;
      const p = getBlockProgress(profile, b.id);
      allow = p.passed || blockCompletion(p, b.lessons.length, exercisesOf(b.id).length) >= 0.5;
    }
    return out;
  }, [profile]);

  const doneCount = COURSE_BLOCKS.filter((b) => getBlockProgress(profile, b.id).passed).length;

  return (
    <section className="screen course">
      <div className="wrap">
        <ScreenHeading as="h1">{t.course.title}</ScreenHeading>
        <p className="lead">{t.course.lead}</p>
        <div className="course-top">
          <span className="course-count">{t.course.blocksDone
            .replace("{n}", String(doneCount)).replace("{total}", String(COURSE_BLOCKS.length))}</span>
          <button className="btn ghost" onClick={onExit}>{t.course.toTable}</button>
        </div>

        <ol className="course-path">
          {COURSE_BLOCKS.map((b, i) => {
            const p = getBlockProgress(profile, b.id);
            const pct = Math.round(blockCompletion(p, b.lessons.length, exercisesOf(b.id).length) * 100);
            const open = unlocked[b.id];
            const status = p.passed ? "done" : open ? "current" : "locked";
            return (
              <li key={b.id} className={`cnode ${status}`}>
                <button className="cnode-btn" onClick={() => open && onOpen(b.id)} disabled={!open}>
                  <span className="cnode-ic" aria-hidden="true">{p.passed ? "★" : open ? b.icon : "🔒"}</span>
                </button>
                <div className="cnode-body">
                  <div className="cnode-t">{b.title[lang]}</div>
                  <div className="cnode-s">{b.skill[lang]}</div>
                  <div className="cnode-meta">
                    <span className="cnode-of">{t.course.blockOf
                      .replace("{n}", String(i + 1)).replace("{total}", String(COURSE_BLOCKS.length))}</span>
                    <span className="cnode-bar"><i style={{ width: `${pct}%` }} /></span>
                    <span className="cnode-pct">{pct}%</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <Tikhon title={t.course.tikhonTitle}>{t.course.tikhonBody}</Tikhon>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ блок

function BlockView({ t, lang, profile, blockId, onLesson, onExam, onBack }: {
  t: Strings; lang: Lang; profile: Profile; blockId: string;
  onLesson: (n: number) => void; onExam: () => void; onBack: () => void;
}) {
  const block = blockById(blockId)!;
  const p = getBlockProgress(profile, blockId);
  const draw = drawExam(blockId, p.attempts);

  return (
    <section className="screen course">
      <div className="wrap">
        <button className="btn ghost back" onClick={onBack}>← {t.course.allBlocks}</button>
        <ScreenHeading as="h1">{block.icon} {block.title[lang]}</ScreenHeading>
        <p className="lead">{block.skill[lang]}</p>

        <ol className="lesson-list">
          {block.lessons.map((l) => {
            const done = p.lessons.includes(l.idx);
            const n = exercisesOfLesson(blockId, l.idx).length;
            return (
              <li key={l.idx} className={done ? "done" : ""}>
                <button onClick={() => onLesson(l.idx)}>
                  <span className="ll-n">{done ? "✓" : l.idx}</span>
                  <span className="ll-t">{l.title[lang]}</span>
                  <span className="ll-x">{n ? t.course.tasksN.replace("{n}", String(n)) : t.course.theory}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="exam-card">
          <h3>🎓 {t.course.examTitle}</h3>
          <p>{t.course.examLead
            .replace("{n}", String(draw.items.length))
            .replace("{pass}", String(draw.passMark))
            .replace("{total}", String(draw.total))}</p>
          {p.attempts > 0 ? (
            <p className="exam-best">{t.course.examBest
              .replace("{best}", String(p.examBest)).replace("{total}", String(p.examTotal || draw.total))}
              {p.passed ? ` · ${t.course.examPassed}` : ""}</p>
          ) : null}
          <button className="btn primary" onClick={onExam}>{t.course.examStart}</button>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ урок

function LessonRunner({ t, lang, profile, onProfile, blockId, lesson, onStartDrill, onBack }: {
  t: Strings; lang: Lang; profile: Profile; onProfile: (p: Profile) => void;
  blockId: string; lesson: number; onStartDrill: (ex: Ex) => void; onBack: () => void;
}) {
  const block = blockById(blockId)!;
  const info = block.lessons.find((l) => l.idx === lesson)!;
  const items = useMemo(() => exercisesOfLesson(blockId, lesson), [blockId, lesson]);
  const [step, setStep] = useState(-1); // -1 = теория
  const [gained, setGained] = useState(0);
  const [right, setRight] = useState(0);
  const [answered, setAnswered] = useState(false);

  const finishTheory = () => {
    onProfile(markLessonDone(profile, blockId, lesson));
    setStep(0);
  };

  const onDone = (correct: boolean) => {
    setAnswered(true);
    if (correct) setRight((n) => n + 1);
    const ex = items[step];
    const res = recordExercise(profile, blockId, ex.id, ex.xp, correct);
    if (res.xpGain) { onProfile(res.profile); setGained((x) => x + res.xpGain); }
  };

  const next = () => { setAnswered(false); setStep((s) => s + 1); };

  if (step < 0) {
    return (
      <section className="screen course">
        <div className="wrap lesson">
          <button className="btn ghost back" onClick={onBack}>← {block.title[lang]}</button>
          <ScreenHeading as="h1">{info.title[lang]}</ScreenHeading>
          <div className="lesson-body">
            {info.body[lang].split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
          </div>
          <Karl state="point" line={t.course.karlTheory} name={t.mascot.karl} />
          <button className="btn primary" onClick={finishTheory}>
            {items.length ? t.course.toTasks : t.course.lessonDone}
          </button>
        </div>
      </section>
    );
  }

  if (step >= items.length) {
    return (
      <section className="screen course">
        <div className="wrap lesson done">
          <ScreenHeading as="h1">{t.course.lessonComplete}</ScreenHeading>
          <p className="lead">{t.course.lessonScore
            .replace("{n}", String(right)).replace("{total}", String(items.length))}</p>
          {gained ? <p className="lesson-xp">+{gained} XP</p> : null}
          <Karl state={right === items.length ? "celebrate" : "idle"}
                line={right === items.length ? t.course.karlPerfect : t.course.karlOk} name={t.mascot.karl} />
          <button className="btn primary" onClick={onBack}>← {block.title[lang]}</button>
        </div>
      </section>
    );
  }

  const ex = items[step];
  return (
    <section className="screen course">
      <div className="wrap lesson">
        <button className="btn ghost back" onClick={onBack}>← {block.title[lang]}</button>
        <div className="lesson-bar"><i style={{ width: `${(step / items.length) * 100}%` }} /></div>
        <div className="lesson-step">{t.course.stepOf
          .replace("{n}", String(step + 1)).replace("{total}", String(items.length))}</div>
        <Exercise key={ex.id} t={t} lang={lang} ex={ex} onDone={onDone} onStartDrill={onStartDrill} />
        {(answered || ex.type === "drill") ? (
          <button className="btn primary" onClick={next}>{t.course.next} →</button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- экзамен

function ExamRunner({ t, lang, profile, onProfile, blockId, onStartDrill, onLesson, onBack }: {
  t: Strings; lang: Lang; profile: Profile; onProfile: (p: Profile) => void; blockId: string;
  onStartDrill: (ex: Ex, ctx: ExamCtx) => void; onLesson: (n: number) => void; onBack: () => void;
}) {
  const block = blockById(blockId)!;
  const attempt = getBlockProgress(profile, blockId).attempts;
  const draw: ExamDraw = useMemo(() => drawExam(blockId, attempt), [blockId, attempt]);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<{ id: string; ok: boolean }[]>([]);
  const [saved, setSaved] = useState<{ xp: number; passed: boolean; badges: string[] } | null>(null);

  const ex = draw.items[step];
  const isLast = step >= draw.items.length - 1;

  const onDone = (ok: boolean) => {
    setAnswered(true);
    setResults((r) => [...r, { id: ex.id, ok }]);
    if (ok) setScore((s) => s + draw.weight(ex));
  };

  const finish = () => {
    // Экзамен со слоями и без обязан быть сравним, поэтому он и не знает о них
    // вовсе: здесь только банк и движок.
    const res = recordExam(profile, blockId, score, draw.total, draw.passMark);
    onProfile(res.profile);
    setSaved({ xp: res.xpGain, passed: res.passed, badges: res.newAchievements });
    setStep(draw.items.length);
  };

  if (step >= draw.items.length) {
    const passed = saved?.passed ?? false;
    // Уроки, к которым ведут промахи, — по одному разу и в порядке курса.
    const recovery = [...new Set(results.filter((r) => !r.ok)
      .map((r) => draw.items.find((x) => x.id === r.id)?.lesson)
      .filter((n): n is number => typeof n === "number"))].sort((a, b) => a - b);
    return (
      <section className="screen course">
        <div className="wrap lesson done">
          <ScreenHeading as="h1">{passed ? t.course.examPass : t.course.examFail}</ScreenHeading>
          <p className="lead">{t.course.examResult
            .replace("{score}", String(score)).replace("{total}", String(draw.total))
            .replace("{pass}", String(draw.passMark))}</p>
          {saved?.xp ? <p className="lesson-xp">+{saved.xp} XP</p> : null}
          <Karl state={passed ? "celebrate" : "concern"}
                line={passed ? t.course.karlExamPass : t.course.karlExamFail} name={t.mascot.karl} />
          {/* Разбор откладывается до конца — во время экзамена подсказок нет. */}
          {/* Урок восстановления: провал обязан заканчиваться маршрутом, а не
              констатацией. Уроки берутся из промахов, а не из общего списка. */}
          {!passed && recovery.length ? (
            <div className="recovery">
              <h4>{t.course.recoveryTitle}</h4>
              <ul>
                {recovery.map((n) => {
                  const l = block.lessons.find((x) => x.idx === n);
                  return l ? (
                    <li key={n}>
                      <button className="btn ghost" onClick={() => onLesson(n)}>↻ {l.title[lang]}</button>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ) : null}
          <ul className="exam-review">
            {results.map((r) => {
              const item = draw.items.find((x) => x.id === r.id)!;
              return (
                <li key={r.id} className={r.ok ? "ok" : "bad"}>
                  <b>{r.ok ? "✓" : "✗"} {t.course.types[item.type]}</b>
                  <span>{item.explain[lang]}</span>
                </li>
              );
            })}
          </ul>
          <button className="btn primary" onClick={onBack}>← {block.title[lang]}</button>
          {/* Значки курса всплывают тем же компонентом, что и после партии:
              одна история обучения — одна полка наград. */}
          {saved?.badges.length ? <AchievementToasts t={t} lang={lang} ids={saved.badges} /> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="screen course exam">
      <div className="wrap lesson">
        <div className="lesson-bar"><i style={{ width: `${(step / draw.items.length) * 100}%` }} /></div>
        <div className="lesson-step">
          {t.course.stepOf.replace("{n}", String(step + 1)).replace("{total}", String(draw.items.length))}
          <span className="exam-flag">🎓 {t.course.examMode}</span>
          {/* Выход без записи: прерванная попытка не тратит счётчик и не портит
              лучший результат — наказывать за случайно открытый экзамен не за что. */}
          <button className="btn ghost exam-quit" onClick={onBack}>✕ {t.course.examQuit}</button>
        </div>
        <Exercise
          key={ex.id} t={t} lang={lang} ex={ex} exam onDone={onDone}
          onStartDrill={(e) => onStartDrill(e, { attempt, score, total: draw.total, passMark: draw.passMark })}
        />
        {answered ? (
          <button className="btn primary" onClick={() => { setAnswered(false); isLast ? finish() : setStep(step + 1); }}>
            {isLast ? t.course.examFinish : `${t.course.next} →`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
