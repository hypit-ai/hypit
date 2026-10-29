import { sealTimeline, timelineManifest, timelineTypes, timelineComponent } from "@hypit/timeline";
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
  AuthorDeclarationRegistry,
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
  htmlVideoFragment,
  createHtmlVideoFragment,
  htmlVideoAuthorDeclarations,
  htmlVideoManifest,
  htmlVideoMarkupDeclarations,
  htmlVideoModuleRef,
  htmlVideoDeliverySpec,
} from "@hypit/html-video";
import {
  mediaOperationsAuthorDeclarations,
  mediaOperationsComponent,
  mediaOperationsManifest,
  mediaOperationsMarkupDeclarations,
  mediaOperationsModuleRef,
  mediaOperationsProducers,
} from "@hypit/media-operations";
import {
  audioProgramCapabilities,
  audioProgramComponent,
  audioProgramManifest,
  audioProgramProducers,
  compileAudioProgram,
} from "@hypit/audio-program";
import {
  mediaDeliveryCapabilities,
  mediaDeliveryComponent,
  mediaDeliveryManifest,
  mediaDeliveryProducers,
} from "@hypit/media-delivery";
import {
  refineRecord,
  RefinementRegistry,
} from "@hypit/refinement";
import type {
  CanonicalValue,
  ModuleManifest,
  Value,
  TypedRecord,
} from "@hypit/protocol";
import { sameCapability } from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";
import { isBlobRef } from "@hypit/protocol";
import { recipeManifest } from "@hypit/recipe";
import { temporalManifest } from "@hypit/temporal";
import {
  createMarkupDeclarationAuthorFrontend,
  MarkupDeclarationRegistry,
} from "@hypit/markup";

async function runBuild(executor: Executor, state: BuildView) {
  return (await new InProcessBuildScheduler(executor).run([{
    id: "html-video-test",
    definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
    facts: [],
  }]))[0]!;
}

const space = sealTimeline({ id: "test-space", frameCount: 60, frameRate: { numerator: 30, denominator: 1 },
});
const composition = sealComposition({ id: "render-test", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [] } }, audio: { contributions: [] } }, space);
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
  audioProgramManifest,
  mediaDeliveryManifest,
  mediaOperationsManifest,
  htmlVideoManifest,
]);
const compositionRecord = {
  id: "composition",
  type: compositionTypes.composition,
  value: stored(composition),
};
await refineRecord(compositionRecord, validatorRegistry());
const deliveryRecord = { id: "delivery", type: mediaTypes.delivery, value: stored(delivery) };
await refineRecord(deliveryRecord, validatorRegistry());
const linked = link(closure, [compositionRecord, deliveryRecord]);
const instance = elaborateGraphFragment(linked, htmlVideoFragment, {
  id: "final",
  inputs: {
    composition: { kind: "record", id: compositionRecord.id },
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
  const planned = planBuild(program, authorGraph, targets, []);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}

function producerRegistry(): ProducerRegistry {
  const registry = new ProducerRegistry();
  registerProducerFacets(registry, mediaOperationsComponent.producers);
  registerProducerFacets(registry, audioProgramComponent.producers);
  registerProducerFacets(registry, mediaDeliveryComponent.producers);
  registerProducerFacets(registry, mediaComponent.producers);
  registerProducerFacets(registry, htmlProgramComponent.producers);
  registerProducerFacets(registry, timelineComponent.producers);
  return registry;
}

function validatorRegistry(): RefinementRegistry {
  const registry = new RefinementRegistry();
  registerTypeRefinements(registry, compositionComponent.refinements);
  registerTypeRefinements(registry, mediaComponent.refinements);
  registerTypeRefinements(registry, mediaOperationsComponent.refinements);
  registerTypeRefinements(registry, audioProgramComponent.refinements);
  return registry;
}

test("HTML renderer rendering is an explicit exact Need after ordinary document compilation", async () => {
  assert.deepEqual(build().plan.steps.map((step) => step.producer.name).sort(), [
    htmlProgramProducers.compile.name,
    htmlProgramProducers.requestVisual.name,
    mediaProducers.visualDelivery.name,
    audioProgramProducers.compile.name,
    audioProgramProducers.render.name,
    mediaDeliveryProducers.mux.name,
    mediaDeliveryProducers.projectVideo.name,
  ].sort());

  const result = await runBuild(new Executor({ producers: producerRegistry(), refinements: validatorRegistry() }), build());
  assert.equal(result.status, "paused");
  assert.equal(result.state.needs.length, 2);
  const visual = result.state.needs.find((need) =>
    sameCapability(need.capability, htmlProgramCapabilities.rasterizeVisual))!;
  assert.equal(visual.returns.name, mediaTypes.timelineVisual.name);
  assert.deepEqual(visual.constraints, htmlRasterRequest(compileHtmlProgram(composition), delivery.visual));
  const audio = result.state.needs.find((need) =>
    sameCapability(need.capability, audioProgramCapabilities.render))!;
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
    ({ request: endpointRequest }) => {
      const request = endpointRequest.constraints as {
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
    audioProgramCapabilities.render,
    mediaTypes.timelineAudio,
    ({ request: endpointRequest }) => {
      const request = endpointRequest.constraints as { contract: string; program: ReturnType<typeof compileAudioProgram> };
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
    mediaDeliveryCapabilities.mux,
    mediaTypes.muxed,
    ({ request: endpointRequest }) => {
      const request = endpointRequest.constraints as { visual: ReturnType<typeof sealTimelineVisual>;
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
const fixtureDeclaration = {
  module: fixtureModule,
  declaration: "composition",
  outputs: [compositionTypes.composition],
  shape: { summary: "Supplies the test Composition.", fields: [] },
  bindings: () => [
    { name: "composition", ref: { kind: "record" as const, id: "composition" }, type: compositionTypes.composition },
  ],
  compile: ({ declaration }: { readonly declaration: { readonly range: { readonly start: number; readonly end: number } } }) => ({
    records: [
      { id: "composition", type: compositionTypes.composition, value: stored(composition), range: declaration.range },
    ],
    components: [],
  }),
} as const;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [compositionDependency],
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
    audioProgramManifest,
    mediaDeliveryManifest,
    mediaOperationsManifest,
    htmlVideoManifest,
    fixtureManifest,
  ]);
  const declarations = new AuthorDeclarationRegistry();
  declarations.register(fixtureDeclaration);
  for (const declaration of [...htmlVideoAuthorDeclarations, ...mediaOperationsAuthorDeclarations]) {
    declarations.register(declaration);
  }
  const syntax = new MarkupDeclarationRegistry();
  syntax.register({ module: fixtureModule, declaration: "composition", tag: "Composition" });
  for (const declaration of htmlVideoMarkupDeclarations) {
    syntax.register({ module: htmlVideoModuleRef, declaration: declaration.name, tag: declaration.tag });
  }
  for (const declaration of mediaOperationsMarkupDeclarations) {
    syntax.register({ module: mediaOperationsModuleRef, declaration: declaration.name, tag: declaration.tag });
  }
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupDeclarationAuthorFrontend({
    syntax,
    compilers: declarations,
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
      <html:Video id="final" composition={composition} ${selectedRange ? 'start-frame="15" end-frame-exclusive="45"' : ""}/>
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
    audioProgramProducers.compile.name,
    selectedRange ? audioProgramProducers.renderRange.name : audioProgramProducers.render.name,
    mediaDeliveryProducers.mux.name,
    mediaDeliveryProducers.projectVideo.name,
    mediaOperationsProducers.inspect.name,
    mediaOperationsProducers.extractFrame.name,
  ].sort());
});
}


test("selected render frames reach both visual and audio Needs through the ordinary Build graph", async () => {
  const range = { startFrame: 15, endFrameExclusive: 45 };
  const rangeRecord = { id: "selection", type: timelineTypes.frameSpan, value: stored(range) };
  await refineRecord(rangeRecord, validatorRegistry());
  const program = link(closure, [compositionRecord, deliveryRecord, rangeRecord]);
  const fragment = createHtmlVideoFragment(true);
  const selected = elaborateGraphFragment(program, fragment, {
    id: "selected", inputs: {
      composition: { kind: "record", id: compositionRecord.id },
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
