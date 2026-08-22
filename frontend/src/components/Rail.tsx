// Rail.tsx — the right-hand widget rail of the "game" skin's app shell.
//
// It exists because the shell is three-part, not two: sidebar · content · rail.
// Without it the content column is the whole width and the layout stops reading
// as an app — which is exactly the gap between what was designed on the canvas
// and what the code shipped first.
//
// Only rendered under `data-skin="game"`; the dojo skin keeps its single column.
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import type { Profile } from "../lib/progress";
import { dailyGoalView, rankForXp, DAILY_GOAL_MAX } from "../lib/progress";

export function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rc">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Daily goal + rank: the two widgets every screen of the shell carries. */
export function ProgressCards({ t, lang, profile }: { t: Strings; lang: Lang; profile: Profile }) {
  const goal = dailyGoalView(profile);
  const r = rankForXp(profile.xp);
  return (
    <>
      <RailCard title={t.goal.title}>
        <div className="rc-goal">
          <b>{goal.done}/{goal.target}</b>
          <span className="rc-steps" aria-hidden="true">
            {Array.from({ length: DAILY_GOAL_MAX }, (_, i) => (
              <i key={i} className={i < goal.done ? "on" : ""}>{i + 1}</i>
            ))}
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
