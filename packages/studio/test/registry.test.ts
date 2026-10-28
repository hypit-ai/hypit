import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion } from "@hypit/studio-companion";

import { StudioCompanionRegistry } from "../src/studio-registry.js";

test("Companion origin matching includes the exact module version", () => {
  const moduleV1 = { name: "@example/track", version: "1" } as const;
  const companion: StudioTrackCompanion = {
    id: "example", family: "example",
    output: { type: compositionTypes.visualTrack, declaration: "track", modules: [moduleV1] },
  };
  const registry = new StudioCompanionRegistry([companion]);
  assert.equal(registry.trackCompanionFor(compositionTypes.visualTrack, { declaration: "track", module: moduleV1 }, []), companion);
  assert.equal(registry.trackCompanionFor(
    compositionTypes.visualTrack,
    { declaration: "track", module: { ...moduleV1, version: "2" } },
    [],
  ), undefined);
});

test("Inspector objects stay out of the Timeline while child Tracks remain available", () => {
  const companion: StudioTrackCompanion = {
    id: "cards", family: "cards", tone: "blue",
    output: { type: compositionTypes.visualTrack },
    inspectorObjects: [{
      id: "rules", label: "Presentation Rules",
      bindings: [{ name: "style" }],
      inspector: [{ binding: "style", label: "Style", domain: "how", section: { id: "style", label: "Style" }, control: "text" }],
      project: () => [{ id: "rule", authoredId: "rule", title: "Layout" }],
    }],
    attachments: [{ id: "objects", family: "objects", icon: "layers", facet: "visual", lane: { heightPx: 40 } }],
    project: () => [{ id: "card", authoredId: "card",
      display: { title: "Card", layers: [] }, startFrame: 0, endFrameExclusive: 120, stackOrder: 0 }],
  };
  const registry = new StudioCompanionRegistry([companion]);
  const track = { typeRef: compositionTypes.visualTrack, outputRef: "cards.visual", name: "cards", type: "VisualTrack",
    value: {}, trace: { references: [], outputPorts: [] } } as const;
  assert.deepEqual(registry.trackAttachments(track).map(item => item.attachmentId), ["objects"]);
  const context = { track, values: new Map(), spans: [], temporalBindings: [], temporalDomains: [], generic: () => [] };
  const [draft] = registry.projectTrack(context);
  assert.equal(draft?.display.title, "Card");
  const [rule] = registry.projectInspectorObjects(context);
  assert.equal(rule?.label, "Presentation Rules");
  assert.deepEqual(rule?.bindings, [{ name: "style" }]);
  assert.equal(rule?.inspector[0]?.label, "Style");
  assert.equal(rule?.draft.title, "Layout");
  const invalid = new StudioCompanionRegistry([{ ...companion,
    inspectorObjects: [{ ...companion.inspectorObjects![0]!, project: () => [rule!.draft, rule!.draft] }],
  }]);
  assert.throws(() => invalid.projectInspectorObjects(context), /repeats Inspector object/);
});

test("Companions own lane-local Item identity and the Host rejects only collisions in that scope", () => {
  const base: StudioTrackCompanion = {
    id: "local-items", family: "visual",
    output: { type: compositionTypes.visualTrack },
    project: () => [
      { id: "same", authoredId: "first", display: { title: "First", layers: [] }, startFrame: 0, endFrameExclusive: 1, stackOrder: 0 },
      { id: "same", authoredId: "attached", lane: "details", display: { title: "Attached", layers: [] }, startFrame: 0, endFrameExclusive: 1, stackOrder: 0 },
    ],
  };
  const registry = new StudioCompanionRegistry([base]);
  const track = { typeRef: compositionTypes.visualTrack, outputRef: "owner", name: "owner", type: "VisualTrack",
    value: {}, trace: { references: [], outputPorts: [] } } as const;
  const context = { track, values: new Map(), spans: [], temporalBindings: [], temporalDomains: [], generic: () => [] };
  assert.equal(registry.projectTrack(context).length, 2);
  const invalid = new StudioCompanionRegistry([{ ...base, project: () => [base.project!(context)[0]!, base.project!(context)[0]!] }]);
  assert.throws(() => invalid.projectTrack(context), /repeats Item same in one lane/u);
});

test("Studio groups Track facets by compiler provenance rather than authored labels", () => {
  const registry = new StudioCompanionRegistry([{
    id: "visual", family: "visual", output: { type: compositionTypes.visualTrack },
  }]);
  const binding = registry.bindTrack({
    typeRef: compositionTypes.visualTrack,
    outputRef: "scene.visual",
    name: "scene.visual",
    type: "VisualTrack",
    value: {},
    trace: { authorElement: "author-element-7", authoredId: "scene", references: [], outputPorts: [] },
  });
  assert.deepEqual(binding.group, { kind: "author-element", element: "author-element-7" });
  assert.equal(binding.label, "scene");
});
