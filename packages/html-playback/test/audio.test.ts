import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { injectHtmlPlayback } from "../src/index.js";

class Param {
  events: { kind: "set" | "ramp"; value: number; time: number }[] = [];
  cancelScheduledValues(time: number) { this.events = this.events.filter(event => event.time < time); }
  setValueAtTime(value: number, time: number) { this.events.push({ kind: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: "ramp", value, time }); }
}
function player(gain: number, levelAutomation: object = {}, preservesPitch = false) {
  const nodes: { gain: Param; connect: () => void }[] = [];
  const attrs: Record<string,string> = {
    "data-start": "0", "data-duration": "4", "data-media-start": "0", "data-media-end": "4",
    "data-preserves-pitch": String(preservesPitch),
    "data-gain": String(gain), "data-level-automation": encodeURIComponent(JSON.stringify(levelAutomation)),
  };
  const audio = { getAttribute: (name: string) => attrs[name] ?? null, currentTime: 0, readyState: 4,
    preservesPitch: !preservesPitch,
    paused: true, volume: 0, muted: false, pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); }, addEventListener() {}, removeEventListener() {} };
  const root = { style: {}, getAttribute: (name: string) => ({ "data-fps": "30", "data-composition-id": "test" })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, dispatchEvent() {},
    __hypitFrameProgram: { async applyFrame() {} } };
  const html = injectHtmlPlayback("").trim();
  vm.runInNewContext(html.slice("<script>".length, -"</script>".length), {
    window, document: { querySelector: () => root, querySelectorAll: (selector: string) => selector === ".hypit-playback-audio" ? [audio] : [] },
    CustomEvent: class {}, AudioContext: class {
      currentTime = 10; destination = {}; state = "running";
      createMediaElementSource() { return { connect() {} }; }
      createGain() { const node = { gain: new Param(), connect() {} }; nodes.push(node); return node; }
    },
  });
  return { audio, nodes, play: (frame: number) => window.__hypitPlayFrame(frame) };
}

test("preview preserves silence and gain above unity through the audio graph", async () => {
  for (const gain of [0, 0.3, 2]) {
    const p = player(gain); await p.play(30);
    assert.equal(p.audio.volume, 1);
    assert.equal(p.nodes[0]!.gain.events.at(-1)!.value, gain);
  }
});

test("preview applies the reconstruction's explicit pitch policy instead of the browser default", async () => {
  for (const preservesPitch of [false, true]) {
    const p = player(1, {}, preservesPitch);
    await p.play(30);
    assert.equal(p.audio.preservesPitch, preservesPitch);
  }
});

test("preview schedules independent envelopes, fades and half-open audible regions on the sample clock", async () => {
  const p = player(2, {
    fadeInSamples: 96000, fadeOutSamples: 96000,
    gainEnvelope: [{ sample: 0, gain: 1 }, { sample: 192000, gain: 0 }],
    audibility: [{ startSample: 48000, endSampleExclusive: 96000 }, { startSample: 144000, endSampleExclusive: 192000 }],
  });
  await p.play(30);
  const time = 1;
  assert.equal(p.nodes[1]!.gain.events[0]!.value, 1 - time/4);
  assert.equal(p.nodes[2]!.gain.events[0]!.value, time/2);
  assert.equal(p.nodes[3]!.gain.events[0]!.value, 1);
  assert.deepEqual(p.nodes[4]!.gain.events.map(event => event.value), [1, 0, 1, 0]);
  assert.ok(p.nodes[1]!.gain.events.some(event => event.kind === "ramp"));
  await p.play(60);
  assert.equal(p.nodes.length, 5, "reuse one audio graph across frames");
  assert.equal(p.nodes[4]!.gain.events[0]!.value, 0, "gap is silent");
});
