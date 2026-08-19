import { compositionComponent, spatialComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { programSpaceDependency, programSpaceTypes, sealProgramSpace } from "@hypit/program-space";
import { compositionDependency, compositionTypes, sealAudioTrack, sealVisualTrack } from "@hypit/composition";
import type { Track } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { createResolvedClosure, sealBuildRequest, start } from "@hypit/core";
import {
  AuthorFrontendRegistry,
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@hypit/elaborator";
import type { AuthorSourceUnit } from "@hypit/elaborator";
import {
  decodeFilmSurface,
  filmManifest,
  filmMarkupSurfaces,
  filmModuleRef,
  filmProducers,
  filmTypes,
} from "@hypit/film";
import type { ModuleManifest } from "@hypit/protocol";
import { svsFrontend, svsManifest } from "@hypit/svs";
import {
  decodeCanvasSurface,
  spatialManifest,
  spatialMarkupSurfaces,
  spatialModuleRef,
} from "@hypit/spatial";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/validation";

const fixtureModule = { name: "example.film-fixture", version: "1" } as const;
const fixtureSurfaceDigest = fixtureDigest("example.film-fixture/inputs-surface@1");
const fixtureSurface = {
  name: "inputs", tag: "Inputs", mode: "structured",
  outputs: [programSpaceTypes.programSpace, compositionTypes.visualTrack, compositionTypes.audioTrack],
} as const;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [
    programSpaceDependency,
    compositionDependency,
  ],
  types: [],
  capabilities: [],
  producers: [],
};

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const visual = sealVisualTrack({
  visualIr: "hypit.visual-ir@1",
  id: "visual",
  presents: [],
});
const audio = sealAudioTrack({
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
  const frontend = id.endsWith(".svs") ? "@hypit/svs@1" : "@hypit/markup@1";
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

async function compileFilm(options: { readonly styles?: string } = {}) {
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "space", type: programSpaceTypes.programSpace, value: { kind: "inline", value: space }, range: element.range },
      { id: "visual", type: compositionTypes.visualTrack, value: { kind: "inline", value: visual }, range: element.range },
      { id: "audio", type: compositionTypes.audioTrack, value: { kind: "inline", value: audio }, range: element.range },
    ],
    components: [],
    fragments: [],
  }) });
  surfaces.registerStructured({
    module: filmModuleRef,
    declaration: filmMarkupSurfaces.find((item) => item.name === "film")!,
    handler: decodeFilmSurface,
  });
  surfaces.registerStructured({
    module: spatialModuleRef,
    declaration: spatialMarkupSurfaces.find((item) => item.name === "canvas")!,
    handler: decodeCanvasSurface,
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      if (request.from.startsWith("@hypit/film")) return filmModuleRef;
      if (request.from.startsWith("@hypit/spatial")) return spatialModuleRef;
      return fixtureModule;
    },
  }));
  frontends.register(svsFrontend);

  return await compileSourceClosure({
    entry: source("/project/main.svml", `<svml>
      <import as="fixture" from="example.film-fixture@1"/>
      <import as="film" from="@hypit/film@1"/>
      <import as="space" from="@hypit/spatial@1"/>
      <import as="studio" source="./studio.svs"/>
      <fixture:Inputs/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <film:Film id="main" canvas={vertical} space={space} appearance={studio.film.vertical}>
        <film:Track source={visual}/><film:Track source={audio}/>
      </film:Film>
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
  const program = compiled.program.records.find((record) => record.type.name === filmTypes.program.name);
  assert.deepEqual(program?.value.kind === "inline" ? program.value.value : undefined, {

    id: "main",
    clearColor: "#09090B",
  });
  const target = resolveCompiledSourceExport(compiled, "main.composition", compositionTypes.composition);
  assert.equal(target.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "" }],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    filmProducers.createTrackSet.name,
    filmProducers.appendAudioTrack.name,
    filmProducers.appendVisualTrack.name,
    filmProducers.compileComposition.name,
  ].sort());
});

test("Film rejects an invalid package-owned Recipe during check", async () => {
  await assert.rejects(
    compileFilm({ styles: `<sheet version="1">film.vertical { width: 1080; }</sheet>` }),
    /Film Recipe requires exactly/u,
  );
});
