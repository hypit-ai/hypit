import {
  assertCaptionCuePayload,
  removeCaptionWordAttribute,
  replaceCaptionWord,
  retimeCaptionUnit,
  setCaptionWordAttribute,
  type CaptionCuePayload,
} from "@hypit/caption";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type CaptionNleComponentParameters = {
  readonly caption: CaptionCuePayload;
};

/** Small factual edits for one already-materialized Cue Item. */
export type CaptionNleComponentEdit =
  | { readonly kind: "replace-word"; readonly wordId: string; readonly text: string }
  | {
      readonly kind: "set-word-attribute";
      readonly wordId: string;
      readonly name: string;
      readonly value: string | number | boolean;
    }
  | { readonly kind: "remove-word-attribute"; readonly wordId: string; readonly name: string }
  | {
      readonly kind: "retime-unit";
      readonly unitId: string;
      readonly start: ExactTemporalValue;
      readonly end: ExactTemporalValue;
    };

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

export function assertCaptionNleComponentParameters(
  value: unknown,
  duration: ExactTemporalValue,
): asserts value is CaptionNleComponentParameters {
  const label = "NLE Caption Component parameters";
  record(value, label);
  exactFields(value, ["caption"], label);
  assertCaptionCuePayload(value.caption, duration);
}

export function editCaptionNleComponentParameters(
  parameters: CaptionNleComponentParameters,
  operation: CaptionNleComponentEdit,
  duration: ExactTemporalValue,
): CaptionNleComponentParameters {
  assertCaptionNleComponentParameters(parameters, duration);
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
  if (operation.kind === "set-word-attribute") {
    exactFields(operation, ["kind", "name", "value", "wordId"], "NLE Caption Component edit");
    if (typeof operation.wordId !== "string"
      || typeof operation.name !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/u.test(operation.name)
      || !(typeof operation.value === "string" || typeof operation.value === "boolean"
        || typeof operation.value === "number" && Number.isFinite(operation.value))) {
      throw new Error("NLE Caption set-word-attribute edit is invalid.");
    }
    return {
      ...structuredClone(parameters),
      caption: setCaptionWordAttribute(parameters.caption, operation.wordId, {
        name: operation.name,
        value: operation.value,
      }),
    };
  }
  if (operation.kind === "remove-word-attribute") {
    exactFields(operation, ["kind", "name", "wordId"], "NLE Caption Component edit");
    if (typeof operation.wordId !== "string"
      || typeof operation.name !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/u.test(operation.name)) {
      throw new Error("NLE Caption remove-word-attribute edit is invalid.");
    }
    return {
      ...structuredClone(parameters),
      caption: removeCaptionWordAttribute(parameters.caption, operation.wordId, operation.name),
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
  throw new Error("NLE Caption Component edit.kind is invalid.");
}
