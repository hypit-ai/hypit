import { resolveTemporalContext } from "@hypit/temporal/markup";
import { compositionTypes } from "@hypit/composition";
import { blobTypes } from "@hypit/hypit/blob";
import { htmlProgramTypes } from "@hypit/html-program";
import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/hypit/markup";

import { htmlOccludedVideoFragment } from "./occluded-fragment.js";

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${element.name}.${name} must be a string`);
  return value;
}

function integerAttribute(element: StructuredElement, name: string): number {
  const text = stringAttribute(element, name);
  if (!/^-?\d+$/u.test(text)) throw new Error(`${element.name}.${name} must be an integer`);
  return Number(text);
}

/**
 * `<html:OccludedVideo composition timeline subject z/>`
 *
 * Renders the programme below `z` and cuts `subject` (an alpha video, e.g. a `<sam:Segment>` mask
 * output) over it. Everything at or above `z` is not painted in this pass.
 */
export const decodeHtmlOccludedVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const allowed = ["id", "composition", "timeline", "subject", "z"];
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}`);
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const compositionRef = element.attributes.composition;
  if (typeof compositionRef !== "object" || compositionRef.kind !== "reference") {
    throw new Error(`${element.name}.composition must be a reference`);
  }
  const composition = resolveReference(compositionRef.path);
  if (composition === undefined
    || composition.type.module.name !== compositionTypes.composition.module.name
    || composition.type.module.version !== compositionTypes.composition.module.version
    || composition.type.name !== compositionTypes.composition.name) {
    throw new Error(`${element.name}.composition must reference Composition`);
  }
  const subjectRef = element.attributes.subject;
  if (typeof subjectRef !== "object" || subjectRef.kind !== "reference") {
    throw new Error(`${element.name}.subject must be a reference`);
  }
  const subject = resolveReference(subjectRef.path);
  if (subject === undefined
    || subject.type.module.name !== blobTypes.blob.module.name
    || subject.type.module.version !== blobTypes.blob.module.version
    || subject.type.name !== blobTypes.blob.name) {
    throw new Error(`${element.name}.subject must be a Blob`);
  }
  if (subject.record !== undefined
    && !(subject.record.value.kind === "blob" && String(subject.record.value.mediaType).startsWith("video/"))) {
    throw new Error(`${element.name}.subject must be video media`);
  }
  const z = integerAttribute(element, "z");
  const context = resolveTemporalContext({ element, resolveReference });
  // Everything strictly below the subject's z, so a Present authored at the same z as the subject is
  // not silently painted underneath it.
  const band = { minInclusive: Number.MIN_SAFE_INTEGER, maxExclusive: z };
  const bandId = `${id}.band`;
  return {
    records: [{
      id: bandId,
      type: htmlProgramTypes.zBand,
      value: { kind: "inline", value: band },
      range: element.range,
    }],
    components: [{
      id,
      fragment: htmlOccludedVideoFragment.id,
      inputs: {
        composition: composition.ref,
        timeline: context.timeline.ref,
        band: { kind: "record" as const, id: bandId },
        subject: subject.ref,
      },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [htmlOccludedVideoFragment],
  };
};
