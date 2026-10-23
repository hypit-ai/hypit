import { sealVisualAdjustmentHeader } from "./program.js";
import { visualAdjustmentSpecFromRecipe } from "./appearance.js";
import { createVisualAdjustmentFragment } from "./fragment.js";
import { visualAdjustmentTypes } from "./manifest.js";
import { sameType } from "@hypit/hypit/protocol";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { assertAttributes, textAttribute } from "@hypit/hypit/markup";
import { resolveTemporalContext, resolveTemporalWindowReference, temporalWindowAttributeNames } from "@hypit/temporal/markup";

function recipe(reference: SurfaceResolvedReference, label: string): Recipe {
  if (!sameType(reference.type, recipeType)) throw new Error(`${label} must reference an SVS Recipe.`);
  const value = reference.record?.value;
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must reference an authored Recipe value.`);
  }
  return value as unknown as Recipe;
}

function resolvedRecipe(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): Recipe {
  const attribute = element.attributes.appearance;
  if (typeof attribute !== "object" || attribute.kind !== "reference") {
    throw new Error(`${element.name}.appearance must be a Recipe reference.`);
  }
  const resolved = resolveReference(attribute.path);
  if (resolved === undefined) throw new Error(`${element.name}.appearance cannot resolve ${attribute.path}.`);
  return recipe(resolved, `${element.name}.appearance`);
}

function integer(element: StructuredElement, name: string): number {
  const source = textAttribute(element, name);
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(source)) throw new Error(`${element.name}.${name} must be an integer.`);
  const value = Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} exceeds safe integer arithmetic.`);
  return value;
}

export const decodeVisualAdjustmentSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline"]);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const records = [{ id: `${id}.header`, type: visualAdjustmentTypes.header,
    value: sealVisualAdjustmentHeader({ id }), range: element.range }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
    header: { kind: "record", id: `${id}.header` }, timeline: context.timeline.ref,
  };
  let count = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Adjustment children.`);
      continue;
    }
    if (!child.name.endsWith(":Adjustment") && child.name !== "Adjustment") {
      throw new Error(`${element.name} accepts only Adjustment children.`);
    }
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) {
      throw new Error(`${child.name} must be empty.`);
    }
    assertAttributes(child, ["id", "appearance", ...temporalWindowAttributeNames]);
    count += 1;
    const suffix = String(count).padStart(4, "0");
    const subjectId = textAttribute(child, "id");
    const specId = `${id}.adjustment.${suffix}.spec`;
    const window = resolveTemporalWindowReference({ element: child, resolveReference });
    records.push({ id: specId, type: visualAdjustmentTypes.spec,
      value: visualAdjustmentSpecFromRecipe(subjectId, resolvedRecipe(child, resolveReference)),
      range: child.range });
    inputs[`spec-${suffix}`] = { kind: "record", id: specId };
    inputs[`window-${suffix}`] = window.ref;
  }
  if (count === 0) throw new Error(`${element.name} requires at least one Adjustment.`);
  return {
    records,
    components: [{ id, fragment: createVisualAdjustmentFragment(count), inputs,
      outputs: { visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.visual`],
  };
};
