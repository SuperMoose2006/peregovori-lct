// Composer.tsx — message composer: textarea with live technique preview,
// quick-move chips, hint button, send.
import { useState } from "react";
import type { QuickMove } from "../i18n";
import { previewChips } from "../lib/techniques";

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
}

export function Composer({
  disabled, placeholder, quickMoves, onSend, onHint, hintEnabled, showChips,
}: Props) {
  const [text, setText] = useState("");
  const chips = showChips ? previewChips(text) : [];

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
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
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
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
      <div className="quick">
        {hintEnabled ? (
          <button onClick={onHint} disabled={disabled}>
            💡
          </button>
        ) : null}
        {quickMoves.map((q, i) => (
          <button key={i} onClick={() => setText(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
