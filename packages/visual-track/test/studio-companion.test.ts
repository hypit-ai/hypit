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

  const transitions = companion.attachments?.find((attachment) => attachment.id === "transitions");
  assert.equal(transitions?.label, "Transitions");
  assert.deepEqual(transitions?.bindings?.map(({ name }) => name), ["outgoing", "incoming", "effect"]);
  assert.equal(transitions?.bindings?.find(({ name }) => name === "effect")?.companion, true);
  assert.deepEqual(transitions?.inspector, []);

  const treatmentNames = visualClipTreatmentStudioFields.bindings.map(({ name }) => name);
  assert.deepEqual(treatmentNames, [
    "opacity", "blur", "brightness", "contrast", "saturation",
    "clip", "radius", "padding", "border-width", "border-style", "border-color", "shadows", "frame-paint",
  ]);
});

test("Studio selects the visible Transition Process instead of its hidden participant Presents", () => {
  const program = {
    id: "picture",
    clips: [
      { id: "outgoing", subjectId: "outgoing", span: { startFrame: 0, endFrameExclusive: 20 }, layers: [] },
      { id: "incoming", subjectId: "incoming", span: { startFrame: 10, endFrameExclusive: 30 }, layers: [] },
    ],
    transitions: [{
      id: "handoff",
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      effect: { format: "example.transition@1", payload: {}, artifacts: [] },
    }],
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
      { id: "handoff", subjectId: "handoff", startFrame: 10, endFrameExclusive: 20, stackOrder: 1 },
      { id: "incoming", subjectId: "incoming", startFrame: 10, endFrameExclusive: 30, stackOrder: 2 },
    ],
    temporalBindings: [],
    temporalDomains: [],
    generic: () => [],
  };
  const items = visualTrackStudioTrackCompanions[0]!.project!(context);
  const transition = items.find((item) => item.authoredId === "handoff");
  assert.deepEqual(transition?.terminalLinks, [{ spanId: "handoff" }]);
  assert.deepEqual([transition?.startFrame, transition?.endFrameExclusive], [10, 20]);
});
