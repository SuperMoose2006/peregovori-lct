// Composer.tsx — message composer: textarea with live technique preview,
// quick-move chips, hint button, send.
import { useEffect, useRef, useState } from "react";
import type { QuickMove } from "../i18n";
import { plural } from "../lib/format";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";
import { MAX_INPUT, clampInput, inputRemaining, showInputNote } from "../lib/net";

interface Props {
  disabled: boolean;
  /** Stronger than `disabled`. `disabled` only stops SENDING — typing ahead while
   *  the opponent replies is deliberate. `blocked` also stops composing, for the
   *  one case where the player genuinely must do something else first (answering
   *  the "read her face" question). */
  blocked?: boolean;
  placeholder: string;
  quickMoves: QuickMove[];
  onSend: (text: string) => void;
  onHint: () => void;
  hintEnabled: boolean;
  /** Имя кнопки подсказки для диктора: сам значок 💡 помечен aria-hidden. */
  hintLabel: string;
  // showChips=false (exam mode) suppresses the live technique preview so the
  // player gets no read on how their line is being classified.
  showChips: boolean;
  // gentle "N chars left" note as the input nears the cap — "{n}" substituted.
  limitNote: string;
  /** Формы «символ/символа/символов» — подпись обязана согласоваться с числом. */
  charForms: [string, string, string];
  // Turn-1 opener: a single tappable chip that pre-fills (never sends) an
  // interest-probing SPIN opener. Provided only on the very first move; hidden
  // here the moment the box is non-empty. Absent ⇒ no chip.
  suggestion?: { label: string; fill: string };
  // Externally-supplied text to drop into the box (the coach's worked example).
  // Keyed by a nonce, not by the text, so tapping the same suggestion twice
  // still re-fills after the player has edited or cleared it.
  prefill?: { text: string; nonce: number };
}

export function Composer({
  disabled, blocked, placeholder, quickMoves, onSend, onHint, hintEnabled, hintLabel, showChips, limitNote, charForms, suggestion, prefill,
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chips = showChips ? previewChips(text) : [];
  const nearLimit = showInputNote(text);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    // Soft send cue + a light haptic tap. This is also a genuine user gesture,
    // so it doubles as the first chance to unlock the AudioContext.
    play("send");
    haptic();
    onSend(t);
    setText("");
  };

  // Chips are sentence STARTERS: seed the box with the stem and hand the player
  // the caret at the end so they finish the thought (never a complete move).
  const insertStem = (stem: string) => {
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

  // The opener chip earns its place only before the player has typed anything —
  // it de-blanks the first move, then yields the moment they start writing.
  const showSuggestion = !!suggestion && text.trim() === "" && !disabled;

  return (
    <div className="compose">
      {showSuggestion && suggestion ? (
        <div className="suggest">
          <button
            type="button"
            className="suggest-chip"
            onClick={() => insertStem(suggestion.fill)}
          >
            {suggestion.label}
          </button>
        </div>
      ) : null}
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send" onClick={submit} disabled={disabled || !text.trim()} aria-label="send">
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
          <button onClick={onHint} disabled={disabled} aria-label={hintLabel} title={hintLabel}>
            <span aria-hidden="true">💡</span>
          </button>
        ) : null}
        {quickMoves.map((q, i) => (
          <button key={i} onClick={() => insertStem(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
