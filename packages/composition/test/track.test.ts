import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";

import { registerTypeRefinements } from "@hypit/refinement";
import { createResolvedClosure } from "@hypit/kernel";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { RefinementRegistry, refineValue } from "@hypit/refinement";
import { blobManifest } from "@hypit/blob";
import { preparedAudioSource } from "@hypit/media";
import type { FontArtifactRef, PreparedMedia } from "@hypit/media";
import { mediaManifest } from "@hypit/media";
import { narrativeManifest } from "@hypit/narrative";
import { timelineManifest, sealTimeline } from "@hypit/timeline";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { spatialManifest } from "@hypit/spatial";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap, sealTemporalMap } from "@hypit/temporal";
import { recipeManifest } from "@hypit/recipe";
import { VISUAL_IR_V1 } from "@hypit/composition";

import {
  assertCompositionIdentity,
  assertAudioTrackIdentity,
  assertVisualTrackIdentity,
  audioGraphFromClips,
  compositionComponent,
  compositionManifest,
  compositionTypes,
  sealAudioTrack,
  sealComposition,
  sealPresentVisualTrack,
  sealVisualTrack,
  visualScopeTrackOccurrences,
} from "../src/index.js";
import type { PresentVisualTrack, VisualTrack } from "../src/index.js";

const scope = (...tracks: VisualTrack[]) => ({ members: tracks.map((track) => ({
  kind: "track" as const,
  id: track.id,
  track,
})) });

const videoContractManifests = [blobManifest, narrativeManifest, mediaManifest, timelineManifest,
  speechEvidenceManifest, recipeManifest, spatialManifest, compositionManifest] as const;

const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("track:test-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};
const audio: BlobRef = {
  kind: "blob",
  resource: fixtureResource("audio"),
  size: 24,
  mediaType: "audio/wav",
};

function preparedAudio(): PreparedMedia {
  const domain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(192_000,
    { frameRate: { numerator: 48_000, denominator: 1 } }) };
  return { source: audio, domain, audio: { streamIndex: 0, presentationStart: exactTemporalZero(),
    sourceDomain: domain, map: identityTemporalMap(domain), interpretation: { sampleRate: 48_000, channels: 2 } } };
}

function fixture() {
  const timeline = sealTimeline({ id: "test-space", frameCount: 120, frameRate: { numerator: 30, denominator: 1 },
  });
  const visual = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "caption",
    presents: [{
      id: "cue-1",
      span: { startFrame: 0, endFrameExclusive: 60 },
      root: { id: "root", kind: "box", children: [
        { id: "text", kind: "text", text: "Hello", fonts: [font], style: [] },
      ], style: [{ name: "position", value: "absolute" }] },
    }],
  });
  const sound = sealAudioTrack({ timelineId: "test-space",
    id: "speech",
    graph: audioGraphFromClips([{
      id: "speech",
      source: preparedAudioSource(preparedAudio()),
      preparation: preparedAudio().audio!.map,
      target: frameRangeFixture(0, 192_000, { numerator: 48_000, denominator: 1 }),
      sampling: frameSamplingMapFixture({
        targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames: 192_000,
        sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames: 192_000,
        pieces: [{ target: { startFrame: 0, endFrameExclusive: 192_000 },
        sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
        }],
      }),
      gain: 1,
      fadeIn: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    }]),
  });
  return { timeline, visual, sound };
}

test("Composition accepts self-contained peer VisualTrack and AudioTrack values", () => {
  const { timeline, visual, sound } = fixture();
  assert.equal(visual.visualIr, VISUAL_IR_V1);
  const composition = sealComposition({
    id: "main",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(visual),
    audio: [sound],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
  assert.deepEqual([composition.audio[0]?.id, composition.visual.members[0]?.kind === "track"
    ? composition.visual.members[0].track.id : undefined], ["speech", "caption"]);
});

test("AudioTrack rejects a sampling domain that differs from its prepared audio domain", () => {
  const { timeline, sound } = fixture();
  const quantized = structuredClone(sound) as unknown as {
    graph: { nodes: Array<{ kind: string; clip?: { sampling: { stages: Array<{
      source: { duration: { ticks: string; timeBase: { numerator: number; denominator: number } } };
    }> } } }> };
  };
  const source = quantized.graph.nodes.find((node) => node.kind === "source");
  assert.ok(source?.clip !== undefined);
  source.clip.sampling.stages.at(-1)!.source.duration = {
    ticks: "960001", timeBase: { numerator: 1, denominator: 240_000 },
  };
  assert.throws(() => assertAudioTrackIdentity(quantized as never, timeline), /differs from its prepared audio domain/u);
});

test("VisualTrack carries exact logical source duration without a terminal materialization", () => {
  const timeline = sealTimeline({ id: "story", frameRate: { numerator: 30, denominator: 1 }, frameCount: 7 });
  const logicalSource = exactTemporalValueFromFrames(5, { frameRate: { numerator: 24, denominator: 1 } });
  const sampling = sealTemporalMap({ stages: [{
    target: { id: "occurrence", duration: exactTemporalValueFromFrames(7, timeline) },
    source: { id: "source", duration: logicalSource },
    pieces: [{
      target: { start: exactTemporalZero(), end: exactTemporalValueFromFrames(7, timeline) },
      sourceAtStart: exactTemporalZero(),
      rate: { numerator: 25, denominator: 28 },
    }],
  }] });
  const track = sealPresentVisualTrack({
    id: "picture", timelineId: timeline.id, visualIr: "hypit.visual-ir@1",
    presents: [{
      id: "clip", span: { startFrame: 0, endFrameExclusive: 7 },
      root: {
        id: "source", kind: "video", source: {
          source: { kind: "blob", resource: fixtureResource("video"), mediaType: "video/mp4", size: 1 },
          streamIndex: 0, presentationStart: exactTemporalZero(),
          sourceDomain: { id: "source", duration: logicalSource },
          interpretation: { codedWidth: 1920, codedHeight: 1080, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 },
        },
        style: [], muted: true, sampling,
      },
    }],
  });
  assert.doesNotThrow(() => assertVisualTrackIdentity(track, timeline));
});

test("Composition accepts case-insensitive hexadecimal canvas colors", () => {
  const { timeline, visual } = fixture();
  const composition = sealComposition({
    id: "uppercase-color",
    canvas: { width: 480, height: 854, clearColor: "#09090B" },
    visual: scope(visual), audio: [],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
});

test("AudioTrack is one closed DAG with explicit silence, mix and process references", () => {
  const { timeline, sound } = fixture();
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "audio-graph", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: scope(), audio: [sound],
  }), timeline));
  const cyclic = sealAudioTrack({ timelineId: timeline.id, id: "cycle", graph: {
    nodes: [
      { kind: "process", id: "a", inputs: { signal: { node: "b", port: "signal" } },
        program: { format: "example.process@1", payload: {}, artifacts: [] } },
      { kind: "process", id: "b", inputs: { signal: { node: "a", port: "signal" } },
        program: { format: "example.process@1", payload: {}, artifacts: [] } },
    ],
    output: { node: "a", port: "signal" },
  } });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "cycle", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: scope(), audio: [cyclic],
  }), timeline), /contains a cycle/u);
  const unreachable = sealAudioTrack({ timelineId: timeline.id, id: "unreachable", graph: {
    nodes: [{ kind: "silence", id: "used" }, { kind: "silence", id: "unused" }],
    output: { node: "used", port: "signal" },
  } });
  assert.throws(() => assertAudioTrackIdentity(unreachable, timeline), /unreachable nodes/u);
  const sourceNode = sound.graph.nodes.find((node) => node.kind === "source");
  assert.ok(sourceNode?.kind === "source");
  const malformed = sealAudioTrack({ timelineId: timeline.id, id: "malformed", graph: {
    nodes: [{ kind: "process", id: "bad", inputs: { signal: { node: "source", port: "signal" } },
      program: { format: "example.process@1", payload: [] as never, artifacts: [] } },
    { kind: "source", id: "source", clip: sourceNode.clip }],
    output: { node: "bad", port: "signal" },
  } });
  assert.throws(() => assertAudioTrackIdentity(malformed, timeline), /payload must be an object/u);
});

test("VisualTrack keeps source-owning Presents and backdrop Adjustments in one ordered item sequence", () => {
  const { timeline, visual } = fixture();
  const adjusted = sealVisualTrack({
    timelineId: visual.timelineId,
    visualIr: visual.visualIr,
    id: "adjusted-caption",
    items: [
      visual.items[0]!,
      {
        kind: "adjustment",
        id: "grade",
        span: { startFrame: 0, endFrameExclusive: 60 },
        program: {
          format: "example.color-grade@1",
          payload: { exposure: 0.25 },
          artifacts: [],
        },
      },
    ],
  });

  assert.doesNotThrow(() => assertVisualTrackIdentity(adjusted, timeline));
  assert.deepEqual(adjusted.items.map((item) => item.kind), ["present", "adjustment"]);
  assert.equal(adjusted.items[1]?.kind === "adjustment" ? adjusted.items[1].program.format : undefined,
    "example.color-grade@1");
  assert.equal(Object.hasOwn(adjusted.items[1]!, "elements"), false);
});

test("VisualTrack constructors preserve explicit Visual Item discriminants", () => {
  const { visual } = fixture();
  const present = visual.items[0]!;
  assert.throws(() => sealVisualTrack({
    timelineId: visual.timelineId,
    visualIr: visual.visualIr,
    id: "misspelled-item",
    items: [{
      kind: "adjusment",
      id: "grade",
      span: { startFrame: 0, endFrameExclusive: 60 },
      program: { format: "example.color-grade@1", payload: {}, artifacts: [] },
    }] as never,
  }), /invalid Visual Item kind adjusment/u);
  assert.throws(() => sealPresentVisualTrack({
    timelineId: visual.timelineId,
    visualIr: visual.visualIr,
    id: "wrong-present-kind",
    presents: [{ ...present, kind: "adjustment" }] as never,
  }), /received non-Present kind adjustment/u);
  assert.throws(() => sealVisualTrack({
    timelineId: visual.timelineId,
    visualIr: visual.visualIr,
    id: "missing-items",
  } as never), /requires an items array/u);
});

test("Visual Adjustment validates only shared time facts and its package-owned programme carrier", () => {
  const { timeline } = fixture();
  const invalid = sealVisualTrack({
    timelineId: timeline.id,
    visualIr: VISUAL_IR_V1,
    id: "invalid-adjustment",
    items: [{
      kind: "adjustment",
      id: "grade",
      span: { startFrame: 0, endFrameExclusive: 60 },
      program: { format: "", payload: {}, artifacts: [] },
    }],
  });
  assert.throws(() => assertVisualTrackIdentity(invalid, timeline), /program\.format/u);
});

test("VisualTrack accepts authored backdrop compositing", () => {
  const { timeline, visual, sound } = fixture();
  const content = structuredClone(visual) as PresentVisualTrack;
  const first = content.items[0]!.root;
  const invasive = sealPresentVisualTrack({...content,
    presents: [{
      ...content.items[0]!,
      root: { ...first, style: [{ name: "backdrop-filter", value: "blur(20px)" }] },
    }],
  });
  const composition = sealComposition({
    id: "invasive",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(invasive), audio: [sound],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
});

test("VisualTrack style values cannot smuggle a second declaration", () => {
  const { timeline, visual } = fixture();
  const content = structuredClone(visual) as PresentVisualTrack;
  const first = content.items[0]!.root;
  const smuggled = sealPresentVisualTrack({...content,
    presents: [{
      ...content.items[0]!,
      root: { ...first, style: [{ name: "color", value: "red;backdrop-filter:blur(20px)" }] },
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      id: "smuggled",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      visual: scope(smuggled), audio: [],
    }), timeline),
    /escapes its declaration/,
  );
});

test("VisualTrack cannot silently extend the versioned public Visual IR", () => {
  const { timeline, visual } = fixture();
  const first = visual.items[0]!.root;
  const unknownStyle = sealPresentVisualTrack({...visual,
    presents: [{
      ...visual.items[0]!,
      root: { ...first, style: [{ name: "mask-image", value: "linear-gradient(black, transparent)" }] },
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      id: "unknown-style",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      visual: scope(unknownStyle), audio: [],
    }), timeline),
    /outside hypit\.visual-ir@1/u,
  );

  const fixedPosition = sealPresentVisualTrack({...visual,
    presents: [{
      ...visual.items[0]!,
      root: { ...first, style: [{ name: "position", value: "fixed" }] },
    }],
  });
  assert.throws(
    () => assertVisualTrackIdentity(fixedPosition, timeline),
    /position has unsupported value fixed/u,
  );

  const environmentBound = sealPresentVisualTrack({...visual,
    presents: [{
      ...visual.items[0]!,
      root: { ...first, style: [{ name: "color", value: "var(--host-color)" }] },
    }],
  });
  assert.throws(
    () => assertVisualTrackIdentity(environmentBound, timeline),
    /environment-dependent style value/u,
  );
});

test("VisualTrack explicitly binds the visual IR instead of trusting the Runtime", () => {
  const { timeline, visual } = fixture();
  assert.throws(
    () => assertVisualTrackIdentity({
      ...visual,
      visualIr: "third-party.browser-css@1",
    } as unknown as VisualTrack, timeline),
    /Unsupported VisualTrack visual IR/u,
  );
});

test("the Type owner rejects duplicate identities inside the recursive Visual tree", async () => {
  const { visual } = fixture();
  const present = visual.items[0]!;
  const invalid = sealPresentVisualTrack({...visual,
    presents: [{
      ...present,
      root: present.root.kind === "box" ? {
        ...present.root,
        children: [...present.root.children, { id: "text", kind: "box", children: [], style: [] }],
      } : present.root,
    }],
  });
  const refinements = new RefinementRegistry();
  registerTypeRefinements(refinements, compositionComponent.refinements);

  await assert.rejects(
    async () => await refineValue(
      compositionTypes.visualTrack,
      (canonicalize(invalid)),
      refinements,
    ),
    /has duplicate element text/u,
  );
});

test("Composition validates Track frame ranges against the explicitly connected Timeline", () => {
  const { timeline, visual } = fixture();
  const foreign = sealTimeline({ id: "test-space", frameCount: 24, frameRate: { numerator: 24, denominator: 1 },
  });
  const composition = sealComposition({
    id: "foreign",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(visual), audio: [],
  });
  assert.throws(() => assertCompositionIdentity(composition, foreign), /outside Timeline/);
  assert.notDeepEqual(timeline, foreign);
});

test("one authoring Track owns its local Present declaration order", () => {
  const { timeline, visual } = fixture();
  const content = structuredClone(visual) as PresentVisualTrack;
  const second = {
    ...structuredClone(content.items[0]!),
    id: "cue-2",
  };
  const interleaved = sealPresentVisualTrack({...content,
    presents: [
      content.items[0]!,
      second,
    ],
  });
  const composition = sealComposition({
    id: "interleaved",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(interleaved), audio: [],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
  assert.deepEqual(interleaved.items.map((present) => present.id), ["cue-1", "cue-2"]);
});

test("visual ordering is array position and identities remain validation-only", () => {
  const { timeline, visual } = fixture();
  const present = visual.items[0]!;
  const ordered = sealVisualTrack({
    timelineId: visual.timelineId,
    visualIr: visual.visualIr,
    id: "ordered",
    items: [{ ...structuredClone(present), id: "another" }, present],
  });
  assert.doesNotThrow(() => assertVisualTrackIdentity(ordered, timeline));
  assert.deepEqual(ordered.items.map((item) => item.id), ["another", "cue-1"]);

  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "repeated-member-id",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: { members: [
      { kind: "track", id: "same", track: visual },
      { kind: "track", id: "same", track: visual },
    ] },
    audio: [],
  }), timeline), /duplicate member id same/u);
});

test("Composition audio is a multiset of closed signals rather than a map keyed by Track id", () => {
  const { timeline, sound } = fixture();
  const composition = sealComposition({
    id: "repeated-signal",
    canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] },
    audio: [sound, structuredClone(sound)],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
  assert.equal(composition.audio.length, 2);
  assert.deepEqual(composition.audio.map((track) => track.id), [sound.id, sound.id]);
});

test("Composition distinguishes reusable VisualTrack values from their Film-owned occurrences", () => {
  const { timeline, visual } = fixture();
  const composition = sealComposition({
    id: "reused-visual",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: { members: [
      { kind: "track", id: "background", track: visual },
      { kind: "stack", id: "inset", scope: { members: [
        { kind: "track", id: "picture", track: visual },
      ] } },
    ] },
    audio: [],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, timeline));
  assert.deepEqual(visualScopeTrackOccurrences(composition.visual).map((item) => item.path), [
    ["background"],
    ["inset", "picture"],
  ]);

  assert.throws(() => assertCompositionIdentity(sealComposition({
    ...composition,
    visual: { members: [
      { kind: "track", id: "same", track: visual },
      { kind: "track", id: "same", track: visual },
    ] },
  }), timeline), /duplicate member id same/u);
});

test("Visual Present animations may finish before or after their visibility window without changing Track isolation", () => {
  const { timeline, visual } = fixture();
  const present = visual.items[0]!;
  const root = present.root;
  const animated = sealPresentVisualTrack({...visual,
    presents: [{
      ...present,
      root: {
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
            { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      },
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "animated",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(animated), audio: [],
  }), timeline));
  const clipped = sealPresentVisualTrack({...visual,
    presents: [{
      ...present,
      root: {
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
            { atFrame: 90, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      },
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "clipped-animation",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(clipped), audio: [],
  }), timeline));
  const invasive = sealPresentVisualTrack({...visual,
    presents: [{
      ...present,
      root: {
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "backdrop-filter", value: "blur(0px)" }] },
            { atFrame: 60, style: [{ name: "backdrop-filter", value: "blur(20px)" }] },
          ],
        },
      },
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "animated-invasive",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(invasive), audio: [],
  }), timeline));
});
