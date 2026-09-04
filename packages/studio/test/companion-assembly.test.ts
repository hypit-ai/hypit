import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import { createStudioTrackCompanionHostFacet } from "@hypit/studio-adapter";

import { loadStudioCompanionRegistry } from "../src/companion-assembly.js";

test("a Source-selected package contributes its Companion without a second Studio profile", async () => {
  const module = { name: "@project/cards", version: "1" } as const;
  const registry = await loadStudioCompanionRegistry({
    distributionPackageRoot: process.cwd(),
    distributionPackages: [],
    sourcePackages: [{
      specifier: "@project/cards",
      contribution: {
        format: "hypit.node-package@1",
        hostFacets: [createStudioTrackCompanionHostFacet([{
          id: "cards",
          role: "track",
          family: "cards",
          output: { type: compositionTypes.visualTrack, surface: "track", modules: [module] },
        }])],
      },
    }],
  });
  assert.equal(
    registry.trackCompanionFor(compositionTypes.visualTrack, { surface: "track", module }, [])?.id,
    "@project/cards#cards",
  );
});
