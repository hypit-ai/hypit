import type { GenerationRequest } from "@hypit/generation";
import type { PixverseModel } from "./index.js";

/**
 * Reference videos carry the length of the run, so that mode states no duration.
 * Every other mode states its own.
 */
export function pixverseRequestValidator(model: PixverseModel): (request: GenerationRequest) => void {
  return (request) => {
    if (request.ports.referenceVideo !== undefined || request.ports.duration !== undefined) return;
    throw new Error(`${model} requires duration`);
  };
}
