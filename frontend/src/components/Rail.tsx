// Rail.tsx — правый рейл виджетов в оболочке приложения.
//
// It exists because the shell is three-part, not two: sidebar · content · rail.
// Without it the content column is the whole width and the layout stops reading
// as an app — which is exactly the gap between what was designed on the canvas
// and what the code shipped first.
import type { Strings } from "../i18n";
import { dailyTable } from "../lib/daily";
import { SCENARIO_MAP } from "../data/scenarios";
import type { Lang } from "../types";
import type { Profile } from "../lib/progress";
import { dailyGoalView, rankForXp, DAILY_GOAL_MAX } from "../lib/progress";

export function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rc">
      {/* h2, а не h3: на странице есть h1, и прыжок через уровень ломает
          навигацию по разделам у экранного диктора. */}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Daily goal + rank: the two widgets every screen of the shell carries.
 *
 * ВЫБОР ЦЕЛИ ЖИВЁТ ЗДЕСЬ. Раньше цифры 1/2/3 были кликабельны только в
 * маркетинговой шапке скина «додзё». Скин удалён — и вместе с ним исчезла бы
 * сама возможность поменять цель дня, хотя к оформлению она отношения не имеет.
 * Поэтому пипсы переехали в рейл и стали кнопками: показ и выбор в одном месте.
 */
export function ProgressCards({ t, lang, profile, onSetGoal }:
  { t: Strings; lang: Lang; profile: Profile; onSetGoal?: (target: number) => void }) {
  const goal = dailyGoalView(profile);
  const r = rankForXp(profile.xp);
  return (
    <>
      <RailCard title={t.goal.title}>
        <div className="rc-goal">
          <b>{goal.done}/{goal.target}</b>
          <span className="rc-steps" role={onSetGoal ? "group" : undefined}
                aria-label={onSetGoal ? t.gam.dailyTargetLabel : undefined}
                aria-hidden={onSetGoal ? undefined : true}>
            {Array.from({ length: DAILY_GOAL_MAX }, (_, i) => {
              const n = i + 1;
              const cls = `${i < goal.done ? "on" : ""}${goal.target === n ? " tgt" : ""}`.trim();
              return onSetGoal ? (
                <button key={n} className={cls} aria-pressed={goal.target === n}
                        title={t.gam.dailyTargetSet.replace("{n}", String(n))}
                        onClick={() => onSetGoal(n)}>{n}</button>
              ) : (
                <i key={n} className={cls}>{n}</i>
              );
            })}
          </span>
        </div>
        <div className="rc-bar"><i style={{ width: `${Math.round(goal.progress * 100)}%` }} /></div>
      </RailCard>

      <RailCard title={t.rank.title}>
        <div className="rc-rank">
          <b>{r.rank.name[lang]}</b>
          <span>{profile.xp} XP</span>
        </div>
        <div className="rc-bar"><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
        {r.next ? (
          <p className="rc-next">
            {t.rank.toNext.replace("{n}", String(r.toNext)).replace("{rank}", r.next.name[lang])}
          </p>
        ) : null}
      </RailCard>
    </>
  );
}

/**
 * «Стол дня» — один и тот же у всех, каждый день другой.
 *
 * Причина вернуться завтра из тех, что не требуют нового содержания: восемь
 * столов открыты сразу, курс проходится за вечер, и без этой карточки
 * возвращаться не за чем. Условие дня названо словами прямо здесь — «короткий
 * стол», «холодный старт», — потому что человек должен знать, во что садится,
 * до того как сел.
 *
 * Стол считается ОФЛАЙН, тем же расписанием, что на сервере
 * (`lib/daily.ts` ↔ `app/engine/daily.py`): карточка обязана работать без сети,
 * как и всё остальное.
 */
export function DailyCard({ t, lang, onPlay }:
  { t: Strings; lang: Lang; onPlay: (scenarioId: string) => void }) {
  const table = dailyTable();
  const sc = SCENARIO_MAP[table.scenarioId];
  if (!sc) return null;
  return (
    <RailCard title={t.daily.title}>
      <button className="rc-daily" onClick={() => onPlay(table.scenarioId)}>
        <span className="rc-daily-ic" aria-hidden="true">{sc.icon}</span>
        <span className="rc-daily-txt">
          <b>{sc.title[lang]}</b>
          <span className="rc-daily-mod">{table.modifier.label[lang]}</span>
        </span>
      </button>
      <p className="rc-next">{table.modifier.note[lang]}</p>
    </RailCard>
  );
}

/** The four principles, condensed. Home only — it is the method in one glance,
 *  and it replaces the long "почему это учит" section the game skin drops. */
export function MethodCard({ t }: { t: Strings }) {
  return (
    <RailCard title={t.method.title}>
      <ul className="rc-method">
        {t.principles.map((p, i) => (
          <li key={i}><span dangerouslySetInnerHTML={{ __html: p }} /></li>
        ))}
      </ul>
    </RailCard>
  );
}
