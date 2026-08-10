import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computeModuleDigest,
  createResolvedClosure,
  digestOf,
  sealBuildRequest,
  start,
} from "@narratage/core";
import {
  AuthorFrontendRegistry,
  SourceClosureError,
  compileSourceClosure,
  resolveCompiledSourceExport,
  sealGraphFragment,
  verifySourceClosure,
} from "@narratage/elaborator";
import type { AuthorSourceUnit } from "@narratage/elaborator";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";
import { maskSourceHeader, parseSourceHeader } from "@narratage/source";
import {
  SvsSyntaxError,
  parseSvs,
  svsFrontend,
  svsManifest,
  svsRecipeType,
} from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@narratage/markup";
import type { StructuredElement } from "@narratage/markup";

const laboratory = { name: "example.recipe-card", version: "1" } as const;
const cardType = { module: laboratory, name: "Card" } satisfies TypeRef;
const cardAppearanceType = { module: laboratory, name: "CardAppearance" } satisfies TypeRef;
const renderProducer = { module: laboratory, name: "render-card" } satisfies ProducerRef;
const cardSurfaceDigest = digestOf("example.recipe-card/card-surface@1");

const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [{ module: { name: svsManifest.name, version: svsManifest.version }, digest: computeModuleDigest(svsManifest) }],
  types: [
    { name: cardType.name, schema: { kind: "string", minLength: 1 } },
    {
      name: cardAppearanceType.name,
      schema: {
        kind: "object",
        fields: {
          contract: { schema: { kind: "literal", value: "example.card-appearance@1" } },
          sourceRecipeDigest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
          fill: { schema: { kind: "string", minLength: 1 } },
          padding: { schema: { kind: "string", minLength: 1 } },
        },
      },
    },
  ],
  capabilities: [],
  surfaces: [{
    name: "card",
    tag: "Card",
    mode: "structured",
    outputs: [cardAppearanceType],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.recipe-card/card-surface",
      digest: cardSurfaceDigest,
    },
  }],
  producers: [{
    name: renderProducer.name,
    inputs: [{ name: "appearance", type: cardAppearanceType }],
    outputs: [{ name: "card", type: cardType }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.recipe-card/render-card",
      digest: digestOf("example.recipe-card/render-card@1"),
    },
  }],
};

const cardFragment = sealGraphFragment({
  name: "example.recipe-card/card@1",
  inputs: [{ name: "appearance", type: cardAppearanceType }],
  operations: [{
    id: "render",
    producer: renderProducer,
    inputs: { appearance: { kind: "fragment-input", name: "appearance" } },
    result: { kind: "output", name: "card" },
  }],
  exports: [{
    name: "result",
    type: cardType,
    root: { kind: "fragment-operation", operation: "render" },
    semanticInputs: ["appearance"],
    fidelity: "exact",
  }],
});

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${element.name}.${name} must be a string`);
  return value;
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a reference`);
  }
  return value.path;
}

function recipeValue(record: TypedRecord | undefined): SvsRecipe {
  if (record?.type.module.name !== svsRecipeType.module.name || record.type.name !== svsRecipeType.name) {
    throw new Error("Card.appearance must reference an SVS Recipe");
  }
  if (record.value.kind !== "inline" || record.value.value === null
    || Array.isArray(record.value.value) || typeof record.value.value !== "object") {
    throw new Error("Card.appearance Recipe must be inline");
  }
  return record.value.value as SvsRecipe;
}

function sourceRegistry(): MarkupSurfaceRegistry {
  const registry = new MarkupSurfaceRegistry();
  registry.registerStructured(laboratory, "card", cardSurfaceDigest, ({ element, resolveReference }) => {
    const id = stringAttribute(element, "id");
    const appearancePath = referenceAttribute(element, "appearance");
    const resolved = resolveReference(appearancePath);
    if (resolved === undefined) throw new Error(`Card.appearance cannot resolve ${appearancePath}`);
    const recipe = recipeValue(resolved.record);
    const keys = Object.keys(recipe.properties).sort();
    if (keys.join(",") !== "fill,padding") throw new Error("Card Recipe must contain exactly fill and padding");
    const fill = recipe.properties.fill;
    const padding = recipe.properties.padding;
    if (typeof fill !== "string" || !/^#[0-9A-F]{6}$/iu.test(fill)) {
      throw new Error("Card Recipe fill must be a six-digit hex color");
    }
    if (typeof padding !== "string" || padding.length === 0) {
      throw new Error("Card Recipe padding must be non-empty");
    }
    const appearanceId = `${id}.appearance`;
    return {
      records: [{
        id: appearanceId,
        type: cardAppearanceType,
        value: {
          kind: "inline",
          value: {
            contract: "example.card-appearance@1",
            sourceRecipeDigest: resolved.record?.digest ?? "",
            fill,
            padding,
          },
        },
        range: element.range,
      }],
      components: [{
        id,
        fragment: cardFragment.id,
        inputs: {
          appearance: { kind: "record", id: appearanceId },
        },
        outputs: { result: `${id}.result` },
        range: element.range,
      }],
      fragments: [cardFragment],
    };
  });
  return registry;
}

const closure = createResolvedClosure([svsManifest, manifest]);

function unit(id: string, text: string, frontend?: string): AuthorSourceUnit {
  const selected = frontend ?? (id.endsWith(".svs") ? "@narratage/svs@1" : "@narratage/markup@1");
  return {
    id,
    name: id.split("/").at(-1) ?? id,
    text: `<?svml using="${selected}"?>\n${text}`,
  };
}

const styleText = `<sheet version="1" id="studio">
  card.answer {
    fill: #73FBD3;
    padding: 16 24;
  }
</sheet>`;

async function compileMain(alias: string, root = "/project", styles = styleText) {
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: sourceRegistry(),
    resolveModule: () => laboratory,
  }));
  frontends.register(svsFrontend);
  const entry = unit(`${root}/main.svml`, `<svml>
    <import as="lab" from="example.recipe-card@1"/>
    <import as="${alias}" source="./studio.svs"/>
    <lab:Card id="answer" appearance={${alias}.card.answer}/>
  </svml>`);
  return await compileSourceClosure({
    entry,
    closure,
    frontends,
    async resolveSource(_importer, request) {
      if (request.from !== "./studio.svs") throw new Error(`unknown source ${request.from}`);
      return await Promise.resolve(unit(`${root}/studio.svs`, styles));
    },
  });
}

test("Text and SVS recursively compile one aliased Recipe into a Core BuildPlan", async () => {
  const compiled = await compileMain("studio");
  assert.equal(compiled.closure.units.length, 2);
  assert.equal(compiled.module.records.length, 2);
  const recipe = compiled.module.records.find((record) => record.type.name === svsRecipeType.name);
  const appearance = compiled.module.records.find((record) => record.type.name === cardAppearanceType.name);
  assert.deepEqual(recipe?.value, {
    kind: "inline",
    value: {
      contract: "svml.svs-recipe@1",
      path: "card.answer",
      properties: { fill: "#73FBD3", padding: "16 24" },
    },
  });
  assert.deepEqual(appearance?.value, {
    kind: "inline",
    value: {
      contract: "example.card-appearance@1",
      sourceRecipeDigest: recipe?.digest,
      fill: "#73FBD3",
      padding: "16 24",
    },
  });
  const target = resolveCompiledSourceExport(compiled, "answer.result", cardType);
  assert.equal(target.ref.kind, "logical-output");
  const state = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "", accepts: "exact" }],
    satisfactions: [],
  }));
  assert.equal(state.plan.steps.length, 1);
  assert.equal(state.plan.steps[0]?.producer.name, renderProducer.name);
  assert.equal(state.plan.steps[0]?.inputs.appearance, appearance?.id);
});

test("the consuming package rejects an invalid generic Recipe during author compilation", async () => {
  await assert.rejects(
    compileMain("studio", "/project", `<sheet version="1">
      card.answer {
        fill: definitely-not-a-color;
        padding: 16 24;
      }
    </sheet>`),
    /Card Recipe fill must be a six-digit hex color/u,
  );
});

test("source import alias changes source identity but not Recipe or Graph semantics", async () => {
  const studio = await compileMain("studio");
  const brand = await compileMain("brand");
  assert.notEqual(studio.closure.id, brand.closure.id);
  const studioAppearance = studio.module.records.find((record) => record.type.name === cardAppearanceType.name);
  const brandAppearance = brand.module.records.find((record) => record.type.name === cardAppearanceType.name);
  assert.equal(studioAppearance?.id, brandAppearance?.id);
  assert.equal(studioAppearance?.digest, brandAppearance?.digest);
  assert.equal(studio.elaboration.graph.id, brand.elaboration.graph.id);
});

test("relocating the same source tree preserves Source Closure and Graph identity", async () => {
  const original = await compileMain("studio", "/project");
  const relocated = await compileMain("studio", "/copy/project");
  assert.equal(original.closure.id, relocated.closure.id);
  assert.equal(original.module.semanticDigest, relocated.module.semanticDigest);
  assert.equal(original.elaboration.graph.id, relocated.elaboration.graph.id);
});

test("Frontend identity changes Source Closure identity but not equal decoded author meaning", async () => {
  const alternate = {
    ...svsFrontend,
    id: "example.svs-compatible@1",
    implementationDigest: digestOf("example.svs-compatible/implementation@1"),
  };
  const compileWith = async (frontend: typeof svsFrontend | typeof alternate) => {
    const frontends = new AuthorFrontendRegistry();
    frontends.register(frontend);
    return await compileSourceClosure({
      entry: unit("/project/studio.any", styleText, frontend.id),
      closure,
      frontends,
      resolveSource() { throw new Error("not used"); },
    });
  };
  const official = await compileWith(svsFrontend);
  const compatible = await compileWith(alternate);
  assert.notEqual(official.closure.id, compatible.closure.id);
  assert.notEqual(official.closure.units[0]?.frontendDigest, compatible.closure.units[0]?.frontendDigest);
  assert.equal(official.closure.units[0]?.semanticDigest, compatible.closure.units[0]?.semanticDigest);
  assert.equal(official.module.semanticDigest, compatible.module.semanticDigest);
  assert.equal(official.elaboration.graph.id, compatible.elaboration.graph.id);
});

test("Source Closure binds every recursive SourceUnit digest", async () => {
  const compiled = await compileMain("studio");
  const first = compiled.closure.units[0]!;
  const tampered = {
    ...compiled.closure,
    units: [{ ...first, sourceDigest: digestOf("tampered source") }, ...compiled.closure.units.slice(1)],
  };
  assert.throws(
    () => verifySourceClosure(tampered),
    (error: unknown) => error instanceof SourceClosureError
      && error.code === "SOURCE_UNIT_DIGEST_MISMATCH",
  );
});

test("Source Closure rejects recursive source import cycles", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: new MarkupSurfaceRegistry(),
    resolveModule: () => laboratory,
  }));
  const a = unit("/project/a.svml", `<svml><import as="b" source="./b.svml"/></svml>`);
  const b = unit("/project/b.svml", `<svml><import as="a" source="./a.svml"/></svml>`);
  await assert.rejects(
    compileSourceClosure({
      entry: a,
      closure,
      frontends,
      resolveSource(_importer, request) {
        return request.from === "./a.svml" ? a : b;
      },
    }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_IMPORT_CYCLE",
  );
});

test("Source Closure rejects duplicate aliases and unknown Frontends before decode", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: new MarkupSurfaceRegistry(),
    resolveModule: () => laboratory,
  }));
  const duplicate = unit("/project/duplicate.svml", `<svml>
    <import as="styles" source="./one.svs"/>
    <import as="styles" source="./two.svs"/>
  </svml>`);
  frontends.register(svsFrontend);
  await assert.rejects(
    compileSourceClosure({
      entry: duplicate,
      closure,
      frontends,
      resolveSource(_importer, request) {
        return unit(`/project/${request.from.slice(2)}`, styleText);
      },
    }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "DUPLICATE_SOURCE_ALIAS",
  );

  const unknown = unit("/project/unknown.svml", `<svml/>`, "example.unknown@1");
  await assert.rejects(
    compileSourceClosure({
      entry: unknown,
      closure,
      frontends,
      resolveSource() {
        return unit("/project/studio.svs", styleText);
      },
    }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "UNKNOWN_FRONTEND",
  );
});

test("the golden studio.svs parses as generic Recipes without video knowledge", () => {
  const source = readFileSync(new URL("../../../examples/talking-film-golden/studio.svs", import.meta.url), "utf8");
  const parsed = parseSvs("studio.svs", maskSourceHeader(source, parseSourceHeader("studio.svs", source)));
  assert.equal(parsed.recipes.length, 11);
  assert.equal(parsed.recipes.find((recipe) => recipe.value.path === "caption.short-cues")?.value.properties.model, "gemini-2.5-flash");
  assert.equal(parsed.recipes.find((recipe) => recipe.value.path === "film.vertical")?.value.properties.background, "#09090B");
});

test("SVS rejects duplicate public recipes", () => {
  assert.throws(
    () => parseSvs("duplicate.svs", `<sheet version="1"><x.y>{}</x.y></sheet>`),
    (error: unknown) => error instanceof SvsSyntaxError,
  );
  assert.throws(
    () => parseSvs("duplicate.svs", `<sheet version="1">x.y {} x.y {}</sheet>`),
    (error: unknown) => error instanceof SvsSyntaxError && error.code === "SVS_RULE_DUPLICATE",
  );
});

test("quoted Recipe values may contain Prompt punctuation without changing SVS structure", () => {
  const sheet = parseSvs(
    "prompt.svs",
    '<sheet version="1">demo.prompt { text: "first; second } /* literal */"; }</sheet>',
  );
  assert.equal(sheet.recipes[0]?.value.properties.text, "first; second } /* literal */");
});
