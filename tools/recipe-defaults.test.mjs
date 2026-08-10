import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultFilmRecipe,
  filmAppearanceFromRecipe,
  filmRecipeKeys,
} from "../packages/film/src/index.ts";

/**
 * A module's default Recipe has to be a Recipe its own Surface would admit.
 *
 * The default and the required key set used to be stated twice — once as a
 * literal in the Surface handler and once wherever a consumer needed one — and
 * a copy that can drift silently is worse than no copy. Now the default is the
 * declaration and the key set is read off it, so the only thing left to check
 * is that the default actually survives the mapping it describes.
 */
const MODULES = [
  { name: "film", keys: filmRecipeKeys, recipe: defaultFilmRecipe, read: filmAppearanceFromRecipe },
];

for (const module of MODULES) {
  test(`the ${module.name} default Recipe is one its own reader admits`, () => {
    assert.deepEqual([...module.keys].sort(), Object.keys(module.recipe).sort(),
      "the key set must be read off the default, not restated");
    assert.doesNotThrow(() => module.read(module.recipe));
  });

  test(`the ${module.name} reader refuses a Recipe with the wrong shape`, () => {
    const { [module.keys[0]]: _dropped, ...missing } = module.recipe;
    assert.throws(() => module.read(missing), /requires exactly/u);
    assert.throws(() => module.read({ ...module.recipe, unexpected: 1 }), /requires exactly/u);
  });
}
