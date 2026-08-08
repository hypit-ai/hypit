import { matchRecipe } from "../registry/index.js";
import type { PreviewComponent } from "../registry/index.js";
import { maskSourceHeader, parseSourceHeader, parseSvs } from "../svml.js";
import type { CanonicalValue } from "../svml.js";

/** The Film Recipe key set, from packages/film/src/surface.ts. */
const FILM_KEYS = ["background", "frame-rate", "height", "width"];

export type CanvasOffer = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly clearColor: string;
};

export type PreviewSubject = {
  readonly key: string;
  readonly path: string;
  readonly component: PreviewComponent;
  readonly parameters: CanonicalValue;
  readonly content: CanonicalValue;
};

export type Discovery = {
  readonly sheetId: string | undefined;
  readonly subjects: readonly PreviewSubject[];
  /** Film Recipes are not previewable; they say how big the frame is. */
  readonly canvases: readonly CanvasOffer[];
  /** Everything else, named so the gaps are visible rather than silent. */
  readonly unmatched: readonly { readonly path: string; readonly keys: readonly string[] }[];
};

function keySet(names: readonly string[]): string {
  return [...names].sort().join("\u0000");
}

function numberOf(value: CanonicalValue | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Reads a stylesheet as a list of things to preview.
 *
 * A sheet is a discovery source, never a dependency: what it produces is form
 * values, and from that point the form is the only source of truth. An
 * unmatched Recipe is reported rather than dropped — `font.*` and
 * `caption.short-cues` are real Recipes the playground simply cannot draw, and
 * saying so is more useful than showing nothing.
 */
export function discover(name: string, source: string): Discovery {
  // The Source Header is mandatory and is not the sheet. Masking it rather than
  // slicing it is what the compiler does: every offset a Recipe reports still
  // points at the right place in the file the author is looking at.
  const header = parseSourceHeader(name, source);
  if (!header.using.startsWith("@narratage/svs@")) {
    throw new Error(`${name} is a ${header.using} source, not a stylesheet.`);
  }
  const sheet = parseSvs(name, maskSourceHeader(source, header));
  const subjects: PreviewSubject[] = [];
  const canvases: CanvasOffer[] = [];
  const unmatched: { path: string; keys: readonly string[] }[] = [];

  for (const [index, parsed] of sheet.recipes.entries()) {
    const recipe = parsed.value;
    const keys = Object.keys(recipe.properties);

    if (keySet(keys) === keySet(FILM_KEYS)) {
      canvases.push({
        path: recipe.path,
        width: numberOf(recipe.properties["width"], 1080),
        height: numberOf(recipe.properties["height"], 1920),
        fps: numberOf(recipe.properties["frame-rate"], 30),
        clearColor: String(recipe.properties["background"] ?? "#000000"),
      });
      continue;
    }

    const component = matchRecipe(recipe.properties);
    if (component === undefined || component.fromRecipe === undefined) {
      unmatched.push({ path: recipe.path, keys: [...keys].sort() });
      continue;
    }
    subjects.push({
      key: `${index}:${recipe.path}`,
      path: recipe.path,
      component,
      parameters: component.fromRecipe(recipe.properties),
      content: component.defaults().content,
    });
  }

  return {
    ...(sheet.id === undefined ? { sheetId: undefined } : { sheetId: sheet.id }),
    subjects,
    canvases,
    unmatched,
  };
}
