import assert from "node:assert/strict";
import test from "node:test";

import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@svml/component-kit";
import {
  compositionContractsComponent,
  contractTypes,
  sealComposition,
  sealMuxedMedia,
  sealProgramSpace,
  sealRenderedVisual,
  sealTimelineAudio,
  videoContractDependencies,
  videoContractManifests,
} from "@svml/contracts";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
} from "@svml/driver-node";
import {
  AuthorFrontendRegistry,
  bindAuthorFragment,
  compileSourceClosure,
  elaborateGraphFragment,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type { AuthorSourceUnit } from "@svml/elaborator";
import {
  compileHyperframesDocument,
  hyperframesComponent,
  hyperframesManifest,
  hyperframesProducers,
} from "@svml/hyperframes";
import {
  decodeHyperframesRenderSurface,
  hyperframesRenderCapabilities,
  hyperframesRenderComponent,
  hyperframesRenderFragment,
  hyperframesRenderManifest,
  hyperframesRenderModuleRef,
  hyperframesRenderProducers,
  hyperframesVisualRequest,
  hyperframesRenderSurfaceImplementationDigest,
} from "@svml/hyperframes-render";
import {
  compileAudioProgramPlan,
  mediaPipelineComponent,
  mediaPipelineComponents,
  mediaPipelineCapabilities,
  mediaPipelineManifest,
  mediaPipelineProducers,
} from "@svml/media-pipeline";
import {
  admitRecord,
  createRecordAdmitter,
  TypeValidatorRegistry,
} from "@svml/validation";
import type {
  CanonicalValue,
  ModuleManifest,
  StoredValue,
  TypedRecord,
} from "@svml/protocol";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";

const space = sealProgramSpace({
  contract: "svml.program-space@0",
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const composition = sealComposition({
  contract: "svml.composition@1",
  id: "render-test",
  programSpace: space,
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
  hyperframesRenderManifest,
]);
const origin = {
  kind: "authored" as const,
  sourceDigest: digestOf("source:hyperframes-render-test"),
  frontendClosureDigest: digestOf("frontend:hyperframes-render-test"),
};
const compositionRecord = await admitRecord(closure, sealRecord({
  id: "composition",
  type: contractTypes.composition,
  value: stored(composition),
  conformance: "exact",
  origin,
}), validatorRegistry());
const linked = link(closure, [sealTypedModule({
  id: "author:hyperframes-render-test",
  closureDigest: closure.digest,
  records: [compositionRecord],
})]);
const instance = elaborateGraphFragment(linked, hyperframesRenderFragment, {
  id: "final",
  fragment: hyperframesRenderFragment.id,
  inputs: { composition: { kind: "record", id: compositionRecord.id } },
});
const contribution = bindAuthorFragment(instance, { video: "final.video" });
const graph = sealCompiledGraph({ program: linked.semanticDigest, ...contribution });

function build() {
  return start(linked, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: "final.video", accepts: "exact" }],
    bindings: [],
  }));
}

function producerRegistry(): HostRegistry {
  const registry = new HostRegistry();
  registerProducerFacets(registry, mediaPipelineComponent.producers);
  registerProducerFacets(registry, hyperframesComponent.producers);
  registerProducerFacets(registry, hyperframesRenderComponent.producers);
  return registry;
}

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionContractsComponent.validators);
  for (const component of mediaPipelineComponents) {
    registerTypeValidatorFacets(registry, component.validators);
  }
  return registry;
}

test("HyperFrames rendering is an explicit exact Need after ordinary document compilation", async () => {
  assert.deepEqual(build().plan.steps.map((step) => step.producer.name).sort(), [
    hyperframesProducers.compile.name,
    hyperframesRenderProducers.requestVisual.name,
    mediaPipelineProducers.planAudio.name,
    mediaPipelineProducers.renderAudio.name,
    mediaPipelineProducers.mux.name,
    mediaPipelineProducers.projectMuxed.name,
  ].sort());

  const result = await new NodeDriver({ registry: producerRegistry(), validators: validatorRegistry() }).run(build());
  assert.equal(result.status, "paused");
  assert.equal(result.state.needs.length, 2);
  const visual = result.state.needs.find((need) => need.capability.name === hyperframesRenderCapabilities.renderVisual.name)!;
  assert.equal(visual.returns.name, contractTypes.renderedVisual.name);
  assert.equal(visual.accepts, "exact");
  assert.deepEqual(visual.constraints, hyperframesVisualRequest(compileHyperframesDocument(composition)));
  const audio = result.state.needs.find((need) => need.capability.name === "render-timeline-audio")!;
  assert.equal(audio.returns.name, contractTypes.timelineAudio.name);
  assert.equal(result.blocked.every((item) => item.reason === "missing-provider"), true);
});

test("separate visual, audio and mux Providers complete one author-visible render", async () => {
  const visualArtifact = {
    kind: "blob" as const,
    digest: digestOf("hyperframes-render:visual"),
    size: 12_345,
    mediaType: "video/mp4",
  };
  const audioArtifact = {
    kind: "blob" as const,
    digest: digestOf("hyperframes-render:audio"),
    size: 4_096,
    mediaType: "audio/wav",
  };
  const finalArtifact = {
    kind: "blob" as const,
    digest: digestOf("hyperframes-render:final-video"),
    size: 16_441,
    mediaType: "video/mp4",
  };
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "example.hyperframes.local",
    hyperframesRenderCapabilities.renderVisual,
    contractTypes.renderedVisual,
    ({ need }) => {
      const request = need.constraints as {
        readonly contract: string;
        readonly document: ReturnType<typeof compileHyperframesDocument>;
      };
      assert.equal(request.contract, "svml.hyperframes-visual-render-request@1");
      return {
        value: stored(sealRenderedVisual({
          contract: "svml.rendered-visual@1",
          renderInputDigest: request.document.digest,
          programSpaceDigest: request.document.programSpaceDigest,
          frameRate: request.document.frameRate,
          frameCount: request.document.frameCount,
          canvas: request.document.canvas,
          artifact: visualArtifact,
          muted: true,
        })),
        conformance: "exact",
        delivery: "executed",
        metadata: { runtime: "fixture-local" },
      };
    },
  );
  providers.registerProvider(
    "example.media.audio-real",
    mediaPipelineCapabilities.renderAudio,
    contractTypes.timelineAudio,
    ({ need }) => {
      const request = need.constraints as { contract: string; plan: ReturnType<typeof compileAudioProgramPlan> };
      return {
        value: stored(sealTimelineAudio({
          contract: "svml.timeline-audio@1",
          planDigest: request.plan.planDigest,
          programSpaceDigest: request.plan.programSpaceDigest,
          artifact: audioArtifact,
          codec: "pcm_s16le",
          sampleRate: 48_000,
          channels: 2,
          sampleFrames: request.plan.sampleFrames,
          loudness: "planned",
        })),
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      };
    },
  );
  providers.registerProvider(
    "example.media.mux",
    mediaPipelineCapabilities.mux,
    contractTypes.muxedMedia,
    ({ need }) => {
      const request = need.constraints as { visual: ReturnType<typeof sealRenderedVisual>; audio: ReturnType<typeof sealTimelineAudio> };
      return {
        value: stored(sealMuxedMedia({
          contract: "svml.muxed-media@1",
          visualDigest: request.visual.visualDigest,
          audioDigest: request.audio.audioDigest,
          programSpaceDigest: request.visual.programSpaceDigest,
          frameRate: request.visual.frameRate,
          frameCount: request.visual.frameCount,
          canvas: request.visual.canvas,
          presentationSampleFrames: request.audio.sampleFrames,
          artifact: finalArtifact,
        })),
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      };
    },
  );
  providers.bind(hyperframesRenderCapabilities.renderVisual, "example.hyperframes.local");
  providers.bind(mediaPipelineCapabilities.renderAudio, "example.media.audio-real");
  providers.bind(mediaPipelineCapabilities.mux, "example.media.mux");

  const result = await new NodeDriver({
    registry: producerRegistry(),
    providers,
    validators: validatorRegistry(),
  }).run(build());
  assert.equal(result.status, "complete");
  const video = result.state.records.find((record) =>
    record.type.module.name === contractTypes.mediaArtifact.module.name
    && record.type.name === contractTypes.mediaArtifact.name);
  assert.deepEqual(inline(video), {
    digest: finalArtifact.digest,
    size: finalArtifact.size,
    mediaType: finalArtifact.mediaType,
    durationSec: space.durationSec,
  });
});

test("a render Product cannot claim another frame domain while keeping the requested document", async () => {
  const document = compileHyperframesDocument(composition);
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "example.hyperframes.wrong-domain",
    hyperframesRenderCapabilities.renderVisual,
    contractTypes.renderedVisual,
    () => ({
      value: stored(sealRenderedVisual({
        contract: "svml.rendered-visual@1",
        renderInputDigest: document.digest,
        programSpaceDigest: document.programSpaceDigest,
        frameRate: document.frameRate,
        frameCount: document.frameCount + 1,
        canvas: document.canvas,
        artifact: {
          kind: "blob",
          digest: digestOf("hyperframes-render:wrong-domain"),
          size: 1,
          mediaType: "video/mp4",
        },
        muted: true,
      })),
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    }),
  );
  providers.bind(hyperframesRenderCapabilities.renderVisual, "example.hyperframes.wrong-domain");

  const result = await new NodeDriver({
    registry: producerRegistry(),
    providers,
    validators: validatorRegistry(),
  }).run(build());
  assert.equal(result.status, "paused");
  assert.match(result.journal.at(-1)?.message ?? "", /frameCount|does not match/u);
  assert.equal(result.state.receipts.length, 0);
});

const fixtureModule = { name: "example.composition-fixture", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.composition-fixture/surface@1");
const fixtureManifest: ModuleManifest = {
  format: "svml.module@0",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [videoContractDependencies.composition],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "composition",
    tag: "Composition",
    mode: "structured",
    outputs: [contractTypes.composition],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.composition-fixture/surface",
      digest: fixtureSurfaceDigest,
    },
  }],
  producers: [],
};

function source(text: string): AuthorSourceUnit {
  return { id: "/project/main.svml", name: "main.svml", text };
}

test("the official render Surface lowers real author source to the same BuildPlan", async () => {
  const sourceClosure = createResolvedClosure([
    ...videoContractManifests,
    hyperframesManifest,
    mediaPipelineManifest,
    hyperframesRenderManifest,
    fixtureManifest,
  ]);
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerStructured(fixtureModule, "composition", fixtureSurfaceDigest, ({ element }) => ({
    records: [{
      id: "composition",
      type: contractTypes.composition,
      value: stored(composition),
      range: element.range,
    }],
    components: [],
    fragments: [],
  }));
  surfaces.registerStructured(
    hyperframesRenderModuleRef,
    "video",
    hyperframesRenderSurfaceImplementationDigest,
    decodeHyperframesRenderSurface,
  );
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      return request.from.startsWith("@svml/hyperframes-render")
        ? hyperframesRenderModuleRef
        : fixtureModule;
    },
  }));
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="fixture" from="example.composition-fixture@1"/>
      <import as="render" from="@svml/hyperframes-render@1"/>
      <fixture:Composition/>
      <render:Video id="final" composition={composition}/>
    </svml>`),
    frontend: textAuthorFrontendId,
    closure: sourceClosure,
    frontends,
    resolveSource() {
      throw new Error("the fixture has no source imports");
    },
    admitRecord: createRecordAdmitter(validatorRegistry()),
  });
  const target = resolveCompiledSourceExport(compiled, "final.video", contractTypes.mediaArtifact);
  assert.equal(target.ref.kind, "logical-output");
  const state = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "", accepts: "exact" }],
    bindings: [],
  }));
  assert.deepEqual(state.plan.steps.map((step) => step.producer.name).sort(), [
    hyperframesProducers.compile.name,
    hyperframesRenderProducers.requestVisual.name,
    mediaPipelineProducers.planAudio.name,
    mediaPipelineProducers.renderAudio.name,
    mediaPipelineProducers.mux.name,
    mediaPipelineProducers.projectMuxed.name,
  ].sort());
});
