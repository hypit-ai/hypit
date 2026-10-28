import type { ModelFieldRequest } from "@hypit/generation/model-fields";
import type { PixverseModel } from "./index.js";

/**
 * Reference videos carry the length of the run, so that mode states no duration.
 * Every other mode states its own.
 */
export function pixverseRequestValidator(model: PixverseModel): (request: ModelFieldRequest) => void {
  return (request) => {
    if (request.fields.referenceVideo !== undefined || request.fields.duration !== undefined) return;
    throw new Error(`${model} requires duration`);
  };
}
