// AUDIT-CONTRACT course-access: 50% progress may open the next study block; passing/master credit still requires exams. See docs/deep-audit-12206/CLEANUP.md.
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
import { useEffect, useMemo, useRef, useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import type { Exercise as Ex } from "../lib/courseTypes";
import {
  COURSE_BANK, COURSE_BLOCKS, COURSE_MASTER, MASTER_PASS_MARK, blockById, drawExam,
  exercisesOf, exercisesOfLesson, masterUnlocked, type ExamDraw,
} from "../lib/course";
import {
  MASTER_ID, blockCompletion, getBlockProgress, loadProfile, markLessonDone, missedExercises, recordExam,
  recordExercise, type Profile,
} from "../lib/progress";
import {
  clearExamRun, examOutcome, examRunFor, loadExamRun, saveExamRun, type ExamRunSnapshot,
} from "../lib/examRun";
import { Exercise } from "./Exercise";
import { Karl, Tikhon } from "./Mascot";
import { plural } from "../lib/format";
import { AchievementToasts } from "./Gamification";
import { play } from "../lib/sound";
import { WhyTeaches } from "./WhyTeaches";
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
  | { kind: "master" }
  | { kind: "redo" }
  | { kind: "block"; id: string }
  | { kind: "lesson"; id: string; lesson: number }
  | { kind: "exam"; id: string };

export function CourseScreen({ t, lang, profile, onProfile, onStartDrill, onExit, startAt }: Props) {
  // ЖДУЩАЯ ПОПЫТКА ЭКЗАМЕНА. Капстоун — настоящая партия, и она размонтирует
  // этот экран целиком; итог экзамена ждёт на диске (см. lib/examRun.ts). Он
  // сильнее `startAt`: человек только что доиграл партию, которой закончился
  // экзамен, и любой другой экран на её месте — потеря результата.
  //
  // Недоигранная попытка выбрасывается, а не показывается: экзамен, из которого
  // ушли, не тратит счётчик — то же правило, что у кнопки «Прервать экзамен».
  const [resume, setResume] = useState<ExamRunSnapshot | null>(() => {
    const run = loadExamRun();
    if (!run) return null;
    if (run.capstoneOk === null) { clearExamRun(); return null; }
    return run;
  });
  const [view, setView] = useState<View>(() =>
    resume
      ? { kind: "exam", id: resume.blockId }
      : startAt
        ? (startAt.blockId === MASTER_ID
            ? { kind: "master" }
            : startAt.lesson === null
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
    // Уход с экрана итога гасит снимок: иначе пересдача открывалась бы прошлым
    // результатом вместо первого задания.
    const leave = (next: View) => { setResume(null); setView(next); };
    return (
      <ExamRunner
        t={t} lang={lang} profile={profile} onProfile={onProfile} blockId={view.id}
        resume={resume && resume.blockId === view.id ? resume : undefined}
        onStartDrill={(ex, ctx) => onStartDrill(ex, { blockId: view.id, exam: ctx })}
        onLesson={(n) => leave({ kind: "lesson", id: view.id, lesson: n })}
        onBack={() => leave({ kind: "block", id: view.id })}
        onMap={() => leave({ kind: "map" })}
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

  if (view.kind === "redo") {
    return (
      <RedoRunner
        t={t} lang={lang} profile={profile} onProfile={onProfile}
        onBack={() => setView({ kind: "map" })}
      />
    );
  }

  if (view.kind === "master") {
    return (
      <MasterExam
        t={t} lang={lang} profile={profile}
        onStart={(ex) => onStartDrill(ex, { blockId: MASTER_ID })}
        onBack={() => setView({ kind: "map" })}
      />
    );
  }

  return (
    <CourseMap
      t={t} lang={lang} profile={profile}
      onOpen={(id) => setView({ kind: "block", id })}
      onMaster={() => setView({ kind: "master" })}
      onRedo={() => setView({ kind: "redo" })}
      onExit={onExit}
    />
  );
}

// ------------------------------------------------------------------ карта

function CourseMap({ t, lang, profile, onOpen, onMaster, onRedo, onExit }: {
  t: Strings; lang: Lang; profile: Profile; onOpen: (id: string) => void;
  onMaster: () => void; onRedo: () => void; onExit: () => void;
}) {
  const missed = missedExercises(profile);
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
        <p className="lead">{t.course.lead.replace("{n}", String(COURSE_BLOCKS.length))}</p>
        {/* Работа над ошибками: список живёт ровно до тех пор, пока ошибка не
            исправлена. Ничего не «висит» вечно и не копится молча. */}
        {missed.length ? (
          <button className="redo-card" onClick={onRedo}>
            <span aria-hidden="true">↻</span>
            <b>{t.course.redoTitle}</b>
            <span>{missed.length} {plural(missed.length, t.course.taskForms)}</span>
          </button>
        ) : null}

        {/* «ПОЧЕМУ ЭТО УЧИТ» — четыре панели метода с примерами из партии.
            Текст был написан на двух языках, задокументирован и никому не
            показывался: он жил в маркетинговой шапке удалённого скина, и вместе
            с ней исчез. Курс объясняет КАК, а зачем вообще Гарвард, SPIN и
            BATNA — не объяснял никто. Место выбрано по тому же принципу:
            вопрос «зачем» возникает ДО первого блока, а не после. */}
        <details className="course-why">
          <summary>{t.teach.head}</summary>
          <WhyTeaches t={t} lang={lang} />
        </details>

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
                {/* Значок помечен aria-hidden, поэтому имя кнопки нужно задать явно:
                    без него запертые узлы читались диктору как «кнопка 🔒» — пять
                    одинаковых безымянных кнопок подряд. */}
                <button className="cnode-btn" onClick={() => open && onOpen(b.id)} disabled={!open}
                        aria-label={`${b.title[lang]} — ${p.passed ? t.course.blockDone : open ? t.course.blockOpen : t.course.blockLocked}`}>
                  <span className="cnode-ic" aria-hidden="true">{p.passed ? "★" : open ? b.icon : "🔒"}</span>
                  {/* Флажок над текущим узлом: «где я» — без чтения, как в кампании. */}
                  {status === "current" ? <span className="cnode-flag">{t.campaign.startFlag}</span> : null}
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

        {/* Экзамен мастера стоит в конце тропы и до последнего блока закрыт:
            три партии подряд на незнакомых столах — проверка навыка, а не разминка. */}
        <div className={`master-card${masterUnlocked(doneCount) ? "" : " locked"}`}>
          <span className="master-ic" aria-hidden="true">
            {profile.course[MASTER_ID]?.passed ? "👑" : masterUnlocked(doneCount) ? "🎓" : "🔒"}
          </span>
          <div>
            <h2>{t.course.masterTitle}</h2>
            {/* Число блоков ПОДСТАВЛЯЕТСЯ, а не пишется словом: строка обещала «все
                девять блоков», когда их стало десять, — то есть экран говорил
                неправду ровно про то условие, которое сам и проверяет. */}
            <p>{masterUnlocked(doneCount)
              ? t.course.masterLead
              : t.course.masterLocked.replace("{n}", String(COURSE_BLOCKS.length))}</p>
          </div>
          <button className="btn primary" disabled={!masterUnlocked(doneCount)} onClick={onMaster}>
            {profile.course[MASTER_ID]?.passed ? t.course.masterAgain : t.course.masterStart}
          </button>
        </div>

        <Tikhon title={t.course.tikhonTitle}>{t.course.tikhonBody}</Tikhon>
      </div>
    </section>
  );
}

// ------------------------------------------------------ работа над ошибками

const REDO_MAX = 5;

function RedoRunner({ t, lang, profile, onProfile, onBack }: {
  t: Strings; lang: Lang; profile: Profile; onProfile: (p: Profile) => void; onBack: () => void;
}) {
  // Список фиксируется на входе: если брать его из профиля на каждом шаге,
  // исправленная ошибка исчезнет из-под ног и прогон «сам себя» перепрыгнет.
  const [queue] = useState(() => missedExercises(profile).slice(0, REDO_MAX));
  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [fixed, setFixed] = useState(0);

  const entry = queue[step];
  const ex = entry ? COURSE_BANK.find((x) => x.id === entry.id) : undefined;

  if (!entry || !ex) {
    return (
      <section className="screen course">
        <div className="wrap lesson done">
          <ScreenHeading as="h1">{t.course.redoDone}</ScreenHeading>
          <p className="lead">{t.course.lessonScore
            .replace("{n}", String(fixed)).replace("{total}", String(queue.length))}</p>
          <Karl state={fixed === queue.length && queue.length > 0 ? "cheer" : "idle"}
                line={t.course.redoKarl} name={t.mascot.karl} />
          <button className="btn primary" onClick={onBack}>← {t.course.allBlocks}</button>
        </div>
      </section>
    );
  }

  const onDone = (correct: boolean) => {
    setAnswered(true);
    if (correct) setFixed((n) => n + 1);
    const res = recordExercise(loadProfile(profile), entry.blockId, ex.id, ex.xp, correct);
    onProfile(res.profile);
  };

  return (
    <section className="screen course">
      <div className="wrap lesson">
        <button className="btn ghost back" onClick={onBack}>← {t.course.allBlocks}</button>
        <div className="lesson-step">
          ↻ {t.course.redoTitle} · {t.course.stepOf
            .replace("{n}", String(step + 1)).replace("{total}", String(queue.length))}
        </div>
        <Exercise key={ex.id} t={t} lang={lang} ex={ex} onDone={onDone} />
        {answered ? (
          <button className="btn primary" onClick={() => { setAnswered(false); setStep(step + 1); }}>
            {t.course.next} →
          </button>
        ) : null}
      </div>
    </section>
  );
}

// --------------------------------------------------------- экзамен мастера

function MasterExam({ t, lang, profile, onStart, onBack }: {
  t: Strings; lang: Lang; profile: Profile; onStart: (ex: Ex) => void; onBack: () => void;
}) {
  const p = getBlockProgress(profile, MASTER_ID);
  const done = COURSE_MASTER.filter((x) => p.solved.includes(x.id)).length;
  const next = COURSE_MASTER.find((x) => !p.solved.includes(x.id));

  return (
    <section className="screen course">
      <div className="wrap lesson">
        <button className="btn ghost back" onClick={onBack}>← {t.course.allBlocks}</button>
        <ScreenHeading as="h1">👑 {t.course.masterTitle}</ScreenHeading>
        {/* split/join, а не replace: «{n}» в строке встречается дважды, и с
            обычной заменой второй плейсхолдер оставался в тексте как есть.
            (replaceAll недоступен — цель сборки старше ES2021.) */}
        <p className="lead">{t.course.masterAbout
          .split("{n}").join(String(COURSE_MASTER.length))
          .split("{pass}").join(String(MASTER_PASS_MARK))}</p>

        <ol className="master-list">
          {COURSE_MASTER.map((x, i) => {
            const ok = p.solved.includes(x.id);
            return (
              <li key={x.id} className={ok ? "done" : ""}>
                <span className="ml-n">{ok ? "✓" : i + 1}</span>
                <div>
                  <b>{x.prompt[lang]}</b>
                  <span>🏁 {x.goal?.[lang]}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {p.passed ? (
          <Tikhon state="exam" title={t.course.masterPassed}>{t.course.masterPassedBody}</Tikhon>
        ) : null}

        {next ? (
          <button className="btn primary" onClick={() => onStart(next)}>
            {t.course.masterNext.replace("{n}", String(done + 1))
              .replace("{total}", String(COURSE_MASTER.length))}
          </button>
        ) : (
          <Karl state={p.passed ? "celebrate" : "concern"}
                line={p.passed ? t.course.masterKarlPass : t.course.masterKarlFail}
                name={t.mascot.karl} />
        )}
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
                  {/* «1 заданий» на экране блока читается как недоделка, а курс,
                      который учит формулировкам, обязан сам говорить грамотно. */}
                  <span className="ll-x">{n ? `${n} ${plural(n, t.course.taskForms)}` : t.course.theory}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="exam-card">
          <h2>🎓 {t.course.examTitle}</h2>
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
    onProfile(markLessonDone(loadProfile(profile), blockId, lesson));
    setStep(0);
  };

  const onDone = (correct: boolean) => {
    setAnswered(true);
    if (correct) setRight((n) => n + 1);
    const ex = items[step];
    // Профиль обновляем ВСЕГДА, а не только когда начислен XP: ошибка тоже
    // меняет профиль — она попадает в работу над ошибками.
    const res = recordExercise(loadProfile(profile), blockId, ex.id, ex.xp, correct);
    onProfile(res.profile);
    if (res.xpGain) setGained((x) => x + res.xpGain);
  };

  const next = () => { setAnswered(false); setStep((s) => s + 1); };

  if (step < 0) {
    return (
      <section className="screen course">
        <div className="wrap lesson">
          <button className="btn ghost back" onClick={onBack}>← {block.title[lang]}</button>
          <ScreenHeading key="theory" as="h1">{info.title[lang]}</ScreenHeading>
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
          <ScreenHeading key="done" as="h1">{t.course.lessonComplete}</ScreenHeading>
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
        {/* Переход «К заданиям» менял экран молча: заголовка тут не было вовсе,
            поэтому и пропуска уровня прибор не видел — пропускать было нечего, а
            диктор о смене контекста не узнавал. Заголовок ОДИН на весь набор, а
            не на каждое задание: «Дальше» — шаг внутри того же экрана, и увод
            фокуса на заголовок обрывал бы чтение только что показанного вопроса.
            Ключ обязателен: без него React переиспользовал бы h1 теории на этой
            же позиции, монтирования бы не случилось и фокус не поехал бы.
            Класс `sr-only` — потому что место заголовка на экране уже занято
            полосой прогресса и счётчиком «задание N из M». */}
        <ScreenHeading key="tasks" as="h1" className="sr-only">
          {t.course.tasksTitle.replace("{lesson}", info.title[lang])}
        </ScreenHeading>
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

function ExamRunner({ t, lang, profile, onProfile, blockId, resume, onStartDrill, onLesson,
                     onBack, onMap }: {
  t: Strings; lang: Lang; profile: Profile; onProfile: (p: Profile) => void; blockId: string;
  /** Экзамен, вернувшийся из капстоуна: показываем сразу итог. */
  resume?: ExamRunSnapshot;
  onStartDrill: (ex: Ex, ctx: ExamCtx) => void; onLesson: (n: number) => void;
  onBack: () => void; onMap: () => void;
}) {
  const block = blockById(blockId)!;
  // Номер попытки на возобновлении берётся ИЗ СНИМКА. Выборка детерминирована от
  // (блок, попытка), а попытка засчитывается здесь же, на экране итога: возьми
  // мы её из профиля после записи — разбор показал бы задания другой выборки.
  const attempt = resume ? resume.attempt : getBlockProgress(profile, blockId).attempts;
  const draw: ExamDraw = useMemo(() => drawExam(blockId, attempt), [blockId, attempt]);
  const resumed = resume ? examOutcome(resume) : null;
  const [step, setStep] = useState(resumed ? draw.items.length : 0);
  const [score, setScore] = useState(resumed ? resumed.score : 0);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<{ id: string; ok: boolean }[]>(resumed ? resumed.results : []);
  const [saved, setSaved] = useState<{ xp: number; badges: string[] } | null>(null);

  const ex = draw.items[step];
  const isLast = step >= draw.items.length - 1;

  const onDone = (ok: boolean) => {
    setAnswered(true);
    setResults((r) => [...r, { id: ex.id, ok }]);
    if (ok) setScore((s) => s + draw.weight(ex));
  };

  // ПОПЫТКА ЗАСЧИТЫВАЕТСЯ РОВНО ОДИН РАЗ И ИМЕННО ЗДЕСЬ. Раньше экзамен,
  // закончившийся капстоуном, записывал `App` из разбора партии — и вместе с
  // записью там же терялись счёт, разбор промахов и урок восстановления,
  // потому что экрана итога не существовало. Теперь запись живёт на том экране,
  // который итог показывает: одно место — один смысл.
  const recorded = useRef(false);
  const record = (points: number) => {
    if (recorded.current) return;
    recorded.current = true;
    // Экзамен со слоями и без обязан быть сравним, поэтому он и не знает о них
    // вовсе: здесь только банк и движок.
    const res = recordExam(loadProfile(profile), blockId, points, draw.total, draw.passMark);
    onProfile(res.profile);
    // Сдача блока звучит как повышение ранга — это и есть повышение.
    play(res.passed ? "levelup" : "wrong");
    setSaved({ xp: res.xpGain, badges: res.newAchievements });
  };

  useEffect(() => {
    if (!resumed) return;
    record(resumed.score);
    // Снимок отработал: второй заход в экзамен обязан начаться с первого
    // задания, а не с чужого итога.
    clearExamRun();
    // Один раз на монтирование: снимок пришёл пропом и внутри жизни экрана
    // не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    record(score);
    setStep(draw.items.length);
  };

  if (step >= draw.items.length) {
    // Сдача считается АРИФМЕТИКОЙ, а не тем, что вернула запись профиля: экран
    // итога рисуется и до того, как эффект записи отработал (первый кадр,
    // серверная отрисовка в тесте), и обязан показывать в нём то же самое.
    const passed = score >= draw.passMark;
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
                line={passed ? (blockId === COURSE_BLOCKS[COURSE_BLOCKS.length - 1].id
                  ? t.course.examPass : t.course.karlExamPass) : t.course.karlExamFail} name={t.mascot.karl} />
          {/* Разбор откладывается до конца — во время экзамена подсказок нет. */}
          {/* Урок восстановления: провал обязан заканчиваться маршрутом, а не
              констатацией. Уроки берутся из промахов, а не из общего списка. */}
          {!passed && recovery.length ? (
            <div className="recovery">
              <h2>{t.course.recoveryTitle}</h2>
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
          {/* СДАЧА И ПРОВАЛ ВЕДУТ В РАЗНЫЕ МЕСТА. Сданный блок закончен — дверь
              ведёт на карту, где уже открылся следующий. Провал заканчивается
              маршрутом, а не констатацией: дверь ведёт обратно в блок, где рядом
              лежат и уроки, и кнопка пересдачи. */}
          {passed ? (
            <button className="btn primary exam-exit" onClick={onMap}>← {t.course.allBlocks}</button>
          ) : (
            <button className="btn primary exam-exit" onClick={onBack}>← {block.title[lang]}</button>
          )}
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
          onStartDrill={(e) => {
            // СНИМОК КЛАДЁТСЯ ДО УХОДА В ПАРТИЮ. Дальше этот экран
            // размонтируется целиком, и всё, что человек уже ответил, живёт
            // только здесь (см. lib/examRun.ts).
            saveExamRun(examRunFor(blockId, draw, attempt, score, results, e.id));
            onStartDrill(e, { attempt, score, total: draw.total, passMark: draw.passMark });
          }}
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
