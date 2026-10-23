import {
  assertExactAttributes as exactAttributes,
  textAttribute as stringAttribute,
} from "@hypit/hypit/markup";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/hypit/markup";
import { sameType } from "@hypit/hypit/protocol";
import type { NarrativeSegmentRef } from "@hypit/narrative";
import { narrativeTypes } from "@hypit/narrative";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalTypes } from "@hypit/temporal";

import { speechAlignmentFragment, speechBoundaryAlignmentFragment } from "./fragment.js";

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  const value = resolveReference(raw.path);
  if (value === undefined || !sameType(value.type, expected)) {
    throw new Error(`${element.name}.${name} has the wrong type`);
  }
  return value;
}

export const decodeSpeechAlignmentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const narrative = reference(element, "narrative", narrativeTypes.narrative, resolveReference);
  const segment = reference(element, "segment", narrativeTypes.segmentRef, resolveReference);
  const domain = reference(element, "domain", temporalTypes.localDomain, resolveReference);
  const excerpt = segment.record?.value as unknown as NarrativeSegmentRef | undefined;
  const empty = excerpt !== undefined && excerpt.tokenStart === excerpt.tokenEndExclusive;
  exactAttributes(element, empty
    ? ["id", "narrative", "segment", "domain"]
    : ["id", "narrative", "segment", "domain", "evidence"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} does not accept children`);
  }
  const id = stringAttribute(element, "id");
  const inputs: Record<string, SurfaceResolvedReference["ref"]> = {
    narrative: narrative.ref,
    segment: segment.ref,
    domain: domain.ref,
  };
  if (!empty) inputs.evidence = reference(element, "evidence", speechEvidenceTypes.transcript, resolveReference).ref;
  return {
    records: [],
    components: [{
      id,
      fragment: empty ? speechBoundaryAlignmentFragment : speechAlignmentFragment,
      inputs,
      outputs: { alignment: `${id}.alignment` },
      range: element.range,
    }],
    exports: [`${id}.alignment`],
  };
};
