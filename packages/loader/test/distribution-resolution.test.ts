import assert from "node:assert/strict";
import test from "node:test";

import {
  installDistributionPackageResolution,
  resolveDistributionPackageImport,
} from "../src/node/distribution-resolution.js";

test("one Distribution resolves public Core without impersonating independent frontends", () => {
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/recipe"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/hypit/recipe"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "example-package"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/script"), undefined);
  assert.equal(resolveDistributionPackageImport(process.cwd(), "@hypit/temporal"), undefined);
});

test("an external Author Package imports the active Distribution public API", async () => {
  installDistributionPackageResolution([process.cwd()]);
  const author = await import(String("@hypit/hypit/author")) as { readonly sealGraphFragment?: unknown };
  const audiovisual = await import(String("@hypit/audiovisual")) as { readonly sealAudiovisualProgram?: unknown };
  assert.equal(typeof author.sealGraphFragment, "function");
  assert.equal(typeof audiovisual.sealAudiovisualProgram, "function");
});
