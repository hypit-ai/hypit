import { sealTimeline, timelineDependency, timelineManifest, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectMomentWindow, projectProgramWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";
import type { TemporalWindowProjection } from "../../../test/temporal-fixture.js";
import { audioTrackManifest, audioTrackModuleRef, audioTrackProducers, appendAudioClip, assertAudioTrackSet, createAudioTrackSet, createAudioTrackFragment, finalizeAudioTrack, renderAudioTrack, sealAudioClipSpec, sealAudioTrackHeader } from "@hypit/audio-track";
import type { AudioClipSpec, AudioTrackSet } from "@hypit/audio-track";
import { blobManifest } from "@hypit/blob";
import { registerTypeRefinements } from "@hypit/refinement";
import { audioGraphFromClips, audioTrackClips, sealComposition, compositionManifest, compositionTypes } from "@hypit/composition";
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import { AuthorFrontendRegistry, resolveCompiledSourceExport } from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import type { PreparedMedia } from "@hypit/media";
import { mediaComponent, mediaDependency, mediaManifest, mediaTypes, prepareMedia } from "@hypit/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { narrativeManifest } from "@hypit/narrative";
import { compileAudioProgram } from "@hypit/audio-program";
import { mediaOperationsManifest } from "@hypit/media-operations";
import type { ModuleManifest } from "@hypit/protocol";
import { exactTemporalValueFromFrames, isAffineTemporalMapPiece, resolveTemporalRelation, temporalDependency, temporalTypes,
  temporalValueInFrames } from "@hypit/temporal";
import type { ExactTemporalValue, TemporalDuration, TemporalMapPiece, TemporalRelationSpec } from "@hypit/temporal";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { narrativeTemporalManifest } from "@hypit/narrative-temporal";
import { spatialManifest } from "@hypit/spatial";
import { recipeManifest } from "@hypit/recipe";
import { temporalManifest } from "@hypit/temporal";
import { refineRecord, RefinementRegistry } from "@hypit/refinement";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets,
  });
  return materializeBuild(defineBuild({
    program: link(program.closure, [...program.records, ...planned.initialRecords]),
    plan: planned.plan,
  }), []);
}

const space = sealTimeline({ id: "test-space", frameCount: 300, frameRate: { numerator: 30, denominator: 1 },
});
const header = sealAudioTrackHeader({ id: "sound" });
const semanticOptions = { narrativeId: "test-narrative", segments: [{ id: "line", frameCount: 300 }], anchors: [
  { identity: "a", frame: 30 }, { identity: "b", frame: 60 },
  { identity: "c", frame: 90 }, { identity: "d", frame: 120 },
] } as const;
const semantic = timelineFixture(space, semanticOptions);
const narrativeProjection = narrativeProjectionFixture(semantic, semanticOptions);
const zero = { unit: "frames" as const, value: 0 };
const duration = (value: number) => ({ unit: "milliseconds" as const, value });
const startPoint = (offset: TemporalDuration = zero) => ({ edge: "start" as const, offset });
const endPoint = (offset: TemporalDuration = zero) => ({ edge: "end" as const, offset });
const fullBounds = () => ({ from: startPoint(), until: endPoint() });
const rateSpec = (input: Partial<Extract<TemporalRelationSpec["relations"][number], { kind: "rate" }>> = {}): TemporalRelationSpec => ({
  relations: [{
    kind: "rate", target: fullBounds(), targetAt: startPoint(), sourceAt: startPoint(),
    rate: { numerator: 1, denominator: 1 }, source: fullBounds(), ...input,
  }],
});
const sampleClock = { frameRate: { numerator: 48_000, denominator: 1 } } as const;
const sampleRational = (value: ExactTemporalValue) => {
  const result = temporalValueInFrames(value, sampleClock);
  return { numerator: Number(result.numerator), denominator: Number(result.denominator) };
};
const sampledPiece = (piece: TemporalMapPiece) => {
  assert.ok(isAffineTemporalMapPiece(piece));
  return { target: { startSample: sampleRational(piece.target.start).numerator,
    endSampleExclusive: sampleRational(piece.target.end).numerator },
  sourceAtStart: sampleRational(piece.sourceAtStart),
  rate: piece.rate,
  ...(piece.wrap === undefined ? {} : { wrap: {
    startSample: sampleRational(piece.wrap.start).numerator,
    endSampleExclusive: sampleRational(piece.wrap.end).numerator,
  } }) };
};
const affinePiece = (piece: TemporalMapPiece) => {
  assert.ok(isAffineTemporalMapPiece(piece));
  return piece;
};
const targetSamples = (target: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue }) => ({
  startSample: sampleRational(target.start).numerator,
  endSampleExclusive: sampleRational(target.end).numerator,
});

type TestMedia = { readonly prepared: PreparedMedia };

function media(id: string, sampleFrames: number): TestMedia {
  return { prepared: preparedAudio(id, sampleFrames) };
}

function preparedAudio(id: string, sampleFrames: number): PreparedMedia {
  return prepareMedia({
    id,
    source: { kind: "blob", resource: fixtureResource(`source:${id}`), size: sampleFrames * 4, mediaType: "audio/wav" },
    inspection: {
      container: { formatNames: ["wav"] },
      streams: [{
        kind: "audio", index: 0, codecType: "audio", codecName: "pcm_s16le",
        disposition: { default: true, attachedPicture: false }, timingStatus: "admissible",
        timeBase: { numerator: 1, denominator: 48_000 },
        startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
        endPts: { ticks: String(sampleFrames), timeBase: { numerator: 1, denominator: 48_000 } },
        decodedUnitCount: sampleFrames, sampleRate: 48_000, channels: 2,
        decodedSampleFrames: sampleFrames,
      }],
    },
    selection: { audioStreamIndex: 0, spanAuthority: "audio" },
  });
}

type TestAudioClipSpec = AudioClipSpec & { readonly projection: TemporalWindowProjection };
const defaultProjection: TemporalWindowProjection = {
  start: { ref: "timeline.start" },
  end: { ref: "absolute", at: { unit: "seconds", numerator: 2, denominator: 1 } },
};

function spec(overrides: Partial<TestAudioClipSpec> = {}): TestAudioClipSpec {
  const { projection = defaultProjection, ...clipOverrides } = overrides;
  return {
    ...sealAudioClipSpec({

    id: "clip",
    mix: { gain: 1, fadeIn: zero, fadeOut: zero },
    ...clipOverrides,
    }),
    projection,
  };
}

function appendProgramAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, timeline: typeof semantic,
  source: TestMedia, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source.prepared, clip, projectProgramWindow({
    itemId: clip.id, semantic: timeline, projection,
  }));
}

function appendSelectionAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, timeline: typeof semantic,
  source: TestMedia, selection: NarrativeSelectionRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source.prepared, clip, projectSelectionWindow({
    itemId: clip.id, semantic: timeline, narrative: narrativeProjection, selection,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function appendMomentAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, timeline: typeof semantic,
  source: TestMedia, moment: NarrativeMomentRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source.prepared, clip, projectMomentWindow({
    itemId: clip.id, semantic: timeline, narrative: narrativeProjection, moment,
    projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: { unit: "seconds", numerator: 1, denominator: 1 } } },
  }));
}

function programTrack(source: TestMedia, clipSpec: TestAudioClipSpec) {
  const set = appendProgramAudioItem(createAudioTrackSet(), header, semantic, source, clipSpec);
  return renderAudioTrack(space, finalizeAudioTrack(set, header));
}

test("partial identity and end alignment preserve exact silence and source head/tail semantics", () => {
  const short = media("short", 48_000);
  const start = programTrack(short, spec());
  assert.deepEqual(targetSamples(audioTrackClips(start)[0]!.target), { startSample: 0, endSampleExclusive: 96_000 });
  assert.deepEqual(audioTrackClips(start)[0]?.sampling.stages[0]?.pieces.map(sampledPiece), [{
    target: { startSample: 0, endSampleExclusive: 48_000 },
    sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
  }]);

  const endAligned = rateSpec({ targetAt: endPoint(), sourceAt: endPoint() });
  const end = programTrack(short, spec({ sampling: endAligned }));
  assert.deepEqual(sampledPiece(audioTrackClips(end)[0]!.sampling.stages[0]!.pieces[0]!).target,
    { startSample: 48_000, endSampleExclusive: 96_000 });

  const long = programTrack(media("long", 144_000), spec({ sampling: endAligned }));
  assert.deepEqual(targetSamples(audioTrackClips(long)[0]!.target), { startSample: 0, endSampleExclusive: 96_000 });
  assert.deepEqual(sampleRational(audioTrackClips(long)[0]!.sampling.stages[0]!.pieces[0]!.sourceAtStart),
    { numerator: 48_000, denominator: 1 });
});

test("fractional rates remain exact until the audio executor chooses sample boundaries", () => {
  const sampling = resolveTemporalRelation({
    clock: space,
    target: { id: "occurrence", duration: exactTemporalValueFromFrames(10, sampleClock) },
    source: { id: "materialization", duration: exactTemporalValueFromFrames(100, sampleClock) },
    spec: rateSpec({ rate: { numerator: 2, denominator: 3 } }),
  });
  assert.deepEqual(sampling.stages[0]!.pieces.map(sampledPiece), [{
    target: { startSample: 0, endSampleExclusive: 10 },
    sourceAtStart: { numerator: 0, denominator: 1 },
    rate: { numerator: 2, denominator: 3 },
  }]);
});

test("periodic maps preserve one source interval and an exact phase", () => {
  const projection = {
    start: { ref: "timeline.start" as const },
    end: { ref: "absolute" as const, at: { unit: "seconds" as const, numerator: 5, denominator: 2 } },
  };
  const start = programTrack(media("loop", 48_000), spec({ projection,
    sampling: rateSpec({ wrap: fullBounds() }) }));
  assert.deepEqual(sampledPiece(audioTrackClips(start)[0]!.sampling.stages[0]!.pieces[0]!).wrap,
    { startSample: 0, endSampleExclusive: 48_000 });
  assert.deepEqual(sampleRational(audioTrackClips(start)[0]!.sampling.stages[0]!.pieces[0]!.sourceAtStart),
    { numerator: 0, denominator: 1 });
  assert.deepEqual(targetSamples(audioTrackClips(start)[0]!.target), { startSample: 0, endSampleExclusive: 120_000 });
  const end = programTrack(media("loop", 48_000), spec({ projection,
    sampling: rateSpec({ targetAt: endPoint(), sourceAt: endPoint(), wrap: fullBounds() }) }));
  assert.deepEqual(sampleRational(audioTrackClips(end)[0]!.sampling.stages[0]!.pieces[0]!.sourceAtStart),
    { numerator: 24_000, denominator: 1 });
});

test("fit is the exact relation between the two authored ranges", () => {
  const fitted = programTrack(media("fit", 96_000), spec({
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 4, denominator: 1 } } },
    sampling: { relations: [{ kind: "fit", target: fullBounds(), source: fullBounds() }] },
  }));
  assert.deepEqual(affinePiece(audioTrackClips(fitted)[0]!.sampling.stages[0]!.pieces[0]!).rate,
    { numerator: 1, denominator: 2 });
});

test("exact audio rates are not rejected by an arbitrary playback-mode ceiling", () => {
  const track = programTrack(media("fast", 12_288_000), spec({
    sampling: rateSpec({ rate: { numerator: 128, denominator: 1 } }),
  }));
  assert.deepEqual(affinePiece(audioTrackClips(track)[0]!.sampling.stages[0]!.pieces[0]!).rate, { numerator: 128, denominator: 1 });
  const program = compileAudioProgram(sealComposition({
    id: "fast", canvas: { width: 1, height: 1, clearColor: "#000000" }, visual: { members: [] }, audio: [track],
  }), space);
  assert.deepEqual(affinePiece(program.clips[0]!.sampling.stages[0]!.pieces[0]!).rate, { numerator: 128, denominator: 1 });
});

test("Audio Track preserves a reverse relation instead of enforcing one renderer's tempo capability", () => {
  const track = programTrack(media("reverse", 48_000), spec({
    sampling: rateSpec({
      targetAt: startPoint(), sourceAt: endPoint(), rate: { numerator: -1, denominator: 1 },
    }),
  }));
  assert.deepEqual(affinePiece(audioTrackClips(track)[0]!.sampling.stages[0]!.pieces[0]!).rate,
    { numerator: -1, denominator: 1 });
  const program = compileAudioProgram(sealComposition({
    id: "reverse", canvas: { width: 1, height: 1, clearColor: "#000000" }, visual: { members: [] }, audio: [track],
  }), space);
  assert.deepEqual(affinePiece(program.clips[0]!.sampling.stages[0]!.pieces[0]!).rate,
    { numerator: -1, denominator: 1 });
});

test("source bounds and fades quantize once into the same sample domain", () => {
  const track = programTrack(media("trim", 144_000), spec({
    sampling: rateSpec({
      sourceAt: startPoint(duration(250)),
      source: { from: startPoint(duration(250)), until: startPoint({ unit: "seconds", numerator: 9, denominator: 4 }) },
    }),
    mix: {
      gain: 0.25,
      fadeIn: { unit: "milliseconds", value: 100 },
      fadeOut: { unit: "milliseconds", value: 200 },
    },
  }));
  assert.deepEqual(sampleRational(audioTrackClips(track)[0]!.sampling.stages[0]!.pieces[0]!.sourceAtStart),
    { numerator: 12_000, denominator: 1 });
  assert.deepEqual(sampledPiece(audioTrackClips(track)[0]!.sampling.stages[0]!.pieces[0]!).target,
    { startSample: 0, endSampleExclusive: 96_000 });
  assert.equal(audioTrackClips(track)[0]?.gain, 0.25);
  const compiled = compileAudioProgram(sealComposition({
    id: "trim", canvas: { width: 1, height: 1, clearColor: "#000000" }, visual: { members: [] }, audio: [track],
  }), space);
  assert.equal(compiled.clips[0]?.fadeInSamples, 4_800);
  assert.equal(compiled.clips[0]?.fadeOutSamples, 9_600);
  assert.throws(() => programTrack(media("fade", 24_000), spec({
    mix: { gain: 1, fadeIn: { unit: "seconds", numerator: 3, denominator: 1 }, fadeOut: zero },
  })), /fade exceeds its Window/u);
});

test("frame-authored fades share their Clip boundaries on a rational clock", () => {
  const ntsc = sealTimeline({
    id: "ntsc-space",
    frameCount: 300,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const ntscSemantic = timelineFixture(ntsc, {
    narrativeId: "ntsc-narrative",
    segments: [{ id: "line", frameCount: 300 }],
    anchors: [],
  });
  const sixteen = { unit: "frames" as const, value: 16 };
  for (const startFrame of [0, 1, 2, 3]) {
    const clip = spec({
      mix: { gain: 1, fadeIn: sixteen, fadeOut: sixteen },
      projection: {
        start: { ref: "absolute", at: { unit: "frames", value: startFrame } },
        end: { ref: "absolute", at: { unit: "frames", value: startFrame + 16 } },
      },
    });
    const track = renderAudioTrack(ntsc, finalizeAudioTrack(
      appendProgramAudioItem(createAudioTrackSet(), header, ntscSemantic, media("sting", 48_000), clip),
      header,
    ));
    const rendered = compileAudioProgram(sealComposition({
      id: `ntsc-${startFrame}`, canvas: { width: 1, height: 1, clearColor: "#000000" },
      visual: { members: [] }, audio: [track],
    }), ntsc).clips[0]!;
    const length = rendered.mixEndSampleExclusive - rendered.mixStartSample;
    assert.equal(rendered.fadeInSamples, length, `fade-in from frame ${startFrame}`);
    assert.equal(rendered.fadeOutSamples, length, `fade-out from frame ${startFrame}`);
  }
});

test("piecewise audio maps preserve silent gaps while execution keeps one Clip-global fade clock", () => {
  const second = { unit: "seconds" as const, numerator: 1, denominator: 1 };
  const seconds = (value: number): TemporalDuration => ({ unit: "seconds", numerator: value, denominator: 1 });
  const track = programTrack(media("pieces", 96_000), spec({
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: seconds(4) } },
    sampling: { relations: [
      { kind: "rate", target: { from: startPoint(), until: startPoint(second) }, targetAt: startPoint(),
        sourceAt: startPoint(), rate: { numerator: 1, denominator: 1 },
        source: { from: startPoint(), until: startPoint(second) } },
      { kind: "rate", target: { from: startPoint(seconds(2)), until: startPoint(seconds(3)) },
        targetAt: startPoint(seconds(2)), sourceAt: startPoint(second), rate: { numerator: 1, denominator: 1 },
        source: { from: startPoint(second), until: endPoint() } },
    ] },
    mix: { gain: 0.5, fadeIn: second, fadeOut: second },
  }));
  assert.deepEqual(audioTrackClips(track)[0]?.sampling.stages[0]?.pieces.map((piece) => sampledPiece(piece).target), [
    { startSample: 0, endSampleExclusive: 48_000 },
    { startSample: 96_000, endSampleExclusive: 144_000 },
  ]);
  const program = compileAudioProgram(sealComposition({
    id: "piecewise", canvas: { width: 1, height: 1, clearColor: "#000000" }, visual: { members: [] }, audio: [track],
  }), space);
  assert.deepEqual(program.clips.map((clip) => ({
    target: [clip.targetStartSample, clip.targetEndSampleExclusive],
    mix: [clip.mixStartSample, clip.mixEndSampleExclusive],
    fade: [clip.fadeInSamples, clip.fadeOutSamples],
    pieces: clip.sampling.stages[0]?.pieces.map((piece) => sampledPiece(piece).target),
  })), [
    { target: [0, 192_000], mix: [0, 192_000], fade: [48_000, 48_000], pieces: [
      { startSample: 0, endSampleExclusive: 48_000 },
      { startSample: 96_000, endSampleExclusive: 144_000 },
    ] },
  ]);
});

test("resolved Windows place independent Clips regardless of their upstream source", () => {
  const selection: NarrativeSelectionRef = {
    narrativeId: "test-narrative",
    id: "mentions",
    startAnchorId: "a",
    endAnchorId: "b",
  };
  const moment: NarrativeMomentRef = {
    narrativeId: "test-narrative",
    id: "hits",
    anchorId: "c",
  };
  let set: AudioTrackSet = createAudioTrackSet();
  set = appendSelectionAudioItem(set, header, semantic, media("selection", 48_000), selection, spec({
    id: "selected",
  }));
  set = appendMomentAudioItem(set, header, semantic, media("moment", 48_000), moment, spec({
    id: "hit",
  }));
  const track = renderAudioTrack(space, finalizeAudioTrack(set, header));
  assert.equal(audioTrackClips(track).length, 2);
  assert.deepEqual(audioTrackClips(track).map((clip) => sampleRational(clip.target.start).numerator),
    [48_000, 144_000]);
});

test("one resolved Window can time distinct Audio Clip occurrences", () => {
  const shared = projectProgramWindow({ itemId: "shared-window", semantic,
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 1, denominator: 1 } } } });
  const first = media("first", 48_000);
  const second = media("second", 48_000);
  let set = appendAudioClip(createAudioTrackSet(), header, space, first.prepared, spec({ id: "first" }), shared);
  set = appendAudioClip(set, header, space, second.prepared, spec({ id: "second" }), shared);
  assert.deepEqual(set.clips.map((clip) => clip.id), ["first", "second"]);
  assert.deepEqual(set.clips.map((clip) => clip.window), [shared.span, shared.span]);
});

test("AudioTrackSet refinement validates every accumulated Clip and its identity", () => {
  const shared = projectProgramWindow({ itemId: "shared-window", semantic,
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 1, denominator: 1 } } } });
  const first = media("first", 48_000);
  const set = appendAudioClip(createAudioTrackSet(), header, space, first.prepared, spec({ id: "first" }), shared);
  assert.doesNotThrow(() => assertAudioTrackSet(set));
  assert.throws(() => assertAudioTrackSet({ clips: [set.clips[0]!, structuredClone(set.clips[0]!)] }),
    /duplicate Clip first/u);
  assert.throws(() => assertAudioTrackSet({ clips: [{ ...set.clips[0]!, source: undefined } as never] }),
    /source is invalid/u);
});

test("one Track with overlaps and two peer Tracks compile to the same mix", () => {
  const sourceA = media("a", 48_000);
  const sourceB = media("b", 48_000);
  const first = { ...programTrack(sourceA, spec({ id: "a" })), id: "first" };
  const second = { ...programTrack(sourceB, spec({ id: "b" })), id: "second" };
  const combined = {
    kind: "audio" as const,
    id: "combined",
    timelineId: space.id,
    graph: audioGraphFromClips([
      { ...audioTrackClips(first)[0]!, id: "a" },
      { ...audioTrackClips(second)[0]!, id: "b" },
    ]),
  };
  const peerProgram = compileAudioProgram(sealComposition({
    id: "peer", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [first, second],
  }), space);
  const combinedProgram = compileAudioProgram(sealComposition({
    id: "combined", canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: { members: [] }, audio: [combined],
  }), space);
  assert.deepEqual(
    peerProgram.clips.map(({ id: _id, ...clip }) => clip),
    combinedProgram.clips.map(({ id: _id, ...clip }) => clip),
  );
});

test("dynamic Fragment keeps every material and temporal dependency as an explicit input", () => {
  const fragment = createAudioTrackFragment([
    { mediaName: "music", specName: "music-spec", windowName: "music-window" },
    { mediaName: "voice", specName: "voice-spec", windowName: "voice-window" },
    { mediaName: "impact", specName: "impact-spec", windowName: "impact-window" },
  ]);
  assert.deepEqual(fragment.inputs.map((input) => input.name), [
    "header", "impact", "impact-spec", "impact-window", "music", "music-spec", "music-window", "timeline", "voice", "voice-spec", "voice-window",
  ]);
  assert.ok(fragment.exports.some((output) => output.name === "audio" && output.type.name === compositionTypes.audioTrack.name));
});
