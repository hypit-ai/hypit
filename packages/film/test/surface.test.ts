import { compositionComponent, spatialComponent, videoContractManifests } from "../../test-support/video-domain.js";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { programSpaceDependency, programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { compositionDependency, compositionTypes, sealAudioTrack, sealVisualTrack } from "@narratage/composition";
import type { Track } from "@narratage/composition";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, digestOf, sealBuildRequest, start } from "@narratage/core";
import {
  AuthorFrontendRegistry,
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@narratage/elaborator";
import type { AuthorSourceUnit } from "@narratage/elaborator";
import {
  decodeFilmSurface,
  filmManifest,
  filmModuleRef,
  filmProducers,
  filmSurfaceImplementationDigest,
  filmTypes,
} from "@narratage/film";
import type { ModuleManifest } from "@narratage/protocol";
import { svsFrontend, svsManifest } from "@narratage/svs";
import {
  decodeCanvasSurface,
  spatialManifest,
  spatialModuleRef,
  spatialSurfaceDigests,
} from "@narratage/spatial";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@narratage/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@narratage/validation";

const fixtureModule = { name: "example.film-fixture", version: "1" } as const;
const fixtureSurfaceDigest = digestOf("example.film-fixture/inputs-surface@1");
const fixtureManifest: ModuleManifest = {
  format: "svml.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [
    programSpaceDependency,
    compositionDependency,
  ],
  types: [],
  capabilities: [],
  surfaces: [{
    name: "inputs",
    tag: "Inputs",
    mode: "structured",
    outputs: [programSpaceTypes.programSpace, compositionTypes.visualTrack, compositionTypes.audioTrack],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.film-fixture/inputs-surface",
      digest: fixtureSurfaceDigest,
    },
  }],
  producers: [],
};

const space = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const visual = sealVisualTrack({
  contract: "svml.visual-track@1",
  visualIr: "svml.visual-ir@1",
  id: "visual",
  presents: [],
});
const audio = sealAudioTrack({
  contract: "svml.audio-track@1",
  id: "audio",
  clips: [],
});

const closure = createResolvedClosure([
  ...videoContractManifests,
  svsManifest,
  fixtureManifest,
  filmManifest,
]);

function source(id: string, text: string): AuthorSourceUnit {
  const frontend = id.endsWith(".svs") ? "@narratage/svs@1" : "@narratage/markup@1";
  return {
    id,
    name: id.split("/").at(-1) ?? id,
    text: `<?svml using="${frontend}"?>\n${text}`,
  };
}

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
  registerTypeValidatorFacets(registry, spatialComponent.validators);
  return registry;
}

const validStyles = `<sheet version="1">
  film.vertical {
    background: #09090B;
  }
</sheet>`;

async function compileFilm(options: { readonly reverse?: boolean; readonly styles?: string } = {}) {
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured(fixtureModule, "inputs", fixtureSurfaceDigest, ({ element }) => ({
    records: [
      { id: "space", type: programSpaceTypes.programSpace, value: { kind: "inline", value: space }, range: element.range },
      { id: "visual", type: compositionTypes.visualTrack, value: { kind: "inline", value: visual }, range: element.range },
      { id: "audio", type: compositionTypes.audioTrack, value: { kind: "inline", value: audio }, range: element.range },
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
  surfaces.registerStructured(
    spatialModuleRef,
    "canvas",
    spatialSurfaceDigests.canvas,
    decodeCanvasSurface,
  );
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      if (request.from.startsWith("@narratage/film")) return filmModuleRef;
      if (request.from.startsWith("@narratage/spatial")) return spatialModuleRef;
      return fixtureModule;
    },
  }));
  frontends.register(svsFrontend);

  const tracks = options.reverse === true
    ? `<film:Track source={audio}/><film:Track source={visual}/>`
    : `<film:Track source={visual}/><film:Track source={audio}/>`;
  return await compileSourceClosure({
    entry: source("/project/main.svml", `<svml>
      <import as="fixture" from="example.film-fixture@1"/>
      <import as="film" from="@narratage/film@1"/>
      <import as="space" from="@narratage/spatial@1"/>
      <import as="studio" source="./studio.svs"/>
      <fixture:Inputs/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <film:Film id="main" canvas={vertical} space={space} appearance={studio.film.vertical}>${tracks}</film:Film>
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
    id: "main",
    clearColor: "#09090B",
  });
  const target = resolveCompiledSourceExport(compiled, "main.composition", compositionTypes.composition);
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
