import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion } from "@hypit/studio-adapter";

import { StudioCompanionRegistry } from "../src/studio-registry.js";

test("Companion origin matching includes the exact module version", () => {
  const moduleV1 = { name: "@example/track", version: "1" } as const;
  const companion: StudioTrackCompanion = {
    id: "example", role: "track", family: "example",
    output: { type: compositionTypes.visualTrack, surface: "track", modules: [moduleV1] },
  };
  const registry = new StudioCompanionRegistry([companion]);
  assert.equal(registry.trackCompanionFor(compositionTypes.visualTrack, { surface: "track", module: moduleV1 }, []), companion);
  assert.equal(registry.trackCompanionFor(
    compositionTypes.visualTrack,
    { surface: "track", module: { ...moduleV1, version: "2" } },
    [],
  ), undefined);
});
