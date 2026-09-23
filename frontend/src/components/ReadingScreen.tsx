// ReadingScreen.tsx — режим «Чтение стола».
//
// Человек смотрит ЧУЖУЮ партию по ходам. На ходах, где стол меняет характер,
// его останавливают одним вопросом — «как ответит вторая сторона?» — и сразу
// после ответа показывают то, ради чего всё и затевалось: улики в реплике
// (какой приём нашёл движок) и состояние стола (мог ли он этот приём принять).
//
// ЧТО ЗДЕСЬ НЕ ПРОИСХОДИТ. Ни одного обращения к сети и ни одной строки от
// модели: всё, что на экране, посчитал движок в браузере (`lib/reading.ts`).
// Поэтому режим целиком работает офлайн, а его ответы одинаковы у всех.
//
// ПОЧЕМУ КАРЛ МОЛЧИТ, ПОКА ВОПРОС ОТКРЫТ. Его лицо считается из ДЕЛЬТ хода
// (`karlState`) — то есть, показанное до ответа, оно и было бы ответом:
// довольный ворон над репликой значит «доверие выросло». Пока человек думает,
// ворон изучает реплику вместе с ним (`study`), и только после раскрытия
// реагирует на то, что уже видно обоим.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang, StateView } from "../types";
import type { Strings } from "../i18n";
import { formatDeal } from "../lib/format";
import { tagText } from "../lib/tagLabel";
import { readingGamesFor } from "../data/readingGames";
import {
  buildReading, verdictOf,
  type Reading, type ReadingSnapshot, type ReadingTurn, type ReadingVerdict,
} from "../lib/reading";
import {
  loadReading, nextReadingGame, recordReading, saveReading,
  type ReadingRecord,
} from "../lib/readingStore";
import { Karl, Tikhon, karlState } from "./Mascot";
import { Meters } from "./Meters";
import { ScreenHeading } from "./ScreenHeading";
import { DataIcon } from "./Icon";

interface Props {
  t: Strings;
  lang: Lang;
  onClose: () => void;
}

const EMPTY_TALLY: ReadingRecord = { asked: 0, exact: 0, near: 0 };

/** Снимок стола в форме, которую понимает общая полоса шкал. Полоса одна на
 *  продукт намеренно: шкалы за столом и шкалы в чтении обязаны выглядеть и
 *  читаться одинаково, иначе человек учится читать НЕ ТО. */
function asState(snap: ReadingSnapshot, turn: ReadingTurn, total: number): StateView {
  return {
    trust: snap.trust, tension: snap.tension, info: snap.info, leverage: snap.leverage,
    offer_opp: snap.offer, offer_player: null,
    interests_found: 0, interests_total: 0,
    status: "active", turn: turn.turn, max_turns: total,
  };
}

export function ReadingScreen({ t, lang, onClose }: Props) {
  const ids = useMemo(() => readingGamesFor(lang).map((g) => g.id), [lang]);
  const [log, setLog] = useState(() => loadReading());
  const [gameId, setGameId] = useState<string | null>(() => nextReadingGame(loadReading(), ids));
  // Смена языка меняет КАТАЛОГ: лестница качества в фикстуре одноязычна, и
  // партии, которой нет в новом языке, полагается уступить место, а не исчезнуть
  // пустым экраном.
  useEffect(() => {
    if (!gameId || !ids.includes(gameId)) setGameId(nextReadingGame(log, ids));
  }, [ids, gameId, log]);

  const reading = useMemo(() => (gameId ? buildReading(gameId, lang) : null), [gameId, lang]);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [tally, setTally] = useState<ReadingRecord>(EMPTY_TALLY);
  // Прошлый результат снимается ПРИ ВХОДЕ в партию, а не выводится из `log`:
  // запись нового итога меняет `log` тут же, и Тихон «вспоминал» бы то, что
  // человек сделал секунду назад, — то есть не помнил бы ничего.
  const [previous, setPrevious] = useState<ReadingRecord | undefined>(
    () => (gameId ? loadReading().games[gameId] : undefined),
  );

  // РАЗБОР ЗАБИРАЕТ ФОКУС. Четыре варианта ответа исчезают тем же нажатием,
  // которым отвечают, — и фокус падал на BODY: с клавиатуры следующий Tab
  // начинал обход диалога заново, а диктору не доставалось ни слова о том, что
  // произошло. Разбор и есть весь смысл остановки, поэтому фокус ведём в него
  // (он `tabIndex={-1}` и `role="status"`), ровно как вердикт упражнения курса.
  const revealRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (picked !== null) revealRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const restart = useCallback((id: string | null) => {
    setGameId(id);
    setPrevious(id ? loadReading().games[id] : undefined);
    setStep(0);
    setPicked(null);
    setTally(EMPTY_TALLY);
  }, []);

  if (!reading || !gameId) return null;

  const total = reading.turns.length;
  const done = step >= total;
  const turn = done ? reading.turns[total - 1] : reading.turns[step];
  const revealed = done || !turn.ask || picked !== null;
  const verdict: ReadingVerdict | null =
    turn.ask && picked !== null ? verdictOf(turn.ask.options[picked], turn.reaction) : null;

  const answer = (i: number) => {
    if (!turn.ask || picked !== null) return;
    setPicked(i);
    const v = verdictOf(turn.ask.options[i], turn.reaction);
    setTally((prev) => ({
      asked: prev.asked + 1,
      exact: prev.exact + (v === "exact" ? 1 : 0),
      near: prev.near + (v === "near" ? 1 : 0),
    }));
  };

  const advance = () => {
    const next = step + 1;
    setPicked(null);
    setStep(next);
    if (next >= total) {
      const updated = recordReading(log, gameId, tally);
      setLog(updated);
      saveReading(updated);
    }
  };

  const shown = revealed ? turn.after : turn.before;
  const nextId = ids[ids.indexOf(gameId) + 1] ?? null;

  return (
    <section className="screen reading">
      <div className="wrap rd-wrap">
        <header className="rd-head">
          <span className="rd-ic" aria-hidden="true"><DataIcon name={reading.icon} /></span>
          <div className="rd-id">
            <ScreenHeading as="h1" className="rd-title">{t.reading.title}</ScreenHeading>
            <p className="rd-sub">
              {reading.title} · {t.reading.gameOf
                .replace("{n}", String(ids.indexOf(gameId) + 1))
                .replace("{total}", String(ids.length))} · {t.reading.turnsN.replace("{n}", String(total))}
            </p>
          </div>
          {/* Плашка стоит в шапке, а не в подвале: правило «в грейд не входит»
              должно быть прочитано ДО первого ответа, а не после последнего. */}
          <span className="rd-badge">{t.reading.notScored}</span>
          <button className="btn ghost rd-x" onClick={onClose} aria-label={t.reading.a11y.close}>✕</button>
        </header>

        <p className="rd-watch">{t.reading.watching.replace("{name}", reading.name)}</p>

        <Meters
          state={asState(shown, turn, total)}
          labels={t.meters}
          short={t.metersShort}
          info={t.meterInfo}
          groupLabel={t.reading.a11y.table}
          deltas={revealed ? turn.deltas : null}
        />
        <p className="rd-price">
          <span>{t.tracker.theirOffer}</span> {formatDeal(shown.offer, reading.unit, lang)}
        </p>

        {step > 0 ? (
          <ol className="rd-log">
            {reading.turns.slice(0, step).map((p) => (
              <li key={p.turn} className={`rd-past rd-${p.tone}`}>
                <b>{p.turn}</b> <span>{t.probe.reactions[p.reaction] ?? p.reaction}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {done ? (
          <ReadingResult
            t={t} reading={reading} tally={tally} previous={previous}
            onAgain={() => restart(gameId)}
            onNext={nextId ? () => restart(nextId) : null}
            onClose={onClose}
          />
        ) : (
          <div className="rd-card">
            <p className="rd-turn">{t.reading.turnOf
              .replace("{n}", String(turn.turn)).replace("{total}", String(total))}</p>
            <p className="rd-quote">{turn.quote}</p>

            {turn.ask && picked === null ? (
              <div className="rd-ask">
                <h2>{t.reading.ask.replace("{name}", reading.name)}</h2>
                {/* Ворон говорит, ЧТО читать, — и ни слова о том, что он видит:
                    его лицо считается из дельт хода, то есть было бы ответом. */}
                <Karl state="study" compact line={t.reading.lookFor}
                      name={t.mascot.karl} alt={t.mascot.alt} />
                <div className="rd-opts">
                  {turn.ask.options.map((opt, i) => (
                    <button key={opt} className="btn ghost rd-opt" onClick={() => answer(i)}>
                      {t.probe.reactions[opt] ?? opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ReadingReveal t={t} turn={turn} name={reading.name} verdict={verdict}
                             innerRef={revealRef}
                             mine={turn.ask && picked !== null ? turn.ask.options[picked] : null} />
            )}

            {revealed ? (
              <button className="btn primary rd-next" onClick={advance}>{t.reading.next} →</button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** Разбор одного хода. Ни одной собственной оценки: ярлык реакции и объяснение
 *  берутся из того же словаря, что и в слое «Читай лицо», улики — из
 *  классификатора, последствия — из хроники движка. */
function ReadingReveal({ t, turn, name, verdict, mine, innerRef }: {
  t: Strings; turn: ReadingTurn; name: string; verdict: ReadingVerdict | null;
  /** Что выбрал человек. Показывается рядом с ответом движка: разбор промаха
   *  без самого промаха заставляет вспоминать, что ты вообще нажал. */
  mine: string | null;
  /** Куда вести фокус после ответа: сами варианты в этот момент исчезают. */
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    // `role="status"` держит вторую половину обещания: карточка появляется
    // целиком, и объявляет её перевод фокуса, а не живая область, — но если
    // фокус почему-то не дойдёт, роль остаётся честным описанием того, что это
    // такое.
    <div className="rd-reveal" ref={innerRef} tabIndex={-1} role="status">
      {verdict ? (
        <p className={`rd-verdict rd-v-${verdict}`}>{t.reading[verdict]}</p>
      ) : (
        <p className="rd-verdict rd-v-none">{t.reading.askNone}</p>
      )}
      <p className="rd-answer">
        {mine && mine !== turn.reaction ? (
          <span className="rd-mine">{t.reading.yourAnswer}: <s>{t.probe.reactions[mine] ?? mine}</s> · </span>
        ) : null}
        {t.reading.engineSaid}: <b>{t.probe.reactions[turn.reaction] ?? turn.reaction}</b>
      </p>
      <Karl state={karlState({ deltas: turn.deltas })} compact
            line={t.probe.why[turn.reaction] ?? null}
            name={t.mascot.karl} alt={t.mascot.alt} />

      <h2 className="rd-h">{t.reading.evidence}</h2>
      {turn.tags.length ? (
        <div className="rd-chips">
          {turn.tags.map((tag, i) => (
            <span className="rd-chip" key={`${tag.key}-${i}`}>{tagText(tag, turn.analysis, t.tagLabels)}</span>
          ))}
          <span className="rd-chip rd-arg">{t.reading.argq.replace("{n}", String(turn.analysis.arg_quality))}</span>
        </div>
      ) : (
        <p className="rd-none">{t.reading.noTags}</p>
      )}
      {/* Порог доверия — та самая вторая половина ответа: вопрос по теме на
          холодном столе получает переспрос, а не откровенность. Показывается
          только там, где он СРАБОТАЛ, иначе это была бы теория. */}
      {turn.gated ? (
        <p className="rd-gate">
          {t.reading.gate
            .replace("{trust}", String(Math.round(turn.before.trust)))
            .replace("{gate}", String(turn.gate))}
        </p>
      ) : null}

      <h2 className="rd-h">{t.reading.effect}</h2>
      {turn.meters.length ? (
        <div className="rd-chips">
          {turn.meters.map((m) => <span className="rd-chip rd-m" key={m}>{m}</span>)}
        </div>
      ) : (
        <p className="rd-none">{t.reading.noMove}</p>
      )}
      {turn.revealedTopic ? (
        <p className="rd-topic">{t.reading.revealed.replace("{topic}", turn.revealedTopic)}</p>
      ) : null}
      <p className="rd-said"><b>{name}:</b> {turn.said}</p>
    </div>
  );
}

/** Итог чтения. Грейд партии показывается ЗДЕСЬ и только здесь: названный
 *  заранее, он был бы ответом на все вопросы сразу. */
function ReadingResult({ t, reading, tally, previous, onAgain, onNext, onClose }: {
  t: Strings; reading: Reading; tally: ReadingRecord;
  previous?: ReadingRecord; onAgain: () => void; onNext: (() => void) | null; onClose: () => void;
}) {
  const d = reading.debrief;
  const end = d.status === "agreement"
    ? t.reading.endAgreement.replace("{deal}", d.deal_text)
    : d.status === "breakdown" ? t.reading.endBreakdown : t.reading.endOpen;
  return (
    <div className="rd-done">
      <Karl state={karlState({ status: d.status, grade: d.grade })}
            name={t.mascot.karl} alt={t.mascot.alt} />
      {/* Подпись обязательна: без неё «F — 17 из 100» рядом со счётом чтения
          читается как ОЦЕНКА ЧИТАТЕЛЯ. Строка та же, что в разборе партии, —
          второй копии одного заголовка в продукте не заводим. */}
      <p className="rd-h">{t.probe.debriefHead}</p>
      <h2 className="rd-tally">
        {t.reading.tally
          .replace("{exact}", String(tally.exact))
          .replace("{near}", String(tally.near))
          .replace("{miss}", String(Math.max(0, tally.asked - tally.exact - tally.near)))}
      </h2>
      <p className="rd-grade">
        {t.reading.grade.replace("{grade}", d.grade).replace("{overall}", String(d.overall))}
      </p>
      <p className="rd-end">{end}</p>
      {reading.missed ? (
        <>
          <h3 className="rd-h">{t.reading.missedHead}</h3>
          <p className="rd-missed">{reading.missed}</p>
        </>
      ) : null}
      {previous ? (
        <Tikhon state="chart" title={t.reading.tikhonTitle}>
          {t.reading.best
            .replace("{n}", String(previous.exact))
            .replace("{total}", String(previous.asked))}
        </Tikhon>
      ) : null}
      <div className="rd-actions">
        {onNext ? <button className="btn primary" onClick={onNext}>{t.reading.nextGame} →</button> : null}
        <button className="btn ghost" onClick={onAgain}>{t.reading.again}</button>
        <button className="btn ghost" onClick={onClose}>{t.reading.close}</button>
      </div>
    </div>
  );
}

export default ReadingScreen;
