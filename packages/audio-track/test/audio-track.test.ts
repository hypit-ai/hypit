import { sealTimeline, timelineDependency, timelineManifest, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectMomentWindow, projectProgramWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";
import type { TemporalWindowProjection } from "../../../test/temporal-fixture.js";

import {
  audioTrackManifest,
  audioTrackMarkupSurfaces,
  audioTrackModuleRef,
  audioTrackProducers,
  appendAudioClip,
  createAudioTrackSet,
  createAudioTrackFragment,
  finalizeAudioTrack,
  renderAudioTrack,
  sealAudioClipSpec,
  sealAudioTrackHeader,
  decodeAudioTrackSurface,
} from "@hypit/audio-track";
import type { AudioClipSpec, AudioSourceTimeSpec, AudioTrackSet } from "@hypit/audio-track";
import { blobManifest } from "@hypit/blob";
import { registerTypeValidatorFacets } from "@hypit/admission";
import { sealComposition, compositionManifest, compositionTypes } from "@hypit/composition";
import { createResolvedClosure, sealBuildRequest, start } from "@hypit/kernel";
import { AuthorFrontendRegistry, resolveCompiledSourceExport } from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import type { SynchronizedMedia } from "@hypit/media";
import { mediaComponent, mediaDependency, mediaManifest, mediaTypes } from "@hypit/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { narrativeManifest } from "@hypit/narrative";
import { compileAudioProgramPlan } from "@hypit/media-operations";
import type { ModuleManifest } from "@hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import type { TemporalDuration } from "@hypit/temporal";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { narrativeTemporalManifest } from "@hypit/narrative-temporal";
import { spatialManifest } from "@hypit/spatial";
import { recipeManifest } from "@hypit/recipe";
import { temporalManifest } from "@hypit/temporal";
import { MarkupSurfaceRegistry, createMarkupAuthorFrontend } from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/admission";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";

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
const rateSpec = (input: Partial<Extract<AudioSourceTimeSpec["relations"][number], { kind: "rate" }>> = {}): AudioSourceTimeSpec => ({
  relations: [{
    kind: "rate", target: fullBounds(), targetAt: startPoint(), sourceAt: startPoint(),
    rate: { numerator: 1, denominator: 1 }, source: fullBounds(), ...input,
  }],
});

function media(id: string, sampleFrames: number): SynchronizedMedia {
  return {
    frameDomain: {
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: Math.max(1, Math.round(sampleFrames / 1_600)),
    },
    audio: {
      artifact: { kind: "blob", resource: fixtureResource(`audio:${id}`), size: sampleFrames * 4, mediaType: "audio/wav" },
    },
  };
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
  source: SynchronizedMedia, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source, clip, projectProgramWindow({
    itemId: clip.id, semantic: timeline, projection,
  }));
}

function appendSelectionAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, timeline: typeof semantic,
  source: SynchronizedMedia, selection: NarrativeSelectionRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source, clip, projectSelectionWindow({
    itemId: clip.id, semantic: timeline, narrative: narrativeProjection, selection,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function appendMomentAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, timeline: typeof semantic,
  source: SynchronizedMedia, moment: NarrativeMomentRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendAudioClip(set, trackHeader, timeline, source, clip, projectMomentWindow({
    itemId: clip.id, semantic: timeline, narrative: narrativeProjection, moment,
    projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: { unit: "seconds", numerator: 1, denominator: 1 } } },
  }));
}

function programTrack(source: SynchronizedMedia, clipSpec: TestAudioClipSpec) {
  const set = appendProgramAudioItem(createAudioTrackSet(), header, semantic, source, clipSpec);
  return renderAudioTrack(space, finalizeAudioTrack(set, header));
}

test("partial identity and end alignment preserve exact silence and source head/tail semantics", () => {
  const short = media("short", 48_000);
  const start = programTrack(short, spec());
  assert.deepEqual(start.clips[0]?.target, { startSample: 0, endSampleExclusive: 96_000 });
  assert.deepEqual(start.clips[0]?.sourceTime, { sourceSampleFrames: 48_000, pieces: [{
    target: { startSample: 0, endSampleExclusive: 48_000 },
    sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
  }] });

  const endAligned = rateSpec({ targetAt: endPoint(), sourceAt: endPoint() });
  const end = programTrack(short, spec({ sourceTime: endAligned }));
  assert.deepEqual(end.clips[0]?.sourceTime.pieces[0]?.target, { startSample: 48_000, endSampleExclusive: 96_000 });

  const long = programTrack(media("long", 144_000), spec({ sourceTime: endAligned }));
  assert.deepEqual(long.clips[0]?.target, { startSample: 0, endSampleExclusive: 96_000 });
  assert.deepEqual(long.clips[0]?.sourceTime.pieces[0]?.sourceAtStart, { numerator: 48_000, denominator: 1 });
});

test("periodic maps preserve one source interval and an exact phase", () => {
  const projection = {
    start: { ref: "timeline.start" as const },
    end: { ref: "absolute" as const, at: { unit: "seconds" as const, numerator: 5, denominator: 2 } },
  };
  const start = programTrack(media("loop", 48_000), spec({ projection,
    sourceTime: rateSpec({ wrap: fullBounds() }) }));
  assert.deepEqual(start.clips[0]?.sourceTime.pieces[0]?.wrap, { startSample: 0, endSampleExclusive: 48_000 });
  assert.deepEqual(start.clips[0]?.sourceTime.pieces[0]?.sourceAtStart, { numerator: 0, denominator: 1 });
  assert.deepEqual(start.clips[0]?.target, { startSample: 0, endSampleExclusive: 120_000 });
  const end = programTrack(media("loop", 48_000), spec({ projection,
    sourceTime: rateSpec({ targetAt: endPoint(), sourceAt: endPoint(), wrap: fullBounds() }) }));
  assert.deepEqual(end.clips[0]?.sourceTime.pieces[0]?.sourceAtStart, { numerator: 24_000, denominator: 1 });
});

test("bounded pitch-preserving fit succeeds exactly or fails without truncation", () => {
  const fitted = programTrack(media("fit", 96_000), spec({
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 4, denominator: 1 } } },
    sourceTime: { relations: [{ kind: "fit", target: fullBounds(), source: fullBounds(), minRate: 0.4, maxRate: 0.6 }] },
  }));
  assert.deepEqual(fitted.clips[0]?.sourceTime.pieces[0]?.rate, { numerator: 1, denominator: 2 });
  assert.throws(() => programTrack(media("fit-fail", 96_000), spec({
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 4, denominator: 1 } } },
    sourceTime: { relations: [{ kind: "fit", target: fullBounds(), source: fullBounds(), minRate: 0.8, maxRate: 1.2 }] },
  })), /below authored minimum/u);
});

test("exact audio rates are not rejected by an arbitrary playback-mode ceiling", () => {
  const track = programTrack(media("fast", 12_288_000), spec({
    sourceTime: rateSpec({ rate: { numerator: 128, denominator: 1 } }),
  }));
  assert.deepEqual(track.clips[0]?.sourceTime.pieces[0]?.rate, { numerator: 128, denominator: 1 });
  const plan = compileAudioProgramPlan(sealComposition({
    id: "fast", canvas: { width: 1, height: 1, clearColor: "#000000" }, tracks: [track],
  }), space);
  assert.equal(plan.clips[0]?.playbackRate, 128);
});

test("a fractional rate ends its piece on a whole source sample", () => {
  // At 3/2 the source position is whole only on every second target sample. A source that runs out
  // mid-Window used to end the piece half a sample past its last sample, so render threw.
  const track = programTrack(media("fractional", 16_000), spec({
    sourceTime: rateSpec({ rate: { numerator: 3, denominator: 2 } }),
  }));
  assert.deepEqual(track.clips[0]?.sourceTime.pieces[0]?.target, { startSample: 0, endSampleExclusive: 10_666 });
  const plan = compileAudioProgramPlan(sealComposition({
    id: "fractional", canvas: { width: 1, height: 1, clearColor: "#000000" }, tracks: [track],
  }), space);
  assert.equal(plan.clips[0]?.sourceEndSampleExclusive, 15_999);
});

test("source bounds and fades quantize once into the same sample domain", () => {
  const track = programTrack(media("trim", 144_000), spec({
    sourceTime: rateSpec({
      sourceAt: startPoint(duration(250)),
      source: { from: startPoint(duration(250)), until: startPoint({ unit: "seconds", numerator: 9, denominator: 4 }) },
    }),
    mix: {
      gain: 0.25,
      fadeIn: { unit: "milliseconds", value: 100 },
      fadeOut: { unit: "milliseconds", value: 200 },
    },
  }));
  assert.deepEqual(track.clips[0]?.sourceTime.pieces[0]?.sourceAtStart, { numerator: 12_000, denominator: 1 });
  assert.deepEqual(track.clips[0]?.sourceTime.pieces[0]?.target, { startSample: 0, endSampleExclusive: 96_000 });
  assert.equal(track.clips[0]?.gain, 0.25);
  assert.equal(track.clips[0]?.fadeInSamples, 4_800);
  assert.equal(track.clips[0]?.fadeOutSamples, 9_600);
  assert.throws(() => programTrack(media("fade", 24_000), spec({
    mix: { gain: 1, fadeIn: { unit: "seconds", numerator: 3, denominator: 1 }, fadeOut: zero },
  })), /fade exceeds its Window/u);
});

test("piecewise audio maps preserve silent gaps while execution keeps one Clip-global fade clock", () => {
  const second = { unit: "seconds" as const, numerator: 1, denominator: 1 };
  const seconds = (value: number): TemporalDuration => ({ unit: "seconds", numerator: value, denominator: 1 });
  const track = programTrack(media("pieces", 96_000), spec({
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: seconds(4) } },
    sourceTime: { relations: [
      { kind: "rate", target: { from: startPoint(), until: startPoint(second) }, targetAt: startPoint(),
        sourceAt: startPoint(), rate: { numerator: 1, denominator: 1 },
        source: { from: startPoint(), until: startPoint(second) } },
      { kind: "rate", target: { from: startPoint(seconds(2)), until: startPoint(seconds(3)) },
        targetAt: startPoint(seconds(2)), sourceAt: startPoint(second), rate: { numerator: 1, denominator: 1 },
        source: { from: startPoint(second), until: endPoint() } },
    ] },
    mix: { gain: 0.5, fadeIn: second, fadeOut: second },
  }));
  assert.deepEqual(track.clips[0]?.sourceTime.pieces.map((piece) => piece.target), [
    { startSample: 0, endSampleExclusive: 48_000 },
    { startSample: 96_000, endSampleExclusive: 144_000 },
  ]);
  const plan = compileAudioProgramPlan(sealComposition({
    id: "piecewise", canvas: { width: 1, height: 1, clearColor: "#000000" }, tracks: [track],
  }), space);
  assert.deepEqual(plan.clips.map((clip) => ({
    target: [clip.targetStartSample, clip.targetEndSampleExclusive],
    mix: [clip.mixStartSample, clip.mixEndSampleExclusive],
    fade: [clip.fadeInSamples, clip.fadeOutSamples],
  })), [
    { target: [0, 48_000], mix: [0, 192_000], fade: [48_000, 48_000] },
    { target: [96_000, 144_000], mix: [0, 192_000], fade: [48_000, 48_000] },
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
  assert.equal(track.clips.length, 2);
  assert.deepEqual(track.clips.map((clip) => clip.target.startSample), [48_000, 144_000]);
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
    clips: [
      { ...first.clips[0]!, id: "a" },
      { ...second.clips[0]!, id: "b" },
    ],
  };
  const peerPlan = compileAudioProgramPlan(sealComposition({
    id: "peer", canvas: { width: 1, height: 1, clearColor: "#000000" },
    tracks: [first, second],
  }), space);
  const combinedPlan = compileAudioProgramPlan(sealComposition({
    id: "combined", canvas: { width: 1, height: 1, clearColor: "#000000" },
    tracks: [combined],
  }), space);
  assert.deepEqual(
    peerPlan.clips.map(({ id: _id, ...clip }) => clip),
    combinedPlan.clips.map(({ id: _id, ...clip }) => clip),
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

test("the self-described Audio Surface parses into the same finite Producer graph", async () => {
  const fixtureModule = { name: "example.audio-inputs", version: "1" } as const;
  const fixtureSurfaceDigest = fixtureResource("example.audio-inputs/surface@1");
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [mediaTypes.synchronized, timelineTypes.timeline, temporalTypes.window],
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "hypit.module@1",
    name: fixtureModule.name,
    version: fixtureModule.version,
    dependencies: [mediaDependency, timelineDependency, temporalDependency],
    types: [],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([
    blobManifest,
    mediaManifest,
    narrativeManifest,
    timelineManifest,
    narrativeTemporalManifest,
    recipeManifest,
    spatialManifest,
    speechEvidenceManifest,
    temporalManifest,
    compositionManifest,
    audioTrackManifest,
    fixtureManifest,
  ]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "source", type: mediaTypes.synchronized, value: { kind: "inline", value: media("surface", 48_000) }, range: element.range },
      { id: "semantic", type: timelineTypes.timeline, value: { kind: "inline", value: semantic }, range: element.range },
      { id: "whole", type: temporalTypes.window, value: { kind: "inline", value: projectProgramWindow({ itemId: "whole",
        semantic, projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }) }, range: element.range },
    ],
    components: [],
    fragments: [],
  }) });
  registry.registerStructured({
    module: audioTrackModuleRef,
    declaration: audioTrackMarkupSurfaces.find((item) => item.name === "track")!,
    handler: decodeAudioTrackSurface,
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry,
    resolveModule: (request) => request.from === "example.audio-inputs@1" ? fixtureModule : audioTrackModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, mediaComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: resolveSelfDescribedTextSource({
      id: "/project/audio.svml",
      name: "audio.svml",
      text: `<?svml using="@hypit/markup@1"?>
      <svml>
        <import as="fixture" from="example.audio-inputs@1"/>
        <import as="audio" from="@hypit/audio-track@1"/>
        <fixture:Inputs/>
        <audio:Track id="sound" timeline={semantic}>
          <audio:Clip source={source} during={whole} gain="0.5" fade-in="2f" fade-out="3f">
            <audio:Map target-at="end" source-at="end" rate="1" wrap-from="start" wrap-until="end"/>
          </audio:Clip>
        </audio:Track>
      </svml>`,
    }),
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Audio fixture has no source imports."); },
  });
  const trackExport = resolveCompiledSourceExport(compiled, "sound.audio", compositionTypes.audioTrack);
  assert.equal(trackExport.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: trackExport.ref.kind === "logical-output" ? trackExport.ref.id : "" }],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    audioTrackProducers.createSet.name,
    audioTrackProducers.appendClip.name,
    audioTrackProducers.finalize.name,
        audioTrackProducers.render.name,
  ].sort());
});
