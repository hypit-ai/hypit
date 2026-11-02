import { declarationField, sealGraphFragment, type AuthorDeclarationCompiler, type AuthorDeclarationChild } from "@hypit/hypit/author";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { timelineTypes } from "@hypit/timeline";
import { captionModuleRef, captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const fragment = sealGraphFragment({
  inputs: [{ name: "document", type: captionTypes.document }, { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: captionTypes.timingSpec }],
  operations: [{ id: "resolve", producer: captionProducers.resolveTiming, inputs: { document: input("document"), timeline: input("timeline"), spec: input("spec") }, result: { kind: "output", name: "timing" } }],
  exports: [{ name: "timing", type: captionTypes.timing, root: { kind: "fragment-operation", operation: "resolve" } }],
});

function literal(node: AuthorDeclarationChild, name: string) {
  const field = declarationField(node, name);
  if (field?.kind !== "literal") throw new Error(`Caption ${node.name}.${name} must be literal.`);
  return field.value;
}
function frames(node: AuthorDeclarationChild, name: string) {
  const value = literal(node, name);
  if (!/^\d+f$/.test(value) || !Number.isSafeInteger(Number(value.slice(0, -1)))) throw new Error(`Caption Unit.${name} must be a nonnegative frame value.`);
  return Number(value.slice(0, -1));
}

export const captionTimingAuthorDeclaration: AuthorDeclarationCompiler = {
  module: captionModuleRef, declaration: "timing", outputs: [captionTypes.timing, captionTypes.timingSpec],
  shape: {
    summary: "Locates every caption unit on an absolute Timeline.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Timing identity." },
      { name: "document", kind: "reference", required: true, accepts: [captionTypes.document], summary: "Caption content." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Absolute frame domain." },
    ],
    children: [{ name: "Unit", cardinality: "many", summary: "One display unit interval.", fields: [
      { name: "unit", kind: "literal", required: true, summary: "Unit identity in the caption document." },
      { name: "from", kind: "literal", required: true, summary: "Start frame, such as 15f." },
      { name: "for", kind: "literal", required: true, summary: "Positive frame duration, such as 45f." },
    ] }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, type: captionTypes.timing, ref: { kind: "component-output", component: id, output: "timing" } }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id"), specId = `${id}:spec`;
    const references = await Promise.all((["document", "timeline"] as const).map(async name => {
      const value = declarationField(declaration, name);
      if (value?.kind !== "reference") throw new Error(`Caption Timing.${name} must be a reference.`);
      const resolved = await resolveReference(value.path);
      const type = name === "document" ? captionTypes.document : timelineTypes.timeline;
      if (!resolved || !sameType(resolved.type, type)) throw new Error(`Caption Timing.${name} has the wrong Type.`);
      return resolved.ref;
    }));
    const units = declaration.children.map(unit => {
      if (unit.name !== "Unit" || unit.children.length) throw new Error("Caption Timing accepts Unit intervals.");
      const startFrame = frames(unit, "from"), duration = frames(unit, "for");
      if (duration < 1) throw new Error("Caption Unit duration must be positive.");
      return { unitId: literal(unit, "unit"), startFrame, endFrameExclusive: startFrame + duration };
    });
    return {
      records: [{ id: specId, type: captionTypes.timingSpec, value: canonicalize({ units }), range: declaration.range }],
      components: [{ id, fragment, inputs: { document: references[0]!, timeline: references[1]!, spec: { kind: "record", id: specId } }, outputs: { timing: id }, range: declaration.range }],
    };
  },
};
export const captionTimingMarkupDeclaration = { name: "timing", tag: "Timing" } as const;
