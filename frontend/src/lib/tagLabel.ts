// tagLabel.ts — localize a move tag from its stable `key`.
//
// Both engines hardcode their tag labels in ONE language: the Python engine in
// English (`techniques.py`), the offline mock in Russian (`mock/engine.ts`). So
// whichever one you played, half the interface was in the wrong language. The
// key is the stable part of the contract, so the client localizes from that and
// keeps the engine's own string only as a fallback for keys it doesn't know.
import type { Analysis, Tag } from "../types";
import type { Strings } from "../i18n";

export type TagLabels = Strings["tagLabels"];

export function tagText(t: Tag, analysis: Analysis, labels: TagLabels): string {
  // The `spin` key covers four SPIN stages plus a plain open question, so the
  // stage on the analysis picks between them.
  if (t.key === "spin") {
    switch (analysis.spin) {
      case "situation": return labels.spinSituation;
      case "problem": return labels.spinProblem;
      case "implication": return labels.spinImplication;
      case "need-payoff": return labels.spinNeedPayoff;
      default: return labels.question;
    }
  }
  return labels[t.key as keyof TagLabels] ?? t.label;
}
