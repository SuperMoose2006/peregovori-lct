// Composer.tsx — message composer: textarea with live technique preview,
// quick-move chips, hint button, send.
import { useRef, useState } from "react";
import type { QuickMove } from "../i18n";
import { previewChips } from "../lib/techniques";
import { haptic, play } from "../lib/sound";
import { MAX_INPUT, clampInput, inputRemaining, showInputNote } from "../lib/net";

interface Props {
  disabled: boolean;
  placeholder: string;
  quickMoves: QuickMove[];
  onSend: (text: string) => void;
  onHint: () => void;
  hintEnabled: boolean;
  // showChips=false (exam mode) suppresses the live technique preview so the
  // player gets no read on how their line is being classified.
  showChips: boolean;
  // gentle "N chars left" note as the input nears the cap — "{n}" substituted.
  limitNote: string;
}

export function Composer({
  disabled, placeholder, quickMoves, onSend, onHint, hintEnabled, showChips, limitNote,
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
          {limitNote.replace("{n}", String(inputRemaining(text)))}
        </div>
      ) : null}
      <div className="quick">
        {hintEnabled ? (
          <button onClick={onHint} disabled={disabled}>
            💡
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
