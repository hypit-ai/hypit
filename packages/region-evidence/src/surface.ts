import { sameType } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { timelineTypes } from "@hypit/timeline";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";

import { regionEvidenceFragment } from "./fragment.js";

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}
function reference(element: StructuredElement, name: string, type: SurfaceResolvedReference["type"], resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  const value = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const result = resolve(value.path);
  if (result === undefined || !sameType(result.type, type)) throw new Error(`${element.name}.${name} must reference ${type.name}.`);
  return result;
}

export const decodeRegionEvidenceSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const allowed = ["id", "within", "timeline", "recipe"];
  const unknown = Object.keys(element.attributes).find((name) => !allowed.includes(name));
  if (unknown !== undefined) throw new Error(`${element.name} does not accept ${unknown}.`);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) throw new Error(`${element.name} must be empty.`);
  const id = text(element, "id");
  const within = reference(element, "within", spatialTypes.frame, resolveReference);
  const timeline = reference(element, "timeline", timelineTypes.timeline, resolveReference);
  const recipe = reference(element, "recipe", recipeType, resolveReference);
  return {
    records: [],
    components: [{ id, fragment: regionEvidenceFragment, inputs: {
      within: within.ref, timeline: timeline.ref, recipe: recipe.ref,
    }, outputs: { evidence: id }, range: element.range }],
    exports: [id],
  };
};
