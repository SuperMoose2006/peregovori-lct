// Warmup.tsx — разминка перед актом кампании: два задания из блока курса,
// который тренирует приём этого акта.
//
// ЗАЧЕМ ОНА. Кампания — это четыре партии подряд, и между ними нет ничего, кроме
// репутации. Разминка вставляет в путь ту самую «подвкладку с техникой»: два
// коротких задания ровно на тот приём, который сейчас понадобится за столом, —
// и сразу за ними стол.
//
// Задания берутся из общего банка (не дублируются), проверяются тем же движком и
// засчитываются в тот же профиль: пройденное здесь считается пройденным в курсе.
// Пропустить можно всегда — разминка не пропуск в акт, а разгон.
import { useMemo, useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import { blockById, exercisesOf } from "../lib/course";
import { loadProfile, recordExercise, type Profile } from "../lib/progress";
import { Exercise } from "./Exercise";
import { Karl } from "./Mascot";
import { ScreenHeading } from "./ScreenHeading";
import { Icon, DataIcon } from "./Icon";

const COUNT = 2;

interface Props {
  t: Strings;
  lang: Lang;
  profile: Profile;
  onProfile: (p: Profile) => void;
  blockId: string;
  /** Дальше — за стол. Тот же путь, что и у кнопки «начать акт». */
  onDone: () => void;
  onSkip: () => void;
}

export function Warmup({ t, lang, profile, onProfile, blockId, onDone, onSkip }: Props) {
  const block = blockById(blockId);
  // Капстоун сюда не берём: разминка перед партией не может БЫТЬ партией.
  const items = useMemo(
    () => exercisesOf(blockId).filter((x) => x.type !== "drill").slice(0, COUNT),
    [blockId],
  );
  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [right, setRight] = useState(0);

  if (!block || items.length === 0) {
    onDone();
    return null;
  }

  const onExerciseDone = (correct: boolean) => {
    setAnswered(true);
    if (correct) setRight((n) => n + 1);
    const ex = items[step];
    // Как и в уроке: ошибка тоже меняет профиль (попадает в работу над ошибками).
    const res = recordExercise(loadProfile(profile), blockId, ex.id, ex.xp, correct);
    onProfile(res.profile);
  };

  if (step >= items.length) {
    return (
      <section className="screen course">
        <div className="wrap lesson done">
          <ScreenHeading as="h1">{t.course.warmupReady}</ScreenHeading>
          <p className="lead">{t.course.lessonScore
            .replace("{n}", String(right)).replace("{total}", String(items.length))}</p>
          <Karl state={right === items.length ? "cheer" : "idle"}
                line={t.course.warmupKarl} name={t.mascot.karl} />
          <button className="btn primary" onClick={onDone}>{t.course.warmupToTable} →</button>
        </div>
      </section>
    );
  }

  const ex = items[step];
  return (
    <section className="screen course">
      <div className="wrap lesson">
        <div className="warm-head">
          <span className="warm-tag"><Icon name="bolt" /> {t.course.warmupTitle}</span>
          <span><DataIcon name={block.icon} /> {block.title[lang]}</span>
          <button className="btn ghost warm-skip" onClick={onSkip}>{t.course.warmupSkip}</button>
        </div>
        <div className="lesson-bar"><i style={{ width: `${(step / items.length) * 100}%` }} /></div>
        <div className="lesson-step">{t.course.stepOf
          .replace("{n}", String(step + 1)).replace("{total}", String(items.length))}</div>
        <Exercise key={ex.id} t={t} lang={lang} ex={ex} onDone={onExerciseDone} />
        {answered ? (
          <button className="btn primary" onClick={() => { setAnswered(false); setStep(step + 1); }}>
            {t.course.next} →
          </button>
        ) : null}
      </div>
    </section>
  );
}
