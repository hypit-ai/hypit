import assert from "node:assert/strict";
import test from "node:test";

import {
  contractTypes,
  sealComposition,
  sealProgramSpace,
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
  compileHyperframesImplementationDigest,
  hyperframesManifest,
  hyperframesProducers,
} from "@svml/hyperframes";
import {
  decodeHyperframesRenderSurface,
  hyperframesRenderCapabilities,
  hyperframesRenderFragment,
  hyperframesRenderManifest,
  hyperframesRenderModuleRef,
  hyperframesRenderProducers,
  hyperframesRenderRequest,
  hyperframesRenderSurfaceImplementationDigest,
  hyperframesRenderTypes,
  projectHyperframesVideo,
  projectHyperframesVideoImplementationDigest,
  requestHyperframesRenderImplementationDigest,
  sealHyperframesRenderedVideo,
} from "@svml/hyperframes-render";
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
  hyperframesRenderManifest,
]);
const origin = {
  kind: "authored" as const,
  sourceDigest: digestOf("source:hyperframes-render-test"),
  frontendClosureDigest: digestOf("frontend:hyperframes-render-test"),
};
const compositionRecord = sealRecord({
  id: "composition",
  type: contractTypes.composition,
  value: stored(composition),
  conformance: "exact",
  origin,
});
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
  registry.registerProducer(hyperframesProducers.compile, compileHyperframesImplementationDigest, ({ inputs }) => ({
    outputs: { document: stored(compileHyperframesDocument(inline(inputs.composition) as typeof composition)) },
    needs: {},
  }));
  registry.registerProducer(
    hyperframesRenderProducers.request,
    requestHyperframesRenderImplementationDigest,
    ({ inputs }) => ({
      outputs: {},
      needs: { product: hyperframesRenderRequest(inline(inputs.document) as never) },
    }),
  );
  registry.registerProducer(
    hyperframesRenderProducers.projectVideo,
    projectHyperframesVideoImplementationDigest,
    ({ inputs }) => ({
      outputs: { video: stored(projectHyperframesVideo(inline(inputs.product) as never)) },
      needs: {},
    }),
  );
  return registry;
}

test("HyperFrames rendering is an explicit exact Need after ordinary document compilation", async () => {
  assert.deepEqual(build().plan.steps.map((step) => step.producer.name).sort(), [
    hyperframesProducers.compile.name,
    hyperframesRenderProducers.request.name,
    hyperframesRenderProducers.projectVideo.name,
  ].sort());

  const result = await new NodeDriver({ registry: producerRegistry() }).run(build());
  assert.equal(result.status, "paused");
  assert.equal(result.state.needs.length, 1);
  const need = result.state.needs[0]!;
  assert.equal(need.capability.name, hyperframesRenderCapabilities.render.name);
  assert.equal(need.returns.name, hyperframesRenderTypes.product.name);
  assert.equal(need.accepts, "exact");
  assert.deepEqual(need.constraints, hyperframesRenderRequest(compileHyperframesDocument(composition)));
  assert.equal(result.blocked[0]?.reason, "missing-provider");
});

test("a bound Provider fulfills the render Need without entering Film or HyperFrames compilation", async () => {
  const artifact = {
    digest: digestOf("hyperframes-render:final-video"),
    size: 12_345,
    mediaType: "video/mp4",
    durationSec: space.durationSec,
  };
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "example.hyperframes.local",
    hyperframesRenderCapabilities.render,
    hyperframesRenderTypes.product,
    ({ need }) => {
      const request = need.constraints as {
        readonly contract: string;
        readonly document: ReturnType<typeof compileHyperframesDocument>;
      };
      assert.equal(request.contract, "svml.hyperframes-render-request@2");
      return {
        value: stored(sealHyperframesRenderedVideo({
          contract: "svml.hyperframes-rendered-video@2",
          documentDigest: request.document.digest,
          programSpaceDigest: request.document.programSpaceDigest,
          frameRate: request.document.frameRate,
          frameCount: request.document.frameCount,
          canvas: request.document.canvas,
          artifact,
        })),
        conformance: "exact",
        delivery: "executed",
        metadata: { runtime: "fixture-local" },
      };
    },
  );
  providers.bind(hyperframesRenderCapabilities.render, "example.hyperframes.local");

  const result = await new NodeDriver({ registry: producerRegistry(), providers }).run(build());
  assert.equal(result.status, "complete");
  const video = result.state.records.find((record) =>
    record.type.module.name === contractTypes.mediaArtifact.module.name
    && record.type.name === contractTypes.mediaArtifact.name);
  assert.deepEqual(inline(video), artifact);
});

test("a render Product cannot claim another frame domain while keeping the requested document", async () => {
  const document = compileHyperframesDocument(composition);
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "example.hyperframes.wrong-domain",
    hyperframesRenderCapabilities.render,
    hyperframesRenderTypes.product,
    () => ({
      value: stored(sealHyperframesRenderedVideo({
        contract: "svml.hyperframes-rendered-video@2",
        documentDigest: document.digest,
        programSpaceDigest: document.programSpaceDigest,
        frameRate: document.frameRate,
        frameCount: document.frameCount + 1,
        canvas: document.canvas,
        artifact: {
          digest: digestOf("hyperframes-render:wrong-domain"),
          size: 1,
          mediaType: "video/mp4",
          durationSec: space.durationSec,
        },
      })),
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    }),
  );
  providers.bind(hyperframesRenderCapabilities.render, "example.hyperframes.wrong-domain");

  const result = await new NodeDriver({ registry: producerRegistry(), providers }).run(build());
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
    hyperframesRenderProducers.request.name,
    hyperframesRenderProducers.projectVideo.name,
  ].sort());
});
