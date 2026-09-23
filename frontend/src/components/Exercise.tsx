// Exercise.tsx — один пункт курса: показать задание, принять ответ, вынести
// вердикт и объяснить.
//
// ПРАВИЛО ЭКРАНА: объяснение показывается ВСЕГДА — и когда верно, и когда нет.
// Duolingo-подобный тренажёр без разбора превращается в лотерею: человек
// угадывает и не понимает, что именно сработало.
//
// Вердикт считает `lib/courseCheck.ts` тем же движком, что и партия. Здесь нет ни
// одной собственной оценки — компонент только собирает ответ и рисует итог.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../types";
import type { Exercise as Ex, ItemWithId, L } from "../lib/courseTypes";
import {
  faceImage, matchHits, metersOptions, orderHits, reactionOptions,
  shuffledOptions, shuffledRight, startingOrder, type Verdict,
} from "../lib/course";
// Вердикт живёт отдельно от данных курса: он тянет движок-зеркало, а данные —
// нет. Экран задания — единственное место, где нужны оба (см. lib/course.ts).
import { check } from "../lib/courseCheck";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";
import { courseCoach } from "../api/courseCoach";
import { plural } from "../lib/format";
import { Karl } from "./Mascot";
import { Icon } from "./Icon";

interface Props {
  t: Strings;
  lang: Lang;
  ex: Ex;
  /** В экзамене разбор откладывается до конца, а подсказки выключены. */
  exam?: boolean;
  onDone: (correct: boolean, verdict: Verdict) => void;
  /** Капстоун открывается настоящей партией — её запускает родитель. */
  onStartDrill?: (ex: Ex) => void;
}

const say = (v: L | undefined, lang: Lang) => (v ? v[lang] : "");

export function Exercise({ t, lang, ex, exam, onDone, onStartDrill }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  // Стартовая раскладка заведомо не совпадает с ответом — иначе «Проверить»
  // без единого действия засчитывало бы упражнение (см. lib/course.ts).
  const [order, setOrder] = useState<string[]>(() => startingOrder(ex));
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  /** Последняя состоявшаяся пара — текст для живой области «соответствия». */
  const [tied, setTied] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // Комментарий тренера приходит ПОСЛЕ вердикта и никогда его не меняет.
  const [coach, setCoach] = useState<string | null>(null);

  // Варианты показываются перемешанными; ответ сверяется по ПОКАЗАННОМУ индексу,
  // поэтому позиция верного варианта ничего не подсказывает.
  const opts = useMemo(() => shuffledOptions(ex), [ex]);

  const chips = useMemo(
    () => (ex.type === "freeform" && !exam ? previewChips(text) : []),
    [ex.type, exam, text],
  );

  const answer = (): unknown => {
    switch (ex.type) {
      case "choice": case "spot_error": return picked;  // индекс в перемешанном списке
      case "order": return order;
      case "match": return pairs;
      case "numeric": return num.trim() === "" ? null : parseFloat(num.replace(",", "."));
      case "freeform": return text;
      case "reaction": case "meters": case "face": return pick;
      default: return null;
    }
  };

  const ready = (): boolean => {
    switch (ex.type) {
      case "choice": case "spot_error": return picked !== null;
      case "numeric": return num.trim() !== "";
      case "freeform": return text.trim().length > 0;
      case "reaction": case "meters": case "face": return pick !== null;
      case "match": return Object.keys(pairs).length === (ex.left?.length ?? 0);
      default: return true;
    }
  };

  const submit = () => {
    if (verdict) return;
    // Для выбора сверяем с перемешанным индексом верного варианта.
    const v = (ex.type === "choice" || ex.type === "spot_error")
      ? check({ ...ex, answer: opts.answer }, picked, lang)
      : check(ex, answer(), lang);
    setVerdict(v);
    // Звук — часть обратной связи, а не украшение: он приходит раньше, чем глаз
    // находит цветную рамку. Глушится общим переключателем, как всё остальное.
    play(v.ok ? "correct" : "wrong");
    haptic(v.ok ? 12 : 22);
    onDone(v.ok, v);
    // Свободный ответ вне экзамена: просим у бэкенда одну подсказку по смыслу.
    // Ответа может не быть — тогда ничего и не появится.
    if (ex.type === "freeform" && !exam) {
      courseCoach(ex.id, text, lang, v.ok).then((c) => { if (c?.note) setCoach(c.note); });
    }
  };

  const move = (i: number, d: number) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const locked = verdict !== null;

  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const goRef = useRef<HTMLButtonElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  // ПОЧЕМУ ЦИФРЫ ЖИВУТ НА СПИСКЕ, А НЕ НА ОКНЕ. Раньше здесь висел
  // `window.keydown`, и он же перехватывал Enter: `preventDefault()` гасил
  // нажатие на сфокусированной кнопке, поэтому с клавиатуры нельзя было выбрать
  // ничего, кроме первого варианта — второй Enter уже отправлял ответ.
  // Теперь Enter обрабатывает сама кнопка (обычный `onClick`), а цифры 1–4
  // слушает список: односимвольная горячая клавиша, активная только пока фокус
  // внутри компонента, — прямое исключение WCAG 2.1.4. Цифра ещё и переводит
  // фокус на выбранный вариант, иначе следующий Enter выбрал бы не то.
  const onOptsKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (locked) return;
    const n = Number(e.key);
    if (!(n >= 1 && n <= opts.options.length)) return;
    setPicked(n - 1);
    optRefs.current[n - 1]?.focus();
    e.preventDefault();
  };

  // Вердикт забирает фокус: кнопка «Проверить» на этом месте исчезает, и без
  // перевода фокус падал на BODY — рефлекторное «проверил → Enter → дальше»
  // не делало ничего, а следующий Tab уводил в боковой навигатор.
  useEffect(() => {
    if (locked) verdictRef.current?.focus({ preventScroll: true });
  }, [locked]);

  return (
    <div className={`ex ex--${ex.type}${locked ? (verdict!.ok ? " ok" : " bad") : ""}`}>
      <div className="ex-kind">{t.course.types[ex.type]}</div>
      <p className="ex-prompt">{say(ex.prompt, lang)}</p>

      {ex.bad_line ? <blockquote className="ex-quote">«{say(ex.bad_line, lang)}»</blockquote> : null}
      {ex.opponent_line ? <blockquote className="ex-quote">«{say(ex.opponent_line, lang)}»</blockquote> : null}
      {ex.type === "reaction" && ex.player_line ? (
        <blockquote className="ex-quote mine">«{say(ex.player_line, lang)}»</blockquote>
      ) : null}
      {ex.type === "meters" ? (
        <>
          <div className="ex-state">
            {(["trust", "tension", "info", "leverage"] as const).map((k) => (
              <span key={k}><b>{t.course.meters[k]}</b> {ex.state?.[k]}</span>
            ))}
          </div>
          <blockquote className="ex-quote mine">«{say(ex.player_line, lang)}»</blockquote>
        </>
      ) : null}

      {/* ---- варианты ---- */}
      {(ex.type === "choice" || ex.type === "spot_error") ? (
        <>
        {/* Подсказка про цифры сказана словами, а не только нарисована номерами:
            номер помечен aria-hidden, и без этой строки о клавишах знал бы
            только зрячий. */}
        {!locked ? <p className="ex-hint">{t.course.optKeys}</p> : null}
        {/* Ни `listbox`, ни `option`: между ними стоял `li`, связь «владеет»
            была разорвана, а каждый «вариант» всё равно оставался отдельной
            остановкой Tab — то есть роль обещала клавиатурную модель, которой
            не было. Обычные кнопки с `aria-pressed` не обещают ничего лишнего. */}
        <ul className="ex-opts" aria-label={say(ex.prompt, lang)} onKeyDown={onOptsKey}>
          {opts.options.map((o, i) => {
            const right = locked && i === opts.answer;
            const wrong = locked && i === picked && i !== opts.answer;
            return (
              <li key={i}>
                <button
                  ref={(el) => { optRefs.current[i] = el; }}
                  className={`ex-opt${picked === i ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}`}
                  onClick={() => !locked && setPicked(i)}
                  disabled={locked}
                  aria-pressed={picked === i}
                >
                  {/* Номер — и подсказка про клавиши, и опора для взгляда:
                      «второй» проще держать в голове, чем полстроки текста. */}
                  <span className="ex-num-k" aria-hidden="true">{i + 1}</span>
                  {say(o as L, lang)}
                </button>
              </li>
            );
          })}
        </ul>
        </>
      ) : null}

      {/* «Прочитай лицо»: та же картинка состояния, что показывает оппонент в
          партии. Мимики здесь не изобретают — это ровно тот кадр, который движок
          выбирает своей реакцией, поэтому ответ проверяем, а не «на глаз». */}
      {ex.type === "face" && faceImage(ex) ? (
        <div className="ex-face">
          {/* Подпись НЕ описывает выражение: картинка выводится из ответа, и
              описание стало бы подсказкой. Но и пустая alt не годится — тогда
              для экранного диктора задание пустое, а картинка здесь и есть
              вопрос. Называем, что это, не называя ответа. */}
          <img src={faceImage(ex)!} alt={t.course.faceAlt} width={200} height={200} />
        </div>
      ) : null}

      {(ex.type === "reaction" || ex.type === "meters" || ex.type === "face") ? (
        <ul className="ex-opts row">
          {(ex.type === "meters" ? metersOptions(ex) : reactionOptions(ex)).map((o) => {
            const label = ex.type === "meters"
              ? (t.course.meters as Record<string, string>)[o] ?? o
              // Ярлыки реакций берём из слоя «Читай лицо»: один словарь на
              // урок, задание и подпись под портретом в партии.
              : t.probe.reactions[o] ?? o;
            const right = locked && o === ex.answer;
            const wrong = locked && o === pick && o !== ex.answer;
            return (
              <li key={o}>
                <button
                  className={`ex-opt${pick === o ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}`}
                  onClick={() => !locked && setPick(o)}
                  disabled={locked}
                  aria-pressed={pick === o}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {ex.type === "order" ? (
        <ol className="ex-order">
          {order.map((id, i) => {
            const item = (ex.items ?? []).find((x) => x.id === id) as ItemWithId;
            const right = locked && (ex.answer as string[])[i] === id;
            return (
              <li key={id} className={locked ? (right ? "right" : "wrong") : ""}>
                <span className="ex-ord-n">{i + 1}</span>
                <span className="ex-ord-t">{say(item, lang)}</span>
                <span className="ex-ord-btns">
                  {/* Имя кнопки называет и действие, и ЧТО двигают: «↑» диктору
                      ничего не говорит, а пять одинаковых стрелок подряд —
                      тем более. Сам знак помечен aria-hidden. */}
                  <button onClick={() => !locked && move(i, -1)} disabled={locked || i === 0}
                          aria-label={t.course.moveUp.replace("{item}", say(item, lang))}>
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button onClick={() => !locked && move(i, 1)} disabled={locked || i === order.length - 1}
                          aria-label={t.course.moveDown.replace("{item}", say(item, lang))}>
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {ex.type === "match" ? (
        <>
        <p className="ex-hint">{t.course.matchHint}</p>
        <div className="ex-match">
          <ul>
            {(ex.left ?? []).map((l) => (
              <li key={l.id}>
                <button
                  ref={(el) => { leftRefs.current[l.id] = el; }}
                  className={`ex-opt${activeLeft === l.id ? " on" : ""}${pairs[l.id] ? " tied" : ""}${
                    locked ? ((ex.answer as Record<string, string>)[l.id] === pairs[l.id] ? " right" : " wrong") : ""}`}
                  onClick={() => !locked && setActiveLeft(l.id)}
                  disabled={locked}
                  aria-pressed={activeLeft === l.id}
                >
                  {say(l, lang)}
                  {pairs[l.id] ? (
                    <em>→ {say((ex.right ?? []).find((r) => r.id === pairs[l.id]), lang)}</em>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <ul>
            {shuffledRight(ex).map((r) => (
              <li key={r.id}>
                <button
                  className="ex-opt"
                  disabled={locked || !activeLeft}
                  onClick={() => {
                    if (!activeLeft) return;
                    const left = activeLeft;
                    const next = { ...pairs, [left]: r.id };
                    setPairs(next);
                    setActiveLeft(null);
                    setTied(`${say((ex.left ?? []).find((x) => x.id === left), lang)} → ${say(r, lang)}`);
                    // Правый столбец целиком выключается тем же кликом, включая
                    // кнопку под фокусом, — и фокус падал на BODY, а следующий
                    // Tab уводил в боковой навигатор. Ведём его туда, где ход:
                    // следующая несвязанная строка слева, а когда пар не
                    // осталось — кнопка «Проверить».
                    const rest = (ex.left ?? []).find((x) => !next[x.id]);
                    requestAnimationFrame(() => {
                      if (rest) leftRefs.current[rest.id]?.focus({ preventScroll: true });
                      else goRef.current?.focus({ preventScroll: true });
                    });
                  }}
                >
                  {say(r, lang)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* Связь состоялась — об этом надо сказать вслух: на экране она видна
            стрелкой внутри левой кнопки, а диктору — ничем. */}
        <p className="sr-only" role="status" aria-live="polite">{tied}</p>
        </>
      ) : null}

      {ex.type === "numeric" ? (
        <div className="ex-num">
          <input
            inputMode="decimal"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            // Enter проверяет: числовой ответ — это одно число, тянуться мышью
            // к кнопке после каждого задания незачем.
            onKeyDown={(e) => { if (e.key === "Enter" && ready()) submit(); }}
            disabled={locked}
            placeholder="0"
            aria-label={say(ex.prompt, lang)}
          />
          <span>{say(ex.unit, lang)}</span>
        </div>
      ) : null}

      {ex.type === "freeform" ? (
        <div className="ex-free">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            // Ctrl/⌘+Enter — как в композере партии: обычный Enter в свободном
            // ответе нужен для переноса строки.
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ready()) submit();
            }}
            disabled={locked}
            rows={3}
            placeholder={t.course.freeformHint}
          />
          {chips.length ? (
            <div className="ex-chips">
              {chips.map((c, i) => <span key={i} className={`tag ${c.key}`}>{c.label}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {ex.type === "drill" ? (
        <div className="ex-drill">
          <p className="ex-goal"><Icon name="flag" /> {say(ex.goal, lang)}</p>
          {/* СРОК, А НЕ ДЛИНА ПАРТИИ. Здесь стояло «настоящая партия на 6
              ходов», и это было четвёртое состояние: бюджет хода капстоуна
              никуда не передаётся (`App.startDrill` открывает обычную партию
              практики), поэтому стол выдаёт свои двенадцать ходов и рисует
              «1 из 12» — рядом с обещанием шести. Шесть — это не бюджет стола, а
              СРОК цели: `checkDrill` заваливает капстоун при `turn > max_turns`,
              и ровно это здесь и написано. Строка собирается из числа и формы
              слова, а не из готового предложения: обе половины уже билингвальны
              (`t.forms.turns`), и второму источнику правды взяться неоткуда. */}
          <p className="ex-goal-n">⏱ ≤ {ex.max_turns ?? 6} {plural(ex.max_turns ?? 6, t.forms.turns)}</p>
          <button className="btn primary" onClick={() => onStartDrill?.(ex)}>{t.course.drillStart}</button>
        </div>
      ) : null}

      {/* ---- итог ---- */}
      {ex.type !== "drill" ? (
        locked ? (
          // Вердикт объявляет себя ДВАЖДЫ, и это не дублирование, а разделение
          // труда. Сам вердикт объявляется переводом фокуса (см. эффект выше):
          // живая область, которая появляется на экране ЦЕЛИКОМ, дикторами
          // обычно молчит — она обязана существовать до того, как в ней что-то
          // изменится. А вот комментарий тренера приходит позже и в уже
          // существующую область — его объявляет именно `aria-live`.
          <div ref={verdictRef} tabIndex={-1}
               className={`ex-verdict ${verdict!.ok ? "ok" : "bad"}`} role="status" aria-live="polite">
            <b>{verdict!.ok ? t.course.correct : t.course.wrong}</b>
            {/* ЧАСТИЧНЫЙ ЗАЧЁТ. «Неверно» без подробностей ничему не учит, когда
                из пяти шагов четыре стоят правильно. Считалки были написаны с
                обеих сторон — и на сервере, и здесь — и не использовались нигде. */}
            {!verdict!.ok && (ex.type === "order" || ex.type === "match") ? (
              <p className="ex-hits">{t.course.hits
                .replace("{n}", String(ex.type === "order"
                  ? orderHits(ex, order)
                  : matchHits(ex, pairs)))
                .replace("{total}", String(ex.type === "order"
                  ? (ex.answer as string[]).length
                  : Object.keys(ex.answer as Record<string, string>).length))}</p>
            ) : null}
            {!verdict!.ok && verdict!.reasons.length ? (
              <ul className="ex-why">
                {verdict!.reasons.map((r) => <li key={r}>{reasonLabel(t, r)}</li>)}
              </ul>
            ) : null}
            {!exam ? (
              <>
                <p className="ex-explain">{say(ex.explain, lang)}</p>
                {ex.reference && ex.type === "freeform" ? (
                  <p className="ex-ref"><b>{t.course.reference}:</b> «{say(ex.reference, lang)}»</p>
                ) : null}
                {/* Карточка тренера появляется только когда ИИ реально ответил.
                    Подпись честная: зачёт — движок, комментарий — тренер. */}
                {coach ? (
                  <div className="ex-coach">
                    <Karl state="think" line={coach} name={t.mascot.karl} compact />
                    <span className="ex-coach-n">{t.course.coachNote}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <button ref={goRef} className="btn primary ex-go" onClick={submit} disabled={!ready()}>
            {t.course.checkIt}
          </button>
        )
      ) : null}
    </div>
  );
}

/** Причина отказа — закрытый словарь ключей, а не сырой текст движка. */
function reasonLabel(t: Strings, reason: string): string {
  const [kind, arg] = reason.split(":");
  const moveName = (m: string) => (t.course.moves as Record<string, string>)[m] ?? m;
  switch (kind) {
    case "missing": return t.course.why.missing.replace("{move}", moveName(arg));
    case "missing_any": return t.course.why.missingAny.replace("{moves}", arg.split("|").map(moveName).join(" / "));
    case "forbidden": return t.course.why.forbidden.replace("{move}", moveName(arg));
    case "missing_term": return t.course.why.missingTerm;
    case "too_short": return t.course.why.tooShort;
    case "weak_argument": return t.course.why.weak;
    case "no_number": return t.course.why.noNumber;
    default: return t.course.why.generic;
  }
}
