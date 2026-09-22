import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "../api/backend";
import type { Lang } from "../types";

export interface Attestation {
  record: { id: string; issued_at: string; grade: string; overall: number };
  signature: string;
}

export function ServerCertificate({ evidence, lang }: { evidence?: Attestation | null; lang: Lang }) {
  const [verified, setVerified] = useState<Attestation | null>(null);
  const id = evidence?.record?.id;
  useEffect(() => {
    setVerified(null);
    if (!id || !/^att_[0-9a-f]{32}$/.test(id)) return;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    apiFetch(`/api/attestations/${id}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async r => {
        if (!r.ok) return;
        const data = await r.json();
        if (!ctrl.signal.aborted && data.valid === true && data.record?.id === id
            && typeof data.signature === "string") setVerified(data);
      }).catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { ctrl.abort(); clearTimeout(timeout); };
  }, [id]);
  // Never display a previous run's evidence while its replacement is loading.
  const current = verified?.record.id === id ? verified : null;
  return <section className="cert-server" aria-live="polite">
    <p>{lang === "ru"
      ? "Серверная аттестация: одна анонимная экзаменационная попытка. Личность не удостоверена."
      : "Server attestation: one anonymous exam attempt. Identity is not verified."}</p>
    {current ? <>
      <p>{current.record.grade} · {current.record.overall}/100 · <time>{current.record.issued_at}</time></p>
      <p>ID: <code>{current.record.id}</code></p>
      <a href={apiUrl(`/api/attestations/${current.record.id}/document`)} target="_blank" rel="noreferrer">
        {lang === "ru" ? "Открыть проверенное свидетельство для печати" : "Open verified certificate for printing"}
      </a>
    </> : <p>{lang === "ru"
      ? "Подписанное свидетельство не подтверждено серверным реестром. Учебный результат сохранён отдельно."
      : "A signed certificate has not been confirmed by the server registry. The practice result is recorded separately."}</p>}
  </section>;
}
