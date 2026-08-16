// Gamification.tsx — the Duolingo-style layer over the honest learning core.
// Everything here renders numbers the deterministic engine already produced
// (see lib/progress.ts): a rank + XP bar and a daily-goal ring for the home
// hero, a skill-mastery screen, a debrief XP count-up, and achievement toasts.
// Understated-premium, theme-aware, reduced-motion-safe, good on a 390px phone.
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import {
  ACHIEVEMENTS, dayKey, getAchievement, rankForXp, skillViews, strongestWeakest,
  type GameResult, type Profile, type SkillId,
} from "../lib/progress";

// Per-skill bar color. Labels carry the meaning; color just aids scanning.
const SKILL_COLOR: Record<SkillId, string> = {
  questions: "var(--info)",
  interests: "var(--trust)",
  criteria: "var(--brass)",
  listening: "var(--leverage)",
  tradeoff: "#d98a3c",
  tension: "var(--trust)",
};

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const sub = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// ---- Home hero stats: rank + XP progress, daily-goal ring, streak ----------
export function HeroStats({
  t, lang, profile, onOpenProfile,
}: {
  t: Strings; lang: Lang; profile: Profile; onOpenProfile: () => void;
}) {
  const r = rankForXp(profile.xp);
  const rankName = r.rank.name[lang];
  const goalDone = profile.lastStreakDay === dayKey();
  const nextLine = r.next
    ? sub(t.gam.toNext, { n: r.toNext, name: r.next.name[lang] })
    : t.gam.maxRank;

  return (
    <div className="herostats">
      <button className="hs-rank" onClick={onOpenProfile} aria-label={t.gam.skillsTitle}>
        <div className="hs-rank-top">
          <span className="hs-rank-kicker">{t.gam.rankLabel}</span>
          <span className="hs-xp">{sub(t.gam.totalXp, { n: profile.xp })}</span>
        </div>
        <div className="hs-rank-name">{rankName}</div>
        <div className="hs-bar" role="progressbar" aria-valuenow={Math.round(r.progress * 100)}>
          <div className="hs-bar-fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
        </div>
        <div className="hs-next">{nextLine}</div>
      </button>

      <div className="hs-aside">
        <div className={`hs-goal${goalDone ? " done" : ""}`} title={goalDone ? t.gam.dailyDone : t.gam.dailyTodo}>
          <DailyRing done={goalDone} />
          <span className="hs-goal-l">{goalDone ? t.gam.dailyDone : t.gam.dailyGoal}</span>
        </div>
        {profile.streak > 0 ? (
          <div className="hs-streak" title={t.streakLabel.replace("{n}", String(profile.streak))}>
            <span className="hs-flame" aria-hidden="true">🔥</span>
            <b>{profile.streak}</b>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// A small ring that fills (with a flame) once today's goal is met.
function DailyRing({ done }: { done: boolean }) {
  const R = 15, C = 2 * Math.PI * R;
  return (
    <span className="hs-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36" width="36" height="36">
        <circle cx="18" cy="18" r={R} className="hs-ring-track" fill="none" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={R} className="hs-ring-fill" fill="none" strokeWidth="3"
          strokeDasharray={C} strokeDashoffset={done ? 0 : C} strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="hs-ring-emoji">{done ? "🔥" : "◌"}</span>
    </span>
  );
}

// ---- Skill-mastery screen (director's #4) ----------------------------------
export function SkillsProfile({
  t, lang, profile, onHome,
}: {
  t: Strings; lang: Lang; profile: Profile; onHome: () => void;
}) {
  const r = rankForXp(profile.xp);
  const views = skillViews(profile);
  const { strong, weak } = strongestWeakest(profile);
  const hasGames = views.some((s) => s.n > 0);
  const grown = useGrown();

  return (
    <section className="screen">
      <div className="wrap">
        <div className="skills">
          <button className="skills-back" onClick={onHome}>{t.gam.back}</button>
          <div className="skills-head">
            <h2>{t.gam.skillsTitle}</h2>
            <div className="skills-rank">
              <b>{r.rank.name[lang]}</b> · {sub(t.gam.totalXp, { n: profile.xp })}
            </div>
          </div>
          <p className="skills-sub">{t.gam.skillsSub}</p>

          {hasGames ? (
            <p className="skills-read">
              {strong ? (<><span className="sr-up">{t.gam.strongIn}:</span> <b>{t.gam.skillNames[strong]}</b></>) : null}
              {weak ? (<> · <span className="sr-dn">{t.gam.workOn}:</span> <b>{t.gam.skillNames[weak]}</b></>) : null}
            </p>
          ) : (
            <p className="skills-empty">{t.gam.noGames}</p>
          )}

          <div className="skillbars">
            {views.map((s) => (
              <div className="skb" key={s.id}>
                <div className="skb-h">
                  <span className="skb-n">{t.gam.skillNames[s.id]}</span>
                  <b>{s.n > 0 ? s.mastery : "—"}</b>
                </div>
                <div className="skb-t">
                  <div
                    className="skb-f"
                    style={{ width: grown && s.n > 0 ? `${s.mastery}%` : "0%", background: SKILL_COLOR[s.id] }}
                  />
                </div>
                <div className="skb-hint">
                  {t.gam.skillHints[s.id]}
                  {s.n > 0 ? <span className="skb-games"> · {sub(t.gam.gamesCount, { n: s.n })}</span> : null}
                </div>
              </div>
            ))}
          </div>

          <h3 className="badges-title">{t.gam.achievementsTitle}</h3>
          <div className="badges">
            {ACHIEVEMENTS.map((a) => {
              const on = profile.achievements.includes(a.id);
              return (
                <div className={`badge${on ? " on" : ""}`} key={a.id} title={on ? a.desc[lang] : t.gam.locked}>
                  <span className="badge-ic">{a.icon}</span>
                  <span className="badge-nm">{a.name[lang]}</span>
                  <span className="badge-ds">{on ? a.desc[lang] : t.gam.locked}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Debrief XP award: count-up + level-up flourish ------------------------
export function XpAward({ t, lang, game }: { t: Strings; lang: Lang; game: GameResult }) {
  const n = useCountUp(game.xpGain);
  return (
    <div className="xpaward">
      <div className="xpa-main">
        <span className="xpa-plus">+{n}</span>
        <span className="xpa-unit">XP</span>
      </div>
      <div className="xpa-cap">{t.gam.xpAwardLabel}</div>
      {game.leveledUp ? (
        <div className="xpa-level">
          <span className="xpa-spark" aria-hidden="true">✦</span> {t.gam.levelUp}
          <b> {game.rankAfter.rank.name[lang]}</b>
        </div>
      ) : null}
    </div>
  );
}

// ---- Achievement toasts (fixed, auto-dismiss) ------------------------------
export function AchievementToasts({ t, lang, ids }: { t: Strings; lang: Lang; ids: string[] }) {
  const [visible, setVisible] = useState<string[]>([]);
  useEffect(() => {
    if (ids.length === 0) return;
    setVisible(ids);
    const timer = setTimeout(() => setVisible([]), 4600);
    return () => clearTimeout(timer);
  }, [ids]);
  if (visible.length === 0) return null;
  return (
    <div className="ach-toasts">
      {visible.map((id, i) => {
        const a = getAchievement(id);
        if (!a) return null;
        return (
          <div className="ach-toast" key={id} style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="ach-ic">{a.icon}</span>
            <span className="ach-txt">
              <b>{t.gam.unlockedToast}</b>
              <span>{a.name[lang]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// A one-shot "grow from 0" trigger after mount (bars animate in).
function useGrown() {
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setGrown(true));
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return grown;
}

// Count from 0 to target over ~0.9s; reduced-motion jumps straight to target.
function useCountUp(target: number) {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
