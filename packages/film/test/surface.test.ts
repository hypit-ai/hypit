import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@svml/component-kit";
import {
  compositionContractsComponent,
  contractTypes,
  sealAudioTrack,
  sealProgramSpace,
  sealVisualTrack,
  videoContractDependencies,
  videoContractManifests,
} from "@svml/contracts";
import { createResolvedClosure, digestOf, sealBuildRequest, start } from "@svml/core";
import {
  AuthorFrontendRegistry,
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type { AuthorSourceUnit } from "@svml/elaborator";
import {
  decodeFilmSurface,
  filmManifest,
  filmModuleRef,
  filmProducers,
  filmSurfaceImplementationDigest,
  filmTypes,
} from "@svml/film";
import type { ModuleManifest } from "@svml/protocol";
import { svsFrontend, svsManifest } from "@svml/svs";
import {
  TextSurfaceRegistry,
  createTextAuthorFrontend,
} from "@svml/text";
import { createRecordAdmitter, TypeValidatorRegistry } from "@svml/validation";

const fixtureModule = { name: "example.film-fixture", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.film-fixture/inputs-surface@1");
const fixtureManifest: ModuleManifest = {
  format: "svml.module@0",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
  ],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "inputs",
    tag: "Inputs",
    mode: "structured",
    outputs: [contractTypes.programSpace, contractTypes.visualTrack, contractTypes.audioTrack],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.film-fixture/inputs-surface",
      digest: fixtureSurfaceDigest,
    },
  }],
  producers: [],
};

const space = sealProgramSpace({
  contract: "svml.program-space@0",
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const visual = sealVisualTrack({
  contract: "svml.visual-track@1",
  visualIr: "svml.hyperframes-visual-ir@1",
  id: "visual",
  programSpaceDigest: space.digest,
  presents: [],
});
const audio = sealAudioTrack({
  contract: "svml.audio-track@1",
  id: "audio",
  programSpaceDigest: space.digest,
  clips: [],
});

const closure = createResolvedClosure([
  ...videoContractManifests,
  svsManifest,
  fixtureManifest,
  filmManifest,
]);

function source(id: string, text: string): AuthorSourceUnit {
  const frontend = id.endsWith(".svs") ? "@svml/svs@1" : "@svml/text@1";
  return {
    id,
    name: id.split("/").at(-1) ?? id,
    text: `<?svml using="${frontend}"?>\n${text}`,
  };
}

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionContractsComponent.validators);
  return registry;
}

const validStyles = `<sheet version="1">
  film.vertical {
    width: 1080;
    height: 1920;
    frame-rate: 30;
    background: #09090B;
  }
</sheet>`;

async function compileFilm(options: { readonly reverse?: boolean; readonly styles?: string } = {}) {
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerStructured(fixtureModule, "inputs", fixtureSurfaceDigest, ({ element }) => ({
    records: [
      { id: "space", type: contractTypes.programSpace, value: { kind: "inline", value: space }, range: element.range },
      { id: "visual", type: contractTypes.visualTrack, value: { kind: "inline", value: visual }, range: element.range },
      { id: "audio", type: contractTypes.audioTrack, value: { kind: "inline", value: audio }, range: element.range },
    ],
    components: [],
    fragments: [],
  }));
  surfaces.registerStructured(
    filmModuleRef,
    "film",
    filmSurfaceImplementationDigest,
    decodeFilmSurface,
  );
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      return request.from.startsWith("@svml/film") ? filmModuleRef : fixtureModule;
    },
  }));
  frontends.register(svsFrontend);

  const tracks = options.reverse === true
    ? `<film:Track source={audio}/><film:Track source={visual}/>`
    : `<film:Track source={visual}/><film:Track source={audio}/>`;
  return await compileSourceClosure({
    entry: source("/project/main.svml", `<svml>
      <import as="fixture" from="example.film-fixture@1"/>
      <import as="film" from="@svml/film@1"/>
      <import as="studio" source="./studio.svs"/>
      <fixture:Inputs/>
      <film:Film id="main" space={space} appearance={studio.film.vertical}>${tracks}</film:Film>
    </svml>`),
    closure,
    frontends,
    resolveSource() {
      return source("/project/studio.svs", options.styles ?? validStyles);
    },
    admitRecord: createRecordAdmitter(validatorRegistry()),
  });
}

test("the official Film Surface validates SVS and lowers dynamic peer Tracks", async () => {
  const compiled = await compileFilm();
  const program = compiled.module.records.find((record) => record.type.name === filmTypes.program.name);
  assert.deepEqual(program?.value.kind === "inline" ? program.value.value : undefined, {
    contract: "svml.film-program@1",
    digest: program?.value.kind === "inline"
      ? (program.value.value as { readonly digest: string }).digest
      : undefined,
    id: "main",
    frameRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1080, height: 1920, clearColor: "#09090B" },
  });
  const target = resolveCompiledSourceExport(compiled, "main.composition", contractTypes.composition);
  assert.equal(target.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "", accepts: "exact" }],
    satisfactions: [],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    filmProducers.createTrackSet.name,
    filmProducers.appendAudioTrack.name,
    filmProducers.appendVisualTrack.name,
    filmProducers.compileComposition.name,
  ].sort());
});

test("Film child order remains organizational, not graph meaning", async () => {
  const normal = await compileFilm();
  const reversed = await compileFilm({ reverse: true });
  assert.equal(normal.elaboration.graph.id, reversed.elaboration.graph.id);
});

test("Film rejects an invalid package-owned Recipe during check", async () => {
  await assert.rejects(
    compileFilm({ styles: `<sheet version="1">film.vertical { width: 1080; }</sheet>` }),
    /Film Recipe requires exactly/u,
  );
});
