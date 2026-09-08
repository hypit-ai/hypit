import assert from "node:assert/strict";
import test from "node:test";

import { resolve } from "node:path";

import {
  installDistributionPackageResolution,
  resolveDistributionPackageImport,
} from "../src/distribution-resolution.js";

test("one Distribution resolves its internal and public package spellings", () => {
  assert.equal(
    resolveDistributionPackageImport(process.cwd(), "@hypit/svs"),
    resolve(process.cwd(), "packages/svs/src/index.ts"),
  );
  assert.equal(
    resolveDistributionPackageImport(process.cwd(), "hypit/svs"),
    resolve(process.cwd(), "packages/svs/src/index.ts"),
  );
  assert.equal(resolveDistributionPackageImport(process.cwd(), "example-package"), undefined);
});

test("an external Author Package imports the active Distribution public API", async () => {
  installDistributionPackageResolution([process.cwd()]);
  const author = await import(String("hypit/author-kit")) as { readonly sealGraphFragment?: unknown };
  const composition = await import(String("hypit/composition")) as { readonly sealVisualTrack?: unknown };
  assert.equal(typeof author.sealGraphFragment, "function");
  assert.equal(typeof composition.sealVisualTrack, "function");
});
