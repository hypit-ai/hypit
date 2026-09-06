import assert from "node:assert/strict";
import test from "node:test";

import { installDistributionPackageResolution } from "../src/distribution-resolution.js";

test("an external Author Package imports the active Distribution public API", async () => {
  installDistributionPackageResolution([process.cwd()]);
  const author = await import(String("hypit/author-kit")) as { readonly sealGraphFragment?: unknown };
  const composition = await import(String("hypit/composition")) as { readonly sealVisualTrack?: unknown };
  assert.equal(typeof author.sealGraphFragment, "function");
  assert.equal(typeof composition.sealVisualTrack, "function");
});
