import {
  assertExactAttributes,
  localName,
  textAttribute,
} from "@hypit/markup";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import type { NarrativeMomentRef } from "@hypit/narrative";
import { canonicalize, sameType } from "@hypit/protocol";
import { speechTypes } from "@hypit/speech";

import { semanticTakeAdjustFragment } from "./fragment.js";
import { semanticTakeAdjustTypes } from "./manifest.js";
import type { SemanticTakeAdjustmentPlan } from "./types.js";

function reference(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const raw: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") {
    throw new Error(`${element.name}.${name} must be a whole-value reference.`);
  }
  const resolved = resolveReference(raw.path);
  if (resolved === undefined) throw new Error(`${element.name}.${name} cannot resolve ${raw.path}.`);
  if (!sameType(resolved.type, expected)) throw new Error(`${element.name}.${name} has the wrong type.`);
  return resolved;
}

function inline<T>(value: SurfaceResolvedReference, subject: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline Record.`);
  return value.record.value.value as unknown as T;
}

function frameAttribute(element: StructuredElement): number {
  const value = Number(textAttribute(element, "frame"));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${element.name}.frame must be a non-negative integer.`);
  return value;
}

export const decodeSemanticTakeAdjustSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertExactAttributes(element, ["id", "source"]);
  const id = textAttribute(element, "id");
  const source = reference(element, "source", speechTypes.semanticTake, resolveReference);
  const moments: NarrativeMomentRef[] = [];
  const anchors: SemanticTakeAdjustmentPlan["anchors"][number][] = [];

  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Anchor children.`);
      continue;
    }
    if (localName(child.name) !== "Anchor") throw new Error(`${element.name} accepts only Anchor children.`);
    assertExactAttributes(child, ["at", "frame"]);
    if (child.children.some((item) => item.kind === "element" || item.value.trim())) {
      throw new Error(`${child.name} must be empty.`);
    }
    const moment = inline<NarrativeMomentRef>(
      reference(child, "at", narrativeTypes.moment, resolveReference),
      `${child.name}.at`,
    );
    moments.push(moment);
    anchors.push({ anchorId: moment.anchorId, frame: frameAttribute(child) });
  }
  if (anchors.length === 0) throw new Error(`${element.name} requires at least one Anchor child.`);
  const narrativeId = moments[0]!.narrativeId;
  if (moments.some((moment) => moment.narrativeId !== narrativeId)) {
    throw new Error(`${element.name} cannot mix Moments from different Narratives.`);
  }

  const planId = `${id}.plan`;
  const plan: SemanticTakeAdjustmentPlan = { narrativeId, anchors };
  return {
    records: [{
      id: planId,
      type: semanticTakeAdjustTypes.plan,
      value: { kind: "inline", value: canonicalize(plan) },
      range: element.range,
    }],
    components: [{
      id,
      fragment: semanticTakeAdjustFragment.id,
      inputs: { source: source.ref, plan: { kind: "record", id: planId } },
      outputs: { take: `${id}.take` },
      range: element.range,
    }],
    fragments: [semanticTakeAdjustFragment],
  };
};
