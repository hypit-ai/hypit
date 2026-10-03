import { assertPlacementFrameBoundary, placementExpression } from "./program.js";
import { assertProgramClockIdentity, programSpaceTypes, type ProgramClock } from "@hypit/program-space";
import { assertAttributes, assertEmptyElement, localName, textAttribute, type StructuredSurfaceHandler } from "@hypit/markup";
import { sameType } from "@hypit/protocol";
import { speechTypes } from "@hypit/speech";
import { createTimelineAuthorFragment } from "./fragment.js";
import { timelineAuthorTypes } from "./manifest.js";

export const decodeTimelineAuthorSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "clock", "end"]);
  const id = textAttribute(element, "id");
  const rawClock = element.attributes.clock;
  const clock = typeof rawClock === "object" && rawClock.kind === "reference" ? resolveReference(rawClock.path) : undefined;
  if (clock === undefined || !sameType(clock.type, programSpaceTypes.clock)) throw new Error(`${element.name}.clock must reference a Clock.`);
  const clockValue = clock.record?.value;
  const staticClock = clockValue?.kind === "inline" ? clockValue.value as unknown as ProgramClock : undefined;
  if (staticClock !== undefined) assertProgramClockIdentity(staticClock);
  const checkBoundary = (expression: string, reference: string, subject: string): void => {
    if (staticClock === undefined) return;
    try {
      assertPlacementFrameBoundary(expression, staticClock, reference);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const { numerator, denominator } = staticClock.frameRate;
      throw new Error(`Timeline ${id} ${subject} at ${numerator}/${denominator} fps: ${error.message}`);
    }
  };
  if (element.attributes.end !== undefined) {
    const end = textAttribute(element, "end");
    placementExpression(end, "content.end");
    checkBoundary(end, "content.end", "end");
  }
  const at: string[] = [];
  const takes = element.children.flatMap(child => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error("Timeline accepts only Take children.");
      return [];
    }
    if (localName(child.name) !== "Take") throw new Error("Timeline accepts only Take children.");
    assertAttributes(child, ["source", "at"]);
    at.push(child.attributes.at === undefined ? (at.length === 0 ? "0f" : "previous.end") : textAttribute(child, "at"));
    const position = placementExpression(at.at(-1)!, "previous.end");
    if (at.length === 1 && position.relative) throw new Error("The first Timeline Take has no previous.end.");
    checkBoundary(at.at(-1)!, "previous.end", `Take ${at.length}.at`);
    assertEmptyElement(child);
    const source = child.attributes.source;
    if (typeof source !== "object" || source.kind !== "reference") throw new Error("Timeline Take source must be a reference.");
    const resolved = resolveReference(source.path);
    if (resolved === undefined || !sameType(resolved.type, speechTypes.semanticTake)) throw new Error("Timeline Take source must be a SemanticTake.");
    return [resolved];
  });
  const inputs = takes.map((_, index) => ({ takeName: `take-${index + 1}` }));
  const fragment = createTimelineAuthorFragment({ takes: inputs });
  return {
    records: [{ id: `${id}.header`, type: timelineAuthorTypes.header, value: { kind: "inline", value: { id, at, ...(element.attributes.end === undefined ? {} : { end: textAttribute(element, "end") }) } }, range: element.range }],
    fragments: [fragment],
    components: [{ id, fragment: fragment.id, inputs: {
      clock: clock.ref,
      header: { kind: "record", id: `${id}.header` },
      ...Object.fromEntries(takes.map((take, index) => [inputs[index]!.takeName, take.ref])),
    }, outputs: { timeline: `${id}.timeline` }, range: element.range }],
    exports: [`${id}.timeline`],
  };
};
