import {
  assertCaptionCuePayload,
  replaceCaptionWord,
  retimeCaptionUnit,
  type CaptionCuePayload,
} from "@hypit/caption";
import { canonicalize, type CanonicalValue } from "@hypit/protocol";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type CaptionNleComponentParameters<Family extends string = string> = {
  readonly caption: CaptionCuePayload;
  readonly styleId: string;
  readonly family: Family;
  readonly style: CanonicalValue;
};

/** Small factual edits for one already-materialized Cue Item. */
export type CaptionNleComponentEdit =
  | { readonly kind: "replace-word"; readonly wordId: string; readonly text: string }
  | {
      readonly kind: "retime-unit";
      readonly unitId: string;
      readonly start: ExactTemporalValue;
      readonly end: ExactTemporalValue;
    }
  | { readonly kind: "set-style"; readonly styleId: string; readonly style: CanonicalValue };

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a record.`);
  }
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  if (Object.keys(value).sort().join("\u0000") !== [...fields].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
}

export function assertCaptionNleComponentParameters<Family extends string>(
  value: unknown,
  family: Family,
  duration: ExactTemporalValue,
): asserts value is CaptionNleComponentParameters<Family> {
  const label = "NLE Caption Component parameters";
  record(value, label);
  exactFields(value, ["caption", "family", "style", "styleId"], label);
  if (value.family !== family) throw new Error(`${label} belongs to ${String(value.family)}, not ${family}.`);
  if (typeof value.styleId !== "string" || value.styleId.trim().length === 0) {
    throw new Error(`${label}.styleId is invalid.`);
  }
  assertCaptionCuePayload(value.caption, duration);
  canonicalize(value.style);
}

export function editCaptionNleComponentParameters<Family extends string>(
  parameters: CaptionNleComponentParameters<Family>,
  operation: CaptionNleComponentEdit,
  duration: ExactTemporalValue,
): CaptionNleComponentParameters<Family> {
  assertCaptionNleComponentParameters(parameters, parameters.family, duration);
  record(operation, "NLE Caption Component edit");
  if (operation.kind === "replace-word") {
    exactFields(operation, ["kind", "text", "wordId"], "NLE Caption Component edit");
    if (typeof operation.wordId !== "string" || typeof operation.text !== "string") {
      throw new Error("NLE Caption replace-word edit is invalid.");
    }
    return {
      ...structuredClone(parameters),
      caption: replaceCaptionWord(parameters.caption, operation.wordId, operation.text),
    };
  }
  if (operation.kind === "retime-unit") {
    exactFields(operation, ["end", "kind", "start", "unitId"], "NLE Caption Component edit");
    if (typeof operation.unitId !== "string") throw new Error("NLE Caption retime-unit edit is invalid.");
    return {
      ...structuredClone(parameters),
      caption: retimeCaptionUnit(
        parameters.caption,
        operation.unitId,
        operation.start,
        operation.end,
        duration,
      ),
    };
  }
  if (operation.kind !== "set-style") throw new Error("NLE Caption Component edit.kind is invalid.");
  exactFields(operation, ["kind", "style", "styleId"], "NLE Caption Component edit");
  if (typeof operation.styleId !== "string" || operation.styleId.trim().length === 0) {
    throw new Error("NLE Caption set-style edit.styleId is invalid.");
  }
  return {
    ...structuredClone(parameters),
    styleId: operation.styleId,
    style: canonicalize(operation.style),
  };
}
