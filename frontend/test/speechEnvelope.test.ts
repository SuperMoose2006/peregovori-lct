import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeechEnvelope } from "../src/lib/speechEnvelope";
import { AudioPlayer } from "../src/realtime/vendor/audio-player";
import { Avatar } from "../src/components/Avatar";

test("mouth follows scheduled audio, including silence and cancellation", () => {
  const e = new SpeechEnvelope();
  e.add(new Float32Array([0.2, -0.2, 0, 0]), 100, 5);
  assert.equal(e.level(4.99), 0);
  assert.ok(e.level(5.01) > 0.9);
  assert.equal(e.level(5.03), 0);
  assert.equal(e.level(5.05), 0);
  e.add(new Float32Array([NaN, Infinity]), 100, 6);
  assert.equal(e.level(6.01), 0);
  e.add(new Float32Array([1, 1]), 100, 7);
  e.clear();
  assert.equal(e.level(7.01), 0);
});

test("actual player schedules mouth on the AudioContext clock and clears on interrupt", () => {
  class Context {
    static instance: Context;
    state = "running"; sampleRate = 100; currentTime = 8; destination = {};
    sources: any[] = [];
    constructor() { Context.instance = this; }
    createBuffer(_channels: number, n: number, rate: number) {
      return { getChannelData: () => new Float32Array(n), duration: n / rate };
    }
    createBufferSource() {
      const source = { connect() {}, start() {}, stop() {}, disconnect() {}, buffer: null };
      this.sources.push(source);
      return source;
    }
  }
  (globalThis as any).window = { AudioContext: Context };
  const player = new AudioPlayer({ outputSampleRate: 100, playbackDelayMs: 0 });
  player.init(); player.beginTurn();
  const loud = Buffer.from(new Float32Array([0.1, -0.1, 0, 0]).buffer).toString("base64");
  player.playChunk(loud);
  assert.ok(player.speechLevel() > 0.5);
  assert.equal(player.playbackTimeMs(), 0);
  Context.instance.state = "suspended";
  assert.equal(player.speechLevel(), 0);
  Context.instance.state = "running";
  Context.instance.currentTime = 8.03;
  assert.equal(player.speechLevel(), 0);
  Context.instance.currentTime = 9;
  Context.instance.sources[0].onended();
  assert.equal(player.isPlaying, false, 'last onended must release the speaking indicator');
  assert.equal(player.playbackTimeMs(), null, 'a network gap is not PCM time');
  player.playChunk(loud);
  Context.instance.currentTime = 9.005;
  assert.ok(Math.abs(player.playbackTimeMs()! - 45) < 0.001,
    'provider timestamps must exclude network starvation');
  assert.ok(player.speechLevel() > 0.5);
  player.stopAll();
  assert.equal(player.speechLevel(), 0);
});

test("SVG mouth changes with real amplitude and closes in silence", () => {
  const render = (mouthOpening: number) => renderToStaticMarkup(createElement(Avatar,
    { scenarioId: "supplier", mood: "neutral", mouthOpening }));
  assert.doesNotMatch(render(0), /data-speech-mouth/);
  assert.match(render(0.5), /data-speech-mouth/);
  assert.notEqual(render(0.2), render(0.8));
});
