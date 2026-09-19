import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { injectRuntimeShim } from "../src/preview/runtime-shim.js";

class Param {
  events: { kind: "set" | "ramp"; value: number; time: number }[] = [];
  cancelScheduledValues(time: number) { this.events = this.events.filter(event => event.time < time); }
  setValueAtTime(value: number, time: number) { this.events.push({ kind: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: "ramp", value, time }); }
}
type PlaybackClock = { fromFrame: number; startedAtMs: number };
type PlayerOptions = {
  duration?: number;
  frameCount?: number;
  mediaStart?: number;
  mediaEnd?: number;
  loop?: boolean;
  phase?: number;
  rate?: number;
};

function player(gain: number, presentation: object = {}, options: PlayerOptions = {}) {
  const nodes: { gain: Param; connect: () => void }[] = [];
  const seeks: { before: number; target: number }[] = [];
  const pictures: number[] = [];
  // A parent with timeOrigin 1,000 and now() 59,000 shares this absolute instant.
  // The iframe's relative clock deliberately differs from its parent's clock.
  const timeOrigin = 50_000;
  let now = 10_000;
  let position = 0;
  const listeners = new Map<string, Set<() => void>>();
  const attrs: Record<string,string> = {
    "data-start": "0", "data-duration": String(options.duration ?? 4),
    "data-media-start": String(options.mediaStart ?? 0), "data-media-end": String(options.mediaEnd ?? 4),
    "data-loop": String(options.loop ?? false), "data-phase": String(options.phase ?? 0),
    "data-playback-rate": String(options.rate ?? 1),
    "data-gain": String(gain), "data-presentation": encodeURIComponent(JSON.stringify(presentation)),
  };
  const audio = {
    getAttribute: (name: string) => attrs[name] ?? null,
    get currentTime() { return position; },
    set currentTime(target: number) {
      seeks.push({ before: position, target });
      position = target;
      queueMicrotask(() => { for (const listener of listeners.get("seeked") ?? []) listener(); });
    },
    readyState: 4, paused: true, playbackRate: 1, volume: 0, muted: false,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) { listeners.get(type)?.delete(listener); },
  };
  const rootAttrs: Record<string, string> = { "data-fps": "30", "data-composition-id": "test" };
  if (options.frameCount !== undefined) rootAttrs["data-hypit-frame-count"] = String(options.frameCount);
  const root = { style: {}, getAttribute: (name: string) => rootAttrs[name] ?? null };
  const window: Record<string, any> = {
    addEventListener() {},
    dispatchEvent(event: { detail: { time: number } }) { pictures.push(event.detail.time); },
  };
  const html = injectRuntimeShim("").trim();
  vm.runInNewContext(html.slice("<script>".length, -"</script>".length), {
    window, document: { querySelector: () => root, querySelectorAll: (selector: string) => selector === ".hypit-studio-audio" ? [audio] : [] },
    performance: { timeOrigin, now: () => now },
    CustomEvent: class { constructor(readonly type: string, readonly init: { detail: unknown }) {} get detail() { return this.init.detail; } },
    AudioContext: class {
      get currentTime() { return now / 1000; } destination = {}; state = "running";
      createMediaElementSource() { return { connect() {} }; }
      createGain() { const node = { gain: new Param(), connect() {} }; nodes.push(node); return node; }
    },
  });
  return {
    audio, nodes, seeks, pictures,
    clock: (fromFrame: number): PlaybackClock => ({ fromFrame, startedAtMs: timeOrigin + now }),
    advance(seconds: number, media = true) {
      now += seconds * 1000;
      if (media && !audio.paused) position += seconds * audio.playbackRate;
    },
    play: (frame: number, clock?: PlaybackClock) => window.__hypitPlayFrame(frame, clock),
    seek: (frame: number) => window.__hypitSeekFrame(frame),
    mute: (value: boolean) => window.__hypitSetMuted(value),
  };
}

test("preview preserves silence and gain above unity through the audio graph", async () => {
  for (const gain of [0, 0.3, 2]) {
    const p = player(gain); await p.play(30);
    assert.equal(p.audio.volume, 1);
    assert.equal(p.nodes[0]!.gain.events.at(-1)!.value, gain);
  }
});

test("preview schedules independent envelopes, fades and half-open audible regions on the sample clock", async () => {
  const p = player(2, {
    fadeInSamples: 96000, fadeOutSamples: 96000,
    gainEnvelope: [{ sample: 0, gain: 1 }, { sample: 192000, gain: 0 }],
    audibility: [{ startSample: 48000, endSampleExclusive: 96000 }, { startSample: 144000, endSampleExclusive: 192000 }],
  });
  await p.play(30);
  const time = 1 + 1/60;
  assert.equal(p.nodes[1]!.gain.events[0]!.value, 1 - time/4);
  assert.equal(p.nodes[2]!.gain.events[0]!.value, time/2);
  assert.equal(p.nodes[3]!.gain.events[0]!.value, 1);
  assert.deepEqual(p.nodes[4]!.gain.events.map(event => event.value), [1, 0, 1, 0]);
  assert.ok(p.nodes[1]!.gain.events.some(event => event.kind === "ramp"));
  await p.play(60);
  assert.equal(p.nodes.length, 5, "reuse one audio graph across frames");
  assert.equal(p.nodes[4]!.gain.events[0]!.value, 0, "gap is silent");
});

test("delayed playback frames do not pull running audio back to an old transport position", async () => {
  const p = player(1);
  const clock = { fromFrame: 0, startedAtMs: 1_000 + 59_000 };
  await p.play(0, clock);
  p.seeks.length = 0;
  p.advance(1);
  // Frame 30 was selected at one second, but reaches the player 120 ms later.
  p.advance(0.12);
  await p.play(30, clock);
  p.advance(1 / 30);
  await p.play(35, clock);
  assert.equal(p.seeks.length, 0, "do not seek backward and then forward after delayed delivery");
  assert.ok(p.audio.currentTime > 1.15, "the media clock keeps advancing independently");
  assert.ok(p.pictures.at(-1)! > 1.1, "the picture follows the fresh transport position too");
});

test("a fresh transport clock still corrects genuine media drift", async () => {
  const p = player(1);
  const clock = p.clock(0);
  await p.play(0, clock);
  p.seeks.length = 0;
  p.advance(1, false);
  await p.play(30, clock);
  assert.equal(p.seeks.length, 1);
  assert.ok(p.audio.currentTime > 1 && p.audio.currentTime < 1.04);
});

test("explicit forward and backward jumps establish new playback origins", async () => {
  const p = player(1);
  await p.play(0, p.clock(0));
  p.advance(0.5);
  const forward = p.clock(90);
  await p.play(90, forward);
  assert.ok(p.audio.currentTime > 3 && p.audio.currentTime < 3.04);
  p.seeks.length = 0;
  p.advance(0.12);
  await p.play(90, forward);
  assert.equal(p.seeks.length, 0, "a delayed frame after the jump must not restore its old position");
  await p.play(15, p.clock(15));
  assert.equal(p.seeks.length, 1, "the requested backward jump remains authoritative");
  assert.ok(p.audio.currentTime > 0.5 && p.audio.currentTime < 0.54);
});

test("pausing seeks exactly and resuming excludes time spent paused", async () => {
  const p = player(1);
  await p.play(30, p.clock(30));
  p.advance(0.5);
  await p.seek(45);
  assert.equal(p.audio.paused, true);
  assert.equal(p.pictures.at(-1), 1.5);
  const pausedAt = p.audio.currentTime;
  p.advance(10);
  await p.mute(false);
  assert.equal(p.audio.currentTime, pausedAt);
  assert.equal(p.pictures.at(-1), 1.5);
  const resumed = p.clock(45);
  await p.play(45, resumed);
  p.seeks.length = 0;
  p.advance(0.12);
  await p.play(45, resumed);
  assert.equal(p.seeks.length, 0);
  assert.ok(p.audio.currentTime > 1.6 && p.audio.currentTime < 1.7);
});

test("mute changes retain the active playback clock without seeking running audio", async () => {
  const p = player(1);
  await p.play(0, p.clock(0));
  p.seeks.length = 0;
  p.advance(1);
  await p.mute(true);
  assert.equal(p.audio.muted, true);
  assert.equal(p.audio.paused, false);
  assert.equal(p.seeks.length, 0);
  p.advance(0.12);
  await p.mute(false);
  assert.equal(p.audio.muted, false);
  assert.equal(p.seeks.length, 0);
  assert.ok(p.audio.currentTime > 1.1);
});

test("delayed playback respects source speed, phase and loop boundaries", async () => {
  const p = player(1, {}, { duration: 10, mediaStart: 1, mediaEnd: 3, rate: 2, loop: true, phase: 0.5 });
  const clock = p.clock(0);
  await p.play(0, clock);
  p.seeks.length = 0;
  p.advance(0.82);
  await p.play(18, clock);
  assert.equal(p.audio.playbackRate, 2);
  assert.equal(p.seeks.length, 1, "the source loop still requires its normal wraparound seek");
  assert.ok(p.audio.currentTime > 1.1 && p.audio.currentTime < 1.25,
    "the delayed update has already crossed the loop boundary at double speed");
});

test("a delayed request beyond the programme end settles on its last frame", async () => {
  const p = player(1, {}, { frameCount: 120 });
  const clock = p.clock(90);
  await p.play(90, clock);
  p.advance(2);
  await p.play(90, clock);
  assert.equal(p.pictures.at(-1), 119 / 30);
  assert.equal(p.audio.paused, true);
});

test("a legacy frame-only request does not inherit a previous playback clock", async () => {
  const p = player(1);
  await p.play(0, p.clock(0));
  p.advance(1);
  await p.play(15);
  assert.equal(p.pictures.at(-1), 0.5);
  assert.ok(p.audio.currentTime > 0.5 && p.audio.currentTime < 0.54);
});
