import assert from "node:assert/strict";
import test from "node:test";

import {
  visualClipTreatmentStudioFields,
  visualTrackStudioTrackCompanions,
} from "../src/studio.js";

test("Visual Studio keeps occurrence facts, treatment and typed Motion separate", () => {
  const companion = visualTrackStudioTrackCompanions[0]!;
  assert.equal(companion.family, "visual");
  const bindings = new Map((companion.bindings ?? []).map((binding) => [binding.name, binding]));

  for (const name of ["fit", "source-time", "treatment", "motion"]) {
    assert.ok(bindings.has(name), `missing ${name}`);
  }
  assert.equal(bindings.has("z"), false);
  assert.ok("recipe" in bindings.get("treatment")!);
  assert.equal("recipe" in bindings.get("motion")!, false);

  const treatmentNames = visualClipTreatmentStudioFields.bindings.map(({ name }) => name);
  assert.deepEqual(treatmentNames, [
    "opacity", "blur", "brightness", "contrast", "saturation",
    "clip", "radius", "padding", "border-width", "border-style", "border-color", "shadows", "frame-paint",
  ]);
});
