import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";
import { projectMomentWindow, projectProgramWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";
import type { TemporalWindowProjection } from "../../../test/temporal-fixture.js";

import {
  audioTrackManifest,
  audioTrackMarkupSurfaces,
  audioTrackModuleRef,
  audioTrackProducers,
  appendProjectedAudioItem,
  createAudioTrackSet,
  createAudioTrackFragment,
  finalizeAudioTrack,
  renderAudioTrack,
  sealAudioClipSpec,
  sealAudioTrackHeader,
  decodeAudioTrackSurface,
} from "@hypit/audio-track";
import type { AudioClipSpec, AudioTrackSet } from "@hypit/audio-track";
import { artifactManifest } from "@hypit/artifact";
import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { sealComposition, compositionManifest, compositionTypes } from "@hypit/composition";
import { createResolvedClosure, sealBuildRequest, start } from "@hypit/core";
import { AuthorFrontendRegistry, compileSourceClosure, resolveCompiledSourceExport } from "@hypit/elaborator";
import type { SynchronizedMedia } from "@hypit/media";
import { mediaComponent, mediaDependency, mediaManifest, mediaTypes } from "@hypit/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { narrativeManifest } from "@hypit/narrative";
import { compileAudioProgramPlan } from "@hypit/media-pipeline";
import { programSpaceDependency, programSpaceManifest, programSpaceTypes, sealProgramSpace } from "@hypit/program-space";
import type { ModuleManifest } from "@hypit/protocol";
import { projectSemanticProgramSpace, semanticTrackDependency, semanticTrackManifest, semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";
import { temporalProducers } from "@hypit/temporal";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { speechManifest } from "@hypit/speech";
import { spatialManifest } from "@hypit/spatial";
import { svsManifest } from "@hypit/svs";
import { temporalManifest } from "@hypit/temporal";
import { MarkupSurfaceRegistry, createMarkupAuthorFrontend } from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/validation";
import { visualIrManifest } from "@hypit/visual-ir";

const space = sealProgramSpace({ id: "test-space", narrativeId: "test-narrative",
  durationSec: 10,
  frameRate: { numerator: 30, denominator: 1 },
});
const header = sealAudioTrackHeader({ id: "sound" });
const semantic = semanticTrackFixture(space, { anchors: [
  { identity: "a", frame: 30 }, { identity: "b", frame: 60 },
  { identity: "c", frame: 90 }, { identity: "d", frame: 120 },
] });
const zero = { unit: "frames" as const, value: 0 };

function media(id: string, sampleFrames: number): SynchronizedMedia {
  return {
    timeline: {
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
  start: { ref: "program.start" },
  end: { ref: "absolute", at: { unit: "seconds", numerator: 2, denominator: 1 } },
};

function spec(overrides: Partial<TestAudioClipSpec> = {}): TestAudioClipSpec {
  const { projection = defaultProjection, ...clipOverrides } = overrides;
  return {
    ...sealAudioClipSpec({

    id: "clip",
    trim: {},
    occupancy: { mode: "once", align: "start" },
    mix: { gain: 1, fadeIn: zero, fadeOut: zero },
    ...clipOverrides,
    }),
    projection,
  };
}

function appendProgramAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, semanticTrack: typeof semantic,
  source: SynchronizedMedia, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendProjectedAudioItem(set, trackHeader, projectSemanticProgramSpace(semanticTrack), source, clip, projectProgramWindow({
    itemId: clip.id, semantic: semanticTrack, projection,
  }));
}

function appendSelectionAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, semanticTrack: typeof semantic,
  source: SynchronizedMedia, selection: NarrativeSelectionRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendProjectedAudioItem(set, trackHeader, projectSemanticProgramSpace(semanticTrack), source, clip, projectSelectionWindow({
    itemId: clip.id, semantic: semanticTrack, selection, projection,
  }));
}

function appendMomentAudioItem(
  set: AudioTrackSet, trackHeader: typeof header, semanticTrack: typeof semantic,
  source: SynchronizedMedia, moment: NarrativeMomentRef, authored: TestAudioClipSpec,
): AudioTrackSet {
  const { projection, ...clip } = authored;
  return appendProjectedAudioItem(set, trackHeader, projectSemanticProgramSpace(semanticTrack), source, clip, projectMomentWindow({
    itemId: clip.id, semantic: semanticTrack, moment, projection,
  }));
}

function programTrack(source: SynchronizedMedia, clipSpec: TestAudioClipSpec) {
  const set = appendProgramAudioItem(createAudioTrackSet(), header, semantic, source, clipSpec);
  return renderAudioTrack(space, finalizeAudioTrack(set, header));
}

test("once start/end preserve exact audible silence and source head/tail semantics", () => {
  const short = media("short", 48_000);
  const start = programTrack(short, spec());
  assert.deepEqual(start.clips[0]?.target, { startSample: 0, endSampleExclusive: 48_000 });
  assert.deepEqual(start.clips[0]?.source, {
    sampleFrames: 48_000, startSample: 0, endSampleExclusive: 48_000, loop: false, phaseSample: 0,
  });

  const end = programTrack(short, spec({ occupancy: { mode: "once", align: "end" } }));
  assert.deepEqual(end.clips[0]?.target, { startSample: 48_000, endSampleExclusive: 96_000 });

  const long = programTrack(media("long", 144_000), spec({ occupancy: { mode: "once", align: "end" } }));
  assert.deepEqual(long.clips[0]?.target, { startSample: 0, endSampleExclusive: 96_000 });
  assert.deepEqual(long.clips[0]?.source, {
    sampleFrames: 144_000, startSample: 48_000, endSampleExclusive: 144_000, loop: false, phaseSample: 0,
  });
});

test("loop alignment uses one source interval and an exact phase instead of duplicating clips", () => {
  const projection = {
    start: { ref: "program.start" as const },
    end: { ref: "absolute" as const, at: { unit: "seconds" as const, numerator: 5, denominator: 2 } },
  };
  const start = programTrack(media("loop", 48_000), spec({ projection, occupancy: { mode: "loop", align: "start" } }));
  assert.equal(start.clips[0]?.source.loop, true);
  assert.equal(start.clips[0]?.source.phaseSample, 0);
  assert.deepEqual(start.clips[0]?.target, { startSample: 0, endSampleExclusive: 120_000 });
  const end = programTrack(media("loop", 48_000), spec({ projection, occupancy: { mode: "loop", align: "end" } }));
  assert.equal(end.clips[0]?.source.phaseSample, 24_000);
});

test("bounded pitch-preserving stretch succeeds exactly or fails without truncation", () => {
  const stretched = programTrack(media("stretch", 96_000), spec({
    projection: { start: { ref: "program.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 4, denominator: 1 } } },
    occupancy: { mode: "stretch", minRate: 0.4, maxRate: 0.6, pitch: "preserve" },
  }));
  assert.equal(stretched.clips[0]?.playbackRate, 0.5);
  assert.equal(stretched.clips[0]?.pitch, "preserve");
  assert.throws(() => programTrack(media("stretch-fail", 96_000), spec({
    projection: { start: { ref: "program.start" }, end: { ref: "absolute", at: { unit: "seconds", numerator: 4, denominator: 1 } } },
    occupancy: { mode: "stretch", minRate: 0.8, maxRate: 1.2, pitch: "preserve" },
  })), /outside authored bounds/u);
});

test("trim and fades quantize once into the same sample domain", () => {
  const track = programTrack(media("trim", 144_000), spec({
    trim: {
      start: { unit: "milliseconds", value: 250 },
      end: { unit: "seconds", numerator: 9, denominator: 4 },
    },
    mix: {
      gain: 0.25,
      fadeIn: { unit: "milliseconds", value: 100 },
      fadeOut: { unit: "milliseconds", value: 200 },
    },
  }));
  assert.equal(track.clips[0]?.source.startSample, 12_000);
  assert.equal(track.clips[0]?.source.endSampleExclusive, 108_000);
  assert.equal(track.clips[0]?.gain, 0.25);
  assert.equal(track.clips[0]?.fadeInSamples, 4_800);
  assert.equal(track.clips[0]?.fadeOutSamples, 9_600);
  assert.throws(() => programTrack(media("fade", 24_000), spec({
    mix: { gain: 1, fadeIn: { unit: "seconds", numerator: 1, denominator: 1 }, fadeOut: zero },
  })), /fade exceeds/u);
});

test("Selection and Moment each place one independent item", () => {
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
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
  set = appendMomentAudioItem(set, header, semantic, media("moment", 48_000), moment, spec({
    id: "hit",
    projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: { unit: "seconds", numerator: 1, denominator: 1 } } },
  }));
  const track = renderAudioTrack(space, finalizeAudioTrack(set, header));
  assert.equal(track.clips.length, 2);
  assert.deepEqual(track.clips.map((clip) => clip.target.startSample), [48_000, 144_000]);
});

test("one Track with overlaps and two peer Tracks compile to the same deterministic mix facts", () => {
  const sourceA = media("a", 48_000);
  const sourceB = media("b", 48_000);
  const first = { ...programTrack(sourceA, spec({ id: "a" })), id: "first" };
  const second = { ...programTrack(sourceB, spec({ id: "b" })), id: "second" };
  const combined = {
    kind: "audio" as const,
    id: "combined",
    programSpaceId: space.id,
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
  const localReceived = structuredClone(peerPlan);
  const remoteReceived = JSON.parse(JSON.stringify(peerPlan)) as typeof peerPlan;
  assert.deepEqual(localReceived, remoteReceived);
});

test("dynamic Fragment keeps every material and temporal dependency as an explicit input", () => {
  const fragment = createAudioTrackFragment([
    { mediaName: "music", specName: "music-spec", windowName: "music-window" },
    { mediaName: "voice", specName: "voice-spec", windowName: "voice-window" },
    { mediaName: "impact", specName: "impact-spec", windowName: "impact-window" },
  ]);
  assert.deepEqual(fragment.inputs.map((input) => input.name), [
    "header", "impact", "impact-spec", "impact-window", "music", "music-spec", "music-window", "semantic", "voice", "voice-spec", "voice-window",
  ]);
  assert.equal(fragment.exports[1]?.name, "track");
});

test("the self-described Audio Surface parses into the same finite Producer graph", async () => {
  const fixtureModule = { name: "example.audio-inputs", version: "1" } as const;
  const fixtureSurfaceDigest = fixtureResource("example.audio-inputs/surface@1");
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [mediaTypes.synchronized, semanticTrackTypes.track],
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "hypit.module@1",
    name: fixtureModule.name,
    version: fixtureModule.version,
    dependencies: [mediaDependency, semanticTrackDependency],
    types: [],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([
    artifactManifest,
    mediaManifest,
    narrativeManifest,
    programSpaceManifest,
    speechManifest,
    svsManifest,
    spatialManifest,
    speechEvidenceManifest,
    semanticTrackManifest,
    temporalManifest,
    visualIrManifest,
    compositionManifest,
    audioTrackManifest,
    fixtureManifest,
  ]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "source", type: mediaTypes.synchronized, value: { kind: "inline", value: media("surface", 48_000) }, range: element.range },
      { id: "semantic", type: semanticTrackTypes.track, value: { kind: "inline", value: semantic }, range: element.range },
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
    entry: {
      id: "/project/audio.svml",
      name: "audio.svml",
      text: `<?svml using="@hypit/markup@1"?>
      <svml>
        <import as="fixture" from="example.audio-inputs@1"/>
        <import as="audio" from="@hypit/audio-track@1"/>
        <fixture:Inputs/>
        <audio:Track id="sound" semantic={semantic}>
          <audio:Clip source={source} during="program" playback="loop-end" gain="0.5" fade-in="2f" fade-out="3f"/>
        </audio:Track>
      </svml>`,
    },
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Audio fixture has no source imports."); },
  });
  const trackExport = resolveCompiledSourceExport(compiled, "sound.track", compositionTypes.audioTrack);
  assert.equal(trackExport.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: trackExport.ref.kind === "logical-output" ? trackExport.ref.id : "" }],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    audioTrackProducers.createSet.name,
    audioTrackProducers.appendItem.name,
    audioTrackProducers.finalize.name,
    temporalProducers.projectProgramInstant.name,
    temporalProducers.projectProgramInstant.name,
    temporalProducers.composeWindow.name,
    semanticTrackProducers.projectProgramSpace.name,
    audioTrackProducers.render.name,
  ].sort());
});
