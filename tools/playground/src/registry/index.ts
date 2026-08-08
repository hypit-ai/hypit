import type { CanonicalValue } from "../svml.js";
import { captionComponent } from "./caption.js";
import { textTrackComponent } from "./text-track.js";
import type { PreviewComponent } from "./types.js";

export type { BuildInput, FieldHint, PreviewComponent } from "./types.js";

export const REGISTRY: readonly PreviewComponent[] = [
  captionComponent,
  textTrackComponent,
];

export function componentById(id: string): PreviewComponent | undefined {
  return REGISTRY.find((component) => component.id === id);
}

/** Joined on a separator no CSS-like property name can contain. */
function keySet(names: readonly string[]): string {
  return [...names].sort().join("\u0000");
}

/**
 * Finds the component a Recipe describes.
 *
 * By exact property key set, which is what every Surface handler in the
 * compiler matches on. A Recipe's dotted path is a label: `caption.dialogue`
 * and `caption.short-cues` share a prefix and describe unrelated things.
 */
export function matchRecipe(
  properties: Readonly<Record<string, CanonicalValue>>,
): PreviewComponent | undefined {
  const wanted = keySet(Object.keys(properties));
  return REGISTRY.find((component) =>
    component.recipeKeys !== undefined && keySet(component.recipeKeys) === wanted);
}
