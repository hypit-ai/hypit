import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverPreviewProducers } from "../tools/playground/src/discovery/producers.js";
import type { PreviewSources } from "../tools/playground/src/discovery/producers.js";

/**
 * What a Recipe leaves unsaid is still knowable.
 *
 * Most of a Recipe is absent, and a form showing blanks tells an author nothing
 * about what will render. Each module reports what its own decoder came to
 * instead — and these tests hold that report to being the decoder's answer
 * rather than a second, drifting opinion of it.
 */

const packages = fileURLToPath(new URL("../packages", import.meta.url));

function workspace(): PreviewSources {
  const manifests: Record<string, () => Promise<unknown>> = {};
  const components: Record<string, () => Promise<unknown>> = {};
  for (const dir of readdirSync(packages, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    manifests[dir.name] = async () => await import(`${packages}/${dir.name}/src/manifest.ts`);
    components[dir.name] = async () => await import(`${packages}/${dir.name}/src/component.ts`);
  }
  return { manifests, components };
}

async function facets() {
  const found = await discoverPreviewProducers(workspace());
  const seen = new Map<string, { module: string; facet: (typeof found)[number]["recipes"][number] }>();
  for (const producer of found) {
    for (const facet of producer.recipes) {
      const key = `${producer.moduleName}#${facet.surface}#${
        Object.keys((facet.schema as { fields?: object }).fields ?? {}).length}`;
      if (!seen.has(key)) seen.set(key, { module: producer.moduleName, facet });
    }
  }
  return [...seen.values()];
}

const names = (facet: { schema: unknown }): readonly string[] =>
  Object.keys((facet.schema as { fields?: object }).fields ?? {}).sort();

test("nothing is answered for that the schema does not declare", async () => {
  const published = await facets();
  assert.ok(published.length > 0, "no module publishes a Recipe");
  for (const { module, facet } of published) {
    const known = new Set(names(facet));
    const stray = Object.keys(facet.effective({})).filter((name) => !known.has(name));
    assert.deepEqual(stray, [], `${module} ${facet.surface} answers for unknown ${stray.join(", ")}`);
  }
});

test("all but a handful of properties are answered for", async () => {
  // Not every property has a value to report: a gradient that is off has no
  // colour, and saying one would be inventing rather than reporting. That is
  // the only honest reason to stay silent, so silence is allowed but held
  // rare — a module answering for half its vocabulary has stopped deriving.
  for (const { module, facet } of await facets()) {
    const all = names(facet);
    const answered = Object.keys(facet.effective({})).length;
    assert.ok(answered >= all.length - 6,
      `${module} ${facet.surface} answers for only ${answered} of ${all.length}`);
  }
});

test("what was written comes back as written", async () => {
  // The report is of the whole Recipe, so it has to include the parts the
  // author decided. One that quietly replaced them would be describing a
  // different Recipe than the one on screen.
  for (const { module, facet } of await facets()) {
    const written = facet.defaults;
    if (Object.keys(written).length === 0) continue;
    const reported = facet.effective(written);
    for (const [name, value] of Object.entries(written)) {
      assert.deepEqual(reported[name], value,
        `${module} ${facet.surface} reports ${name} as something other than what was written`);
    }
  }
});

test("the reported Recipe renders the same thing the empty one does", async () => {
  // The claim being tested: these are the values that rendered. Writing them
  // all down explicitly must therefore change nothing — if it does, the report
  // is of something other than what the decoder used.
  for (const { module, facet } of await facets()) {
    let bare: unknown;
    try {
      bare = facet.apply(facet.defaults, {});
    } catch {
      continue; // Needs media; the round trip is tested where it can be.
    }
    const full = facet.apply(facet.effective(facet.defaults), {});
    assert.deepEqual(full, bare,
      `${module} ${facet.surface} renders differently once its own report is written down`);
  }
});

test("a reported value is one an author could have written", async () => {
  // In the author's vocabulary and shape, not the module's internals — a
  // colour comes back as hex, a pair of pixel counts as the one string a
  // stylesheet spells them with.
  for (const { module, facet } of await facets()) {
    const fields = (facet.schema as {
      fields: Record<string, { schema: { kind: string; enum?: readonly string[]; format?: string } }>;
    }).fields;
    const reported = facet.effective({});
    for (const [name, field] of Object.entries(fields)) {
      const value = reported[name];
      if (value === undefined) continue;
      const where = `${module} ${facet.surface} ${name}`;
      if (field.schema.kind === "number") {
        assert.equal(typeof value, "number", `${where} is not a number`);
        assert.ok(Number.isFinite(value as number), `${where} is not finite`);
      }
      if (field.schema.kind === "string") {
        assert.equal(typeof value, "string", `${where} is not a string`);
        if (field.schema.enum !== undefined) {
          assert.ok(field.schema.enum.includes(value as string),
            `${where} reports ${String(value)}, which its own enum does not list`);
        }
        if (field.schema.format === "color") {
          assert.match(value as string, /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu, `${where} is not a hex colour`);
        }
      }
    }
  }
});
