import { captionTypes } from "@hypit/caption";
import { sealGraphFragment } from "@hypit/hypit/author";
import {
  assertAttributes,
  assertEmptyElement,
  textAttribute,
  type StructuredSurfaceHandler,
  type SurfaceResolvedReference,
} from "@hypit/hypit/markup";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { narrativeTemporalTypes } from "@hypit/narrative-temporal";

import { narrativeCaptionProducers, narrativeCaptionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function reference(
  path: unknown,
  subject: string,
  type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof path !== "object" || path === null || !("kind" in path) || path.kind !== "reference"
    || !("path" in path) || typeof path.path !== "string") throw new Error(`${subject} must be a reference.`);
  const found = resolve(path.path);
  if (found === undefined || !sameType(found.type, type)) throw new Error(`${subject} has the wrong Type.`);
  return found;
}

/** Resolve one explicit Narrative-to-Caption relation into neutral absolute CaptionTiming. */
export const decodeNarrativeCaptionTimingSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "document", "binding", "projection"]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const document = reference(element.attributes.document, `${element.name}.document`, captionTypes.document, resolveReference);
  const binding = reference(element.attributes.binding, `${element.name}.binding`, narrativeCaptionTypes.binding, resolveReference);
  const projection = reference(element.attributes.projection, `${element.name}.projection`, narrativeTemporalTypes.narrativeProjection, resolveReference);
  const fragment = sealGraphFragment({
    inputs: [
      { name: "document", type: captionTypes.document },
      { name: "binding", type: narrativeCaptionTypes.binding },
      { name: "projection", type: narrativeTemporalTypes.narrativeProjection },
    ],
    operations: [{
      id: "project",
      producer: narrativeCaptionProducers.projectTiming,
      inputs: { document: input("document"), binding: input("binding"), projection: input("projection") },
      result: { kind: "output" as const, name: "timing" },
    }],
    exports: [{ name: "timing", type: captionTypes.timing, root: operation("project") }],
  });
  return {
    records: [],
    components: [{
      id,
      fragment,
      inputs: { document: document.ref, binding: binding.ref, projection: projection.ref },
      outputs: { timing: id },
      range: element.range,
    }],
    exports: [id],
  };
};

export const narrativeCaptionTimingMarkupSurface = {
  name: "timing", tag: "Timing", mode: "structured", outputs: [captionTypes.timing],
  vocabulary: {
    summary: "Projects an explicit Narrative-to-Caption binding onto absolute CaptionTiming.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resolved CaptionTiming." },
      { name: "document", kind: "reference", required: true, accepts: [captionTypes.document], summary: "Chooses displayed Caption content." },
      { name: "binding", kind: "reference", required: true, accepts: [narrativeCaptionTypes.binding], summary: "Relates Caption units to Narrative Tokens." },
      { name: "projection", kind: "reference", required: true, accepts: [narrativeTemporalTypes.narrativeProjection], summary: "Locates those Tokens on one Timeline." },
    ],
    ports: [{ name: "", type: captionTypes.timing, summary: "Neutral absolute timing for the selected CaptionDocument." }],
    example: '<narrative-caption:Timing id="story-captions" document={story.caption} binding={story.caption-binding} projection={speech}/>',
  },
} as const;
