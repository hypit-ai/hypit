import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { REGISTRY } from "./playground/src/registry/index.ts";

/**
 * The playground copies each component's SVS Recipe key set, because the
 * compiler states it only as a literal inside its Surface handler and there is
 * no shared declaration to import yet.
 *
 * A copy that can drift silently is worse than no copy: the playground would
 * quietly stop matching a Recipe it still claims to preview. This reads the
 * literal back out of the Surface source and pins the two together, so adding a
 * property to a Recipe breaks the build until the playground follows.
 *
 * Delete this once the key sets move into the packages' manifests and the
 * playground can import them.
 */

const SURFACES = {
  caption: "../packages/caption/src/surface.ts",
  "text-track": "../packages/text-track/src/surface.ts",
  broll: "../packages/broll/src/surface.ts",
};

/** Pulls the `expected` array literal a Surface compares Recipe keys against. */
function declaredKeys(source) {
  const found = /const expected = \[([^\]]*)\]/u.exec(source);
  assert.notEqual(found, null, "the Surface must declare an expected Recipe key list");
  return [...found[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]).sort();
}

for (const [id, relative] of Object.entries(SURFACES)) {
  test(`the ${id} Recipe key set matches its Surface`, () => {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    const component = REGISTRY.find((entry) => entry.id === id);
    assert.notEqual(component, undefined, `the registry must carry ${id}`);
    assert.deepEqual(
      [...component.recipeKeys].sort(),
      declaredKeys(source),
      `${id} drifted from ${relative}; update tools/playground/src/registry/${id}.ts`,
    );
  });
}

test("no two components claim the same Recipe shape", () => {
  const seen = new Map();
  for (const component of REGISTRY) {
    if (component.recipeKeys === undefined) continue;
    const key = [...component.recipeKeys].sort().join(" ");
    assert.equal(seen.get(key), undefined,
      `${component.id} and ${seen.get(key)} match the same Recipe, so discovery would be arbitrary`);
    seen.set(key, component.id);
  }
});
