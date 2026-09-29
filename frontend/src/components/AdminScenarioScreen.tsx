import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Lang } from "../types";
import {
  ADMIN_DRAFT_KEY, ADMIN_LABELS, DOMAINS, TONES, GOALS, adminPreset,
  adminPreviewIsCurrent, loadAdminDraft, requestAdminPreview, saveAdminDraft, validAdminDraft,
  translateAdminPreset,
  type AdminDraft, type AdminDomain, type AdminGoal, type AdminPreview, type AdminTone,
} from "../lib/adminContext";
import "./AdminScenarioScreen.css";
import { ScreenHeading } from "./ScreenHeading";
import { DataIcon, Icon } from "./Icon";
import { DifficultySelect } from "./DifficultySelect";

const COPY = {
  ru: {
    eyebrow: "Для преподавателя и руководителя", title: "Подготовьте переговоры", intro: "Задайте ситуацию и собеседника. Посмотрите условия, затем передайте участнику готовую тренировку.",
    vsCustom: "Чем это отличается от «Своей сделки»: там вы описываете СВОЮ ситуацию своими словами и садитесь за стол сами. Здесь вы собираете переговоры для другого человека из готовых настроек — сфера, роль и тон собеседника, сложность, его цели, — видите заранее, что он получит, и запускаете.",
    back: "← К практике", presets: "Начать с примера", configure: "1. Настройка ситуации", domain: "Сфера", topic: "Тема встречи", role: "Роль собеседника", tone: "Тон собеседника", difficulty: "Сложность", easy: "Больше уступок", hard: "Выше требования", goals: "Заявленные цели собеседника", goalsHelp: "Выберите от одной до трёх. Они меняют его позицию и ценность ваших уступок.",
    preview: "Посмотреть условия", waiting: "Готовим тренировку…", save: "Сохранить черновик", reset: "Сбросить", saved: "Черновик сохранён в этом браузере.", saveError: "Браузер не сохранил черновик. Вы можете продолжить без сохранения.", resetDone: "Восстановлен пример закупок.",
    previewTitle: "2. Предпросмотр участника", empty: "Здесь появятся условия переговоров", emptyBody: "Начните с готового примера или заполните настройки слева. Предпросмотр покажет роль участника и то, как будет вести себя собеседник.", basis: "На основе кейса", counterpart: "Ваш собеседник", player: "Роль участника", conditions: "Условия встречи", impact: "Как работают настройки", launch: "Начать тренировку", launchHint: "Участник проходит переговоры и получает разбор своих решений.", ready: "Условия готовы. Можно начинать тренировку.",
    errors: { rate: "Слишком много предпросмотров. Подождите секунду и попробуйте снова.", auth: "Нужен вход на стенд. Обновите страницу и введите пароль доступа.", invalid: "Проверьте тему, роль и выбранные цели.", server: "Не удалось подготовить тренировку. Проверьте подключение к серверу и повторите попытку." },
  },
  en: {
    eyebrow: "For educators and team leads", title: "Set up a negotiation", intro: "Choose a situation and a counterpart. Review the terms, then let your learner begin the practice.",
    vsCustom: "How this differs from “Your deal”: there you describe YOUR own situation in your own words and take the seat yourself. Here you build a negotiation for someone else from ready-made settings — the counterpart's field, role and tone, the difficulty and their goals — see in advance what the learner will get, and launch it.",
    back: "← Back to practice", presets: "Start from an example", configure: "1. Configure the situation", domain: "Context", topic: "Meeting topic", role: "Counterpart role", tone: "Counterpart tone", difficulty: "Difficulty", easy: "More concessions", hard: "Higher expectations", goals: "Counterpart’s stated objectives", goalsHelp: "Choose one to three. These change their position and the value of your concessions.",
    preview: "Preview the terms", waiting: "Preparing practice…", save: "Save draft", reset: "Reset", saved: "Draft saved in this browser.", saveError: "The browser could not save your draft. You can continue without saving.", resetDone: "Procurement example restored.",
    previewTitle: "2. Learner preview", empty: "Your negotiation will appear here", emptyBody: "Start with an example or complete the settings. Preview the learner’s role and how the counterpart will respond.", basis: "Based on", counterpart: "Your counterpart", player: "Learner’s role", conditions: "Meeting terms", impact: "How the settings work", launch: "Start practice", launchHint: "The learner negotiates and gets feedback on their decisions.", ready: "The terms are ready. You can start the practice.",
    errors: { rate: "Too many previews. Wait a second and try again.", auth: "Sign in to the demo. Reload the page and enter the access password.", invalid: "Check the topic, role and selected objectives.", server: "Could not prepare this practice. Check the server connection and try again." },
  },
};
function browserStorage(): Storage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
export interface AdminScenarioScreenProps {
  lang: Lang;
  onExit: () => void;
  onLaunch: (scenarioId: string) => void;
}
export function AdminScenarioScreen({ lang, onExit, onLaunch }: AdminScenarioScreenProps) {
  const t = COPY[lang], labels = ADMIN_LABELS[lang];
  const [draft, setDraft] = useState(() => loadAdminDraft(lang, browserStorage()));
  const [preview, setPreview] = useState<AdminPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const previousLang = useRef(lang);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    request.current?.abort(); request.current = null;
    const from = previousLang.current;
    previousLang.current = lang;
    if (from !== lang) setDraft(current => translateAdminPreset(current, from, lang));
    setBusy(false); setPreview(null); setStatus(""); setError("");
  }, [lang]);
  const change = (patch: Partial<AdminDraft>) => {
    setDraft(old => ({ ...old, ...patch })); setPreview(null); setError(""); setStatus("");
  };
  const choosePreset = (domain: AdminDomain) => { setDraft(adminPreset(domain, lang)); setPreview(null); setError(""); setStatus(""); };
  const toggleGoal = (goal: AdminGoal) => change({ opponentGoals: draft.opponentGoals.includes(goal)
    ? draft.opponentGoals.filter(g => g !== goal) : [...draft.opponentGoals, goal] });
  const prepare = async (launch = false) => {
    if (!validAdminDraft(draft)) { setError(t.errors.invalid); return; }
    request.current?.abort();
    const ctrl = new AbortController(); request.current = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    setBusy(true); setError(""); setStatus("");
    try {
      // Refresh before launch: an old preview may have expired after a break.
      const result = await requestAdminPreview(draft, lang, ctrl.signal);
      if (request.current !== ctrl || ctrl.signal.aborted) return;
      setPreview(result); setStatus(t.ready);
      if (launch) onLaunch(result.scenario.id);
      else requestAnimationFrame(() => previewHeading.current?.focus());
    } catch (e) {
      if (request.current !== ctrl) return;
      const code = e instanceof Error ? e.message : "server";
      setError(t.errors[code as keyof typeof t.errors] ?? t.errors.server);
    } finally {
      clearTimeout(timeout);
      if (request.current === ctrl) setBusy(false);
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void prepare(); };
  const reset = () => {
    choosePreset("procurement");
    try { browserStorage()?.removeItem(ADMIN_DRAFT_KEY); } catch { /* Keep reset usable with blocked storage. */ }
    setStatus(t.resetDone);
  };
  const ready = adminPreviewIsCurrent(preview, draft, lang);
  return <section className="admin-context" aria-labelledby="admin-title">
    <button type="button" className="admin-back" onClick={onExit}>{t.back}</button>
    <header className="admin-heading">
      <p className="admin-eyebrow">{t.eyebrow}</p><ScreenHeading as="h1"><span id="admin-title">{t.title}</span></ScreenHeading><p>{t.intro}</p>
      {/* Два режима собирают переговоры, и без этой строки их путали: даже
          прочитав описание, было непонятно, чем редактор отличается от «Своей
          сделки». Разница — КТО садится за стол и ИЗ ЧЕГО собран стол. */}
      <p className="admin-vs">{t.vsCustom}</p>
    </header>
    <div className="admin-presets" role="group" aria-label={t.presets}>
      <span>{t.presets}</span>
      {DOMAINS.map(domain => <button type="button" key={domain} disabled={busy} onClick={() => choosePreset(domain)}>{labels.domains[domain]}</button>)}
    </div>
    <div className="admin-grid">
      <form onSubmit={submit} className="admin-card">
        <h2>{t.configure}</h2>
        <fieldset disabled={busy} className="admin-fields">
          <legend className="admin-sr">{t.configure}</legend>
          <label htmlFor="admin-domain">{t.domain}<select id="admin-domain" value={draft.domain} onChange={e => change({ domain: e.target.value as AdminDomain })}>{DOMAINS.map(d => <option value={d} key={d}>{labels.domains[d]}</option>)}</select></label>
          <label htmlFor="admin-topic">{t.topic}<input id="admin-topic" required minLength={3} maxLength={120} value={draft.topic} onChange={e => change({ topic: e.target.value })}/></label>
          <label htmlFor="admin-role">{t.role}<input id="admin-role" required minLength={2} maxLength={80} value={draft.opponentRole} onChange={e => change({ opponentRole: e.target.value })}/></label>
          <label htmlFor="admin-tone">{t.tone}<select id="admin-tone" value={draft.tone} onChange={e => change({ tone: e.target.value as AdminTone })}>{TONES.map(tone => <option value={tone} key={tone}>{labels.tones[tone]}</option>)}</select></label>
          <label htmlFor="admin-difficulty">{t.difficulty}<DifficultySelect id="admin-difficulty" lang={lang} value={draft.difficulty} onChange={difficulty => change({ difficulty })} /></label>
          <fieldset className="admin-goals"><legend>{t.goals}</legend><p id="admin-goals-help">{t.goalsHelp}</p>
            {GOALS.map(goal => <label className="admin-check" key={goal}><input type="checkbox" checked={draft.opponentGoals.includes(goal)} aria-describedby="admin-goals-help" onChange={() => toggleGoal(goal)}/><span>{labels.goals[goal]}</span></label>)}
          </fieldset>
          <div className="admin-actions"><button type="submit" className="primary" disabled={!validAdminDraft(draft)}>{busy ? t.waiting : t.preview}</button>
            <button type="button" disabled={!validAdminDraft(draft)} onClick={() => setStatus(saveAdminDraft(draft, browserStorage()) ? t.saved : t.saveError)}>{t.save}</button><button type="button" onClick={reset}>{t.reset}</button></div>
        </fieldset>
      </form>
      <section className="admin-card admin-preview" aria-labelledby="admin-preview-title" aria-busy={busy}>
        <h2 id="admin-preview-title" tabIndex={-1} ref={previewHeading}>{t.previewTitle}</h2>
        {ready && preview ? <>
          <p className="admin-source">{t.basis}: {preview.sourceTitle}</p><h3><DataIcon name={preview.scenario.icon} /> {preview.scenario.title}</h3>
          <dl><dt>{t.counterpart}</dt><dd>{preview.scenario.counterpart_name}</dd><dt>{t.player}</dt><dd>{preview.scenario.role}</dd><dt>{t.conditions}</dt><dd>{preview.scenario.briefing}</dd></dl>
          <div className="admin-effects"><h3>{t.impact}</h3><ul>{preview.effects.map(effect => <li key={effect}>{effect}</li>)}</ul></div>
          <button type="button" className="primary admin-launch" disabled={busy} onClick={() => void prepare(true)}>{busy ? t.waiting : t.launch}</button><p className="admin-hint">{t.launchHint}</p>
        </> : <div className="admin-empty"><span aria-hidden="true"><Icon name="clipboard" /></span><h3>{t.empty}</h3><p>{t.emptyBody}</p></div>}
      </section>
    </div>
    {error && <p role="alert" className="admin-error">{error}</p>}
    <p role="status" aria-live="polite" className="admin-status">{busy ? t.waiting : status}</p>
  </section>;
}
