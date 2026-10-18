import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ServerCertificate} from "../src/components/ServerCertificate";
import {I18N} from "../src/i18n";

test("client-supplied evidence cannot render a verified document link", () => {
  for (const lang of ["ru", "en"] as const) {
    const html = renderToStaticMarkup(createElement(ServerCertificate, {lang, evidence: {
      record: {id: "att_" + "a".repeat(32), grade: "A", overall: 100, issued_at: "2099-01-01"}, signature: "forged",
    }}));
    assert.doesNotMatch(html, /<a |2099|100\/100/);
    assert.match(html, lang === "ru" ? /не подтверждено/ : /not been confirmed/);
    assert.match(I18N[lang].exam.certifies, lang === "ru" ? /личность не удостоверены/ : /neither qualification nor identity/);
  }
});

test("a server without attestation says so instead of «not confirmed»", () => {
  // Аудит 17.10, F07: стенд без ключа писал «не подтверждено серверным
  // реестром» за сданный экзамен. Теперь — «не включена», и даже присланное
  // свидетельство не превращается в ссылку.
  for (const lang of ["ru", "en"] as const) {
    const html = renderToStaticMarkup(createElement(ServerCertificate, {lang, enabled: false, evidence: {
      record: {id: "att_" + "a".repeat(32), grade: "A", overall: 100, issued_at: "2099-01-01"}, signature: "forged",
    }}));
    assert.match(html, lang === "ru" ? /не выдаются/ : /not issued in this version/);
    assert.doesNotMatch(html, /не подтверждено|not been confirmed|<a |2099/);
  }
});
