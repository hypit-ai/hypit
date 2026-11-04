import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import type { HtmlProgram } from "@hypit/html-program";
import { exactTemporalValueFromFrames, identityTemporalMap, sealTemporalMap } from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";
import { injectHtmlPlayback } from "../src/index.js";

const playbackClock = { frameRate: { numerator: 30, denominator: 1 } } as const;
const picture = { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
  colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const;

function surfaceMap(
  id: string,
  targetFrames: number,
  sourceFrames: number,
  sourceAt: { readonly numerator: number; readonly denominator: number } = { numerator: 0, denominator: 1 },
  rate: { readonly numerator: number; readonly denominator: number } = { numerator: 1, denominator: 1 },
): TemporalMap {
  const target = { id: `${id}:target`, duration: exactTemporalValueFromFrames(targetFrames, playbackClock) };
  const source = { id: `${id}:source`, duration: exactTemporalValueFromFrames(sourceFrames, playbackClock) };
  return sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: exactTemporalValueFromFrames(0, playbackClock), end: target.duration },
    sourceAtStart: { ticks: String(sourceAt.numerator),
      timeBase: { numerator: 1, denominator: 30 * sourceAt.denominator } },
    rate,
  }] }] });
}

function mediaProgram(
  frameCount: number,
  sources: readonly { readonly id: string; readonly startFrame: number; readonly endFrameExclusive: number;
    readonly sampling: TemporalMap }[],
): HtmlProgram {
  return { frameRate: playbackClock.frameRate, frameCount, artifacts: [], html: "<!doctype html>",
    videoSources: sources.map((source) => ({
      kind: "media" as const, id: source.id, elementId: source.id,
      startFrame: source.startFrame, endFrameExclusive: source.endFrameExclusive,
      usage: { kind: "frames" as const, spans: [{ startFrame: source.startFrame,
        endFrameExclusive: source.endFrameExclusive }] },
      source: {
        source: { kind: "blob" as const, resource: `res_${source.id}` as const,
          size: 1, mediaType: "video/mp4" },
        streamIndex: 0,
        presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
        sourceDomain: structuredClone(source.sampling.stages.at(-1)!.source),
        interpretation: { codedWidth: 16, codedHeight: 9,
          sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const, picture },
      },
      sampling: source.sampling,
    })) } as unknown as HtmlProgram;
}

test("playback owns deferred and direct video sources before renderer activation", () => {
  const html = injectHtmlPlayback('<body><video data-hypit-artifact-src="long.mp4"></video><video src="short.mp4"></video><img data-hypit-artifact-src="still.png"></body>');
  assert.match(html, /<video preload="none" data-hypit-src="long.mp4">/u);
  assert.match(html, /<video preload="none" data-hypit-src="short.mp4">/u);
  assert.doesNotMatch(html, /<video[^>]*\s(?:src|data-hypit-artifact-src)=/u);
  assert.match(html, /<img data-hypit-artifact-src="still.png">/u);
});

test("PreparedMedia preview samples the HtmlProgram TemporalMap as its timing authority", async () => {
  const domain = { id: "direct-source", duration: exactTemporalValueFromFrames(30,
    { frameRate: { numerator: 30, denominator: 1 } }) };
  const program = {
    frameRate: { numerator: 30, denominator: 1 }, frameCount: 3,
    videoSources: [{ kind: "media", id: "direct", elementId: "direct",
      startFrame: 0, endFrameExclusive: 3,
      source: { source: { kind: "blob", resource: "res_direct", size: 1, mediaType: "video/mp4" },
        streamIndex: 0, presentationStart: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } },
        sourceDomain: domain, interpretation: { codedWidth: 16, codedHeight: 9,
          sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,} },
      sampling: identityTemporalMap(domain) }],
  } as unknown as HtmlProgram;
  const attrs: Record<string, string> = {
    "data-hypit-src": "direct.mp4", "data-hypit-start-frame": "0", "data-hypit-end-frame": "3",
    "data-hypit-video-source": "media",
  };
  const listeners = new Map<string, () => void>();
  let currentTime = 0;
  const video = { id: "direct", style: {}, readyState: 4, duration: 10, paused: true,
    getAttribute: (name: string) => attrs[name] ?? null, closest: () => null,
    setAttribute(name: string, value: string) { attrs[name] = value; },
    removeAttribute(name: string) { delete attrs[name]; }, load() {},
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.()); },
    pause() {}, play() { return Promise.resolve(); },
    addEventListener(name: string, listener: () => void) { listeners.set(name, listener); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const root = { style: {}, getAttribute: (name: string) => ({
    "data-hypit-frame-numerator": "30", "data-hypit-frame-denominator": "1",
  })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, __hypitFrameProgram: { async applyFrame() {} } };
  const script = injectHtmlPlayback("", "", program).trim().slice("<script>".length, -"</script>".length);
  vm.runInNewContext(script, { window, document: { querySelector: () => root,
    querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? [video] : [] } });
  await window.__hypitSeekFrame(2);
  assert.equal(currentTime, 2 + 2 / 30);
});

test("browser playback rejects a selected nonzero visual stream instead of playing the container default", () => {
  const domain = { id: "alternate-source", duration: exactTemporalValueFromFrames(1,
    { frameRate: { numerator: 30, denominator: 1 } }) };
  const program = {
    frameRate: { numerator: 30, denominator: 1 }, frameCount: 1,
    videoSources: [{ kind: "media", id: "alternate", elementId: "alternate",
      startFrame: 0, endFrameExclusive: 1,
      source: { source: { kind: "blob", resource: "res_alternate", size: 1, mediaType: "video/mp4" },
        streamIndex: 2, presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
        sourceDomain: domain, interpretation: { codedWidth: 16, codedHeight: 9,
          sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
          picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
            colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const } },
      sampling: identityTemporalMap(domain) }],
  } as unknown as HtmlProgram;
  assert.throws(() => injectHtmlPlayback("", "", program),
    /cannot select visual stream 2 for alternate/u);
});

test("PreparedMedia playback evaluates one complete multi-stage cubic Map behind its display plane", async () => {
  const target = { id: "surface-target", duration: exactTemporalValueFromFrames(3, playbackClock) };
  const middle = { id: "surface-middle", duration: exactTemporalValueFromFrames(3, playbackClock) };
  const source = { id: "surface-source", duration: exactTemporalValueFromFrames(3, playbackClock) };
  const sampling = sealTemporalMap({ stages: [{ target, source: middle, pieces: [{
    target: { start: exactTemporalValueFromFrames(0, playbackClock), end: target.duration },
    sourceAtStart: exactTemporalValueFromFrames(0, playbackClock),
    sourceControl1: exactTemporalValueFromFrames(1, playbackClock),
    sourceControl2: exactTemporalValueFromFrames(2, playbackClock),
    sourceAtEnd: middle.duration,
  }] }, { target: middle, source, pieces: [{
    target: { start: exactTemporalValueFromFrames(0, playbackClock), end: middle.duration },
    sourceAtStart: exactTemporalValueFromFrames(0, playbackClock), rate: { numerator: 1, denominator: 1 },
  }] }] });
  const program = mediaProgram(3, [{ id: "surface-plane", startFrame: 0, endFrameExclusive: 3, sampling }]);
  const attrs: Record<string, string> = { "data-hypit-src": "surface.mp4" };
  const listeners = new Map<string, () => void>();
  let currentTime = 0;
  const plane = { id: "surface-plane" };
  const video = { id: "", style: {}, readyState: 4, duration: 10, paused: true,
    getAttribute: (name: string) => attrs[name] ?? null, closest: () => plane,
    setAttribute(name: string, value: string) { attrs[name] = value; },
    removeAttribute(name: string) { delete attrs[name]; }, load() {},
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.()); },
    pause() {}, play() { return Promise.resolve(); },
    addEventListener(name: string, listener: () => void) { listeners.set(name, listener); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const root = { style: {}, getAttribute: (name: string) => ({
    "data-hypit-frame-numerator": "30", "data-hypit-frame-denominator": "1",
  })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, __hypitFrameProgram: { async applyFrame() {} } };
  const script = injectHtmlPlayback("", "", program).trim().slice("<script>".length, -"</script>".length);
  vm.runInNewContext(script, { window, document: { querySelector: () => root,
    querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? [video] : [] } });
  await window.__hypitSeekFrame(2);
  assert.equal(currentTime, 2 / 30);
});

test("long preview releases remote Clips and cancels obsolete metadata waits", async () => {
  const clips = Array.from({ length: 126 }, (_, index) => {
    const attrs: Record<string, string> = {
      "data-hypit-src": `${index}.mp4`,
    };
    const listeners = new Map<string, Set<() => void>>();
    return {
      style: {}, readyState: 0, currentTime: 0, paused: true, attrs, listeners,
      getAttribute: (name: string) => attrs[name] ?? null, closest: () => ({ id: `clip-${index}` }),
      setAttribute(name: string, value: string) { attrs[name] = value; },
      removeAttribute(name: string) { delete attrs[name]; },
      pause() {}, load() {},
      addEventListener(name: string, fn: () => void) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(fn);
      },
      removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
    };
  });
  const root = { style: {}, getAttribute: () => null };
  const window: Record<string, any> = { addEventListener() {}, __hypitFrameProgram: { async applyFrame() {} } };
  const program = mediaProgram(clips.length * 300, clips.map((_clip, index) => ({
    id: `clip-${index}`, startFrame: index * 300, endFrameExclusive: (index + 1) * 300,
    sampling: surfaceMap(`clip-${index}`, 300, 300),
  })));
  const script = injectHtmlPlayback("", "", program).trim().slice("<script>".length, -"</script>".length);
  vm.runInNewContext(script, { window, document: { querySelector: () => root,
    querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? clips : [] } });
  assert.equal(clips.filter((clip) => clip.attrs.src !== undefined).length, 1);
  const original = window.__hypitFrameReady;
  for (let index = 1; index < clips.length; index += 1) {
    await window.__hypitPlayFrame(index * 300 + 60);
    assert.equal(clips.filter((clip) => clip.attrs.src !== undefined).length, 1);
  }
  await original;
  assert.equal(clips[0]!.listeners.get("loadedmetadata")!.size, 0);
  assert.equal(clips[0]!.attrs.src, undefined);
});

test("preview scrubs to the same source frame as rendering at fractional sample positions", async () => {
  const attrs: Record<string, string> = {
    "data-hypit-src": "fractional.mp4",
  };
  const listeners = new Map<string, () => void>();
  let currentTime = 0;
  const video = { style: {}, readyState: 4, duration: 10, paused: true,
    getAttribute: (name: string) => attrs[name] ?? null, closest: () => ({ id: "fractional" }),
    setAttribute(name: string, value: string) { attrs[name] = value; },
    removeAttribute(name: string) { delete attrs[name]; }, load() {},
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.()); },
    pause() {}, play() { return Promise.resolve(); },
    addEventListener(name: string, listener: () => void) { listeners.set(name, listener); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const root = { style: {}, getAttribute: (name: string) => ({ "data-fps": "30", "data-composition-id": "test" })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, dispatchEvent() {},
    __hypitFrameProgram: { async applyFrame() {} } };
  const program = mediaProgram(30, [{ id: "fractional", startFrame: 0, endFrameExclusive: 30,
    sampling: surfaceMap("fractional", 30, 30, { numerator: 7, denominator: 4 },
      { numerator: 1, denominator: 2 }) }]);
  const html = injectHtmlPlayback("", "", program).trim();
  vm.runInNewContext(html.slice("<script>".length, -"</script>".length), {
    window, document: { querySelector: () => root,
      querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? [video] : [] },
    CustomEvent: class {},
  });
  await window.__hypitFrameReady;
  // Browser playback seeks the exact mapped media timestamp; the renderer separately selects samples.
  for (const [frame, sourcePosition] of [[0, 1.75], [1, 2.25], [2, 2.75], [3, 3.25], [0, 1.75]] as const) {
    await window.__hypitSeekFrame(frame);
    assert.equal(video.currentTime, sourcePosition / 30, `preview frame ${frame}`);
  }
});

test("preview keeps a compact zero-rate sampling interval paused on its source frame", async () => {
  const attrs: Record<string, string> = {
    "data-hypit-src": "hold.mp4",
  };
  const listeners = new Map<string, () => void>();
  let currentTime = 0;
  let pauses = 0;
  let plays = 0;
  const video = { style: {}, readyState: 4, duration: 10, paused: true,
    getAttribute: (name: string) => attrs[name] ?? null, closest: () => ({ id: "hold" }),
    setAttribute(name: string, value: string) { attrs[name] = value; },
    removeAttribute(name: string) { delete attrs[name]; }, load() {},
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.()); },
    pause() { pauses += 1; }, play() { plays += 1; return Promise.resolve(); },
    addEventListener(name: string, listener: () => void) { listeners.set(name, listener); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const root = { style: {}, getAttribute: (name: string) => ({ "data-fps": "30", "data-composition-id": "test" })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, dispatchEvent() {},
    __hypitFrameProgram: { async applyFrame() {} } };
  const program = mediaProgram(360, [{ id: "hold", startFrame: 60, endFrameExclusive: 360,
    sampling: surfaceMap("hold", 300, 30, { numerator: 3, denominator: 1 },
      { numerator: 0, denominator: 1 }) }]);
  const html = injectHtmlPlayback("", "", program).trim();
  vm.runInNewContext(html.slice("<script>".length, -"</script>".length), {
    window, document: { querySelector: () => root,
      querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? [video] : [] },
    CustomEvent: class {},
  });
  await window.__hypitSeekFrame(60);
  await window.__hypitPlayFrame(211);
  await window.__hypitSeekFrame(359);
  assert.equal(currentTime, 3 / 30);
  assert.equal(plays, 0, "a held interval never hands its clock to native video playback");
  assert.ok(pauses >= 3);
});

test("preview gives an exact reverse boundary to its left-hand source frame", async () => {
  const attrs: Record<string, string> = {
    "data-hypit-src": "reverse.mp4",
  };
  const listeners = new Map<string, () => void>();
  let currentTime = 0;
  let plays = 0;
  let assignedRate: number | undefined;
  const video = { style: {}, readyState: 4, duration: 10, paused: true,
    getAttribute: (name: string) => attrs[name] ?? null, closest: () => ({ id: "reverse" }),
    setAttribute(name: string, value: string) { attrs[name] = value; },
    removeAttribute(name: string) { delete attrs[name]; }, load() {},
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.()); },
    set playbackRate(value: number) { assignedRate = value; },
    pause() {}, play() { plays += 1; return Promise.resolve(); },
    addEventListener(name: string, listener: () => void) { listeners.set(name, listener); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const root = { style: {}, getAttribute: (name: string) => ({ "data-fps": "30", "data-composition-id": "test" })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, dispatchEvent() {},
    __hypitFrameProgram: { async applyFrame() {} } };
  const program = mediaProgram(10, [{ id: "reverse", startFrame: 0, endFrameExclusive: 10,
    sampling: surfaceMap("reverse", 10, 10, { numerator: 10, denominator: 1 },
      { numerator: -1, denominator: 1 }) }]);
  const html = injectHtmlPlayback("", "", program).trim();
  vm.runInNewContext(html.slice("<script>".length, -"</script>".length), {
    window, document: { querySelector: () => root,
      querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? [video] : [] },
    CustomEvent: class {},
  });
  await window.__hypitPlayFrame(3);
  assert.equal(currentTime, 7 / 30);
  assert.equal(assignedRate, undefined);
  assert.equal(plays, 0);
});

test("playback parks the next Clip on its entry frame and shows it only once decoded", async () => {
  const clips = [0, 1].map((index) => {
    const attrs: Record<string, string> = {
      "data-hypit-src": `${index}.mp4`,
    };
    const listeners = new Map<string, Set<() => void>>();
    let currentTime = 0;
    const clip = {
      style: {} as Record<string, string>, readyState: 0, seeking: false, duration: 60, paused: true, attrs, listeners,
      getAttribute: (name: string) => attrs[name] ?? null, closest: () => ({ id: `park-${index}` }),
      setAttribute(name: string, value: string) {
        attrs[name] = value;
        if (name === "src") queueMicrotask(() => { clip.readyState = 4; listeners.get("loadedmetadata")?.forEach((fn) => fn()); });
      },
      removeAttribute(name: string) { delete attrs[name]; },
      get currentTime() { return currentTime; },
      set currentTime(value: number) { currentTime = value; queueMicrotask(() => listeners.get("seeked")?.forEach((fn) => fn())); },
      pause() { clip.paused = true; }, play() { clip.paused = false; return Promise.resolve(); }, load() {},
      addEventListener(name: string, fn: () => void) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(fn);
      },
      removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
    };
    return clip;
  });
  const root = { style: {}, getAttribute: (name: string) => ({ "data-hypit-frame-numerator": "30" })[name] ?? null };
  const window: Record<string, any> = { addEventListener() {}, __hypitFrameProgram: { async applyFrame() {} } };
  const program = mediaProgram(240, [0, 1].map((index) => ({
    id: `park-${index}`, startFrame: index * 120, endFrameExclusive: (index + 1) * 120,
    sampling: surfaceMap(`park-${index}`, 120, 420,
      { numerator: index === 0 ? 0 : 300, denominator: 1 }),
  })));
  const script = injectHtmlPlayback("", "", program).trim().slice("<script>".length, -"</script>".length);
  vm.runInNewContext(script, { window, document: { querySelector: () => root,
    querySelectorAll: (selector: string) => selector === ".hypit-visual-present video" ? clips : [] } });
  await window.__hypitFrameReady;
  // Inside the next Clip's preload window its decoder is moved to the entry frame.
  await window.__hypitPlayFrame(80);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await window.__hypitPlayFrame(81);
  assert.equal(clips[1]!.currentTime, 300 / 30);
  assert.equal(clips[1]!.style.visibility, "hidden");
  await window.__hypitPlayFrame(120);
  assert.equal(clips[1]!.style.visibility, "visible");
  assert.equal(clips[0]!.style.visibility, "hidden");

  // Entered without a decoded frame: stay hidden rather than paint a stale picture.
  clips[1]!.readyState = 1;
  clips[1]!.style.visibility = "hidden";
  await window.__hypitPlayFrame(150);
  assert.equal(clips[1]!.style.visibility, "hidden");
});
