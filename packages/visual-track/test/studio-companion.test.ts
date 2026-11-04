import assert from "node:assert/strict";
import test from "node:test";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanionContext } from "@hypit/studio-companion";

import {
  visualClipTreatmentStudioFields,
  visualTrackStudioTrackCompanions,
} from "../src/studio.js";

test("Visual Studio keeps occurrence facts, treatment and typed Motion separate", () => {
  const companion = visualTrackStudioTrackCompanions[0]!;
  assert.equal(companion.family, "visual");
  const bindings = new Map((companion.bindings ?? []).map((binding) => [binding.name, binding]));

  for (const name of ["fit", "treatment", "motion"]) {
    assert.ok(bindings.has(name), `missing ${name}`);
  }
  assert.ok("recipe" in bindings.get("treatment")!);
  assert.equal("recipe" in bindings.get("motion")!, false);

  assert.equal(companion.attachments, undefined);

  const treatmentNames = visualClipTreatmentStudioFields.bindings.map(({ name }) => name);
  assert.deepEqual(treatmentNames, [
    "opacity", "blur", "brightness", "contrast", "saturation",
    "clip", "radius", "padding", "border-width", "border-style", "border-color", "shadows", "frame-paint",
  ]);
});

test("Studio projects only the Visual Clip occurrences owned by this legacy package", () => {
  const program = {
    id: "picture",
    clips: [
      { id: "outgoing", subjectId: "outgoing", span: { startFrame: 0, endFrameExclusive: 20 }, layers: [] },
      { id: "incoming", subjectId: "incoming", span: { startFrame: 10, endFrameExclusive: 30 }, layers: [] },
    ],
  };
  const context: StudioTrackCompanionContext = {
    track: {
      name: "picture.visual",
      type: compositionTypes.visualTrack.name,
      typeRef: compositionTypes.visualTrack,
      outputRef: "picture.visual",
      value: {},
      trace: { outputPorts: [{ name: "program", ref: "picture.program" }], references: [] },
    },
    values: new Map([["picture.program", program]]),
    spans: [
      { id: "outgoing", subjectId: "outgoing", startFrame: 0, endFrameExclusive: 20, stackOrder: 0 },
      { id: "incoming", subjectId: "incoming", startFrame: 10, endFrameExclusive: 30, stackOrder: 1 },
    ],
    temporalBindings: [],
    temporalDomains: [],
    generic: () => [],
  };
  const items = visualTrackStudioTrackCompanions[0]!.project!(context);
  assert.deepEqual(items.map((item) => item.authoredId), ["outgoing", "incoming"]);
});
