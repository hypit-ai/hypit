import { blobManifest } from "@hypit/blob";
import { sealTimeline, timelineDependency, timelineManifest, timelineTypes } from "@hypit/timeline";
import { registerTypeRefinements } from "@hypit/refinement";
import {
  compositionComponent,
  compositionDependency,
  compositionManifest,
  compositionTypes,
  sealAudioTrack,
  sealVisualTrack,
} from "@hypit/composition";
import { mediaManifest } from "@hypit/media";
import type { Track } from "@hypit/composition";
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
} from "@hypit/kernel";
import {
  AuthorFrontendRegistry,
  resolveCompiledSourceExport,
} from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import type { ResolvedSource } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import {
  decodeFilmSurface,
  filmManifest,
  filmMarkupSurfaces,
  filmModuleRef,
  filmProducers,
  filmTypes,
} from "@hypit/film";
import type { ModuleManifest } from "@hypit/protocol";
import { recipeFrontend, recipeManifest, recipeType } from "@hypit/recipe";
import {
  decodeCanvasSurface,
  spatialComponent,
  spatialManifest,
  spatialMarkupSurfaces,
  spatialModuleRef,
  spatialTypes,
} from "@hypit/spatial";
import { temporalManifest } from "@hypit/temporal";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@hypit/markup";
import type { StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import { createRecordValidator, RefinementRegistry } from "@hypit/refinement";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets: targets.map((output) => ({ output })),
  });
  return materializeBuild(defineBuild({
    program: link(program.closure, [...program.records, ...planned.initialRecords]),
    plan: planned.plan,
  }), []);
}

const fixtureModule = { name: "example.film-fixture", version: "1" } as const;
const fixtureSurfaceDigest = fixtureResource("example.film-fixture/inputs-surface@1");
const fixtureSurface = {
  name: "inputs", tag: "Inputs", mode: "structured",
  outputs: [timelineTypes.timeline, compositionTypes.visualTrack, compositionTypes.audioTrack],
} as const;
const fixtureManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fixtureModule.name,
  version: fixtureModule.version,
  dependencies: [
    timelineDependency,
    compositionDependency,
  ],
  types: [],
  capabilities: [],
  producers: [],
};

const space = sealTimeline({ id: "test-space", frameCount: 60, frameRate: { numerator: 30, denominator: 1 },
});
const semantic = timelineFixture(space);
const visual = sealVisualTrack({ timelineId: "test-space",
  visualIr: "hypit.visual-ir@1",
  id: "visual",
  presents: [],
});
const audio = sealAudioTrack({ timelineId: "test-space",
  id: "audio",
  clips: [],
});

const closure = createResolvedClosure([
  blobManifest,
  timelineManifest,
  temporalManifest,
  mediaManifest,
  spatialManifest,
  compositionManifest,
  recipeManifest,
  fixtureManifest,
  filmManifest,
]);

function source(id: string, text: string): ResolvedSource {
  const frontend = id.endsWith(".svs") ? "@hypit/recipe@1" : "@hypit/markup@1";
  return resolveSelfDescribedTextSource({
    id,
    name: id.split("/").at(-1) ?? id,
    text: `<?svml using="${frontend}"?>\n${text}`,
  });
}

function validatorRegistry(): RefinementRegistry {
  const registry = new RefinementRegistry();
  registerTypeRefinements(registry, compositionComponent.refinements);
  registerTypeRefinements(registry, spatialComponent.refinements);
  return registry;
}

const validStyles = `<sheet version="1">
  film.vertical {
    background: #09090B;
  }
</sheet>`;

async function compileFilm(options: { readonly styles?: string; readonly tracks?: string } = {}) {
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "semantic", type: timelineTypes.timeline, value: (semantic), range: element.range },
      { id: "visual", type: compositionTypes.visualTrack, value: (visual), range: element.range },
      { id: "audio", type: compositionTypes.audioTrack, value: (audio), range: element.range },
    ],
    components: [],
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
  frontends.register(recipeFrontend);

  return await compileSourceClosure({
    entry: source("/project/main.svml", `<svml>
      <import as="fixture" from="example.film-fixture@1"/>
      <import as="film" from="@hypit/film@1"/>
      <import as="space" from="@hypit/spatial@1"/>
      <import as="recipes" source="./recipes.svs"/>
      <fixture:Inputs/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <film:Film id="main" canvas={vertical.canvas} timeline={semantic} appearance={recipes.film.vertical}>
        ${options.tracks ?? '<film:Track source={visual}/><film:Track source={audio}/>'}
      </film:Film>
    </svml>`),
    closure,
    frontends,
    resolveSource() {
      return source("/project/recipes.svs", options.styles ?? validStyles);
    },
    validateRecord: createRecordValidator(validatorRegistry()),
  });
}

test("the official Film Surface validates SVS and lowers dynamic peer Tracks", async () => {
  const compiled = await compileFilm();
  const program = compiled.program.records.find((record) => record.type.name === filmTypes.program.name);
  assert.ok(program);
  assert.deepEqual(program.value, {

    id: "main",
    clearColor: "#09090B",
  });
  const target = resolveCompiledSourceExport(compiled, "main.composition", compositionTypes.composition);
  assert.equal(target.ref.kind, "logical-output");
  const build = buildState(compiled.program, compiled.graph, [
    target.ref.kind === "logical-output" ? target.ref.id : "",
  ]);
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

test("Film rejects a repeated Track reference during check, before executing its inputs", async () => {
  for (const track of ["visual", "audio"]) {
    await assert.rejects(
      compileFilm({ tracks: `<film:Track source={${track}}/><film:Track source={${track}}/>` }),
      /cannot include the same Track more than once/u,
    );
  }
});

test("Film distinguishes component output ports and resolves duplicate aliases", async () => {
  const range = { source: "main.svml", start: 0, end: 1 };
  const refs = new Map<string, SurfaceResolvedReference>();
  for (const [path, type] of [["canvas", spatialTypes.canvas], ["timeline", timelineTypes.timeline]] as const) {
    refs.set(path, { path, type, ref: { kind: "record", id: path } });
  }
  refs.set("appearance", { path: "appearance", type: recipeType,
    ref: { kind: "record", id: "appearance" }, record: { id: "appearance", type: recipeType,
      value: ({ path: "film", properties: { background: "#000000" } }) } });
  for (const [path, component, output, type] of [
    ["board.visual", "board", "visual", compositionTypes.visualTrack],
    ["board.audio", "board", "audio", compositionTypes.audioTrack],
    ["other.visual", "other", "visual", compositionTypes.visualTrack],
    ["board-alias.visual", "board", "visual", compositionTypes.visualTrack],
  ] as const) {
    refs.set(path, { path, type, ref: { kind: "component-output", component, output } });
  }
  const decode = (paths: string[]) => {
    const element: StructuredElement = { kind: "element", name: "film:Film", range,
      attributes: { id: "main", canvas: { kind: "reference", path: "canvas" },
        timeline: { kind: "reference", path: "timeline" }, appearance: { kind: "reference", path: "appearance" } },
      children: paths.map(path => ({ kind: "element", name: "film:Track", range, children: [],
        attributes: { source: { kind: "reference", path } } })),
    };
    return decodeFilmSurface({ element, sourceName: "main.svml", resolveReference: path => refs.get(path),
      resolveAsset: () => { throw new Error("Film reads explicit references only"); } });
  };
  const compiled = await decode(["board.visual", "board.audio", "other.visual"]);
  assert.deepEqual(compiled.components[0]?.inputs["track-2"], refs.get("board.audio")!.ref);
  assert.throws(() => decode(["board.visual", "board-alias.visual"]), /cannot include the same Track more than once/u);
});
