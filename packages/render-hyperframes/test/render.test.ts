import { compositionComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { artifactTypes } from "@narratage/artifact";
import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import { mediaTypes, sealMuxedMedia, sealRenderedVisual, sealTimelineAudio } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { compositionDependency, compositionTypes, sealComposition } from "@narratage/composition";
import type { Composition } from "@narratage/composition";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@narratage/core";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@narratage/driver-node";
import {
  AuthorFrontendRegistry,
  bindAuthorFragment,
  compileSourceClosure,
  elaborateGraphFragment,
  resolveCompiledSourceExport,
} from "@narratage/elaborator";
import type { AuthorSourceUnit } from "@narratage/elaborator";
import {
  compileHyperframesDocument,
  hyperframesComponent,
  hyperframesManifest,
  hyperframesProducers,
} from "@narratage/hyperframes";
import {
  decodeHyperframesRenderSurface,
  renderHyperframesCapabilities,
  renderHyperframesComponent,
  renderHyperframesFragment,
  renderHyperframesManifest,
  renderHyperframesMarkupSurfaces,
  renderHyperframesModuleRef,
  renderHyperframesProducers,
  hyperframesVisualRequest,
} from "@narratage/render-hyperframes";
import {
  compileAudioProgramPlan,
  decodeExtractFrameSurface,
  mediaPipelineComponent,
  mediaPipelineComponents,
  mediaPipelineCapabilities,
  mediaPipelineManifest,
  mediaPipelineMarkupSurfaces,
  mediaPipelineModuleRef,
  mediaPipelineProducers,
} from "@narratage/media-pipeline";
import {
  admitRecord,
  createRecordAdmitter,
  TypeValidatorRegistry,
} from "@narratage/validation";
import type {
  CanonicalValue,
  ModuleManifest,
  StoredValue,
  TypedRecord,
} from "@narratage/protocol";
import {
  createMarkupAuthorFrontend,
  MarkupSurfaceRegistry,
} from "@narratage/markup";

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const composition = sealComposition({
  id: "render-test",
  canvas: { width: 1080, height: 1920, clearColor: "#000000" },
  tracks: [],
});

const stored = (value: CanonicalValue): StoredValue => ({ kind: "inline", value });
function inline(record: TypedRecord | undefined): CanonicalValue {
  assert(record, "missing Producer input");
  assert.equal(record.value.kind, "inline");
  return record.value.value;
}

const closure = createResolvedClosure([
  ...videoContractManifests,
  hyperframesManifest,
  mediaPipelineManifest,
  renderHyperframesManifest,
]);
const origin = {
  kind: "authored" as const,
};
const compositionRecord = await admitRecord(closure, sealRecord({
  id: "composition",
  type: compositionTypes.composition,
  value: stored(composition),
  origin,
}), validatorRegistry());
const spaceRecord = await admitRecord(closure, sealRecord({
  id: "space",
  type: programSpaceTypes.programSpace,
  value: stored(space),
  origin,
}), validatorRegistry());
const linked = link(closure, [compositionRecord, spaceRecord]);
const instance = elaborateGraphFragment(linked, renderHyperframesFragment, {
  id: "final",
  fragment: renderHyperframesFragment.id,
  inputs: {
    composition: { kind: "record", id: compositionRecord.id },
    space: { kind: "record", id: spaceRecord.id },
  },
});
const contribution = bindAuthorFragment(instance, { video: "final.video" });
const graph = sealCompiledGraph({ program: linked.semanticDigest, ...contribution });

function build() {
  return start(linked, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: "final.video" }],
  }));
}

function producerRegistry(): ProducerRegistry {
  const registry = new ProducerRegistry();
  registerProducerFacets(registry, mediaPipelineComponent.producers);
  registerProducerFacets(registry, hyperframesComponent.producers);
  registerProducerFacets(registry, renderHyperframesComponent.producers);
  return registry;
}

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
  for (const component of mediaPipelineComponents) {
    registerTypeValidatorFacets(registry, component.validators);
  }
  return registry;
}

test("HyperFrames rendering is an explicit exact Need after ordinary document compilation", async () => {
  assert.deepEqual(build().plan.steps.map((step) => step.producer.name).sort(), [
    hyperframesProducers.compile.name,
    renderHyperframesProducers.requestVisual.name,
    mediaPipelineProducers.planAudio.name,
    mediaPipelineProducers.renderAudio.name,
    mediaPipelineProducers.mux.name,
    mediaPipelineProducers.projectMuxed.name,
  ].sort());

  const result = await new NodeDriver({ producers: producerRegistry(), validators: validatorRegistry() }).run(build());
  assert.equal(result.status, "paused");
  assert.equal(result.state.needs.length, 2);
  const visual = result.state.needs.find((need) => need.capability.name === renderHyperframesCapabilities.renderVisual.name)!;
  assert.equal(visual.returns.name, mediaTypes.renderedVisual.name);
  assert.deepEqual(visual.constraints, hyperframesVisualRequest(compileHyperframesDocument(composition, space)));
  const audio = result.state.needs.find((need) => need.capability.name === "render-timeline-audio")!;
  assert.equal(audio.returns.name, mediaTypes.timelineAudio.name);
  assert.equal(result.blocked.every((item) => item.reason === "missing-endpoint"), true);
});

test("separate visual, audio and mux Endpoints complete one author-visible render", async () => {
  const visualArtifact = {
    kind: "blob" as const,
    digest: digestOf("render-hyperframes:visual"),
    size: 12_345,
    mediaType: "video/mp4",
  };
  const audioArtifact = {
    kind: "blob" as const,
    digest: digestOf("render-hyperframes:audio"),
    size: 4_096,
    mediaType: "audio/wav",
  };
  const finalArtifact = {
    kind: "blob" as const,
    digest: digestOf("render-hyperframes:final-video"),
    size: 16_441,
    mediaType: "video/mp4",
  };
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint(
    "example.hyperframes.local",
    renderHyperframesCapabilities.renderVisual,
    mediaTypes.renderedVisual,
    ({ need }) => {
      const request = need.constraints as {
        readonly contract: string;
        readonly document: ReturnType<typeof compileHyperframesDocument>;
      };
      assert.equal(request.contract, "svml.hyperframes-visual-render-request@1");
      return {
        value: stored(sealRenderedVisual({
          frameRate: request.document.frameRate,
          frameCount: request.document.frameCount,
          canvas: request.document.canvas,
          artifact: visualArtifact,
        })),
      };
    },
  );
  endpoints.registerImmediateEndpoint(
    "example.media.audio-real",
    mediaPipelineCapabilities.renderAudio,
    mediaTypes.timelineAudio,
    ({ need }) => {
      const request = need.constraints as { contract: string; plan: ReturnType<typeof compileAudioProgramPlan> };
      return {
        value: stored(sealTimelineAudio({
          artifact: audioArtifact,
          sampleFrames: request.plan.sampleFrames,
        })),
      };
    },
  );
  endpoints.registerImmediateEndpoint(
    "example.media.mux",
    mediaPipelineCapabilities.mux,
    mediaTypes.muxed,
    ({ need }) => {
      const request = need.constraints as { visual: ReturnType<typeof sealRenderedVisual>; audio: ReturnType<typeof sealTimelineAudio> };
      return {
        value: stored(sealMuxedMedia({
          frameRate: request.visual.frameRate,
          frameCount: request.visual.frameCount,
          canvas: request.visual.canvas,
          presentationSampleFrames: request.audio.sampleFrames,
          artifact: finalArtifact,
        })),
      };
    },
  );
  endpoints.bind(renderHyperframesCapabilities.renderVisual, "example.hyperframes.local");
  endpoints.bind(mediaPipelineCapabilities.renderAudio, "example.media.audio-real");
  endpoints.bind(mediaPipelineCapabilities.mux, "example.media.mux");

  const result = await new NodeDriver({
    producers: producerRegistry(),
    endpoints,
    validators: validatorRegistry(),
  }).run(build());
  assert.equal(result.status, "complete");
  const video = result.state.records.find((record) =>
    record.type.module.name === artifactTypes.blob.module.name
    && record.type.name === artifactTypes.blob.name
    && record.value.kind === "blob"
    && record.value.digest === finalArtifact.digest);
  assert(video, "missing final BlobArtifact");
  assert.deepEqual(video.value, finalArtifact);
});

test("a render Product with another frame domain is rejected by the explicit downstream join", async () => {
  const document = compileHyperframesDocument(composition, space);
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint(
    "example.hyperframes.wrong-domain",
    renderHyperframesCapabilities.renderVisual,
    mediaTypes.renderedVisual,
    () => ({
      value: stored(sealRenderedVisual({
        frameRate: document.frameRate,
        frameCount: document.frameCount + 1,
        canvas: document.canvas,
        artifact: {
          kind: "blob",
          digest: digestOf("render-hyperframes:wrong-domain"),
          size: 1,
          mediaType: "video/mp4",
          },
      })),
    }),
  );
  endpoints.registerImmediateEndpoint(
    "example.media.audio-for-domain-check",
    mediaPipelineCapabilities.renderAudio,
    mediaTypes.timelineAudio,
    ({ need }) => {
      const request = need.constraints as { readonly plan: ReturnType<typeof compileAudioProgramPlan> };
      return {
        value: stored(sealTimelineAudio({
          artifact: {
            kind: "blob",
            digest: digestOf("render-hyperframes:domain-check-audio"),
            size: 1,
            mediaType: "audio/wav",
          },
          sampleFrames: request.plan.sampleFrames,
        })),
      };
    },
  );
  endpoints.bind(renderHyperframesCapabilities.renderVisual, "example.hyperframes.wrong-domain");
  endpoints.bind(mediaPipelineCapabilities.renderAudio, "example.media.audio-for-domain-check");

  const result = await new NodeDriver({
    producers: producerRegistry(),
    endpoints,
    validators: validatorRegistry(),
  }).run(build());
  assert.equal(result.status, "paused");
  assert.match(result.outcomes.at(-1)?.message ?? "", /different presentation durations/u);
  assert.equal(result.state.receipts.length, 2);
});

const fixtureModule = { name: "example.composition-fixture", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.composition-fixture/surface@1");
const fixtureSurface = {
  name: "composition", tag: "Composition", mode: "structured",
  outputs: [compositionTypes.composition, programSpaceTypes.programSpace],
  implementation: { digest: fixtureSurfaceDigest },
} as const;
const fixtureManifest: ModuleManifest = {
  format: "svml.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [compositionDependency, programSpaceDependency],
  types: [],
  capabilities: [],
  producers: [],
};

function source(text: string): AuthorSourceUnit {
  return {
    id: "/project/main.svml",
    name: "main.svml",
    text: `<?svml using="@narratage/markup@1"?>\n${text}`,
  };
}

test("the final rendered video is an ordinary BlobArtifact that can feed another author component", async () => {
  const sourceClosure = createResolvedClosure([
    ...videoContractManifests,
    hyperframesManifest,
    mediaPipelineManifest,
    renderHyperframesManifest,
    fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "composition", type: compositionTypes.composition, value: stored(composition), range: element.range },
      { id: "space", type: programSpaceTypes.programSpace, value: stored(space), range: element.range },
    ],
    components: [],
    fragments: [],
  }) });
  surfaces.registerStructured({
    module: renderHyperframesModuleRef,
    declaration: renderHyperframesMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeHyperframesRenderSurface,
  });
  surfaces.registerStructured({
    module: mediaPipelineModuleRef,
    declaration: mediaPipelineMarkupSurfaces.find((item) => item.name === "extract-frame")!,
    handler: decodeExtractFrameSurface,
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      if (request.from.startsWith("@narratage/render-hyperframes")) return renderHyperframesModuleRef;
      if (request.from.startsWith("@narratage/media-pipeline")) return mediaPipelineModuleRef;
      return fixtureModule;
    },
  }));
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="fixture" from="example.composition-fixture@1"/>
      <import as="render" from="@narratage/render-hyperframes@1"/>
      <import as="media" from="@narratage/media-pipeline@1"/>
      <fixture:Composition/>
      <render:Video id="final" composition={composition} space={space}/>
      <media:ExtractFrame id="poster" source={final.video} video="primary-moving" at="last"/>
    </svml>`),
    closure: sourceClosure,
    frontends,
    resolveSource() {
      throw new Error("the fixture has no source imports");
    },
    admitRecord: createRecordAdmitter(validatorRegistry()),
  });
  const target = resolveCompiledSourceExport(compiled, "poster.image", artifactTypes.blob);
  assert.equal(target.ref.kind, "logical-output");
  const state = start(compiled.program, compiled.graph, sealBuildRequest({
    graph: compiled.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "" }],
  }));
  assert.deepEqual(state.plan.steps.map((step) => step.producer.name).sort(), [
    hyperframesProducers.compile.name,
    renderHyperframesProducers.requestVisual.name,
    mediaPipelineProducers.planAudio.name,
    mediaPipelineProducers.renderAudio.name,
    mediaPipelineProducers.mux.name,
    mediaPipelineProducers.projectMuxed.name,
    mediaPipelineProducers.inspect.name,
    mediaPipelineProducers.extractFrame.name,
  ].sort());
});
