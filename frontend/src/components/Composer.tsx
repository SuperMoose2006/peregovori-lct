// Composer.tsx — message composer: textarea with live technique preview,
// quick-move chips, hint button, send.
//
// Чипа-затравки «Спросите, что для них важно →» здесь больше нет. Он предлагал
// ровно тот же вопрос, что и первая строка карточки «Стол накрыт», стоявшей
// сантиметром выше: на первом ходу их было двое, и это была одна подсказка,
// сказанная дважды. Правило — одна подсказка на ход.
import { useEffect, useRef, useState } from "react";
import type { QuickMove } from "../i18n";
import { plural } from "../lib/format";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";
import { MAX_INPUT, clampInput, inputRemaining, showInputNote } from "../lib/net";
import { Icon } from "./Icon";

interface Props {
  disabled: boolean;
  /** Stronger than `disabled`. `disabled` only stops SENDING — typing ahead while
   *  the opponent replies is deliberate. `blocked` also stops composing, for the
   *  one case where the player genuinely must do something else first (answering
   *  the "read her face" question). */
  blocked?: boolean;
  placeholder: string;
  quickMoves: QuickMove[];
  onSend: (text: string) => boolean | void;
  onHint: () => void;
  hintEnabled: boolean;
  /** Имя кнопки подсказки для диктора: сам значок помечен aria-hidden. */
  hintLabel: string;
  /** Имя кнопки отправки. Тоже строка из словаря, а не английское «send»:
   *  aria-label — пользовательский контент, и русский диктор читал «сенд». */
  sendLabel: string;
  // showChips=false (exam mode) suppresses the live technique preview so the
  // player gets no read on how their line is being classified.
  showChips: boolean;
  // gentle "N chars left" note as the input nears the cap — "{n}" substituted.
  limitNote: string;
  /** Формы «символ/символа/символов» — подпись обязана согласоваться с числом. */
  charForms: [string, string, string];
  // Externally-supplied text to drop into the box (the coach's worked example).
  // Keyed by a nonce, not by the text, so tapping the same suggestion twice
  // still re-fills after the player has edited or cleared it.
  prefill?: { text: string; nonce: number };
}

export function Composer({
  disabled, blocked, placeholder, quickMoves, onSend, onHint, hintEnabled, hintLabel, sendLabel, showChips, limitNote, charForms, prefill,
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chips = showChips ? previewChips(text) : [];
  const nearLimit = showInputNote(text);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled || blocked) return;
    if (onSend(t) === false) return;
    // Soft send cue + a light haptic tap. This is also a genuine user gesture,
    // so it doubles as the first chance to unlock the AudioContext.
    play("send");
    haptic();
    setText("");
  };

  // Chips are sentence STARTERS: seed the box with the stem and hand the player
  // the caret at the end so they finish the thought (never a complete move).
  const insertStem = (stem: string) => {
    if (blocked) return;
    setText(stem);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  useEffect(() => {
    if (prefill?.text) insertStem(prefill.text);
    // Only the nonce drives this: re-filling on text identity would fight the
    // player's edits on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  return (
    <div className="compose">
      {showChips ? (
        <div className="live">
          {chips.map((c, i) => (
            <span className={`tag ${c.key}`} key={i}>
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="crow">
        <textarea
          ref={taRef}
          rows={2}
          value={text}
          maxLength={MAX_INPUT}
          disabled={blocked}
          placeholder={placeholder}
          // Cap defensively even if maxLength is bypassed (paste, IME, autofill).
          onChange={(e) => setText(clampInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send" onClick={submit} disabled={disabled || blocked || !text.trim()} aria-label={sendLabel}>
          ➤
        </button>
      </div>
      {nearLimit ? (
        <div className="compose-note" role="status">
          {limitNote.replace("{n}", String(inputRemaining(text)))
            .replace("{form}", plural(inputRemaining(text), charForms))}
        </div>
      ) : null}
      <div className="quick">
        {hintEnabled ? (
          <button onClick={onHint} disabled={disabled || blocked} aria-label={hintLabel} title={hintLabel}>
            <span aria-hidden="true"><Icon name="bulb" /></span>
          </button>
        ) : null}
        {quickMoves.map((q, i) => (
          <button key={i} onClick={() => insertStem(q.text)} disabled={blocked}>
            <Icon name={q.icon} /> {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
