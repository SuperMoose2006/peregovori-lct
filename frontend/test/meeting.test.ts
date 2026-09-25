// meeting.test.ts — когда включается встреча и что рисует лицо.
import test from "node:test";
import assert from "node:assert/strict";
import { meetingMode, meetingStatus, syntheticFace } from "../src/lib/meeting";
import { faceRenderer, pickFaceSource, type FaceInputs } from "../src/lib/faceSource";
import { NO_LAYERS } from "../src/lib/layers";
import type { Mode } from "../src/types";

const voice = { ...NO_LAYERS, voice: true, avatar: true };
const speech = { speech: true };

test("встреча — только тренировка с голосом и настоящим синтезом", () => {
  assert.equal(meetingMode({ mode: "practice", layers: voice, capabilities: speech }), true);
  for (const mode of ["exam", "drill", "campaign", "custom"] as Mode[]) {
    assert.equal(meetingMode({ mode, layers: voice, capabilities: speech }), false,
      `${mode}: слои здесь погашены — встречи быть не может`);
  }
  assert.equal(meetingMode({ mode: "practice", layers: NO_LAYERS, capabilities: speech }), false);
  // Голос просили, а синтеза нет: большая немая картинка — запрещённое состояние.
  assert.equal(meetingMode({ mode: "practice", layers: voice, capabilities: { speech: false } }), false);
  assert.equal(meetingMode({ mode: "practice", layers: voice, capabilities: {} }), false);
  assert.equal(meetingMode({ mode: "practice", layers: voice, capabilities: null }), false);
});

test("стенд узнаётся только по явному флагу сервера", () => {
  assert.equal(syntheticFace({ avatar: { synthetic: true } }), true);
  assert.equal(syntheticFace({ avatar: { synthetic: "yes" } }), false);
  assert.equal(syntheticFace({ avatar: {} }), false);
  assert.equal(syntheticFace(null), false);
});

test("строка состояния: связь важнее речи, речь важнее ожидания", () => {
  const base = { conn: "online" as const, oppSpeaking: false, userSpeaking: false, busy: false };
  assert.equal(meetingStatus(base), "listening");
  assert.equal(meetingStatus({ ...base, busy: true }), "thinking");
  assert.equal(meetingStatus({ ...base, busy: true, userSpeaking: true }), "hearing");
  assert.equal(meetingStatus({ ...base, busy: true, userSpeaking: true, oppSpeaking: true }), "speaking");
  assert.equal(meetingStatus({ ...base, oppSpeaking: true, conn: "reconnecting" }), "reconnecting");
  assert.equal(meetingStatus({ ...base, conn: "lost" }), "lost");
});

test("режим лица читается из capabilities", () => {
  assert.equal(faceRenderer({ avatar: { lipsync_mode: "video" } }), "video");
  assert.equal(faceRenderer({ avatar: { lipsync_mode: "amplitude" } }), "amplitude");
  assert.equal(faceRenderer({ avatar: { lipsync_mode: "none" } }), "portrait");
  assert.equal(faceRenderer(null), "portrait");
});

const face = (over: Partial<FaceInputs>): FaceInputs => ({
  renderer: "portrait", exam: false, reducedMotion: false, hasFrame: false,
  stillFailed: false, loopFailed: false, ...over,
});

test("видео: между кадрами — портрет того же человека, не рисованная замена", () => {
  assert.equal(pickFaceSource(face({ renderer: "video", hasFrame: true })), "frame");
  assert.equal(pickFaceSource(face({ renderer: "video", hasFrame: false })), "still");
  // Рисованный портрет — только когда картинки персонажа нет вовсе.
  assert.equal(pickFaceSource(face({ renderer: "video", stillFailed: true })), "drawn");
});

test("экзамен: неподвижный нейтральный портрет при любом режиме", () => {
  for (const renderer of ["portrait", "amplitude", "video"] as const) {
    assert.equal(pickFaceSource(face({ renderer, exam: true, hasFrame: true })), "still");
  }
});

test("портрет: ролик только без reduced-motion и пока он грузится", () => {
  assert.equal(pickFaceSource(face({})), "loop");
  assert.equal(pickFaceSource(face({ reducedMotion: true })), "still");
  assert.equal(pickFaceSource(face({ loopFailed: true })), "still");
  assert.equal(pickFaceSource(face({ renderer: "amplitude" })), "drawn");
});
