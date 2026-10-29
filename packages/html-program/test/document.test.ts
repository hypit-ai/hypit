import {
  assertHtmlProgram,
  assertHtmlFrameIndex,
  assertHtmlFrameSpan,
  compileHtmlProgram,
  htmlAdjustment,
  htmlVisualElement,
  htmlVisual,
  htmlProgramTime,
  materializeHtmlProgram,
} from "@hypit/html-program";
import type { FontArtifactRef } from "@hypit/media";
import { sealTimeline } from "@hypit/timeline";
import { audioGraphFromClips, sealAudioTrack, sealComposition, sealPresentVisualTrack, sealVisualProcessEffect, sealVisualScope, sealVisualTrack, visualElements, visualPresents, visualScopeTracks } from "@hypit/composition";
import type { Composition, VisualTrack } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap, isAffineTemporalMapPiece, sealTemporalMap } from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";

function directVideoSource(artifact: import("@hypit/hypit/protocol").BlobRef,
  sampling: TemporalMap) {
  return { source: artifact, streamIndex: 0, presentationStart: exactTemporalZero(),
    sourceDomain: structuredClone(sampling.stages.at(-1)!.source),
    interpretation: { codedWidth: 100, codedHeight: 100, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,} };
}

const fixtureFont: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("html-program:fixture-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

const scope = (...tracks: VisualTrack[]) => ({ members: tracks.map((track) => ({
  kind: "track" as const,
  id: track.id,
  track,
})) });
const replaceVisualTrack = (composition: Composition, id: string, track: VisualTrack): Composition => sealComposition({
  ...composition,
  visual: { ...composition.visual, root: { members: composition.visual.root.members.map((member) =>
    member.kind === "track" && member.track.id === id
      ? { kind: "track" as const, id: member.id, track }
      : member) } },
 }, composition.timeline);
const staticAdjustment = (filter: string) => htmlAdjustment({ keyframes: [{
  at: 0,
  filter,
  opacity: 1,
  transform: "none",
  transformOrigin: "50% 50%",
}] });

function fixture() {
  const timeline = sealTimeline({ id: "test-space", frameCount: 30, frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:picture"),
    size: 10,
    mediaType: "image/png",
  };
  const sound = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:sound"),
    size: 20,
    mediaType: "audio/wav",
  };
  const lower = sealPresentVisualTrack({ timelineId: "test-space",

    id: "lower",
    presents: [{
      id: "picture",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: htmlVisualElement({
        id: "media",
        kind: "image", picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
        artifact: picture,
        style: [{ name: "width", value: "100%" }],
      }),
    }],
  });
  const upper = sealPresentVisualTrack({ timelineId: "test-space",

    id: "upper",
    presents: [{
      id: "words",
      span: { startFrame: 3, endFrameExclusive: 20 },
      root: htmlVisualElement({ id: "root", kind: "box", children: [
        { id: "text", kind: "text", text: "Hello <world>", fonts: [fixtureFont], style: [],
          paints: [
            { kind: "stroke", placement: "outside", widthPx: 2,
              paint: { kind: "solid", color: "#000000" } },
            { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
          ],
        },
      ], style: [{ name: "position", value: "absolute" }] }),
    }],
  });
  const audio = sealAudioTrack({ timelineId: "test-space",
    id: "sound",
    graph: audioGraphFromClips([{
      id: "main",
      source: (() => {
        const domain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        return { source: sound, streamIndex: 0, presentationStart: exactTemporalZero(),
          sourceDomain: domain, interpretation: { sampleRate: 48_000, channels: 2 } };
      })(),
      preparation: (() => {
        const domain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        return identityTemporalMap(domain);
      })(),
      target: frameRangeFixture(0, 48_000, { numerator: 48_000, denominator: 1 }),
      sampling: frameSamplingMapFixture({ targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames: 48_000,
        sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames: 48_000,
        pieces: [{ target: { startFrame: 0, endFrameExclusive: 48_000 },
        sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
        }] }),
      gain: 1,
      fadeIn: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    }]),
  });
  const composition = sealComposition({ id: "main", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: scope(lower, upper) }, audio: { contributions: [audio] } }, timeline);
  return { composition, picture, sound, timeline };
}

test("HTML renderer flattens generic peer visual Track Presents without absorbing audio rendering", () => {
  const { composition, picture, sound, timeline } = fixture();
  const document = compileHtmlProgram(composition);
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.deepEqual(new Set(document.artifacts.map(({ artifact }) => artifact.resource)),
    new Set([picture.resource, fixtureFont.sources[0]!.artifact.resource]));
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === fixtureFont.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  const pictureId = document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)!.id;
  assert.ok(document.html.includes(`data-hypit-artifact-src="hypit-artifact://${pictureId}"`));
  assert.doesNotMatch(document.html, /<img\b[^>]*\ssrc=/u,
    "compiler-owned images stay inert until the page applies its render selection");
  assert.ok(document.html.indexOf('data-hypit-occurrence-path="[&quot;lower&quot;]"')
    < document.html.indexOf('data-hypit-occurrence-path="[&quot;upper&quot;]"'));
  assert.equal((document.html.match(/class="hypit-visual-present"/gu) ?? []).length, 2);
  assert.doesNotMatch(document.html, /<audio/u);
  assert.doesNotMatch(document.html, new RegExp(sound.resource, "u"));
  assert.doesNotMatch(document.html, /isolation:isolate|hypit-visual-track/u);
  assert.match(document.html, /Hello &lt;world&gt;/u);
  assert.match(document.html, /display:inline-grid/u);
  assert.doesNotMatch(document.html, /display:inline-grid;padding:/u);
  assert.match(document.html, /-webkit-text-stroke:4px #000000/u);
  assert.doesNotMatch(document.html, /<feMorphology/u);
  assert.doesNotMatch(document.html, /speech-visual-track|caption-track/u);
});

test("HTML renderer preserves independent input clocks inside a Visual Process", () => {
  const { composition, timeline } = fixture();
  const processTrack = sealVisualTrack({
    timelineId: timeline.id,

    id: "process",
    items: [{
      kind: "process",
      id: "handoff",
      span: { startFrame: 10, endFrameExclusive: 20 },
      inputs: [{
        name: "outgoing",
        contribution: {
          kind: "present",
          id: "outgoing",
          span: { startFrame: 0, endFrameExclusive: 20 },
          root: htmlVisualElement({ kind: "box", id: "outgoing-root", style: [], children: [] }),
        },
      }, {
        name: "incoming",
        contribution: {
          kind: "present",
          id: "incoming",
          span: { startFrame: 10, endFrameExclusive: 30 },
          root: htmlVisualElement({ kind: "box", id: "incoming-root", style: [], children: [] }),
        },
      }],
      effect: sealVisualProcessEffect({
        inputs: ["outgoing", "incoming"],
        program: htmlVisual({
          html: "<div>{{outgoing}}{{incoming}}</div>",
          setup: "return localFrame => { root.dataset.localFrame = String(localFrame); };",
        }),
      }),
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    ...composition,
    visual: { ...composition.visual, root: scope(processTrack) },
 }, timeline));
  assert.match(document.html, /data-hypit-process-id="handoff"/u);
  assert.match(document.html, /data-hypit-present-id="outgoing"[^>]*data-hypit-contribution-start-frame="0"/u);
  assert.match(document.html, /data-hypit-present-id="incoming"[^>]*data-hypit-contribution-start-frame="10"/u);
  assert.match(document.html, /new Function\('root', 'data', 'context'/u);
});

test("HTML renderer lowers a recursive scope Process as one generic Picture operation", () => {
  const { composition, timeline } = fixture();
  const [content, matte] = composition.visual.root.members;
  assert.equal(content?.kind, "track");
  assert.equal(matte?.kind, "track");
  if (content?.kind !== "track" || matte?.kind !== "track") throw new Error("fixture tracks are missing");
  const effect = sealVisualProcessEffect({
    inputs: ["content", "matte"],
    program: htmlVisual({
      html: '<div data-test-sibling-process>{{content}}<aside>{{matte}}</aside></div>',
      setup: "root.dataset.ready = 'true'; return () => {};",
    }),
  });
  const root = sealVisualScope({ members: [{
    kind: "process",
    id: "masked-picture",
    inputs: [
      { name: "content", scope: { members: [content] } },
      { name: "matte", scope: { members: [matte] } },
    ],
    effect,
  }] });
  const document = compileHtmlProgram(sealComposition({
    ...composition,
    visual: { ...composition.visual, root },
  }, timeline));
  assert.equal(document.processPasses, 2);
  assert.match(document.html, /data-hypit-process-id="masked-picture"/u);
  assert.match(document.html, /data-hypit-process-input="content"/u);
  assert.match(document.html, /data-hypit-process-input="matte"/u);
  assert.match(document.html, /data-test-sibling-process/u);
  assert.match(document.html, /root\.dataset\.ready = 'true'/u);
  assert.equal((document.html.match(/data-hypit-process-stage(?=[ >])/gu) ?? []).length, 2);
  assert.match(document.html, /class="hypit-visual-scope-process" data-hypit-capture-root/u);
  assert.doesNotMatch(document.html, /class="hypit-visual-present" data-hypit-capture-root/u,
    "private input Presents are captured only through their renderer-owned Process stages");
});

test("HTML renderer lowers a nested Scope Process for recursive execution", () => {
  const { composition, timeline } = fixture();
  const [content, matte] = composition.visual.root.members;
  assert.equal(content?.kind, "track");
  assert.equal(matte?.kind, "track");
  if (content?.kind !== "track" || matte?.kind !== "track") throw new Error("fixture tracks are missing");
  const child = sealComposition({
    ...composition,
    id: "child-with-process",
    visual: { ...composition.visual, root: sealVisualScope({ members: [{
      kind: "process",
      id: "child-matte",
      inputs: [
        { name: "content", scope: { members: [content] } },
        { name: "matte", scope: { members: [matte] } },
      ],
      effect: sealVisualProcessEffect({
        inputs: ["content", "matte"],
        program: htmlVisual({ html: "{{content}}{{matte}}", setup: "return () => {};" }),
      }),
    }] }) },
  }, timeline);
  const parentTrack = sealPresentVisualTrack({
    timelineId: timeline.id,

    id: "parent",
    presents: [{
      id: "child-use",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: {
        id: "child",
        kind: "composition",
        composition: child,
        sampling: frameSamplingMapFixture({
          targetFrameRate: timeline.frameRate,
          targetFrames: 30,
          sourceFrameRate: timeline.frameRate,
          sourceFrames: 30,
          pieces: [{ target: { startFrame: 0, endFrameExclusive: 30 },
            sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }],
        }),
      },
    }],
  });
  const parent = sealComposition({
    ...composition,
    id: "parent",
    visual: { ...composition.visual, root: scope(parentTrack) },
  }, timeline);
  const document = compileHtmlProgram(parent);
  assert.equal(document.processPasses, 2);
  assert.match(document.html, /data-hypit-nested-document-id/u);
  assert.match(document.html, /data-hypit-process-stage/u);
});

test("Programme-local Artifact ids do not depend on Resource-id substring order", () => {
  const timeline = sealTimeline({ id: "artifact-prefix", frameCount: 1, frameRate: { numerator: 1, denominator: 1 } });
  const artifacts: readonly import("@hypit/hypit/protocol").BlobRef[] = [
    { kind: "blob" as const, resource: "res_prefix", size: 1, mediaType: "image/png" },
    { kind: "blob" as const, resource: "res_prefix_long", size: 1, mediaType: "image/png" },
  ];
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,

    id: "pictures",
    presents: artifacts.map((artifact, index) => ({
      id: `picture-${index}`,
      span: { startFrame: 0, endFrameExclusive: 1 },
      root: { id: `image-${index}`, kind: "image" as const, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact, style: [] },
    })),
  });
  const document = compileHtmlProgram(sealComposition({ id: "artifact-prefix", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1, height: 1, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, timeline));
  const ids = document.artifacts.map((entry) => entry.id);
  assert.equal(ids.length, 2);
  for (const id of ids) assert.ok(document.html.includes(`hypit-artifact://${id}`));
  assert.doesNotMatch(document.html, /hypit-artifact:\/\/res_prefix/u);
});

test("one VisualTrack paints by declaration order rather than item identity", () => {
  const timeline = sealTimeline({
    id: "paint-order",
    frameCount: 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visualTrack = (id: string, ids: readonly string[]) => sealPresentVisualTrack({
    timelineId: timeline.id,

    id,
    presents: ids.map(id => ({
      id,
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: htmlVisualElement({ id: "root", kind: "box", children: [], style: [] }),
    })),
  });
  const composition = sealComposition({ id: "paint-order", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1920, height: 1080, clearColor: "#000000" }, root: { members: [
      { kind: "track", id: "b", track: visualTrack("track-b", ["z-first", "a-second"]) },
    ] } }, audio: { contributions: [] } }, timeline);

  const html = compileHtmlProgram(composition).html;
  const first = html.indexOf('data-hypit-present-id="z-first"');
  const second = html.indexOf('data-hypit-present-id="a-second"');
  assert.ok(first >= 0 && first < second);
  assert.doesNotMatch(html, /data-hypit-z=/u);
});

test("one VisualTrack value renders at each distinct visual occurrence path", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual.root).find((track) => track.id === "lower")!;
  const reused = sealComposition({
    ...composition,
    visual: { ...composition.visual, root: { members: [
      { kind: "track", id: "background", track: lower },
      { kind: "stack", id: "inset", scope: { members: [
        { kind: "track", id: "picture", track: lower },
      ] } },
    ] } },
    audio: { contributions: [] },
 }, composition.timeline);
  const html = compileHtmlProgram(reused).html;
  assert.match(html, /data-hypit-occurrence-path="\[&quot;background&quot;\]"/u);
  assert.match(html, /data-hypit-occurrence-path="\[&quot;inset&quot;,&quot;picture&quot;\]"/u);
  const elementIds = [...html.matchAll(/<img id="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(elementIds.length, 2);
  assert.equal(new Set(elementIds).size, 2);
});

test("shared glyph filter definitions live outside temporal Present capture roots", () => {
  const { composition, timeline } = fixture();
  const changed = structuredClone(composition);
  const upper = visualScopeTracks(changed.visual.root).find((track) => track.id === "upper");
  assert.ok(upper !== undefined);
  const text = visualElements(visualPresents(upper)[0]!.root).find(element => element.kind === "text");
  assert.ok(text?.kind === "text");
  Object.assign(text, { paints: [
    { kind: "glow", paint: { kind: "solid", color: "#ff00ff" }, blurPx: 4, spreadPx: 1 },
    { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
  ] });
  const html = compileHtmlProgram(changed).html;
  const definitions = html.indexOf("data-hypit-document-definitions");
  const present = html.indexOf('class="hypit-visual-present"');
  assert.ok(definitions >= 0 && definitions < present);
  assert.equal((html.match(/<filter id="hypit-/gu) ?? []).length, 1);
  assert.equal((html.match(/filter:url\(#hypit-/gu) ?? []).length, 1);
});

test("HTML renderer folds Adjustments around the accumulated picture in visual stack order", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual.root).find((track) => track.id === "lower");
  assert.ok(lower !== undefined);
  const adjusted = sealVisualTrack({
    timelineId: lower.timelineId,

    id: lower.id,
    items: [...lower.items,
      {
        kind: "adjustment",
        id: "soften",
        span: { startFrame: 0, endFrameExclusive: 30 },
        program: staticAdjustment("blur(4px)"),
      },
      {
        kind: "adjustment",
        id: "grade",
        span: { startFrame: 4, endFrameExclusive: 24 },
        visibility: [{ startFrame: 6, endFrameExclusive: 20 }],
        program: staticAdjustment("saturate(1.2) contrast(1.05)"),
      },
    ],
  });
  const value = replaceVisualTrack(composition, lower.id, adjusted);
  const html = compileHtmlProgram(value).html;
  const grade = html.indexOf('data-hypit-adjustment-id="grade"');
  const soften = html.indexOf('data-hypit-adjustment-id="soften"');
  const clear = html.indexOf("data-hypit-canvas-clear");
  const picture = html.indexOf('data-hypit-present-id="picture"');
  const words = html.indexOf('data-hypit-present-id="words"');
  assert.ok(grade >= 0 && grade < soften && soften < clear && clear < picture && picture < words,
    "later Adjustments wrap the earlier picture while later Presents remain outside");
  assert.match(html, /blur\(4px\)/u);
  assert.match(html, /saturate\(1\.2\) contrast\(1\.05\)/u);
  assert.match(html, /htmlCreateFrameWorkIndex/u);
});

test("recursive Visual Stack closes child compositing before entering its parent sequence", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual.root).find((candidate) => candidate.id === "lower");
  const upper = visualScopeTracks(composition.visual.root).find((candidate) => candidate.id === "upper");
  assert.ok(lower !== undefined && upper !== undefined);
  const adjustedUpper = sealVisualTrack({
    ...upper,
    items: [...upper.items, {
      kind: "adjustment",
      id: "child-grade",
      span: { startFrame: 0, endFrameExclusive: 30 },
      program: staticAdjustment("contrast(1.1)"),
    }],
  });
  const nested = sealComposition({
    ...composition,
    visual: { ...composition.visual, root: { members: [
      { kind: "track", id: "lower", track: lower },
      { kind: "stack", id: "foreground", scope: scope(adjustedUpper) },
    ] } },
 }, composition.timeline);
  const html = compileHtmlProgram(nested).html;
  const clear = html.indexOf("data-hypit-canvas-clear");
  const picture = html.indexOf('data-hypit-present-id="picture"');
  const stack = html.indexOf('data-hypit-stack-id="foreground"');
  const adjustment = html.indexOf('data-hypit-adjustment-id="child-grade"');
  const words = html.indexOf('data-hypit-present-id="words"');
  assert.ok(clear < picture && picture < stack && stack < adjustment && adjustment < words);
  assert.equal((html.match(/data-hypit-stack-id=/gu) ?? []).length, 1);
});

test("HTML renderer rejects an Adjustment programme owned by another renderer", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual.root).find((track) => track.id === "lower");
  assert.ok(lower !== undefined);
  const adjusted = sealVisualTrack({
    timelineId: lower.timelineId,

    id: lower.id,
    items: [...lower.items, {
      kind: "adjustment",
      id: "grade",
      span: { startFrame: 0, endFrameExclusive: 30 },
      program: { format: "example.color-grade@1", payload: { exposure: 0.25 }, artifacts: [] },
    }],
  });
  const value = replaceVisualTrack(composition, lower.id, adjusted);
  assert.throws(() => compileHtmlProgram(value),
    /does not support Visual Adjustment format example\.color-grade@1/u);
});

test("HTML Adjustment activity is an absolute-frame function across arbitrary seeks", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlAdjustmentScript } = await import("../src/html-adjustment.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const element = { style: { filter: "uninitialized" } };
  const peer = { style: { filter: "uninitialized" } };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  const window_: {
    addEventListener: (_name: string, callback: typeof seek) => void;
    __hypitSetAdjustmentBypassed?: (path: readonly string[], id: string, bypassed: boolean) => boolean;
  } = { addEventListener: (_name, callback) => { seek = callback; } };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlAdjustmentScript([{
    id: "grade",
    occurrencePath: ["left"],
    adjustmentId: "grade",
    startFrame: 4,
    endFrameExclusive: 24,
    visibility: [{ startFrame: 6, endFrameExclusive: 10 }, { startFrame: 16, endFrameExclusive: 20 }],
    keyframes: [{ at: 0, filter: "blur(4px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" }],
  }, {
    id: "peer-grade",
    occurrencePath: ["right"],
    adjustmentId: "grade",
    startFrame: 4,
    endFrameExclusive: 24,
    keyframes: [{ at: 0, filter: "contrast(1.1)", opacity: 1, transform: "none", transformOrigin: "50% 50%" }],
  }])}`, {
    document: { getElementById: (id: string) => id === "grade" ? element : peer },
    window: window_,
  });
  assert.equal(element.style.filter, "none");
  seek({ detail: { frame: 17 } });
  assert.equal(element.style.filter, "blur(4px)");
  seek({ detail: { frame: 12 } });
  assert.equal(element.style.filter, "none");
  seek({ detail: { frame: 7 } });
  assert.equal(element.style.filter, "blur(4px)");
  assert.equal(peer.style.filter, "contrast(1.1)");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["left"], "grade", true), true);
  assert.equal(element.style.filter, "none");
  assert.equal(peer.style.filter, "contrast(1.1)");
  seek({ detail: { frame: 8 } });
  assert.equal(element.style.filter, "none");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["left"], "grade", false), true);
  assert.equal(element.style.filter, "blur(4px)");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["missing"], "grade", true), false);
  seek({ detail: { frame: 24 } });
  assert.equal(element.style.filter, "none");
});

test("HTML Adjustment samples dynamic effect keyframes on occurrence-local progress", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlAdjustmentScript } = await import("../src/html-adjustment.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const element = { style: { filter: "uninitialized", opacity: "1", transform: "none", transformOrigin: "50% 50%" } };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  let animationCount = 0;
  class Effect {
    constructor(readonly target: typeof element, readonly keyframes: readonly Record<string, string | number>[]) {}
  }
  class AnimationProbe {
    constructor(readonly effect: Effect) { animationCount += 1; }
    pause() {}
    cancel() {}
    set currentTime(value: number) {
      const state = this.effect.keyframes.find(({ offset }) => offset === value / 1000);
      if (state === undefined) throw new Error(`Fixture has no exact state at ${value}.`);
      this.effect.target.style.filter = String(state.filter);
      this.effect.target.style.opacity = String(state.opacity);
      this.effect.target.style.transform = String(state.transform);
      this.effect.target.style.transformOrigin = String(state.transformOrigin);
    }
  }
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlAdjustmentScript([{
    id: "pulse",
    occurrencePath: ["scope"],
    adjustmentId: "pulse",
    startFrame: 10,
    endFrameExclusive: 13,
    keyframes: [
      { at: 0, filter: "blur(0px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
      { at: 0.5, filter: "blur(12px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
      { at: 1, filter: "blur(0px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
    ],
  }])}`, {
    Animation: AnimationProbe,
    KeyframeEffect: Effect,
    document: { getElementById: () => element, timeline: {} },
    getComputedStyle: () => element.style,
    window: { addEventListener: (_name: string, callback: typeof seek) => { seek = callback; } },
  });
  assert.equal(animationCount, 1);
  seek({ detail: { frame: 10 } });
  assert.equal(element.style.filter, "blur(0px)");
  seek({ detail: { frame: 11 } });
  assert.equal(element.style.filter, "blur(12px)");
  seek({ detail: { frame: 12 } });
  assert.equal(element.style.filter, "blur(0px)");
  assert.equal(animationCount, 1);
});

test("Text shrink preserves authored hug sizing and trims metrics inside the content box", () => {
  const timeline = sealTimeline({
    id: "text-space",
        frameCount: 30, frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,

    id: "text",
    presents: [{
      id: "title",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: htmlVisualElement({ id: "root", kind: "box", style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }], children: [
        {
          id: "flow",
          kind: "text-flow",
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
          document: { paragraphs: [{
            id: "title",
            inlines: [
              { kind: "text", id: "first", text: "RANKING THE BEST" },
              { kind: "break", id: "break" },
              { kind: "text", id: "second", text: "FOOTBALLERS" },
            ],
          }] },
          typography: {
            fonts: [fixtureFont],
            sizePx: 44,
            weight: 700,
            style: "normal",
            axes: [],
            features: [],
            synthesis: "none",
            kerning: "auto",
            trackingPx: 0,
            wordSpacingPx: 0,
            lineHeight: 1,
            direction: "auto",
            writingMode: "horizontal-tb",
            baselineShiftPx: 0,
            tabSize: 4,
            indentationPx: 0,
            paragraphBeforePx: 0,
            paragraphAfterPx: 0,
            transform: "none",
            variantCaps: "normal",
            verticalAlign: "baseline",
            decorations: [],
            cjk: { textSpacing: "normal", punctuationTrim: "none" },
          },
          paints: [
            { kind: "fill", paint: { kind: "solid", color: "#090a0f" } },
            {
              kind: "box",
              target: "content",
              continuity: "isolated",
              decoration: {
                fill: { kind: "solid", color: "#f1eee6" },
                paddingPx: { top: 4, right: 0, bottom: 4, left: 0 },
                radiiPx: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
                shadows: [],
              },
            },
          ],
          flow: {
            form: { kind: "area" },
            inlineSize: "fixed",
            blockSize: "hug",
            paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
            inlineAlign: "center",
            blockAlign: "center",
            wrap: "none",
            overflow: "shrink",
            maxLines: 2,
            minimumScale: 0.9,
            clipToFrame: false,
            columns: 1,
            columnGapPx: 0,
            metricEdge: "cap-height",
          },
          sequences: [],
        },
      ] }),
    }],
  });
  const document = compileHtmlProgram(sealComposition({ id: "text-boxes", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 720, height: 1280, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, timeline));

  assert.match(document.html, /data-hypit-text-flow data-hypit-text-overflow="shrink" data-hypit-text-inline-size="fixed" data-hypit-text-block-size="hug"/u);
  assert.match(document.html, /flex-shrink:0/u);
  assert.match(document.html, /height:max-content/u);
  assert.match(document.html, /data-hypit-text-metrics style="display:block;text-box-trim:trim-both;text-box-edge:cap alphabetic"/u);
  assert.match(document.html, /flow\.style\.height = blockSize === 'fixed' \? String\(100 \/ scale\) \+ '%' : 'max-content'/u);
  assert.doesNotMatch(document.html, /flow\.style\.height = String\(100 \/ scale\) \+ '%'/u);
});

test("visual Artifact placeholders are materialized only by the Runtime boundary", () => {
  const { composition, picture, sound, timeline } = fixture();
  const document = compileHtmlProgram(composition);
  assert.match(document.html, /hypit-artifact:\/\/artifact-/u);
  assert.doesNotMatch(document.html, new RegExp(picture.resource, "u"));
  const resolved = materializeHtmlProgram(document,
    (artifact) => `https://assets.example/${artifact.resource}?x=1&y=2`);
  assert.doesNotMatch(resolved, /hypit-artifact:\/\//u);
  assert.match(resolved, new RegExp(`https://assets\\.example/${picture.resource}\\?x=1&amp;y=2`, "u"));
  assert.doesNotMatch(resolved, new RegExp(sound.resource, "u"));
  assert.equal(document.html.includes("assets.example"), false, "materialization must not mutate the compiled document");
});

test("HtmlProgram carries the complete render facts needed by a Provider", () => {
  const { composition, timeline } = fixture();
  const document = compileHtmlProgram(composition);
  assert.deepEqual(document.frameRate, { numerator: 30_000, denominator: 1_001 });
  assert.equal(document.frameCount, 30);
  assert.deepEqual(document.canvas, { width: 1080, height: 1920 });
  assert.match(document.html, /data-hypit-frame-numerator="30000"/u);
  assert.match(document.html, /data-hypit-frame-denominator="1001"/u);
  assert.match(document.html, /data-hypit-frame-count="30"/u);
  assert.equal(htmlProgramTime.frameSeconds(30, 30_000, 1_001), "1.001");
  assert.equal(htmlProgramTime.fpsDecimal(30_000, 1_001), "29.970029970029");
});

test("any legal frame and Provider-owned chunk can be addressed without traversing earlier frames", () => {
  const fixtureValue = fixture();
  const document = compileHtmlProgram(fixtureValue.composition);
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 0));
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 17));
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 29));
  assert.throws(() => assertHtmlFrameIndex(document, -1), /outside/u);
  assert.throws(() => assertHtmlFrameIndex(document, 30), /outside/u);

  const chunks = [
    { startFrame: 0, endFrameExclusive: 7 },
    { startFrame: 7, endFrameExclusive: 14 },
    { startFrame: 14, endFrameExclusive: 21 },
    { startFrame: 21, endFrameExclusive: 28 },
    { startFrame: 28, endFrameExclusive: 30 },
  ];
  for (const chunk of chunks) assert.doesNotThrow(() => assertHtmlFrameSpan(document, chunk));
  assert.equal(chunks[0]?.startFrame, 0);
  assert.equal(chunks.at(-1)?.endFrameExclusive, document.frameCount);
  assert.equal(chunks.reduce((frames, chunk) => frames + chunk.endFrameExclusive - chunk.startFrame, 0), document.frameCount);
  assert.throws(
    () => assertHtmlFrameSpan(document, { startFrame: 29, endFrameExclusive: 31 }),
    /outside/u,
  );
});

test("HTML-owned animation closes behind one Programme", () => {
  const { composition, picture } = fixture();
  const lower = visualScopeTracks(composition.visual.root).find((track) => track.id === "lower");
  assert(lower !== undefined);
  const present = visualPresents(lower)[0]!;
  const animated = sealPresentVisualTrack({ ...lower, presents: [{
    ...present,
    root: htmlVisualElement({
      id: "animated-media",
      kind: "image",
      picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
      artifact: picture,
      style: [{ name: "width", value: "100%" }],
      animation: { keyframes: [
        { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
        { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
      ] },
    }),
  }] });
  const document = compileHtmlProgram(replaceVisualTrack(composition, "lower", animated));
  assert.match(document.html, /data-hypit-html-element-id="animated-media"/u);
  assert.match(document.html, /element\.animate\(definition\.keyframes/u);
  assert.doesNotMatch(document.html, /data-hypit-frame-animation/u);
});

test("content-bound fonts and typed compositable Surfaces cross the same Artifact boundary", () => {
  const space = sealTimeline({ id: "test-space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 },
  });
  const font: FontArtifactRef = {
    sources: [{ artifact: {
      kind: "blob",
      resource: fixtureResource("html-program:font"),
      size: 1_024,
      mediaType: "font/woff2",
    } }],
    weight: 700,
    style: "normal",
  };
  const surfaceResource = fixtureResource("html-program:alpha-surface");
  const track = sealPresentVisualTrack({ timelineId: "test-space",

    id: "bound-render-dependencies",
    presents: [{
      id: "bound",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: htmlVisualElement({ id: "root", kind: "box", style: [], children: [
        {
          id: "text",
          kind: "text",
          text: "SVML",
          fonts: [font],
          style: [{ name: "font-size", value: "72px" }],
        },
        {
          id: "surface",
          kind: "surface",
          surface: {
            artifact: { kind: "blob", resource: surfaceResource, size: 2_048, mediaType: "video/webm" },
            width: 1080,
            height: 1920,
            picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
            timing: {
              kind: "frames",
              frameRate: { numerator: 30, denominator: 1 },
              frameCount: 30,
            },
          },
          sampling: frameSamplingMapFixture({
            targetFrameRate: space.frameRate, targetFrames: 30,
            sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 30,
            pieces: [{
              target: { startFrame: 0, endFrameExclusive: 30 },
              sourceAtStart: { numerator: 0, denominator: 1 },
              rate: { numerator: 1, denominator: 1 },
            }],
          }),
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
        },
      ] }),
    }],
  });
  const document = compileHtmlProgram(sealComposition({ id: "render-dependencies", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, space));
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.deepEqual(document.artifacts.map(({ artifact }) => artifact.resource), [font.sources[0]!.artifact.resource, surfaceResource].sort());
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === font.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === surfaceResource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.match(document.html, /@font-face\{/u);
  assert.match(document.html, /format\("woff2"\)/u);
  assert.match(document.html, /font-synthesis:none/u);
  assert.match(document.html, /data-hypit-alpha-mode="straight"/u);
  assert.match(document.html, /data-hypit-color-primaries="bt709"/u);
  assert.match(document.html, /data-hypit-color-transfer="srgb"/u);
  assert.match(document.html, /data-hypit-color-matrix="rgb"/u);
  assert.match(document.html, /data-hypit-color-range="full"/u);
  assert.match(document.html, /data-hypit-bit-depth="8"/u);
  const materialized = materializeHtmlProgram(document,
    (artifact) => `https://assets.example/${artifact.resource}?token=1&part=2`);
  assert.doesNotMatch(materialized, /hypit-artifact:\/\//u);
  assert.match(materialized, new RegExp(font.sources[0]!.artifact.resource, "u"));
  assert.match(materialized, new RegExp(surfaceResource, "u"));
});

test("exact timed sampling keeps a held frame as one compact interval without zero-rate browser media", () => {
  const timeline = sealTimeline({ id: "test-space", frameCount: 8, frameRate: { numerator: 30, denominator: 1 },
  });
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:sampled-video"),
    size: 1_000,
    mediaType: "video/mp4",
  };
  const track = sealPresentVisualTrack({ timelineId: "test-space",

    id: "sampled",
    presents: [{
      id: "sampled",
      span: { startFrame: 0, endFrameExclusive: 8 },
      root: (() => {
        const sampling = frameSamplingMapFixture({
          targetFrameRate: timeline.frameRate, targetFrames: 8,
          sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 4,
          pieces: [
            { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
              rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
            { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 },
              rate: { numerator: 0, denominator: 1 } },
          ],
        });
        return {
        id: "video",
        kind: "video",
        source: directVideoSource(artifact, sampling),
        muted: true,
        sampling,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }; })(),
    }],
  });
  const document = compileHtmlProgram(sealComposition({ id: "sampled", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 100, height: 100, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, timeline));
  assert.equal((document.html.match(/data-hypit-sampling-part=/gu) ?? []).length, 0);
  assert.equal(document.videoSources.length, 1);
  assert.equal(document.videoSources[0]?.kind, "media");
  if (document.videoSources[0]?.kind !== "media") throw new Error("Expected direct media source");
  assert.equal(document.videoSources[0].sampling.stages[0]?.pieces.length, 2);
  assert.equal((document.html.match(/data-hypit-artifact-src="hypit-artifact:\/\//gu) ?? []).length, 1);
  assert.doesNotMatch(document.html, /<video\b[^>]*\ssrc=/u,
    "compiler-owned video stays inert while its exact slots remain statically readable");
  const heldPiece = document.videoSources[0].sampling.stages[0]?.pieces[1];
  assert.ok(heldPiece && isAffineTemporalMapPiece(heldPiece));
  assert.equal(heldPiece.rate.numerator, 0);
});

test("HTML terminal quantizes continuous sampling pieces without moving their source position", () => {
  const timeline = sealTimeline({ id: "partial-piece", frameCount: 3, frameRate: { numerator: 30, denominator: 1 } });
  const sourceFrameRate = { numerator: 24, denominator: 1 };
  const boundary = exactTemporalValueFromFrames(1, { frameRate: { numerator: 48, denominator: 1 } });
  const target = { id: "occurrence", duration: exactTemporalValueFromFrames(3, timeline) };
  const source = { id: "materialization", duration: exactTemporalValueFromFrames(3, { frameRate: sourceFrameRate }) };
  const sampling = sealTemporalMap({ stages: [{ target, source, pieces: [
    {
      target: { start: exactTemporalValueFromFrames(0, timeline), end: boundary },
      sourceAtStart: exactTemporalValueFromFrames(0, { frameRate: sourceFrameRate }),
      rate: { numerator: 1, denominator: 1 },
    },
    {
      target: { start: boundary, end: target.duration },
      sourceAtStart: boundary,
      rate: { numerator: 1, denominator: 1 },
    },
  ] }] });
  const track = sealPresentVisualTrack({ timelineId: timeline.id, id: "partial-piece", presents: [{
    id: "partial-piece",
    span: { startFrame: 0, endFrameExclusive: 3 },
    root: {
      id: "video",
      kind: "video",
      source: directVideoSource({ kind: "blob", resource: fixtureResource("html-program:partial-piece"), size: 1, mediaType: "video/mp4" }, sampling),
      muted: true,
      sampling,
    },
  }] });
  const document = compileHtmlProgram(sealComposition({ id: "partial-piece", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 100, height: 100, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, timeline));
  assert.equal(document.videoSources.length, 1);
  assert.equal(document.videoSources[0]?.kind, "media");
  if (document.videoSources[0]?.kind !== "media") throw new Error("Expected direct media source");
  assert.deepEqual(document.videoSources[0].sampling, sampling);
});

test("a Track naming five takes still lowers to DOM identities a Windows path can hold", () => {
  // HTML renderer spends the video element's id as a directory name for that video's extracted
  // frames, under the Provider execution's private decoded-frame directory.
  // That surround is 103 characters of a 260-character budget, so the id is what decides whether
  // extraction can write at all. These identities are the ones a five-take speech Track produces:
  // the Track names every take, and the Present and the layer each repeat the Track.
  const trackId = "speech-visual:opening-monologue-take-1+opening-monologue-take-2"
    + "+opening-monologue-take-3+opening-monologue-take-4+opening-monologue-take-5";
  const presentId = `${trackId}:clip-1`;
  const timeline = sealTimeline({ id: "test-space", frameCount: 8, frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealPresentVisualTrack({ timelineId: "test-space",

    id: trackId,
    presents: [{
      id: presentId,
      span: { startFrame: 0, endFrameExclusive: 8 },
      root: (() => {
        const sampling = frameSamplingMapFixture({
          targetFrameRate: timeline.frameRate, targetFrames: 8,
          sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 8,
          pieces: [
            { target: { startFrame: 0, endFrameExclusive: 4 }, sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
            { target: { startFrame: 4, endFrameExclusive: 8 }, sourceAtStart: { numerator: 4, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
          ],
        });
        return {
        id: `${presentId}:foreground`,
        kind: "video",
        source: directVideoSource({
          kind: "blob" as const,
          resource: fixtureResource("html-program:long-identity-video"),
          size: 1_000,
          mediaType: "video/mp4",
        }, sampling),
        muted: true,
        sampling,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }; })(),
    }],
  });
  const document = compileHtmlProgram(sealComposition({ id: "long-identity", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 100, height: 100, clearColor: "#000000" }, root: scope(track) }, audio: { contributions: [] } }, timeline));

  // The `id` attribute only; `data-hypit-element-id` and friends are meant to stay readable.
  const identities = [...document.html.matchAll(/\sid="([^"]*)"/gu)].map((match) => match[1]!);
  assert.ok(identities.length > 0, "the document names something");
  assert.deepEqual(identities.filter((id) => id.length > 64), [],
    "a DOM identity does not grow with the number of takes its Track names");
  // The parts stay readable where a reader looks for them, spelled the way the author wrote them.
  assert.ok(document.html.includes(`data-hypit-occurrence-path="[&quot;${trackId}&quot;]"`));
  assert.ok(document.html.includes(`data-hypit-element-id="${presentId}:foreground"`));
});

test("HTML visuals own local HTML while retaining typed child resources and format boundaries", async () => {
  const { htmlVisual } = await import("../src/html-visual.js");
  const { timeline, picture } = fixture();
  const opaqueArtifact = { kind: "blob" as const, resource: fixtureResource("html-program:opaque-program"),
    size: 12, mediaType: "image/png" };
  const visual = sealPresentVisualTrack({ id: "scene", timelineId: timeline.id,
    presents: [{ id: "scene", span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "root", kind: "program", slots: [{ name: "photo", element: {
        id: "photo", kind: "image", picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, artifact: picture,
      } }], program: htmlVisual({
        html: `<section class="viewport">{{photo}}<img class="opaque" src="hypit-artifact://${opaqueArtifact.resource}"><svg><path d="M0 0H20"/></svg></section>`,
        css: '.viewport { backdrop-filter:blur(4px); display:grid; }',
        setup: 'return frame => { root.dataset.frame = String(frame); };',
      }, [opaqueArtifact]) } }] });
  const composition = sealComposition({ id: "scene", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 200, height: 200, clearColor: "#000000" }, root: scope(visual) }, audio: { contributions: [] } }, timeline);
  const document = compileHtmlProgram(composition);
  assert.equal(document.artifacts.length, 2);
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === opaqueArtifact.resource)?.usage,
    { kind: "always" }, "opaque HtmlVisual dependencies remain conservative");
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.ok(document.html.includes('<section class="viewport">'));
  const opaqueId = document.artifacts.find(({ artifact }) => artifact.resource === opaqueArtifact.resource)!.id;
  const pictureId = document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)!.id;
  assert.ok(document.html.includes(`class="opaque" src="hypit-artifact://${opaqueId}"`),
    "opaque HtmlVisual structure keeps its authored HTML while declared locators use Programme identities");
  assert.ok(document.html.includes(`data-hypit-artifact-src="hypit-artifact://${pictureId}"`),
    "a typed child keeps the structural compiler's selection-gated resource behavior");
  assert.ok(document.html.includes('@scope'));
  const missing = structuredClone(composition);
  const root = visualScopeTracks(missing.visual.root)[0]!;
  const first = visualPresents(root)[0];
  if (first?.root.kind !== "program") throw new Error("fixture");
  const program = first.root.program;
  (program as { format: string }).format = "another.renderer@1";
  assert.throws(() => compileHtmlProgram(missing), /does not support visual program format/);
});

test("HTML visual state follows direct seeks and reports authored evaluation failures", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frame: -1 };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  const window: { addEventListener: (name: string, callback: typeof seek) => void; __hypitHtmlVisualError?: string } = {
    addEventListener: (_name, callback) => { seek = callback; },
  };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 30, durationFrames: 90,
    program: { html: "", setup: 'return frame => { if(frame===60) throw new Error("bad pose"); root.frame=frame; };' },
  }])}`, { window, document: { getElementById: () => root } });
  seek({ detail: { frame: 75 } });
  assert.equal(root.frame, 45);
  seek({ detail: { frame: 36 } });
  assert.equal(root.frame, 6);
  seek({ detail: { frame: 90 } });
  assert.match(window.__hypitHtmlVisualError!, /bad pose/);
});

test("inactive programs settle once, while re-entry and repeated active seeks still redraw ready assets", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frames: [] as number[], ready: false, painted: false };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 30, durationFrames: 30,
    program: { html: "", setup: 'return frame => { root.frames.push(frame); root.painted=root.ready; };' },
  }])}`, { window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: () => root } });
  seek({ detail: { frame: 15 } });
  assert.deepEqual(root.frames, [0]);
  seek({ detail: { frame: 30 } });
  root.ready = true;
  seek({ detail: { frame: 30 } });
  assert.equal(root.painted, true);
  seek({ detail: { frame: 60 } });
  seek({ detail: { frame: 90 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30]);
  seek({ detail: { frame: 45 } });
  seek({ detail: { frame: 15 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30, 15, 0]);
});

test("sequential HtmlVisual work follows active and crossed spans instead of every visual", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const entries = Array.from({ length: 100 }, (_, index) => ({
    id: `scene-${index}`,
    startFrame: index * 10,
    durationFrames: 10,
    program: { html: "", setup: "return () => { root.calls += 1; };" },
  }));
  const roots = new Map(entries.map(entry => [entry.id, { calls: 0 }]));
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript(entries)}`, {
    window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  for (const root of roots.values()) root.calls = 0;
  for (let frame = 0; frame < 1_000; frame++) seek({ detail: { frame } });
  assert.equal([...roots.values()].reduce((sum, root) => sum + root.calls, 0), 1_099);
});

test("HTML visual setup is limited to Presents overlapping the render selection", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const roots = new Map([
    ["early", { setups: 0, renders: 0 }],
    ["selected", { setups: 0, renders: 0 }],
  ]);
  const entries = [
    { id: "early", startFrame: 0, durationFrames: 30,
      program: { html: "", setup: "root.setups += 1; return () => { root.renders += 1; };" } },
    { id: "selected", startFrame: 90, durationFrames: 30,
      program: { html: "", setup: "root.setups += 1; return () => { root.renders += 1; };" } },
  ];
  runInNewContext(`${frameWorkIndexRuntime}
    htmlPrepareFrameSelection([{ startFrame: 100, endFrameExclusive: 101 }]);
    ${htmlVisualScript(entries)}`, {
    window: { addEventListener() {} },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  assert.deepEqual(roots.get("early"), { setups: 0, renders: 0 });
  assert.deepEqual(roots.get("selected"), { setups: 1, renders: 1 });
});

test("an asynchronous HTML visual reports its unsupported frame behavior instead of racing capture", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const window = { addEventListener() {}, __hypitHtmlVisualError: undefined as string | undefined };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 0, durationFrames: 30,
    program: { html: "", setup: 'return async frame => { await Promise.resolve(); throw new Error("late drawing failure"); };' },
  }])}`, { window, document: { getElementById: () => ({}) } });
  assert.match(window.__hypitHtmlVisualError!, /must be synchronous/u);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(window.__hypitHtmlVisualError!, /late drawing failure/u);
});
