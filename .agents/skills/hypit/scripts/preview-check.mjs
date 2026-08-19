#!/usr/bin/env node
/**
 * Preview-check a reconstruction before it is delivered.
 *
 * `pnpm hypit check` proves a Source is legal; it proves nothing about whether
 * the tracks it declares can actually be built by the local preview. A track
 * that fails here fails the same way when the author opens the playground, so
 * find out now.
 *
 * Usage:  node --import tsx .agents/skills/hypit/scripts/preview-check.mjs <main.svml> [<build.svrun>]
 * Exit:   0 when every track built and nothing is waiting on an error.
 *         1 otherwise, listing the failing tracks and their errors.
 */
import { fileURLToPath } from "node:url";
// The script lives under `.agents/`; resolve the playground's preview pipeline from the repo root.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const { preview } = await import(`${repoRoot}packages/svml-playground/src/pipeline/preview.js`);

const source = process.argv[2];
if (source === undefined) {
  console.error("usage: preview-check.mjs <main.svml> [<build.svrun>]");
  process.exit(2);
}
const run = process.argv[3];

const built = await preview(source, run, undefined);
const problems = [];
for (const track of built.tracks ?? []) {
  const errors = track.errors ?? [];
  if (errors.length > 0) problems.push({ track: track.name, errors });
  else if ((track.waiting ?? []).length > 0) {
    // A track waiting on a capability is normal when a Provider is absent; it
    // is only a problem when it waits on an actual error rather than a Provider.
    const fatal = track.waiting.filter((w) => !/Provider|credential|capability/iu.test(String(w)));
    if (fatal.length > 0) problems.push({ track: track.name, waiting: fatal });
  }
}
const refused = (built.refused ?? []).map((r) => ({ refused: r }));
const unserved = (built.unserved ?? []).length > 0 ? { unserved: built.unserved } : undefined;

const all = [...problems, ...refused, ...(unserved === undefined ? [] : [unserved])];
if (all.length === 0) {
  console.log("preview-check: every track built.");
  process.exit(0);
}
for (const item of all) console.log(JSON.stringify(item, null, 2));
process.exit(1);
