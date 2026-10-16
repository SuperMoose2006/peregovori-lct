import {useEffect, useState} from "react";
import type {Lang} from "../types";

export type WaitStage = "judging" | "replying" | "receiving" | "debrief";
/** Deadline for offering an exit, not an estimate of provider completion. */
export const WAIT_LIMIT = {turn: 35, debrief: 12} as const;
export function WaitStatus({stage, lang, onExit}: {stage: WaitStage; lang: Lang; onExit: () => void}) {
  const [elapsed, setElapsed] = useState(0);
  const limit = stage === "debrief" ? WAIT_LIMIT.debrief : WAIT_LIMIT.turn;
  useEffect(() => {
    const began = performance.now();
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - began) / 1000)), 250);
    return () => clearInterval(timer);
  }, []);
  const expired = elapsed >= limit;
  const ru = lang === "ru";
  const labels = ru
    ? {judging: "Оцениваем доводы", replying: "Готовим ответ оппонента", receiving: "Получаем ответ", debrief: "Готовим итоговый разбор"}
    : {judging: "Evaluating your argument", replying: "Preparing the opponent’s reply", receiving: "Waiting for a response", debrief: "Preparing the final review"};
  return <aside className="wait-status" data-wait-stage={stage}>
    <div role="status">{expired
      ? (ru ? "Ответ задерживается. Можно ждать дальше или выйти из этой партии и начать другую." : "The response is delayed. You can keep waiting or leave this negotiation and start another.")
      : labels[stage]}</div>
    {/* Только прошедшее время. Обратный отсчёт «через 34 с предложим выход.
        Это не прогноз готовности ответа» честно оговаривал устройство, но
        читался как техническая сноска (аудит 16.10); выход и так появляется
        сам, когда срок вышел. */}
    <p aria-live="off">{ru ? `Прошло ${elapsed} с.` : `${elapsed}s elapsed.`}</p>
    {expired && <button className="ghost" onClick={onExit}>{ru ? "Выйти и выбрать тренировку" : "Leave and choose a practice"}</button>}
  </aside>;
}
