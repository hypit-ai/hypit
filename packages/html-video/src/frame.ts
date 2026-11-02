import { declarationField, sealGraphFragment, type AuthorDeclarationCompiler } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { htmlProgramProducers } from "@hypit/html-program";
import { htmlVideoModuleRef } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
export const htmlFrameFragment = sealGraphFragment({
  inputs: [{ name: "composition", type: compositionTypes.composition }, { name: "range", type: timelineTypes.frameSpan }],
  operations: [
    { id: "compile-program", producer: htmlProgramProducers.compile, inputs: { composition: input("composition") }, result: { kind: "output", name: "program" } },
    { id: "request-frame", producer: htmlProgramProducers.requestFrame, inputs: { program: operation("compile-program"), range: input("range") }, result: { kind: "need", name: "frames" } },
    { id: "project-frame", producer: htmlProgramProducers.projectFrame, inputs: { frames: operation("request-frame"), range: input("range") }, result: { kind: "output", name: "image" } },
  ],
  exports: [{ name: "image", type: blobTypes.blob, root: operation("project-frame") }],
});
function literal(declaration: Parameters<typeof declarationField>[0], name: string) {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || !value.value.trim()) throw new Error(`Frame.${name} must be non-empty text`);
  return value.value.trim();
}
export const htmlFrameAuthorDeclaration: AuthorDeclarationCompiler = {
  module: htmlVideoModuleRef,
  declaration: "frame",
  outputs: [blobTypes.blob, timelineTypes.frameSpan],
  shape: { summary: "Captures one Composition frame as a full-size sRGB PNG.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names the frame output." },
    { name: "composition", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the composed picture." },
    { name: "at-frame", kind: "literal", required: true, summary: "Selects a zero-based frame on the Composition clock." },
  ] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.image`, ref: { kind: "component-output", component: id, output: "image" }, type: blobTypes.blob, retained: true }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id"), rawFrame = literal(declaration, "at-frame");
    const frame = Number(rawFrame);
    if (!/^\d+$/u.test(rawFrame) || !Number.isSafeInteger(frame) || !Number.isSafeInteger(frame + 1)) throw new Error("Frame.at-frame must be a non-negative safe integer");
    const field = declarationField(declaration, "composition");
    const composition = field?.kind === "reference" ? await resolveReference(field.path) : undefined;
    if (!composition || !sameType(composition.type, compositionTypes.composition)) throw new Error("Frame.composition must reference a Composition");
    const range = `${id}.frame-range`;
    return {
      records: [{ id: range, type: timelineTypes.frameSpan, value: { startFrame: frame, endFrameExclusive: frame + 1 }, range: declaration.range }],
      components: [{ id, fragment: htmlFrameFragment, inputs: { composition: composition.ref, range: { kind: "record", id: range } }, outputs: { image: `${id}.image` }, range: declaration.range }],
    };
  },
};
