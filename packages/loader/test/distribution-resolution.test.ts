import assert from "node:assert/strict";
import test from "node:test";

import { resolve } from "node:path";

import {
  installDistributionPackageResolution,
  resolveDistributionPackageImport,
} from "../src/node/distribution-resolution.js";

test("one Distribution resolves its internal and public package spellings", () => {
  assert.equal(
    resolveDistributionPackageImport(process.cwd(), "@hypit/recipe"),
    resolve(process.cwd(), "packages/recipe/src/index.ts"),
  );
  assert.equal(
    resolveDistributionPackageImport(process.cwd(), "@hypit/hypit/recipe"),
    resolve(process.cwd(), "packages/recipe/src/index.ts"),
  );
  assert.equal(resolveDistributionPackageImport(process.cwd(), "example-package"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/script"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/temporal"), undefined);
});

test("an external Author Package imports the active Distribution public API", async () => {
  installDistributionPackageResolution([process.cwd()]);
  const author = await import(String("@hypit/hypit/author")) as { readonly sealGraphFragment?: unknown };
  const composition = await import(String("@hypit/composition")) as { readonly sealPresentVisualTrack?: unknown };
  assert.equal(typeof author.sealGraphFragment, "function");
  assert.equal(typeof composition.sealPresentVisualTrack, "function");
});
