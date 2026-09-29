import test from "node:test";
import assert from "node:assert/strict";
import { RealtimeTransport } from "../src/realtime/transport";
import { MediaProvider } from "../src/realtime/vendor/media-provider";
import { AudioPlayer } from "../src/realtime/vendor/audio-player";
import { reduce } from "../src/api/useNegotiation";

test("TTS failure is visible but cannot release a still-streaming turn", () => {
  const messages: any[] = [];
  const transport: any = new RealtimeTransport(e => messages.push(e), () => {});
  transport.live = true;
  transport.route({type: "error", error: {code: "tts_unavailable", message: "Speech failed"}});
  const before: any = {busy: true, phase: "opponent", log: []};
  const after = reduce(before, messages[0], () => 1);
  assert.equal(after.busy, true);
  assert.equal(after.phase, "opponent");
  assert.equal((after.log[0] as any).text, "Speech failed");
  transport.route({type: "error", error: {code: "asr_unavailable", message: "Retry or type"}});
  assert.equal(reduce(before, messages[1], () => 2).busy, false);
});

test("ASR configuration stays out of the chat; unavailable input does not disable TTS or record audio", async () => {
  const events: any[] = [];
  const transport: any = new RealtimeTransport(e => events.push(e), () => {});
  transport.voiceWanted = true;
  transport.honourServerCapabilities({microphone: false, asr: "parakeet; fallback: text"});
  assert.ok(!events.some(e => e.type === "notice"), "internal ASR configuration is not a chat message");
  assert.ok(events.some(e => e.type === "layer_failed" && e.layer === "voice"));
  assert.equal(transport.voiceWanted, true);
  const supported = MediaProvider.supported, start = MediaProvider.prototype.start;
  const stop = MediaProvider.prototype.stop, init = AudioPlayer.prototype.init;
  let options: any;
  try {
    MediaProvider.supported = () => true;
    AudioPlayer.prototype.init = () => {};
    MediaProvider.prototype.start = async o => { options = o; return {mic: "off", camera: "off"} as any; };
    MediaProvider.prototype.stop = async () => {};
    await transport.startMedia();
    assert.equal(options.mic, false);
    assert.ok(transport.player, "opponent audio remains available");
  } finally {
    MediaProvider.supported = supported; MediaProvider.prototype.start = start;
    MediaProvider.prototype.stop = stop; AudioPlayer.prototype.init = init;
  }
});
