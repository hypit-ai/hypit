import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { fineCaptionRecipeSchema } from "@narratage/caption-fine";
import type { ValueSchema } from "@narratage/protocol";
import { maskSourceHeader, parseSourceHeader } from "@narratage/source";
import type { SvsRecipe } from "@narratage/svs";
import { parseSvs } from "@narratage/svs";

/**
 * Which Recipe in a stylesheet a component could have been written with.
 *
 * The playground picks the component; the stylesheet only supplies values. So
 * the question is not who owns a Recipe but whether one fits, and the published
 * schema answers it alone — every required property present, and none written
 * that the schema does not know. This is that rule, tested against a real
 * project sheet rather than a fixture, because the case worth catching is a
 * planner Recipe that shares a prefix with a styling one.
 */

function fits(schema: ValueSchema, recipe: SvsRecipe): boolean {
  const fields = (schema as { fields?: Record<string, { optional?: true }> }).fields ?? {};
  const known = new Set(Object.keys(fields));
  const required = Object.entries(fields)
    .filter(([, field]) => field.optional !== true)
    .map(([name]) => name);
  const written = Object.keys(recipe.properties);
  return required.every((name) => written.includes(name))
    && written.every((name) => known.has(name));
}

function golden(): readonly SvsRecipe[] {
  const path = fileURLToPath(new URL("../examples/talking-film-golden/studio.svs", import.meta.url));
  const source = readFileSync(path, "utf8");
  const header = parseSourceHeader("studio.svs", source);
  return parseSvs("studio.svs", maskSourceHeader(source, header)).recipes.map((entry) => entry.value);
}

test("a real project sheet yields exactly the Recipes this component is styled by", () => {
  const fitting = golden().filter((recipe) => fits(fineCaptionRecipeSchema, recipe));
  assert.deepEqual(fitting.map((recipe) => recipe.path).sort(),
    ["caption.alice", "caption.bob", "caption.dialogue"]);
});

test("a Recipe sharing the prefix but not the shape does not fit", () => {
  // `caption.short-cues` plans Cues for a model. Same prefix, different thing —
  // and nothing here matches on prefixes, so the shape is what separates them.
  const shortCues = golden().find((recipe) => recipe.path.endsWith("short-cues"));
  assert.notEqual(shortCues, undefined, "the golden sheet no longer holds the planner Recipe");
  assert.equal(fits(fineCaptionRecipeSchema, shortCues!), false);
});

test("Recipes belonging to other components do not fit", () => {
  const foreign = golden().filter((recipe) => !recipe.path.startsWith("caption."));
  assert.ok(foreign.length > 0, "the golden sheet styles nothing but captions");
  for (const recipe of foreign) {
    assert.equal(fits(fineCaptionRecipeSchema, recipe), false, `${recipe.path} should not fit`);
  }
});

test("an unknown property keeps a Recipe from fitting", () => {
  // Silently ignoring one would hand the decoder something it rejects, and the
  // failure would surface far from the sheet that caused it.
  const dialogue = golden().find((recipe) => recipe.path.endsWith("dialogue"))!;
  const stray = {
    ...dialogue,
    properties: { ...dialogue.properties, "not-a-caption-property": 1 },
  };
  assert.equal(fits(fineCaptionRecipeSchema, stray as SvsRecipe), false);
});

test("a missing required property keeps a Recipe from fitting", () => {
  const dialogue = golden().find((recipe) => recipe.path.endsWith("dialogue"))!;
  const { size: _dropped, ...rest } = dialogue.properties as Record<string, unknown>;
  assert.equal(fits(fineCaptionRecipeSchema, { ...dialogue, properties: rest } as SvsRecipe), false);
});
