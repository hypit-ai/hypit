import type { GenerationRequest } from "@hypit/generation";
import type { PixverseModel } from "./index.js";

/**
 * Reference videos carry the length of the run, so that mode states no duration.
 * Every other mode states its own. `aspectRatio` `auto` takes the shape of the
 * reference videos, so it requires at least one.
 */
export function pixverseRequestValidator(model: PixverseModel): (request: GenerationRequest) => void {
  return (request) => {
    const videos = (request.ports.referenceVideo?.length ?? 0) > 0;
    if (request.ports.aspectRatio?.[0] === "auto" && !videos) {
      throw new Error(`${model} aspectRatio auto requires a reference video`);
    }
    if (videos || request.ports.duration !== undefined) return;
    throw new Error(`${model} requires duration`);
  };
}
