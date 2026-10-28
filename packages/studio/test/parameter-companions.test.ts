import assert from "node:assert/strict";
import test from "node:test";
import type { StudioPlacement, StudioItemDraft, StudioParameterCompanion } from "@hypit/studio-companion";
import { studioContributionFromPackage, createStudioCompanionFacet } from "@hypit/studio-companion";
import { composeParameterDeclarations, sourceBindingsForDraft, inspectorFieldsForBindings } from "../src/parameters.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";
import { parameterAuthorValue, serializeParameterValue } from "../src/parameter-values.js";

const module = { name: "@project/pan", version: "1" } as const;
const companion: StudioParameterCompanion = {
  id: "pan", match: { module, declaration: "pan" },
  bindings: [{ name: "distance", writable: true, fallback: 0.25 }],
  inspector: [{ binding: "distance", label: "Travel", domain: "where", section: { id: "path", label: "Path" },
    control: "number", number: { scale: 100 }, unit: "%" }],
};
const text = '<x:Track id="view" style={pan}/><p:Pan id="pan"/>';
function placement(id: string, start: number, end: number): StudioPlacement {
  return { id, module, declaration: id === "pan" ? "pan" : "track", tag: id === "pan" ? "p:Pan" : "x:Track",
    sourcePath: "main.svml", range: { start, end }, records: [id], values: [], outputs: [], outputPorts: [], children: [],
    attributes: { id }, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {} };
}
test("a project object contributes its own parameters to a consumer and inserts an omitted scalar on first edit", () => {
  const contribution = studioContributionFromPackage("@project/pan", [createStudioCompanionFacet({ parameters: [companion] })]);
  const registry = new StudioCompanionRegistry([], { parameters: contribution.parameters });
  const split = text.indexOf('<p:Pan');
  const owner = { ...placement("view", 0, split), referenceAttributes: { style: "pan" }, resolvedReferenceAttributes: { style: "pan" } };
  const style = placement("pan", split, text.length);
  const draft: StudioItemDraft = { id: "use", authoredId: "view", display: { title: "Pan", layers: [] }, startFrame: 0, endFrameExclusive: 30, stackOrder: 0 };
  const declarations = composeParameterDeclarations({ registry, placement: owner, placements: [owner, style], draft,
    bindings: [{ name: "style", companion: true }], inspector: [] });
  const fields = inspectorFieldsForBindings(draft, sourceBindingsForDraft({ root: "/workspace", files: [{ path: "main.svml", text, language: "svml" }],
    placement: owner, placements: [owner, style], draft, declarations: declarations.bindings }), declarations.inspector);
  assert.equal(fields.length, 1);
  const field = fields[0]!;
  assert.equal(field.label, "Travel"); assert.equal(field.value, 0.25);
  const source = field.edit!.source;
  const written = source.prefix! + serializeParameterValue(parameterAuthorValue(field, 50), field.edit!.language) + source.suffix!;
  assert.equal(text.slice(0, source.range.start) + written + text.slice(source.range.end),
    '<x:Track id="view" style={pan}/><p:Pan distance="0.5" id="pan"/>');
  assert.equal(registry.parameterCompanionFor({ name: "@other/pan", version: "1" }, "pan"), undefined);
});
