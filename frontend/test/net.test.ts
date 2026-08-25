// net.test.ts — the pure resilience helpers behind the three async seams:
// reconnect backoff/cap, the custom-generation timeout state machine, and the
// composer input-length guard. Browser-free, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECONNECT_ATTEMPTS,
  GEN_TIMEOUT_MS,
  MAX_INPUT,
  INPUT_NOTE_AT,
  reconnectDelay,
  canReconnect,
  genReducer,
  clampInput,
  inputRemaining,
  showInputNote,
  type GenPhase,
} from "../src/lib/net";

// ---- reconnect backoff -----------------------------------------------------
// Числа сверены с ТЕМ, ЧТО РАБОТАЕТ: раньше эти тесты проверяли базу 500 мс и
// три попытки, а realtime-session.ts переподключался с базой 400 и делал четыре
// — политика жила в двух местах и разошлась. Теперь она одна, здесь.
test("reconnectDelay is exponential and capped", () => {
  assert.equal(reconnectDelay(1), 400);
  assert.equal(reconnectDelay(2), 800);
  assert.equal(reconnectDelay(3), 1600);
  assert.equal(reconnectDelay(4), 3200);
  // Cap holds beyond the retry budget.
  assert.equal(reconnectDelay(5), 4000);
  assert.equal(reconnectDelay(10), 4000);
});

test("reconnectDelay is monotonic non-decreasing and floors junk input", () => {
  for (let a = 1; a < 12; a++) {
    assert.ok(reconnectDelay(a + 1) >= reconnectDelay(a), `attempt ${a}`);
  }
  // Defensive against sub-1 / fractional attempts.
  assert.equal(reconnectDelay(0), 400);
  assert.equal(reconnectDelay(-5), 400);
  assert.equal(reconnectDelay(2.9), 800);
});

test("canReconnect allows exactly MAX attempts then gives up", () => {
  for (let a = 1; a <= MAX_RECONNECT_ATTEMPTS; a++) {
    assert.equal(canReconnect(a), true, `attempt ${a} within budget`);
  }
  assert.equal(canReconnect(MAX_RECONNECT_ATTEMPTS + 1), false);
  assert.ok(MAX_RECONNECT_ATTEMPTS >= 2, "at least a couple of retries");
});

// ---- custom-generation state machine ---------------------------------------
test("genReducer: start → generating → ready on greeting", () => {
  let p: GenPhase = "idle";
  p = genReducer(p, "start");
  assert.equal(p, "generating");
  p = genReducer(p, "greeting");
  assert.equal(p, "ready");
});

test("genReducer: a server error while generating fails", () => {
  const p = genReducer("generating", "error");
  assert.equal(p, "failed");
});

test("genReducer: the client timeout fails only a live generation", () => {
  assert.equal(genReducer("generating", "timeout"), "failed");
  // A timeout that fires after we already resolved must not clobber the outcome.
  assert.equal(genReducer("ready", "timeout"), "ready");
  assert.equal(genReducer("failed", "timeout"), "failed");
  assert.equal(genReducer("idle", "timeout"), "idle");
});

test("genReducer: a late greeting/error after resolve is ignored (race guard)", () => {
  // Backend greeting arriving just after the client timed out must not yank a
  // failed screen back into a game (or vice-versa).
  assert.equal(genReducer("failed", "greeting"), "failed");
  assert.equal(genReducer("ready", "error"), "ready");
});

test("genReducer: reset always returns to idle", () => {
  for (const from of ["idle", "generating", "ready", "failed"] as GenPhase[]) {
    assert.equal(genReducer(from, "reset"), "idle", `from ${from}`);
  }
});

test("genReducer: retry re-enters generating from a failed state", () => {
  assert.equal(genReducer("failed", "start"), "generating");
});

test("GEN_TIMEOUT_MS is a sane upper bound for the ~25s backend", () => {
  assert.ok(GEN_TIMEOUT_MS > 25000, "must exceed the observed backend latency");
  assert.ok(GEN_TIMEOUT_MS <= 60000, "but not so long it feels hung");
});

// ---- input-length guard ----------------------------------------------------
test("clampInput caps at MAX_INPUT and leaves short text untouched", () => {
  assert.equal(clampInput("hello"), "hello");
  const long = "x".repeat(MAX_INPUT + 500);
  assert.equal(clampInput(long).length, MAX_INPUT);
  assert.equal(clampInput("x".repeat(MAX_INPUT)).length, MAX_INPUT);
  // Custom cap for coverage.
  assert.equal(clampInput("abcdef", 3), "abc");
});

test("inputRemaining and showInputNote track the cap threshold", () => {
  assert.equal(inputRemaining("abc"), MAX_INPUT - 3);
  assert.equal(showInputNote("x".repeat(INPUT_NOTE_AT - 1)), false);
  assert.equal(showInputNote("x".repeat(INPUT_NOTE_AT)), true);
  assert.ok(INPUT_NOTE_AT < MAX_INPUT, "the note appears before the hard cap");
});
