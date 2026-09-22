// Debrief.tsx — post-negotiation report: grade ring (A–F), three score bars
// (economic / relationship / technique), stat cells, coaching tips, retry/home.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Debrief as DebriefData, Lang, Mode, SecondaryIssueView, VisionNote, WhatIfBranch, WhatIfRequest, WhatIfResponse } from "../types";
import type { Strings } from "../i18n";
import { skillSignals, type GameResult, type RecordResult } from "../lib/progress";
import { blockById, blockForWeakest } from "../lib/course";
import { pickPivotalTurn, pivotalTurnIndex } from "../lib/whatif";
import { LOOKED_IN_SILENCE } from "../lib/layers";
import { formatDeal, plural } from "../lib/format";
import { play } from "../lib/sound";
import { ScreenHeading } from "./ScreenHeading";
import { XpAward } from "./Gamification";
import { Karl, MascotImg, Tikhon, type KarlState, type TikhonState } from "./Mascot";
import { RematchOffer } from "./Rematch";
import { ServerCertificate } from "./ServerCertificate";
import type { PastRun } from "../lib/progress";

/** Сколько строк ленты помещается в карточку. Партия на двенадцать ходов
 *  успевает набрать вчетверо больше (взгляд не чаще раза в 8 секунд), а разбор
 *  читают целиком — поэтому показываем хвост и ЧЕСТНО говорим, сколько осталось
 *  за кадром, вместо того чтобы молча обрезать. */
export const VISION_TAPE_ROWS = 12;

/** Форматирование времени наблюдения: «м:сс» от начала партии. */
export function visionClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Лента наблюдений для карточки: хвост плюс число спрятанных строк.
 *
 * Отсекает всё, что не является записью с ходом: разбор может прийти и от
 * старого сервера, где `observations` были плоскими строками. Строка без хода —
 * ровно то, от чего эта карточка уходит, и рисовать её пустой строкой значит
 * подсунуть человеку «наблюдение» без наблюдения. По той же причине отсюда
 * не выходит строка, которой нечего сказать: ни текста, ни выражения на лице.
 */
export function visionTape(notes: unknown, rows: number = VISION_TAPE_ROWS):
  { tape: VisionNote[]; hidden: number } {
  const all: VisionNote[] = [];
  for (const raw of Array.isArray(notes) ? notes : []) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Partial<VisionNote>;
    if (typeof n.turn !== "number") continue;
    const text = typeof n.text === "string" ? n.text : "";
    const expressive = n.expressive === true ? true : n.expressive === false ? false : null;
    if (!text && expressive !== true) continue;
    all.push({ turn: n.turn, at_ms: typeof n.at_ms === "number" ? n.at_ms : 0,
               text, expressive });
  }
  return { tape: all.slice(-rows), hidden: Math.max(0, all.length - rows) };
}

const GRADE_COLOR: Record<string, string> = {
  A: "var(--trust)",
  B: "var(--info)",
  C: "var(--brass)",
  D: "#d98a3c",
  F: "var(--tension)",
};

interface Props {
  t: Strings;
  d: DebriefData;
  mode: Mode;
  lang: Lang;
  scenarioTitle?: string;
  // Exam only: the name the player entered, printed on a passing certificate.
  // Empty ⇒ the certificate falls back to a neutral placeholder.
  playerName?: string;
  // This run's personal-best outcome (from the retention profile) — null if not
  // yet recorded. Drives the "Личный рекорд" line + the "new record!" flourish.
  record?: RecordResult | null;
  // The gamification outcome of this run (XP gained, rank, level-up). Drives the
  // "+XP" count-up award. Same object as `record` (GameResult extends RecordResult).
  game?: GameResult | null;
  /** How many "read her face" questions were asked and answered correctly.
   *  Absent when the layer was off — the card then does not render at all. */
  probeStats?: { asked: number; right: number };
  /** Живые наблюдения слоя камеры, накопленные за партию. ЛЕНТУ РИСУЕТ НЕ ОН:
   *  содержимое карточки берётся из `d.observations` — того же, что видел
   *  сервер, с ходами и временем. Клиентский список короче настоящего ровно на
   *  то, что пришло, пока сокет был оборван, а лента, теряющая куски при
   *  переподключении, честной не бывает.
   *
   *  Здесь он остался тем, чем всегда и был по смыслу: отметкой «слой в этой
   *  партии был включён». `undefined` — камеры не просили, карточки нет. */
  observations?: string[];
  /** «Покерфейс»: сколько раз лицо несло явное выражение, и по скольким кадрам
   *  слой вообще успел высказаться. Второе число обязательно: без него «ноль
   *  срывов» неотличимо от «слой ни разу не посмотрел», а это разные новости —
   *  первая про выдержку, вторая про то, что камера не доехала. */
  tells?: { count: number; frames: number };
  onRetry: () => void;
  onHome: () => void;
  // Campaign mode: the primary action advances the arc instead of replaying.
  onNext?: () => void;
  nextLabel?: string;
  // "А что если…" replay: the callback that runs the deterministic branch (backend
  // or offline synth) plus the context it needs — the player's OWN lines in order,
  // the scenario id, and the display context (unit + which direction is better).
  // Omit any of these (or leave moves empty) to hide the card entirely.
  runWhatIf?: (req: WhatIfRequest) => Promise<WhatIfResponse | null>;
  whatIfMoves?: string[];
  whatIfScenarioId?: string;
  whatIfUnit?: string;
  whatIfLowerBetter?: boolean;
  // Visible logrolling recap: the scenario's tradeable secondary issues and the
  // ids actually traded (the final terms_conceded). Both engine-owned — the line
  // reinforces that trading created value, or gently flags the missed chance.
  // Absent/empty secondaryIssues ⇒ the line doesn't render (non-logrolling games).
  secondaryIssues?: SecondaryIssueView[];
  termsConceded?: string[];
  /** Открыть блок курса, который тренирует просевший навык. Экзамен — без него:
   *  там сопровождение выключено до конца, включая рекомендации. */
  onCourse?: (blockId: string) => void;
  /** «Переиграй партию против себя вчерашнего»: партия, которая теперь лежит на
   *  этом столе и пойдёт рядом в следующий раз, плюс отметка «это она и есть»
   *  (первая партия за столом сама становится соперником). Отсутствует там, где
   *  сравнения не бывает: экзамен, акт кампании, своя сделка. */
  rematch?: { past: PastRun; isThisRun: boolean } | null;
}

export function Debrief({
  t, d, mode, lang, scenarioTitle, playerName, record, game, probeStats, observations, tells, onRetry, onHome, onNext, nextLabel,
  runWhatIf, whatIfMoves, whatIfScenarioId, whatIfUnit, whatIfLowerBetter,
  secondaryIssues, termsConceded, onCourse, rematch,
}: Props) {
  const gc = GRADE_COLOR[d.grade] || "var(--brass)";
  // Лента камеры приезжает в самом разборе — с ходами и временем, посчитанными
  // там же, где живёт партия.
  const visTape = useMemo(() => visionTape(d.observations), [d.observations]);
  // Самый слабый сигнал разбора → блок курса, который его тренирует.
  const weakBlock = useMemo(() => {
    const id = blockForWeakest(skillSignals(d));
    return id ? blockById(id) ?? null : null;
  }, [d]);
  // Exam reads like a certificate: same score/stats/tips, ceremonial framing.
  const exam = mode === "exam";
  // A passing exam earns a named, printable certificate (A/B/C — not D/F). Only
  // then do we show the awarded-to name, date and print action.
  const passed = exam && ["A", "B", "C"].includes(d.grade);
  // Certificate date — new Date() lives only here, in the browser render path
  // (never in the mock/engine or tests), so it stays deterministic-safe there.
  const certDate = passed
    ? new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : "";
  const certName = (playerName ?? "").trim() || t.exam.namePlaceholder;
  // Animate the bars in from 0 after mount.
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();
  useEffect(() => {
    raf.current = requestAnimationFrame(() => setGrown(true));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Grade-ring reveal sting: a short tone whose pitch/brightness scales with the
  // grade (A rises bright, F sinks low). Once per debrief mount, timed to land as
  // the ring fills — ahead of the XP cascade the award plays.
  const graded = useRef(false);
  useEffect(() => {
    if (graded.current) return;
    graded.current = true;
    const id = setTimeout(() => play("grade", { grade: d.grade }), 160);
    return () => clearTimeout(id);
  }, [d.grade]);

  const bars: Array<{ label: string; v: number; color: string }> = [
    { label: t.sb.economic, v: d.economic, color: "var(--brass)" },
    { label: t.sb.relationship, v: d.relationship, color: "var(--trust)" },
    { label: t.sb.technique, v: d.technique, color: "var(--leverage)" },
  ];

  // The pivotal (most-damaging) turn to teach from, and its 0-based index into the
  // player's moves. The card renders only when everything lines up: a callback, the
  // player's lines, a scenario id, and a valid pivotal turn inside that move list.
  const pivotal = pickPivotalTurn(d.turning_points);
  const pivotIdx = pivotalTurnIndex(pivotal, whatIfMoves?.length ?? 0);
  const showWhatIf =
    !!runWhatIf && !!whatIfScenarioId && !!whatIfMoves && whatIfMoves.length > 0 &&
    pivotal !== null && pivotIdx !== null && !exam;

  // Переигровка против себя. Экзамен исключён здесь ещё раз — не потому, что
  // App его и так не передаст, а потому что «сравнения на экзамене не бывает»
  // должно читаться в том же файле, где рисуется сравнение.
  const showRematch = !!rematch && !exam;

  // Mobile-only collapse for the hoisted what-if card (item 6): on ≤640px it
  // pushes the score bars far down, so on mobile it starts collapsed behind a
  // teaser + CTA and expands in place. Desktop ignores this (CSS always shows it).
  const [wiOpen, setWiOpen] = useState(false);
  // The debrief used to be one 2750px document. It is now three beats with one
  // action each — the shape a lesson-complete flow needs. The certificate keeps
  // its single page: a certificate is a document, and paging one is absurd.
  const [beat, setBeat] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const paged = mode !== "exam";
  const at = (n: number) => !paged || beat === n;

  // Лицо разбора. Состояние — из грейда движка и статуса партии, ничего своего:
  // A/B — праздник, всё остальное при закрытой сделке — озабоченность, срыв —
  // расстройство. В экзамене Карла нет вовсе, поэтому реплики у него там нет.
  const karlMood: KarlState =
    d.status === "breakdown" ? "sad" : d.grade === "A" || d.grade === "B" ? "celebrate" : "concern";
  const karlTip = !exam && d.tips.length ? d.tips[0] : null;

  // Лицо памяти. Тихон вспоминает прошлую попытку за этим же столом — и с
  // одним и тем же лицом сообщал «вы стали лучше» и «вы просели». Оба факта
  // движок уже посчитал: рекорд побит — это `game.celebrate` (он же зажигает
  // «▲ новый рекорд» выше), результат ниже прежнего — сравнение двух чисел из
  // профиля. Своей оценки Тихон не выносит и текст не меняет: меняется поза.
  const tikhonMood: TikhonState =
    game?.celebrate ? "cheer"
    : record?.prevBest?.grade && d.overall < record.prevBest.score ? "concern"
    : "remember";
  const listTips = karlTip ? d.tips.slice(1) : d.tips;

  // Technique-floor rule (item 4): a great price with thin method caps the grade.
  // Surfacing the rule makes a capped grade read as principled, not harsh.
  const techniqueFloored = d.technique < 45 && d.economic >= 65;

  // "Что сказал бы мастер" (item 3): spotlight the single weakest turning point and
  // reformulate it with the ONE most-relevant missing technique. The selection is
  // an engine fact (pivotal turn + which technique the debrief shows was missing);
  // the reformulation is a principled Harvard/SPIN template. Nothing when no turn.
  const master: { quote: string; line: string; why: string } | null = (() => {
    if (!pivotal || exam) return null;
    const m = t.master;
    if (d.threats > 0) return { quote: pivotal.quote, line: m.threat, why: m.whyThreat };
    if (d.objective_criteria === 0) return { quote: pivotal.quote, line: m.criteria, why: m.whyCriteria };
    if (d.interests_found < d.interests_total) return { quote: pivotal.quote, line: m.interest, why: m.whyInterest };
    if (d.tradeoffs === 0) return { quote: pivotal.quote, line: m.tradeoff, why: m.whyTradeoff };
    return null;
  })();

  const cells: Array<{ n: string; l: string }> = [
    { n: `${d.spin_stages}/3`, l: t.stat.spin },
    // Подпись согласуется с числом: «1 критерий», а не «1 критериев».
    { n: String(d.objective_criteria), l: plural(d.objective_criteria, t.statForms.criteria) },
    { n: String(d.empathy), l: plural(d.empathy, t.statForms.empathy) },
    { n: `${d.interests_found}/${d.interests_total}`, l: t.stat.interests },
    { n: String(d.tradeoffs), l: plural(d.tradeoffs, t.statForms.tradeoffs) },
    { n: String(d.threats), l: plural(d.threats, t.statForms.threats) },
    { n: String(d.avg_arg), l: t.stat.arg },
  ];

  // Visible logrolling recap. Only scenarios with tradeable issues show this line:
  // the labels of what actually went on the table, or — if nothing did — a gentle
  // note that value was left uncreated. Labels only; no hidden numbers leak here.
  const issues = secondaryIssues ?? [];
  const tradedIds = new Set(termsConceded ?? []);
  const tradedLabels = issues.filter((iss) => tradedIds.has(iss.id)).map((iss) => iss.label);
  const showTerms = issues.length > 0;

  return (
    <section className="screen">
      <div className="wrap">
        <div className={exam ? "debrief cert" : "debrief"}>
          <div className="gh">
            <div
              className="ring"
              role="img"
              aria-label={t.a11y.grade.replace("{grade}", d.grade).replace("{score}", String(d.overall))}
              style={
                {
                  ["--p" as string]: grown ? d.overall : 0,
                  ["--gc" as string]: gc,
                } as CSSProperties
              }
            >
              <span className="gl" style={{ color: gc }} aria-hidden="true">
                {d.grade}
              </span>
              <span className="gs" aria-hidden="true">{d.overall}/100</span>
            </div>
            <div>
              {exam ? <div className="cert-eyebrow">🏆 {t.exam.eyebrow}</div> : null}
              {/* h1: разбор — самостоятельный экран, заголовка первого уровня
                  на нём не было. */}
              <ScreenHeading as="h1">{exam ? t.exam.resultTitle : t.debriefTitle}</ScreenHeading>
              {exam && scenarioTitle ? (
                <div className="cert-scenario">
                  {t.exam.scenarioLabel}: <b>{scenarioTitle}</b>
                </div>
              ) : null}
              {passed ? (
                <div className="cert-award">
                  <div className="cert-award-line">
                    <span className="cert-award-lab">{t.exam.awardedTo}</span>
                    <b className="cert-name">{certName}</b>
                  </div>
                  <div className="cert-award-line">
                    <span className="cert-award-lab">{t.exam.dateLabel}</span>
                    <span className="cert-date">{certDate}</span>
                  </div>
                  {/* Печать на сертификате ставит Тихон — память, а не тренер:
                      экзамен идёт без подсказок, и Карлу тут места нет. */}
                  <MascotImg dir="tikhon" state="exam" alt="" size={64} className="tikhon-seal" />
                </div>
              ) : null}
              {/* Экзамен без сертификата был экраном, который просто ничего не
                  говорил: грейд, статистика — и пустое место там, где у
                  сдавшего печать. Пустое место читается как «здесь что-то
                  должно было быть», а правило («сертификат с грейда C»)
                  человек узнавал ниоткуда. Говорит Тихон: это правило и запись,
                  а не совет, — и тренера на экзамене не бывает вовсе. */}
              {exam && !passed ? (
                <div className="cert-none">
                  <MascotImg dir="tikhon" state="concern" alt="" size={48} />
                  <p>{t.exam.notAwarded}</p>
                </div>
              ) : null}
              <div className="oc">
                {t.outcome[d.status]} · <b>{d.deal_text}</b>
              </div>
              {record && record.record.bestGrade ? (
                <div className={`pb${game?.celebrate ? " beat" : ""}`}>
                  <span className="pb-l">
                    {t.personalBest}: <b>{record.record.bestGrade} ({record.record.bestScore})</b>
                  </span>
                  {/* "new record!" only when a real prior best was beaten with a
                      passing, non-collapsed outcome — never on a first attempt or a D/F. */}
                  {game?.celebrate ? (
                    <span className="pb-new">
                      ▲ {t.newRecord}
                      {record.prevBest && record.prevBest.grade
                        ? ` +${Math.max(0, record.record.bestScore - record.prevBest.score)}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {game ? <XpAward t={t} lang={lang} game={game} failed={game.failed} /> : null}
              {passed ? (
                <button className="cert-print" type="button" onClick={() => window.print()}>
                  🖨 {t.exam.download}
                </button>
              ) : null}
            </div>
          </div>

          {passed ? <div className="cert-certifies">{t.exam.certifies}</div> : null}
          {exam ? <ServerCertificate evidence={d.attestation} lang={lang} /> : null}

          {/* Hoisted to the top (directly under the grade ring): the single
              pivotal-turn replay is the jury's magnet — an inviting teaser + the
              player's own costly line, before the metric bars. Deterministic
              replay logic is unchanged; only its position moved. */}
          {/* Главное, что можно сделать после партии: сесть за тот же стол и
              пойти против себя же. Стоит выше всего остального разбора — цифры
              рассказывают, ЧТО было, а переигровка показывает, что дело в
              методе, и показывает вашими собственными словами. */}
          {at(0) && showRematch && rematch ? (
            <RematchOffer
              t={t}
              past={rematch.past}
              isThisRun={rematch.isThisRun}
              onRematch={onRetry}
            />
          ) : null}

          {at(0) && showWhatIf && pivotal && pivotIdx !== null ? (
            <div className={`whatif-wrap${wiOpen ? " open" : ""}`}>
              <button
                type="button"
                className="whatif-mtoggle"
                aria-expanded={wiOpen}
                onClick={() => setWiOpen((o) => !o)}
              >
                <span className="wi-teaser">{t.whatIf.teaser}</span>
                <span className="wmt-cta">{t.whatIf.mobileCta} ▾</span>
              </button>
              <WhatIfCard
                t={t}
                lang={lang}
                run={runWhatIf!}
                scenarioId={whatIfScenarioId!}
                moves={whatIfMoves!}
                turnIndex={pivotIdx}
                originalQuote={pivotal.quote}
                unit={whatIfUnit}
                lowerBetter={whatIfLowerBetter}
              />
            </div>
          ) : null}

          {at(0) ? (
          <>
          <div className="sb">
            {bars.map((b, i) => (
              <div
                className="sbi"
                key={i}
                role="img"
                aria-label={t.a11y.scoreBar.replace("{label}", b.label).replace("{v}", String(b.v))}
              >
                <div className="sbh" aria-hidden="true">
                  <span>{b.label}</span>
                  <b>{b.v}</b>
                </div>
                <div className="sbt" aria-hidden="true">
                  <div
                    className="sbf"
                    style={{ width: grown ? `${b.v}%` : "0%", background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          {techniqueFloored ? (
            <div className="tfloor" role="note">
              <span className="tfloor-i" aria-hidden="true">⚖</span>
              <span>{t.techniqueFloor}</span>
            </div>
          ) : null}
          </>
          ) : null}

          {at(1) && d.interests && d.interests.length > 0 ? (
            <div className="reveal">
              {/* h2, а не h3: это раздел ПОД заголовком экрана, и уровнем ниже
                  он был прыжком через ступень в навигации диктора. */}
              <h2>🔎 {t.reveal.title}</h2>
              <ul>
                {d.interests.map((it, i) => (
                  <li key={i} className={it.found ? "rv-found" : "rv-missed"}>
                    <span className="rv-mark" aria-hidden="true">{it.found ? "✓" : "?"}</span>
                    <span className="rv-text">{it.text}</span>
                    <span className="rv-badge">{it.found ? t.reveal.found : t.reveal.missed}</span>
                  </li>
                ))}
              </ul>
              {d.interests.every((i) => i.found) ? (
                <p className="rv-note good">{t.reveal.allFound}</p>
              ) : d.interests.every((i) => !i.found) ? (
                <p className="rv-note bad">{t.reveal.noneFound}</p>
              ) : null}
            </div>
          ) : null}

          {/* «С той стороны стола» — сразу ПОД занавесом, и это не вкусовщина.
              Занавес показывает, ЧТО она прятала; колонка объясняет, почему
              оно осталось спрятанным — ход за ходом, её словами. Порознь эти
              две карточки читаются как список и как упрёк; подряд — как урок.

              Текст реплик приходит с готовым разбором и собран движком (на
              сервере views.her_side, офлайн — mock/engine.ts::herSide). Здесь
              не сочиняется ни одного слова: ИИ до этой карточки не дотягивается
              вовсе, поэтому она одинаково полна с сетью и без неё.

              Экзамена это не касается: там сопровождение выключено до конца, и
              объяснение хода — такое же сопровождение, как слово наставника. */}
          {at(1) && !exam && d.her_side && d.her_side.turns.length > 0 ? (
            <div className="herside">
              <h2>🪑 {t.herSide.title}</h2>
              <div className="hs-lead">
                {/* Тихон отвечает за память, и поза `chart` — «указывает на
                    цифру» — нарисована ровно под колонку, где у каждой реплики
                    стоят числа движка. */}
                <MascotImg dir="tikhon" state="chart" alt={t.herSide.mascotAlt} size={44} />
                <p>{t.herSide.lead.replace("{name}", d.her_side.name)}</p>
              </div>
              <ol className="hs-tape">
                {d.her_side.turns.map((p) => (
                  <li key={p.turn} className={`hs-${p.tone}`}>
                    <span className="hs-when">{t.herSide.turn} {p.turn}</span>
                    <blockquote className="hs-quote">
                      <b>{t.herSide.you}:</b> «{p.quote}»
                    </blockquote>
                    <p className="hs-said"><b>{d.her_side!.name}:</b> {p.said}</p>
                    {p.meters.length ? (
                      <span className="hs-meters">
                        {p.meters.map((m, j) => (
                          <i key={j}>{m}</i>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="hs-missed">
                <h3>{t.herSide.missedTitle}</h3>
                <p>{d.her_side.missed}</p>
                {d.her_side.ask ? <p className="hs-ask">{d.her_side.ask}</p> : null}
              </div>
            </div>
          ) : null}

          {/* «Обратная сторона стола» — карточка, ради которой режим и заведён.
              Стоит СРАЗУ ЗА колонкой оппонента, потому что читается как её
              вторая половина: там — что прятали от вас, здесь — что прятали ВЫ,
              и почему никто напротив этого не увидел.

              Ключа `other_side` нет на обычном столе, и карточки тогда нет
              вовсе: режима, которого не было, на экране не бывает (принцип 2).
              Всё, что здесь написано, посчитано движком — на сервере
              views.other_side, офлайн mock/engine.ts::otherSide, — и совпадает
              у двух реализаций до символа (frontend/test/games.test.ts).

              Экзамена это не касается по той же причине, что и колонки выше:
              там сопровождение выключено до конца. */}
          {at(1) && !exam && d.other_side ? (
            <div className="herside otherside">
              <h2>🪞 {t.otherSide.debriefTitle}</h2>
              <div className="hs-lead">
                <MascotImg dir="tikhon" state="chart" alt={t.otherSide.mascotAlt} size={44} />
                <p>
                  {t.otherSide.seat.replace("{seat}", d.other_side.seat)}{" "}
                  {t.otherSide.origin.replace("{title}", d.other_side.origin_title)}
                </p>
              </div>

              <h3>{t.otherSide.defendTitle}</h3>
              <ul className="os-list">
                {d.other_side.defended.map((i) => (
                  <li key={i.topic + i.text}>
                    <b>{i.topic}</b>
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>

              <div className="hs-missed">
                <h3>{t.otherSide.blindTitle}</h3>
                <p>{d.other_side.blind}</p>
              </div>

              <div className="hs-missed">
                <h3>{t.otherSide.windowsTitle}</h3>
                {d.other_side.windows.length ? (
                  <ul className="os-windows">
                    {d.other_side.windows.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                ) : (
                  <p className="hs-ask">{t.otherSide.windowsNone}</p>
                )}
              </div>
            </div>
          ) : null}

          {/* Numbers live in the details drawer: they are reference, not the
              lesson, and they were the densest block on the old single page. */}
          {at(2) && (!paged || detailsOpen) ? (
          <div className="stats">
            {cells.map((c, i) => (
              <div className="st" key={i} role="img" aria-label={`${c.l}: ${c.n}`}>
                <div className="n" aria-hidden="true">{c.n}</div>
                <div className="l" aria-hidden="true">{c.l}</div>
              </div>
            ))}
          </div>
          ) : null}

          {at(1) && showTerms ? (
            <div className={`dbterms${tradedLabels.length ? "" : " none"}`}>
              <span className="dbt-label">🔄 {t.terms.debriefLabel}</span>
              {tradedLabels.length ? (
                <span className="dbt-chips">
                  {tradedLabels.map((label, i) => (
                    <span className="dbt-chip" key={i}>✓ {label}</span>
                  ))}
                </span>
              ) : (
                <span className="dbt-miss">{t.terms.debriefNone}</span>
              )}
            </div>
          ) : null}

          {/* Layer observation. It sits BELOW the score bars and carries the
              shared "observation" badge, because how well you read her is not
              part of the grade — unlike the interests card above, whose
              interests_found genuinely feeds `technique`. */}
          {at(1) && probeStats && probeStats.asked > 0 ? (
            <div className="obs">
              <div className="obs-head">
                <h2>🎭 {t.probe.debriefHead}</h2>
                <span className="obs-badge">{t.probe.observation}</span>
              </div>
              <div className="obs-body">
                <b className="obs-n">{probeStats.right} / {probeStats.asked}</b>
                <span className="obs-dots" aria-hidden="true">
                  {Array.from({ length: probeStats.asked }, (_, i) => (
                    <i key={i} className={i < probeStats.right ? "ok" : "bad"} />
                  ))}
                </span>
              </div>
            </div>
          ) : null}

          {/* Лента камеры: на каком ходу что было видно. Рисуется, ТОЛЬКО если
              слой и правда высказался — сервер не присылает ключ, когда модель
              не сказала ни слова, и «ноль наблюдений» под невставшей камерой
              нарисовать нечем. Данные берутся из разбора, а не из накопленных
              живых событий: после переподключения посреди партии клиентский
              список короче настоящего, и лента врала бы про начало игры. */}
          {at(1) && observations && visTape.tape.length > 0 ? (
            <div className="obs">
              <div className="obs-head">
                <h2>📷 {t.layers.seenHead}</h2>
                <span className="obs-badge">{t.probe.observation}</span>
              </div>
              <div className="vis-lead">
                <MascotImg dir="karl" state="study" alt={t.mascot.alt.study} size={44} />
                <p>{t.layers.seenNote}</p>
              </div>
              <ol className="vis-tape">
                {visTape.tape.map((n, i) => (
                  <li key={i} className={n.expressive ? "tell" : undefined}>
                    <span className="vis-when">
                      {n.turn > 0
                        ? t.layers.seenTurn.replace("{n}", String(n.turn))
                        : t.layers.seenStart}
                      <i>{visionClock(n.at_ms)}</i>
                    </span>
                    {n.text ? <p className="vis-what">{n.text}</p> : null}
                    {/* Отметка только на «да». `null` — модель про лицо не
                        сказала, и это не «нет»: рисовать «лицо спокойно» там,
                        где никто ничего не говорил, значит придумать данные. */}
                    {n.expressive ? (
                      <span className="vis-tell">{t.layers.seenTell}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {visTape.hidden > 0 ? (
                <p className="vis-more">
                  {t.layers.seenMore.replace("{n}", String(visTape.hidden))}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* КАМЕРА СМОТРЕЛА И МОЛЧАЛА — ЭТО ОТВЕТ, А НЕ ПУСТОТА. Карточка выше
              рисуется только когда слою было что сказать; без неё разбор молчал
              одинаково и про отработавший слой, и про невставший. Число взглядов
              приходит с сервера (`observation_looks`) и есть ТОЛЬКО когда модель
              и правда отвечала, поэтому обещания здесь не выдаются за наблюдение. */}
          {at(1) && observations && visTape.tape.length === 0
            && (d.observation_looks ?? 0) > 0 ? (
            <div className="obs">
              <div className="obs-head">
                <h2>📷 {t.layers.seenHead}</h2>
                <span className="obs-badge">{t.probe.observation}</span>
              </div>
              <div className="vis-lead">
                <MascotImg dir="karl" state="shrug" alt={t.mascot.alt.shrug} size={44} />
                <p>{LOOKED_IN_SILENCE[lang].replace("{n}", String(d.observation_looks))}</p>
              </div>
            </div>
          ) : null}

          {at(1) && tells && tells.frames > 0 ? (
            <div className="obs">
              <div className="obs-head">
                <h2>😐 {t.layers.names.pokerface}</h2>
                <span className="obs-badge">{t.probe.observation}</span>
              </div>
              <p className="obs-tells">
                <b>{tells.count}</b>
                {" "}
                {t.layers.tellsOf.replace("{n}", String(tells.frames))}
              </p>
            </div>
          ) : null}

          {at(2) && d.ai_verdict ? (
            <div className="mentor">
              <h2>🎓 {t.mentor.title}</h2>
              <p className="mn-verdict">{d.ai_verdict}</p>
              {d.ai_strength || d.ai_growth ? (
                <div className="mn-grid">
                  {d.ai_strength ? (
                    <div className="mn-cell good">
                      <span className="mn-lab">{t.mentor.strength}</span>
                      <p>{d.ai_strength}</p>
                    </div>
                  ) : null}
                  {d.ai_growth ? (
                    <div className="mn-cell grow">
                      <span className="mn-lab">{t.mentor.growth}</span>
                      <p>{d.ai_growth}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {at(2) && d.turning_points && d.turning_points.length > 0 ? (
            <div className="tpoints">
              <h2>{t.turningPoints.title}</h2>
              <ol>
                {d.turning_points.map((p, i) => (
                  <li key={i}>
                    <span className="tp-turn">
                      {t.turningPoints.turn} {p.turn}
                    </span>
                    <blockquote className="tp-quote">«{p.quote}»</blockquote>
                    <div className="tp-what">{p.what}</div>
                    {p.coach ? <div className="tp-coach">{p.coach}</div> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {at(2) && master ? (
            <div className="master">
              <h2>✦ {t.master.title}</h2>
              <div className="ms-grid">
                <div className="ms-cell yours">
                  <span className="ms-lab">{t.master.yours}</span>
                  <blockquote className="ms-q">«{master.quote}»</blockquote>
                </div>
                <div className="ms-cell mstr">
                  <span className="ms-lab">✦ {t.master.label}</span>
                  <blockquote className="ms-q ms-line">«{master.line}»</blockquote>
                </div>
              </div>
              <div className="ms-why">
                <b>{t.master.why}</b> {master.why}
              </div>
            </div>
          ) : null}

          {at(2) && (!paged || detailsOpen) ? (
          <div className="coach">
            <h2>{t.coachTitle}</h2>
            {/* Итог партии был единственным экраном без лица. Карл берёт ПЕРВУЮ
                подсказку разбора — из списка она при этом уходит: один и тот же
                совет дважды на экране это не забота, а шум. Своего текста он
                по-прежнему не сочиняет, а состояние берёт из грейда движка.
                В экзамене его нет — там сопровождения не бывает. */}
            {karlTip ? (
              <Karl state={karlMood} line={karlTip} name={t.mascot.karl} alt={t.mascot.alt} />
            ) : null}
            {listTips.length ? (
              <ul>
                {listTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            ) : null}
            {/* Разбор говорит, где вы просели; курс знает, где этому учат.
                Связь не должна быть догадкой игрока. В экзамене её нет: там
                сопровождение выключено до конца. */}
            {/* Тихон помнит прошлую попытку на этом же столе. Это единственное
                место, где продукт сравнивает вас с ВАМИ ЖЕ, а не с эталоном —
                и данные для сравнения у него настоящие, из профиля. */}
            {!exam && !showRematch && record && record.prevBest && record.prevBest.grade ? (
              <Tikhon state={tikhonMood} title={t.mascot.rememberTitle}>
                {t.lastTime
                  .replace("{grade}", record.prevBest.grade)
                  .replace("{score}", String(record.prevBest.score))
                  .replace("{now}", String(d.overall))}
              </Tikhon>
            ) : null}
            {!exam && onCourse && weakBlock ? (
              <button className="coach-course" onClick={() => onCourse(weakBlock.id)}>
                {weakBlock.icon} {t.course.trainThis}: <b>{weakBlock.title[lang]}</b> →
              </button>
            ) : null}
          </div>
          ) : null}

          {paged ? (
            <div className="beats">
              {/* One action per beat — the shape a lesson-complete flow needs.
                  The dots double as a progress read and as direct navigation. */}
              {/* НЕ `tablist`. Роль обещала клавиатурную модель, которой здесь
                  нет и быть не может: части разбора не лежат в одной панели —
                  `at(n)` гасит куски по всей карточке, — поэтому ни `tabpanel`,
                  ни `aria-controls` указать не на что, а стрелки не работали.
                  Диктор при этом объявлял «вкладка 1 из 3». Три обычные кнопки
                  с `aria-pressed` не обещают ничего сверх того, что делают. */}
              <div className="beat-dots" role="group" aria-label={t.beats.label}>
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    aria-pressed={beat === i}
                    aria-label={t.beats.names[i]}
                    className={`beat-dot${beat === i ? " on" : ""}${beat > i ? " done" : ""}`}
                    onClick={() => setBeat(i)}
                  />
                ))}
              </div>
              {/* Смена части подменяла содержимое молча: кнопка остаётся под
                  фокусом, а полкарточки над ней становится другой. */}
              <p className="sr-only" role="status" aria-live="polite">{t.beats.names[beat]}</p>
              {beat < 2 ? (
                <button className="primary beat-go" onClick={() => setBeat((n) => n + 1)}>
                  {t.beats.next.replace("{name}", t.beats.names[beat + 1])}
                </button>
              ) : (
                <button className="beat-more" onClick={() => setDetailsOpen((o) => !o)}>
                  {detailsOpen ? t.beats.less : t.beats.more}
                </button>
              )}
            </div>
          ) : null}

          {(!paged || beat === 2) ? (
          <div className="dacts">
            {onNext ? (
              <button className="primary" onClick={onNext}>
                {nextLabel}
              </button>
            ) : (
              <button className="primary" onClick={onRetry}>
                ↻ {showRematch ? t.rematch.cta : t.retry}
              </button>
            )}
            <button className="quit" onClick={onHome}>
              {t.toHome}
            </button>
          </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "А что если…" — the what-if replay card. Shows the player's pivotal line, lets
// them pick (or type) a stronger one, then reveals a side-by-side divergence of
// the two deterministic branches: meter swings, the opponent's offer, and their
// line. Honest: the "better" banner shows only when the alternative truly wins.
// ---------------------------------------------------------------------------
interface WhatIfCardProps {
  t: Strings;
  lang: Lang;
  run: (req: WhatIfRequest) => Promise<WhatIfResponse | null>;
  scenarioId: string;
  moves: string[];
  turnIndex: number;
  originalQuote: string;
  unit?: string;
  lowerBetter?: boolean;
}

function WhatIfCard({ t, lang, run, scenarioId, moves, turnIndex, originalQuote, unit, lowerBetter }: WhatIfCardProps) {
  const w = t.whatIf;
  // Alt choice: two presets (0|1) or free text ("custom"). Default to the first
  // preset — a strong interest probe, the canonical "ask why" move.
  const [choice, setChoice] = useState<0 | 1 | "custom">(0);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<WhatIfResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // Grow the alt bars in from 0 once the divergence is revealed.
  const [grown, setGrown] = useState(false);
  const raf = useRef<number>();

  const altText = (choice === "custom" ? custom : w.presets[choice]).trim();

  const reveal = async () => {
    if (loading || !altText) return;
    setLoading(true);
    setFailed(false);
    const out = await run({ scenarioId, lang, moves, turnIndex, altText });
    setLoading(false);
    if (!out) {
      setFailed(true);
      return;
    }
    setRes(out);
    setGrown(false);
    raf.current = requestAnimationFrame(() => setGrown(true));
  };

  // ВЕТКА ЗАБИРАЕТ ФОКУС. Кнопка «Показать, что было бы иначе» исчезает вместе
  // с нажатием — на её месте встаёт расхождение, ради которого всё и делалось,
  // — и фокус падал на BODY: с клавиатуры обход начинался заново, а диктору не
  // доставалось ни слова о том, что контрфакт посчитан. Тот же приём, что у
  // вердикта упражнения и у разбора «Чтения стола».
  const divergeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (res) divergeRef.current?.focus({ preventScroll: true });
  }, [res]);

  const resetChoice = () => {
    setRes(null);
    setFailed(false);
    setGrown(false);
    if (raf.current) cancelAnimationFrame(raf.current);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className="whatif">
      <div className="wi-teaser">{w.teaser}</div>
      <h2>{w.title}</h2>
      <p className="wi-intro">{w.intro}</p>

      <blockquote className="wi-orig">«{originalQuote}»</blockquote>

      {!res ? (
        <>
          <div className="wi-altlabel">{w.altLabel}</div>
          <div className="wi-presets">
            {w.presets.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`wi-preset${choice === i ? " on" : ""}`}
                onClick={() => setChoice(i as 0 | 1)}
              >
                {p}
              </button>
            ))}
          </div>
          {/* ПЕРЕКЛЮЧАЕТ ВВОД, А НЕ ФОКУС. Здесь стоял `onFocus`, и он делал
              контрфакт НЕИГРАБЕЛЬНЫМ с клавиатуры: поле лежит в порядке обхода
              между затравками и кнопкой «Показать», то есть пройти мимо него
              нельзя. Tab с выбранной затравкой заходил сюда, `setChoice` гасил
              выбор, `altText` становился пустым — и следующая остановка Tab
              была уже точкой раздела, потому что кнопка успевала стать
              `disabled`. Мышью путь работал (по затравке кликают, поля не
              касаются), клавиатурой — не работал НИКОГДА. Ввод и так
              переключает выбор в `onChange`; фокус сам по себе выбором не
              является. */}
          <input
            className="wi-input"
            type="text"
            value={custom}
            placeholder={w.customPlaceholder}
            onChange={(e) => {
              setCustom(e.target.value);
              setChoice("custom");
            }}
          />
          <button className="wi-reveal" type="button" onClick={reveal} disabled={loading || !altText}>
            {loading ? w.loading : w.reveal}
          </button>
          {failed ? <p className="wi-fail">{w.unavailable}</p> : null}
        </>
      ) : (
        <Divergence
          t={t}
          lang={lang}
          res={res}
          innerRef={divergeRef}
          grown={grown}
          unit={unit}
          lowerBetter={lowerBetter}
          onReset={resetChoice}
        />
      )}
    </div>
  );
}

// The revealed side-by-side: original vs alternative branch. Emphasizes the
// improvement honestly — the banner and summary are derived from the real deltas.
function Divergence({
  t, lang, res, grown, unit, lowerBetter, onReset, innerRef,
}: {
  t: Strings;
  lang: Lang;
  res: WhatIfResponse;
  grown: boolean;
  unit?: string;
  lowerBetter?: boolean;
  onReset: () => void;
  /** Куда вести фокус: кнопка, которой сюда пришли, в этот момент исчезает. */
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const w = t.whatIf;
  const { original: o, alternative: a } = res;

  // Is the alternative genuinely better? Cooler room AND at least one real gain
  // (an interest uncovered, more trust, or a better price move). Keeps it honest.
  const priceBetter =
    lowerBetter === undefined
      ? false
      : lowerBetter
        ? a.state.offer_opp < o.state.offer_opp
        : a.state.offer_opp > o.state.offer_opp;
  const uncovered = a.state.interests_found > o.state.interests_found;
  const trustHigher = a.deltas.trust > o.deltas.trust;
  const cooler = a.deltas.tension < o.deltas.tension;
  const better = cooler && (uncovered || trustHigher || priceBetter);

  // The one-line proof, built only from what's actually true.
  const bits: string[] = [];
  if (a.deltas.tension !== o.deltas.tension) {
    bits.push(`${w.meters.tension.toLowerCase()} ${fmtDelta(a.deltas.tension)} ${w.insteadOf} ${fmtDelta(o.deltas.tension)}`);
  }
  if (uncovered) bits.push(w.uncovered);
  else if (trustHigher) bits.push(w.trustHigher);
  if (priceBetter) bits.push(w.priceFurther);

  return (
    <div className="wi-diverge" ref={innerRef} tabIndex={-1} role="status">
      <div className={`wi-banner${better ? " good" : ""}`}>
        {better ? w.betterBanner : w.neutralBanner}
      </div>
      {bits.length ? <div className="wi-summary">{bits.join(" · ")}</div> : null}

      <div className="wi-cols">
        <Branch t={t} lang={lang} label={w.wasLabel} b={o} grown={grown} unit={unit} alt={false} />
        <Branch t={t} lang={lang} label={w.couldLabel} b={a} grown={grown} unit={unit} alt />
      </div>

      <button className="wi-reveal ghost" type="button" onClick={onReset}>
        ↺ {w.again}
      </button>
    </div>
  );
}

// One branch column: three meter bars (trust/tension/info), the opponent's offer,
// and their line. Only the alternative column animates its bars in.
function Branch({
  t, lang, label, b, grown, unit, alt,
}: {
  t: Strings;
  lang: Lang;
  label: string;
  b: WhatIfBranch;
  grown: boolean;
  unit?: string;
  alt: boolean;
}) {
  const w = t.whatIf;
  const rows: Array<{ label: string; v: number; goodPos: boolean }> = [
    { label: w.meters.trust, v: b.deltas.trust, goodPos: true },
    { label: w.meters.tension, v: b.deltas.tension, goodPos: false },
    { label: w.meters.info, v: b.deltas.info, goodPos: true },
  ];
  return (
    <div className={`wi-col${alt ? " alt" : ""}`}>
      <div className="wi-collabel">{label}</div>
      <div className="wi-meters">
        {rows.map((r, i) => {
          const good = r.v === 0 ? "neutral" : (r.goodPos ? r.v > 0 : r.v < 0) ? "good" : "bad";
          // Only the alt column grows on reveal; the original is static context.
          const width = alt ? (grown ? meterWidth(r.v) : 0) : meterWidth(r.v);
          return (
            <div className="wi-meter" key={i}>
              <span className="wi-mlabel">{r.label}</span>
              <span className={`wi-mval ${good}`}>{fmtDelta(r.v)}</span>
              <span className="wi-mtrack">
                <span className={`wi-mfill ${good}`} style={{ width: `${width}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="wi-offer">
        <span>{w.offerLabel}</span>
        <b>{formatDeal(b.state.offer_opp, unit ?? "", lang)}</b>
      </div>
      <div className="wi-oline">
        <span className="wi-olabel">{w.opponentLabel}</span>
        «{b.opponent_line}»
      </div>
    </div>
  );
}

// Signed delta as "+5" / "−3" / "0" (typographic minus).
function fmtDelta(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
}

// Scale a meter delta to a bar width (capped). Tension can swing ~26 → ~68%.
function meterWidth(v: number): number {
  return Math.min(100, Math.abs(v) * 2.6);
}
