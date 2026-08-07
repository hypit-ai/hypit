import { contractTypes } from "@narratage/contracts";
import { digestOf } from "@narratage/protocol";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@narratage/text";

import { createFilmAssemblyFragment } from "./fragment.js";
import { filmTypes } from "./manifest.js";
import { sealFilmProgram } from "./program.js";

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
  const value: TextAttributeValue | undefined = element.attributes[name];
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

function numberProperty(value: SvsRecipe, name: string): number {
  const property = value.properties[name];
  if (typeof property !== "number" || !Number.isSafeInteger(property) || property <= 0) {
    throw new Error(`Film Recipe ${name} must be a positive integer`);
  }
  return property;
}

function colorProperty(value: SvsRecipe, name: string): string {
  const property = value.properties[name];
  if (typeof property !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(property)) {
    throw new Error(`Film Recipe ${name} must be a six- or eight-digit hex color`);
  }
  return property;
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
  if (sameType(reference.type, contractTypes.visualTrack)) return "visual";
  if (sameType(reference.type, contractTypes.audioTrack)) return "audio";
  throw new Error(`Film Track ${reference.path} must be a VisualTrack or AudioTrack`);
}

export const decodeFilmSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "space", "appearance"]);
  const id = stringAttribute(element, "id");
  const space = requiredReference(element, "space", resolveReference);
  if (!sameType(space.type, contractTypes.programSpace)) {
    throw new Error(`${element.name}.space must reference ProgramSpace`);
  }
  const appearanceReference = requiredReference(element, "appearance", resolveReference);
  const appearance = recipe(appearanceReference, `${element.name}.appearance`);
  const expectedProperties = ["background", "frame-rate", "height", "width"];
  const actualProperties = Object.keys(appearance.properties).sort();
  if (actualProperties.join("\u0000") !== expectedProperties.join("\u0000")) {
    throw new Error(`Film Recipe requires exactly ${expectedProperties.join(", ")}`);
  }

  const programId = `${id}.program`;
  const program = sealFilmProgram({
    contract: "svml.film-program@1",
    id,
    frameRate: { numerator: numberProperty(appearance, "frame-rate"), denominator: 1 },
    canvas: {
      width: numberProperty(appearance, "width"),
      height: numberProperty(appearance, "height"),
      clearColor: colorProperty(appearance, "background"),
    },
  });

  const tracks = trackChildren(element).map((child) => {
    const source = requiredReference(child, "source", resolveReference);
    const name = `track-${digestOf({ ref: source.ref, type: source.type }).slice("sha256:".length, 28)}`;
    return { name, kind: trackKind(source), source };
  });
  if (new Set(tracks.map((track) => track.name)).size !== tracks.length) {
    throw new Error(`${element.name} cannot include the same Track more than once`);
  }
  const fragment = createFilmAssemblyFragment({ name: "@narratage/film/surface-assembly@1", tracks });

  return {
    records: [{
      id: programId,
      type: filmTypes.program,
      value: { kind: "inline", value: program },
      range: element.range,
    }],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        program: { kind: "record", id: programId },
        space: space.ref,
        ...Object.fromEntries(tracks.map((track) => [track.name, track.source.ref])),
      },
      outputs: { composition: `${id}.composition` },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
