import { compositionComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { artifactTypes } from "@hypit/artifact";
import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@hypit/component-kit";
import { mediaTypes, sealMuxedMedia, sealRenderedVisual, sealTimelineAudio } from "@hypit/media";
import { programSpaceDependency, programSpaceTypes, sealProgramSpace } from "@hypit/program-space";
import { compositionDependency, compositionTypes, sealComposition } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";

import {
  createResolvedClosure,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@hypit/core";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@hypit/driver-node";
import {
  AuthorFrontendRegistry,
  bindAuthorFragment,
  compileSourceClosure,
  elaborateGraphFragment,
  resolveCompiledSourceExport,
} from "@hypit/elaborator";
import type { AuthorSourceUnit } from "@hypit/elaborator";
import {
  compileHyperframesDocument,
  hyperframesComponent,
  hyperframesManifest,
  hyperframesProducers,
} from "@hypit/hyperframes";
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
} from "@hypit/render-hyperframes";
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
} from "@hypit/media-pipeline";
import {
  admitRecord,
  createRecordAdmitter,
  TypeValidatorRegistry,
} from "@hypit/validation";
import type {
  CanonicalValue,
  ModuleManifest,
  StoredValue,
  TypedRecord,
} from "@hypit/protocol";
import {
  createMarkupAuthorFrontend,
  MarkupSurfaceRegistry,
} from "@hypit/markup";
import {
  semanticTrackComponent,
  semanticTrackDependency,
  semanticTrackTypes,
} from "@hypit/semantic-track";
import { svsManifest } from "@hypit/svs";

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const semantic = semanticTrackFixture(space);
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
  svsManifest,
]);
const compositionRecord = await admitRecord(closure, sealRecord({
  id: "composition",
  type: compositionTypes.composition,
  value: stored(composition),
}), validatorRegistry());
const semanticRecord = await admitRecord(closure, sealRecord({
  id: "semantic",
  type: semanticTrackTypes.track,
  value: stored(semantic),
}), validatorRegistry());
const linked = link(closure, [compositionRecord, semanticRecord]);
const instance = elaborateGraphFragment(linked, renderHyperframesFragment, {
  id: "final",
  fragment: renderHyperframesFragment.id,
  inputs: {
    composition: { kind: "record", id: compositionRecord.id },
    semantic: { kind: "record", id: semanticRecord.id },
  },
});
const contribution = bindAuthorFragment(instance, { video: "final.video" });
const graph = sealCompiledGraph({ ...contribution });

function build() {
  return start(linked, graph, sealBuildRequest({
    targets: [{ output: "final.video" }],
  }));
}

function producerRegistry(): ProducerRegistry {
  const registry = new ProducerRegistry();
  registerProducerFacets(registry, mediaPipelineComponent.producers);
  registerProducerFacets(registry, hyperframesComponent.producers);
  registerProducerFacets(registry, renderHyperframesComponent.producers);
  registerProducerFacets(registry, semanticTrackComponent.producers);
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
    "project-program-space",
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
    digest: fixtureDigest("render-hyperframes:visual"),
    size: 12_345,
    mediaType: "video/mp4",
  };
  const audioArtifact = {
    kind: "blob" as const,
    digest: fixtureDigest("render-hyperframes:audio"),
    size: 4_096,
    mediaType: "audio/wav",
  };
  const finalArtifact = {
    kind: "blob" as const,
    digest: fixtureDigest("render-hyperframes:final-video"),
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
        readonly document: ReturnType<typeof compileHyperframesDocument>;
      };
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
          digest: fixtureDigest("render-hyperframes:wrong-domain"),
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
            digest: fixtureDigest("render-hyperframes:domain-check-audio"),
            size: 1,
            mediaType: "audio/wav",
          },
          sampleFrames: request.plan.sampleFrames,
        })),
      };
    },
  );
  const result = await new NodeDriver({
    producers: producerRegistry(),
    endpoints,
    validators: validatorRegistry(),
  }).run(build());
  assert.equal(result.status, "paused");
  assert.match(result.outcomes.at(-1)?.message ?? "", /different presentation durations/u);
});

const fixtureModule = { name: "example.composition-fixture", version: "1" } as const;
const fixtureSurfaceDigest = fixtureDigest("example.composition-fixture/surface@1");
const fixtureSurface = {
  name: "composition", tag: "Composition", mode: "structured",
  outputs: [compositionTypes.composition, semanticTrackTypes.track],
} as const;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [compositionDependency, semanticTrackDependency],
  types: [],
  capabilities: [],
  producers: [],
};

function source(text: string): AuthorSourceUnit {
  return {
    id: "/project/main.svml",
    name: "main.svml",
    text: `<?svml using="@hypit/markup@1"?>\n${text}`,
  };
}

test("the final rendered video is an ordinary BlobArtifact that can feed another author component", async () => {
  const sourceClosure = createResolvedClosure([
    ...videoContractManifests,
    hyperframesManifest,
    mediaPipelineManifest,
    renderHyperframesManifest,
    fixtureManifest,
    svsManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "composition", type: compositionTypes.composition, value: stored(composition), range: element.range },
      { id: "semantic", type: semanticTrackTypes.track, value: stored(semantic), range: element.range },
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
      if (request.from.startsWith("@hypit/render-hyperframes")) return renderHyperframesModuleRef;
      if (request.from.startsWith("@hypit/media-pipeline")) return mediaPipelineModuleRef;
      return fixtureModule;
    },
  }));
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="fixture" from="example.composition-fixture@1"/>
      <import as="render" from="@hypit/render-hyperframes@1"/>
      <import as="media" from="@hypit/media-pipeline@1"/>
      <fixture:Composition/>
      <render:Video id="final" composition={composition} semantic={semantic}/>
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
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "" }],
  }));
  assert.deepEqual(state.plan.steps.map((step) => step.producer.name).sort(), [
    "project-program-space",
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
