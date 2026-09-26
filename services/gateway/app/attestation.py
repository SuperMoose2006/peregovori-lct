# AUDIT-DEBT attestation: anonymous attempt only; single HMAC key has no rotation/key_id. Replacing it invalidates old records. See docs/deep-audit-12206/CLEANUP.md.
"""Server-issued evidence of one anonymous exam, not a qualification diploma.

No client score, identity claim or local course progress enters issuance.
HMAC authenticates the canonical record; the persistent registry supplies lookup.
Configuration is explicit: without a signing key AND database, issuance is off.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from app import views
from app.session import store

router = APIRouter(prefix="/api/attestations", tags=["attestation"])
_ID = re.compile(r"att_[0-9a-f]{32}\Z")


def _config() -> tuple[bytes, Path] | None:
    key = os.getenv("NEGO_ATTESTATION_KEY", "")
    path = Path(os.getenv("NEGO_ATTESTATION_DB", ""))
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key) or not path.is_absolute():
        return None
    return bytes.fromhex(key), path


def _canonical(record: dict) -> str:
    return json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _signature(key: bytes, raw: str) -> str:
    return hmac.new(key, b"dialog-attestation-v1\0" + raw.encode(), hashlib.sha256).hexdigest()


def issue(session) -> dict | None:
    """Only called from the server's final debrief; idempotent per admitted run."""
    config = _config()
    context = store.context(session.session_id)
    if (not config or not context.get("attestable") or session.game_mode != "exam"
            or context.get("game_mode") != "exam"
            or store.get(session.session_id) is not session.engine_session):
        return None
    result = views.debrief_view(session.engine_session)
    if result.status == "active" or result.grade not in ("A", "B", "C"):
        return None
    key, path = config
    # Registry never exposes the resumable session's bearer token.
    source = hmac.new(key, b"source\0" + session.session_id.encode(), hashlib.sha256).hexdigest()
    with sqlite3.connect(path, timeout=1) as db:
        db.execute("CREATE TABLE IF NOT EXISTS attestations (source TEXT UNIQUE NOT NULL, id TEXT PRIMARY KEY, record TEXT NOT NULL, signature TEXT NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT record, signature FROM attestations WHERE source=?", (source,)).fetchone()
        if row:
            return _checked(row, key)
        record = {
            "id": "att_" + secrets.token_hex(16),
            "version": 1, "scope": "anonymous-single-exam",
            "identity_verified": False,
            "issued_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "scenario_id": session.engine_session.scenario_id,
            "lang": session.engine_session.lang,
            "rubric": "dialog-engine-v1:0.40-economic+0.25-relationship+0.35-technique;grade>=C",
            "grade": result.grade, "overall": result.overall,
            "economic": result.economic, "relationship": result.relationship,
            "technique": result.technique, "status": result.status,
        }
        raw = _canonical(record)
        signature = _signature(key, raw)
        db.execute("INSERT INTO attestations VALUES (?,?,?,?)", (source, record["id"], raw, signature))
        return {"record": record, "signature": signature}


def _checked(row, key: bytes) -> dict:
    raw, signature = row
    if not hmac.compare_digest(_signature(key, raw), signature):
        raise ValueError("invalid attestation signature")
    return {"record": json.loads(raw), "signature": signature}


def lookup(identifier: str) -> dict:
    if not _ID.fullmatch(identifier):
        raise HTTPException(404, "Attestation not found")
    config = _config()
    if not config:
        raise HTTPException(503, "Attestation registry is not configured")
    key, path = config
    if not path.is_file():
        raise HTTPException(404, "Attestation not found")
    try:
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=1) as db:
            row = db.execute("SELECT record, signature FROM attestations WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, "Attestation not found")
        result = _checked(row, key)
        if result["record"]["id"] != identifier:
            raise ValueError("identifier mismatch")
        return result
    except (sqlite3.Error, ValueError, KeyError, TypeError):
        raise HTTPException(503, "Attestation cannot be verified") from None


@router.get("/{identifier}")
def verify(identifier: str):
    return JSONResponse({"valid": True, **lookup(identifier)}, headers={"Cache-Control": "no-store"})


@router.get("/{identifier}/document", response_class=HTMLResponse)
def document(identifier: str):
    signed = lookup(identifier)
    r = signed["record"]
    ru = r["lang"] == "ru"
    title = "Свидетельство о результате экзамена" if ru else "Exam result certificate"
    text = ("Анонимная серверная попытка. Личность не удостоверена. Подтверждает результат одного экзамена тренажёра, не прохождение курса и не квалификацию."
            if ru else "Anonymous server attempt. Identity not verified. Certifies one simulator exam, not course completion or a qualification.")
    esc = lambda value: html.escape(str(value), quote=True)
    # Standalone printable server document; no client-controlled name or date.
    body = f'''<!doctype html><html lang="{esc(r['lang'])}"><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>{title}</title>
<style>body{{font:18px Georgia,serif;max-width:800px;margin:4rem auto;padding:2rem;border:3px double #786338}}dt{{font-weight:bold;margin-top:1rem}}dd{{margin:0;overflow-wrap:anywhere}}small{{overflow-wrap:anywhere}}@media print{{body{{margin:0}}}}</style>
<h1>{title}</h1><p>Диалог / Dialog</p><p>{text}</p>
<dl><dt>ID</dt><dd>{esc(r['id'])}</dd><dt>{'Выдано (UTC)' if ru else 'Issued (UTC)'}</dt><dd>{esc(r['issued_at'])}</dd>
<dt>{'Сценарий' if ru else 'Scenario'}</dt><dd>{esc(r['scenario_id'])}</dd>
<dt>{'Результат' if ru else 'Result'}</dt><dd>{esc(r['grade'])} · {esc(r['overall'])}/100</dd>
<dt>{'Методика' if ru else 'Rubric'}</dt><dd>{esc(r['rubric'])}</dd></dl>
<p><a href="/api/attestations/{esc(identifier)}">{'Проверить в реестре' if ru else 'Verify in registry'}</a></p>
<small>HMAC-SHA256: {esc(signed['signature'])}</small></html>'''
    return HTMLResponse(body, headers={"Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"})
