import { sealTimeline, timelineDependency, timelineManifest, timelineTypes, timelineComponent } from "@hypit/timeline";
import { blobManifest, blobTypes } from "@hypit/blob";
import {
  registerProducerFacets,
} from "@hypit/producer";
import { registerTypeRefinements } from "@hypit/refinement";
import { mediaComponent, mediaManifest, mediaProducers, mediaTypes, sealMuxedMedia, sealTimelineVisual, sealTimelineAudio } from "@hypit/media";
import { compositionComponent, compositionDependency, compositionManifest, compositionTypes, sealComposition } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { timelineFixture } from "../../../test/timeline-fixture.js";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import {
  ProducerRegistry,
  Executor,
  EndpointRegistry,
} from "@hypit/executor";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import {
  AuthorFrontendRegistry,
  bindAuthorFragment,
  elaborateGraphFragment,
  resolveCompiledSourceExport,
} from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import type { ResolvedSource } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import {
  compileHtmlProgram,
  htmlProgramComponent,
  htmlProgramManifest,
  htmlProgramProducers,
  htmlProgramCapabilities,
  htmlRasterRequest,
} from "@hypit/html-program";
import {
  decodeHtmlVideoSurface,
  htmlVideoFragment,
  createHtmlVideoFragment,
  htmlVideoManifest,
  htmlVideoMarkupSurfaces,
  htmlVideoModuleRef,
  htmlVideoDeliverySpec,
} from "@hypit/html-video";
import {
  compileAudioProgram,
  decodeExtractFrameSurface,
  mediaOperationsComponent,
  mediaOperationsComponents,
  mediaOperationsCapabilities,
  mediaOperationsManifest,
  mediaOperationsMarkupSurfaces,
  mediaOperationsModuleRef,
  mediaOperationsProducers,
} from "@hypit/media-operations";
import {
  refineRecord,
  RefinementRegistry,
} from "@hypit/refinement";
import type {
  BuildState,
  CanonicalValue,
  ModuleManifest,
  Value,
  TypedRecord,
} from "@hypit/protocol";
import { isBlobRef } from "@hypit/protocol";
import { recipeManifest } from "@hypit/recipe";
import { temporalManifest } from "@hypit/temporal";
import {
  createMarkupAuthorFrontend,
  MarkupSurfaceRegistry,
} from "@hypit/markup";

async function runBuild(executor: Executor, state: BuildState) {
  return (await new InProcessBuildScheduler(executor).run([{
    id: "html-video-test",
    definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
    facts: [],
  }]))[0]!;
}

const space = sealTimeline({ id: "test-space", frameCount: 60, frameRate: { numerator: 30, denominator: 1 },
});
const semantic = timelineFixture(space);
const composition = sealComposition({
  id: "render-test",
  canvas: { width: 1080, height: 1920, clearColor: "#000000" },
  visual: { members: [] },
  audio: [],
});
const delivery = htmlVideoDeliverySpec();

const stored = (value: CanonicalValue): Value => value;
function valueOf(record: TypedRecord | undefined): CanonicalValue {
  assert(record, "missing Producer input");
  return record.value;
}

const closure = createResolvedClosure([
  blobManifest,
  timelineManifest,
  temporalManifest,
  mediaManifest,
  compositionManifest,
  recipeManifest,
  htmlProgramManifest,
  mediaOperationsManifest,
  htmlVideoManifest,
]);
const compositionRecord = {
  id: "composition",
  type: compositionTypes.composition,
  value: stored(composition),
};
await refineRecord(compositionRecord, validatorRegistry());
const spaceRecord = {
  id: "space",
  type: timelineTypes.timeline,
  value: stored(space),
};
await refineRecord(spaceRecord, validatorRegistry());
const deliveryRecord = { id: "delivery", type: mediaTypes.delivery, value: stored(delivery) };
await refineRecord(deliveryRecord, validatorRegistry());
const linked = link(closure, [compositionRecord, spaceRecord, deliveryRecord]);
const instance = elaborateGraphFragment(linked, htmlVideoFragment, {
  id: "final",
  inputs: {
    composition: { kind: "record", id: compositionRecord.id },
    timeline: { kind: "record", id: spaceRecord.id },
    delivery: { kind: "record", id: deliveryRecord.id },
  },
});
const contribution = bindAuthorFragment(instance, { video: "final.video" });
const graph = sealAuthorGraph({ ...contribution });

function build() {
  return buildState(linked, graph, ["final.video"]);
}

function buildState(
  program: Parameters<typeof planBuild>[0],
  authorGraph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, authorGraph, {
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

function producerRegistry(): ProducerRegistry {
  const registry = new ProducerRegistry();
  registerProducerFacets(registry, mediaOperationsComponent.producers);
  registerProducerFacets(registry, mediaComponent.producers);
  registerProducerFacets(registry, htmlProgramComponent.producers);
  registerProducerFacets(registry, timelineComponent.producers);
  return registry;
}

function validatorRegistry(): RefinementRegistry {
  const registry = new RefinementRegistry();
  registerTypeRefinements(registry, compositionComponent.refinements);
  for (const component of mediaOperationsComponents) {
    registerTypeRefinements(registry, component.refinements);
  }
  return registry;
}

test("HTML renderer rendering is an explicit exact Need after ordinary document compilation", async () => {
  assert.deepEqual(build().plan.steps.map((step) => step.producer.name).sort(), [
    htmlProgramProducers.compile.name,
    htmlProgramProducers.requestVisual.name,
    mediaProducers.visualDelivery.name,
    mediaOperationsProducers.compileAudio.name,
    mediaOperationsProducers.renderAudio.name,
    mediaOperationsProducers.mux.name,
    mediaOperationsProducers.projectMuxed.name,
  ].sort());

  const result = await runBuild(new Executor({ producers: producerRegistry(), refinements: validatorRegistry() }), build());
  assert.equal(result.status, "paused");
  assert.equal(result.state.needs.length, 2);
  const visual = result.state.needs.find((need) => need.capability.name === htmlProgramCapabilities.rasterizeVisual.name)!;
  assert.equal(visual.returns.name, mediaTypes.timelineVisual.name);
  assert.deepEqual(visual.constraints, htmlRasterRequest(compileHtmlProgram(composition, space), delivery.visual));
  const audio = result.state.needs.find((need) => need.capability.name === "render-timeline-audio")!;
  assert.equal(audio.returns.name, mediaTypes.timelineAudio.name);
  assert.equal(result.blocked.every((item) => item.reason === "missing-endpoint"), true);
});

test("separate visual, audio and mux Endpoints complete one author-visible render", async () => {
  const visualArtifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-video:visual"),
    size: 12_345,
    mediaType: "video/mp4",
  };
  const audioArtifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-video:audio"),
    size: 4_096,
    mediaType: "audio/wav",
  };
  const finalArtifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-video:final-video"),
    size: 16_441,
    mediaType: "video/mp4",
  };
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint(
    "example.html.local",
    htmlProgramCapabilities.rasterizeVisual,
    mediaTypes.timelineVisual,
    ({ need }) => {
      const request = need.constraints as {
        readonly program: ReturnType<typeof compileHtmlProgram>;
        readonly delivery: typeof delivery.visual;
      };
      return stored(sealTimelineVisual({
          frameRate: request.program.frameRate,
          frameCount: request.program.frameCount,
          canvas: request.program.canvas,
          delivery: request.delivery,
          artifact: visualArtifact,
        }));
    },
  );
  endpoints.registerImmediateEndpoint(
    "example.media.audio-real",
    mediaOperationsCapabilities.renderAudio,
    mediaTypes.timelineAudio,
    ({ need }) => {
      const request = need.constraints as { contract: string; program: ReturnType<typeof compileAudioProgram> };
      return stored(sealTimelineAudio({
          artifact: audioArtifact,
          sampleRate: 48_000,
          channelLayout: "stereo",
          sampleFrames: request.program.sampleFrames,
        }));
    },
  );
  endpoints.registerImmediateEndpoint(
    "example.media.mux",
    mediaOperationsCapabilities.mux,
    mediaTypes.muxed,
    ({ need }) => {
      const request = need.constraints as { visual: ReturnType<typeof sealTimelineVisual>;
        audio: ReturnType<typeof sealTimelineAudio>; delivery: typeof delivery };
      return stored(sealMuxedMedia({
          frameRate: request.visual.frameRate,
          frameCount: request.visual.frameCount,
          canvas: request.visual.canvas,
          presentationSampleFrames: request.audio.sampleFrames,
          delivery: request.delivery,
          artifact: finalArtifact,
        }));
    },
  );
  const result = await runBuild(new Executor({
    producers: producerRegistry(),
    endpoints,
    refinements: validatorRegistry(),
  }), build());
  assert.equal(result.status, "complete");
  const video = result.state.records.find((record) =>
    record.type.module.name === blobTypes.blob.module.name
    && record.type.name === blobTypes.blob.name
    && isBlobRef(record.value)
    && record.value.resource === finalArtifact.resource);
  assert(video, "missing final Blob");
  assert.deepEqual(video.value, finalArtifact);
});

const fixtureModule = { name: "example.composition-fixture", version: "1" } as const;
const fixtureSurface = {
  name: "composition", tag: "Composition", mode: "structured",
  outputs: [compositionTypes.composition, timelineTypes.timeline],
} as const;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [compositionDependency, timelineDependency],
  types: [],
  capabilities: [],
  producers: [],
};

function source(text: string): ResolvedSource {
  return resolveSelfDescribedTextSource({
    id: "/project/main.svml",
    name: "main.svml",
    text: `<?svml using="@hypit/markup@1"?>\n${text}`,
  });
}

for (const selectedRange of [false, true]) {
test(`the ${selectedRange ? "selected" : "full"} rendered video remains an ordinary Blob for downstream components`, async () => {
  const sourceClosure = createResolvedClosure([
    blobManifest,
    timelineManifest,
    temporalManifest,
    mediaManifest,
    compositionManifest,
    recipeManifest,
    htmlProgramManifest,
    mediaOperationsManifest,
    htmlVideoManifest,
    fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "composition", type: compositionTypes.composition, value: stored(composition), range: element.range },
      { id: "semantic", type: timelineTypes.timeline, value: stored(semantic), range: element.range },
    ],
    components: [],
  }) });
  surfaces.registerStructured({
    module: htmlVideoModuleRef,
    declaration: htmlVideoMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeHtmlVideoSurface,
  });
  surfaces.registerStructured({
    module: mediaOperationsModuleRef,
    declaration: mediaOperationsMarkupSurfaces.find((item) => item.name === "extract-frame")!,
    handler: decodeExtractFrameSurface,
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      if (request.from.startsWith("@hypit/html-video")) return htmlVideoModuleRef;
      if (request.from.startsWith("@hypit/media-operations")) return mediaOperationsModuleRef;
      return fixtureModule;
    },
  }));
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="fixture" from="example.composition-fixture@1"/>
      <import as="html" from="@hypit/html-video@1"/>
      <import as="media" from="@hypit/media-operations@1"/>
      <fixture:Composition/>
      <html:Video id="final" composition={composition} timeline={semantic} ${selectedRange ? 'start-frame="15" end-frame-exclusive="45"' : ""}/>
      <media:ExtractFrame id="poster" source={final.video} video="primary-moving" at="last"/>
    </svml>`),
    closure: sourceClosure,
    frontends,
    resolveSource() {
      throw new Error("the fixture has no source imports");
    },
    refineRecord: async (record) => await refineRecord(record, validatorRegistry()),
  });
  const target = resolveCompiledSourceExport(compiled, "poster.image", blobTypes.blob);
  assert.equal(target.ref.kind, "logical-output");
  const state = buildState(compiled.program, compiled.graph, [
    target.ref.kind === "logical-output" ? target.ref.id : "",
  ]);
  assert.deepEqual(state.plan.steps.map((step) => step.producer.name).sort(), [
    htmlProgramProducers.compile.name,
    selectedRange ? htmlProgramProducers.requestVisualRange.name : htmlProgramProducers.requestVisual.name,
    mediaProducers.visualDelivery.name,
    mediaOperationsProducers.compileAudio.name,
    selectedRange ? mediaOperationsProducers.renderAudioRange.name : mediaOperationsProducers.renderAudio.name,
    mediaOperationsProducers.mux.name,
    mediaOperationsProducers.projectMuxed.name,
    mediaOperationsProducers.inspect.name,
    mediaOperationsProducers.extractFrame.name,
  ].sort());
});
}


test("selected render frames reach both visual and audio Needs through the ordinary Build graph", async () => {
  const range = { startFrame: 15, endFrameExclusive: 45 };
  const rangeRecord = { id: "selection", type: timelineTypes.frameSpan, value: stored(range) };
  await refineRecord(rangeRecord, validatorRegistry());
  const program = link(closure, [compositionRecord, spaceRecord, deliveryRecord, rangeRecord]);
  const fragment = createHtmlVideoFragment(true);
  const selected = elaborateGraphFragment(program, fragment, {
    id: "selected", inputs: {
      composition: { kind: "record", id: compositionRecord.id },
      timeline: { kind: "record", id: spaceRecord.id },
      delivery: { kind: "record", id: deliveryRecord.id },
      range: { kind: "record", id: rangeRecord.id },
    },
  });
  const selectedGraph = sealAuthorGraph(bindAuthorFragment(selected, { video: "selected.video" }));
  const result = await runBuild(
    new Executor({ producers: producerRegistry(), refinements: validatorRegistry() }),
    buildState(program, selectedGraph, ["selected.video"]),
  );
  assert.equal(result.state.needs.length, 2);
  for (const need of result.state.needs) assert.deepEqual((need.constraints as { range: unknown }).range, range);
});
