import assert from "node:assert/strict";
import test from "node:test";
import {
  createResolvedClosure,
  sealBuildRequest,
  start,
} from "@hypit/core";
import {
  AuthorFrontendRegistry,
  SourceClosureError,
  compileSourceClosure,
  resolveCompiledSourceExport,
  sealGraphFragment,
} from "@hypit/elaborator";
import type { AuthorSourceUnit } from "@hypit/elaborator";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import {
  SvsSyntaxError,
  parseSvs,
  svsFrontend,
  svsManifest,
  svsRecipeType,
} from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@hypit/markup";
import type { StructuredElement } from "@hypit/markup";

const laboratory = { name: "example.recipe-card", version: "1" } as const;
const cardType = { module: laboratory, name: "Card" } satisfies TypeRef;
const cardAppearanceType = { module: laboratory, name: "CardAppearance" } satisfies TypeRef;
const renderProducer = { module: laboratory, name: "render-card" } satisfies ProducerRef;
const cardSurfaceDigest = "surface:example.recipe-card/card";
const cardSurface = {
  name: "card", tag: "Card", mode: "structured", outputs: [cardAppearanceType],
} as const;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [{ module: { name: svsManifest.name, version: svsManifest.version } }],
  types: [
    { name: cardType.name },
    {
      name: cardAppearanceType.name,
    },
  ],
  capabilities: [],
  producers: [{
    name: renderProducer.name,
    inputs: [{ name: "appearance", type: cardAppearanceType }],
    outputs: [{ name: "card", type: cardType }],
    needs: [],
  }],
};

const cardFragment = sealGraphFragment({
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
  registry.registerStructured({ module: laboratory, declaration: cardSurface, handler: ({ element, resolveReference }) => {
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
  } });
  return registry;
}

const closure = createResolvedClosure([svsManifest, manifest]);

function unit(id: string, text: string, frontend?: string): AuthorSourceUnit {
  const selected = frontend ?? (id.endsWith(".svs") ? "@hypit/svs@1" : "@hypit/markup@1");
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
  assert.equal(compiled.program.records.length, 2);
  const recipe = compiled.program.records.find((record) => record.type.name === svsRecipeType.name);
  const appearance = compiled.program.records.find((record) => record.type.name === cardAppearanceType.name);
  assert.deepEqual(recipe?.value, {
    kind: "inline",
    value: {

      path: "card.answer",
      properties: { fill: "#73FBD3", padding: "16 24" },
    },
  });
  assert.deepEqual(appearance?.value, {
    kind: "inline",
    value: {
      contract: "example.card-appearance@1",
      fill: "#73FBD3",
      padding: "16 24",
    },
  });
  const target = resolveCompiledSourceExport(compiled, "answer.result", cardType);
  assert.equal(target.ref.kind, "logical-output");
  const state = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: target.ref.kind === "logical-output" ? target.ref.id : "" }],
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

test("SVS exposes exact property and value spans without inventing editor metadata", () => {
  const source = `<sheet version="1">
  caption.primary {
    size : 58 ; /* preserve me */
    padding: 16 24;
  }
</sheet>`;
  const recipe = parseSvs("editable.svs", source).recipes[0]!;
  const size = recipe.properties.find((property) => property.name === "size")!;
  assert.equal(source.slice(size.range.start, size.range.end), "size : 58 ;");
  assert.equal(source.slice(size.valueRange.start, size.valueRange.end), "58");
  const padding = recipe.properties.find((property) => property.name === "padding")!;
  assert.equal(source.slice(padding.valueRange.start, padding.valueRange.end), "16 24");
});
