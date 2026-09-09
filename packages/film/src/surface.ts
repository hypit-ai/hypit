import { createTemporalSpace, resolveTemporalContext } from "@hypit/temporal-markup";
import { spatialTypes } from "@hypit/spatial";
import { compositionTypes } from "@hypit/composition";
import type { AudioTrack, Track, VisualTrack } from "@hypit/composition";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

import { createFilmAssemblyFragment } from "./fragment.js";
import { filmTypes } from "./manifest.js";
import { sealFilmProgram } from "./program.js";
import { filmAppearanceFromRecipe } from "./recipe.js";

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function exactAttributes(element: StructuredElement, names: readonly string[]): void {
  const actual = Object.keys(element.attributes).sort();
  const expected = [...names].sort();
  if (actual.join("\u0000") !== expected.join("\u0000")) {
    throw new Error(`${element.name} requires exactly ${expected.join(", ")}`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value;
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function requiredReference(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referenceAttribute(element, name);
  const resolved = resolve(path);
  if (resolved === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  return resolved;
}

function recipe(reference: SurfaceResolvedReference, label: string): SvsRecipe {
  if (!sameType(reference.type, svsRecipeType)) throw new Error(`${label} must reference an SVS Recipe`);
  const value = reference.record?.value;
  if (value?.kind !== "inline" || value.value === null || Array.isArray(value.value)
    || typeof value.value !== "object") {
    throw new Error(`${label} must reference an authored Recipe value`);
  }
  return value.value as SvsRecipe;
}

function trackChildren(element: StructuredElement): StructuredElement[] {
  const tracks: StructuredElement[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Track children`);
      continue;
    }
    if (localName(child.name) !== "Track") throw new Error(`${element.name} accepts only Track children`);
    exactAttributes(child, ["source"]);
    tracks.push(child);
  }
  if (tracks.length === 0) throw new Error(`${element.name} requires at least one Track`);
  return tracks;
}

function trackKind(reference: SurfaceResolvedReference): "visual" | "audio" {
  if (sameType(reference.type, compositionTypes.visualTrack)) return "visual";
  if (sameType(reference.type, compositionTypes.audioTrack)) return "audio";
  throw new Error(`Film Track ${reference.path} must be a VisualTrack or AudioTrack`);
}

export const decodeFilmSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "canvas", element.attributes.space === undefined ? "semantic" : "space", "appearance"]);
  const id = stringAttribute(element, "id");
  const canvas = requiredReference(element, "canvas", resolveReference);
  if (!sameType(canvas.type, spatialTypes.canvas)) {
    throw new Error(`${element.name}.canvas must reference CanvasSpace`);
  }
  const time = createTemporalSpace({ id, element, ...resolveTemporalContext({ element, resolveReference }) });
  const appearanceReference = requiredReference(element, "appearance", resolveReference);
  const appearance = filmAppearanceFromRecipe(
    recipe(appearanceReference, `${element.name}.appearance`).properties,
  );

  const programId = `${id}.program`;
  const program = sealFilmProgram({

    id,
    clearColor: appearance.clearColor,
  });

  const tracks = trackChildren(element).map((child, index) => {
    const source = requiredReference(child, "source", resolveReference);
    const name = `track-${index + 1}`;
    return { name, kind: trackKind(source), source };
  });
  if (new Set(tracks.map((track) => track.name)).size !== tracks.length) {
    throw new Error(`${element.name} cannot include the same Track more than once`);
  }
  const fragment = createFilmAssemblyFragment({ name: "@hypit/film/surface-assembly@1", tracks });

  return {
    records: [{
      id: programId,
      type: filmTypes.program,
      value: { kind: "inline", value: program },
      range: element.range,
    }],
    components: [...time.components, {
      id,
      fragment: fragment.id,
      inputs: {
        program: { kind: "record", id: programId },
        canvas: canvas.ref,
        space: time.space.ref,
        ...Object.fromEntries(tracks.map((track) => [track.name, track.source.ref])),
      },
      outputs: { composition: `${id}.composition` },
      range: element.range,
    }],
    fragments: [...time.fragments, fragment],
  };
};
