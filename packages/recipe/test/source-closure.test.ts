import assert from "node:assert/strict";
import test from "node:test";
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  declarationField,
  resolveCompiledSourceExport,
  sealGraphFragment,
  type AuthorDeclarationCompiler,
} from "@hypit/author";
import { SourceClosureError, compileSourceClosure } from "@hypit/compiler";
import type { ResolvedSource } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import {
  formatRecipeValue,
  RecipeSyntaxError,
  parseRecipe,
  recipeFrontend,
  recipeManifest,
  recipeType,
} from "@hypit/recipe";
import type { Recipe } from "@hypit/recipe";
import {
  MarkupDeclarationRegistry,
  createMarkupDeclarationAuthorFrontend,
} from "@hypit/markup";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, targets, []);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}

const laboratory = { name: "example.recipe-card", version: "1" } as const;
const cardType = { module: laboratory, name: "Card" } satisfies TypeRef;
const cardAppearanceType = { module: laboratory, name: "CardAppearance" } satisfies TypeRef;
const renderProducer = { module: laboratory, name: "render-card" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [{ name: recipeManifest.name, version: recipeManifest.version }],
  types: [
    cardType.name,
    cardAppearanceType.name,
  ],
  capabilities: [],
  producers: [{
    name: renderProducer.name,
    inputs: [{ name: "appearance", type: cardAppearanceType }],
    result: { kind: "output" as const, name: "card", type: cardType },
  }],
};

const cardFragment = sealGraphFragment({
  inputs: [{ name: "appearance", type: cardAppearanceType }],
  operations: [{
    id: "render",
    producer: renderProducer,
    inputs: { appearance: { kind: "fragment-input", name: "appearance" } },
    result: { kind: "output" as const, name: "card" },
  }],
  exports: [{
    name: "result",
    type: cardType,
    root: { kind: "fragment-operation", operation: "render" },
  }],
});

function recipeValue(record: TypedRecord | undefined): Recipe {
  if (record?.type.module.name !== recipeType.module.name || record.type.name !== recipeType.name) {
    throw new Error("Card.appearance must reference an SVS Recipe");
  }
  if (record.value === null
    || Array.isArray(record.value) || typeof record.value !== "object") {
    throw new Error("Card.appearance Recipe must be an object");
  }
  return record.value as Recipe;
}

const cardDeclaration: AuthorDeclarationCompiler = {
  module: laboratory,
  declaration: "card",
  outputs: [cardAppearanceType, cardType],
  shape: {
    summary: "Renders one test Card from a Recipe.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Card." },
      { name: "appearance", kind: "reference", required: true, accepts: [recipeType], summary: "Selects its appearance Recipe." },
    ],
  },
  bindings(declaration) {
    const id = declarationField(declaration, "id");
    if (id?.kind !== "literal") throw new Error("Card.id must be a string");
    return [{ name: `${id.value}.result`, ref: { kind: "component-output", component: id.value, output: "result" }, type: cardType }];
  },
  async compile({ declaration, resolveReference }) {
    const idField = declarationField(declaration, "id");
    const appearance = declarationField(declaration, "appearance");
    if (idField?.kind !== "literal") throw new Error("Card.id must be a string");
    if (appearance?.kind !== "reference") throw new Error("Card.appearance must be a reference");
    const id = idField.value;
    const resolved = await resolveReference(appearance.path);
    if (resolved === undefined) throw new Error(`Card.appearance cannot resolve ${appearance.path}`);
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
        value: ({
            contract: "example.card-appearance@1",
            fill,
            padding,
          }),
        range: declaration.range,
      }],
      components: [{
        id,
        fragment: cardFragment,
        inputs: {
          appearance: { kind: "record", id: appearanceId },
        },
        outputs: { result: `${id}.result` },
        range: declaration.range,
      }],
    };
  },
};

function declarationFrontend() {
  const compilers = new AuthorDeclarationRegistry();
  compilers.register(cardDeclaration);
  const syntax = new MarkupDeclarationRegistry();
  syntax.register({ module: laboratory, declaration: "card", tag: "Card" });
  return createMarkupDeclarationAuthorFrontend({
    syntax,
    compilers,
    resolveModule: () => laboratory,
  });
}

const closure = createResolvedClosure([recipeManifest, manifest]);

function unit(id: string, text: string, frontend?: string): ResolvedSource {
  const selected = frontend ?? (id.endsWith(".svs") ? "@hypit/recipe@1" : "@hypit/markup@1");
  return resolveSelfDescribedTextSource({
    id,
    name: id.split("/").at(-1) ?? id,
    text: `<?svml using="${selected}"?>\n${text}`,
  });
}

const styleText = `<sheet version="1" id="studio">
  card.answer {
    fill: #73FBD3;
    padding: 16 24;
  }
</sheet>`;

async function compileMain(alias: string, root = "/project", styles = styleText) {
  const frontends = new AuthorFrontendRegistry();
  frontends.register(declarationFrontend());
  frontends.register(recipeFrontend);
  const entry = unit(`${root}/main.svml`, `<svml>
    <import as="lab" from="example.recipe-card@1"/>
    <import as="${alias}" source="./recipes.svs"/>
    <lab:Card id="answer" appearance={${alias}.card.answer}/>
  </svml>`);
  return await compileSourceClosure({
    entry,
    closure,
    frontends,
    async resolveSource(_importer, request) {
      if (request.from !== "./recipes.svs") throw new Error(`unknown source ${request.from}`);
      return await Promise.resolve(unit(`${root}/recipes.svs`, styles));
    },
  });
}

test("Text and SVS recursively compile one aliased Recipe into a Core BuildPlan", async () => {
  const compiled = await compileMain("studio");
  assert.equal(compiled.closure.units.length, 2);
  assert.equal(compiled.program.records.length, 2);
  const recipe = compiled.program.records.find((record) => record.type.name === recipeType.name);
  const appearance = compiled.program.records.find((record) => record.type.name === cardAppearanceType.name);
  assert.deepEqual(recipe?.value, ({

      path: "card.answer",
      properties: { fill: "#73FBD3", padding: "16 24" },
    }));
  assert.deepEqual(appearance?.value, ({
      contract: "example.card-appearance@1",
      fill: "#73FBD3",
      padding: "16 24",
    }));
  const target = resolveCompiledSourceExport(compiled, "answer.result", cardType);
  assert.equal(target.ref.kind, "logical-output");
  const state = buildState(compiled.program, compiled.graph, [
    target.ref.kind === "logical-output" ? target.ref.id : "",
  ]);
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
  frontends.register(declarationFrontend());
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
  frontends.register(declarationFrontend());
  const duplicate = unit("/project/duplicate.svml", `<svml>
    <import as="styles" source="./one.svs"/>
    <import as="styles" source="./two.svs"/>
  </svml>`);
  frontends.register(recipeFrontend);
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
        return unit("/project/recipes.svs", styleText);
      },
    }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "UNKNOWN_FRONTEND",
  );
});

test("SVS rejects duplicate public recipes", () => {
  assert.throws(
    () => parseRecipe("duplicate.svs", `<sheet version="1"><x.y>{}</x.y></sheet>`),
    (error: unknown) => error instanceof RecipeSyntaxError,
  );
  assert.throws(
    () => parseRecipe("duplicate.svs", `<sheet version="1">x.y {} x.y {}</sheet>`),
    (error: unknown) => error instanceof RecipeSyntaxError && error.code === "SVS_RULE_DUPLICATE",
  );
});

test("quoted Recipe values may contain Prompt punctuation without changing SVS structure", () => {
  const sheet = parseRecipe(
    "prompt.svs",
    '<sheet version="1">demo.prompt { text: "first; second } /* literal */"; }</sheet>',
  );
  assert.equal(sheet.recipes[0]?.value.properties.text, "first; second } /* literal */");
});

test("Recipe strings decode the quote syntax used by their structure scanner", () => {
  const sheet = parseRecipe(
    "escape.svs",
    `<sheet version="1">
  demo.value {
    quoted: "He said \\"hi\\" twice";
    control: "line\\nbreak\\there";
    single: 'It\\'s C:\\\\caps';
  }
</sheet>`,
  );
  const properties = sheet.recipes[0]?.value.properties;
  assert.equal(properties?.quoted, 'He said "hi" twice');
  assert.equal(properties?.control, "line\nbreak\there");
  assert.equal(properties?.single, "It's C:\\caps");
  assert.throws(
    () => parseRecipe("joined.svs", '<sheet version="1">demo.value { value: "one" "two"; }</sheet>'),
    (error: unknown) => error instanceof RecipeSyntaxError && error.code === "SVS_VALUE_STRING",
  );
});

test("quoted Recipe values may contain the sheet closing text without ending the document", () => {
  const sheet = parseRecipe(
    "literal-close.svs",
    '<sheet version="1">demo.prompt { text: "write </sheet> literally"; }</sheet>',
  );
  assert.equal(sheet.recipes[0]?.value.properties.text, "write </sheet> literally");
  assert.throws(
    () => parseRecipe(
      "missing-close.svs",
      '<sheet version="1">demo.prompt { text: "write </sheet> literally"; }',
    ),
    (error: unknown) => error instanceof RecipeSyntaxError && error.code === "SVS_ROOT_UNCLOSED",
  );
  assert.throws(
    () => parseRecipe(
      "trailing.svs",
      '<sheet version="1">demo.prompt { text: "write </sheet> literally"; }</sheet> trailing',
    ),
    (error: unknown) => error instanceof RecipeSyntaxError && error.code === "SVS_TRAILING",
  );
  assert.throws(
    () => parseRecipe(
      "second-close.svs",
      '<sheet version="1">demo.prompt { text: "write </sheet> literally"; }</sheet></sheet>',
    ),
    (error: unknown) => error instanceof RecipeSyntaxError && error.code === "SVS_TRAILING",
  );
});

test("SVS parses and serializes canonical arrays and objects as one Recipe value", () => {
  const source = `<sheet version="1">
  ranking.column {
    colors: ["#FF3F56", "#FFA72D"];
    rows: [{"id":"s","label":"S","color":"#EF4444"}];
  }
</sheet>`;
  const recipe = parseRecipe("structured.svs", source).recipes[0]!;
  assert.deepEqual(recipe.value.properties.colors, ["#FF3F56", "#FFA72D"]);
  assert.deepEqual(recipe.value.properties.rows, [{ id: "s", label: "S", color: "#EF4444" }]);
  assert.equal(formatRecipeValue(recipe.value.properties.colors!), '["#FF3F56","#FFA72D"]');
});

test("formatted Recipe values parse back to the same canonical value", () => {
  const values = [
    "plain-value",
    "two words",
    "assets/*.png",
    "</sheet>",
    'He said "hi"',
    "line\nbreak",
    "tab\there",
    "C:\\caps",
    "null",
    "12",
  ] as const;
  for (const value of values) {
    const source = `<sheet version="1">demo.value { value: ${formatRecipeValue(value)}; }</sheet>`;
    assert.equal(parseRecipe("format.svs", source).recipes[0]?.value.properties.value, value, JSON.stringify(value));
  }
  assert.equal(formatRecipeValue("plain-value"), "plain-value");
});

test("SVS exposes exact property and value spans without inventing editor metadata", () => {
  const source = `<sheet version="1">
  caption.primary {
    size : 58 ; /* preserve me */
    padding: 16 24;
  }
</sheet>`;
  const recipe = parseRecipe("editable.svs", source).recipes[0]!;
  const size = recipe.properties.find((property) => property.name === "size")!;
  assert.equal(source.slice(size.range.start, size.range.end), "size : 58 ;");
  assert.equal(source.slice(size.valueRange.start, size.valueRange.end), "58");
  const padding = recipe.properties.find((property) => property.name === "padding")!;
  assert.equal(source.slice(padding.valueRange.start, padding.valueRange.end), "16 24");
});
