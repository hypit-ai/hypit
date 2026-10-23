import { sameType } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { resolveTemporalContext } from "@hypit/temporal/markup";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/hypit/markup";

import { createFilmAssemblyFragment } from "./fragment.js";
import { filmTypes } from "./manifest.js";
import { sealFilmProgram } from "./program.js";
import { filmAppearanceFromRecipe } from "./recipe.js";
import type { FilmTrackInput, FilmVisualPlanMember } from "./types.js";

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

function recipe(reference: SurfaceResolvedReference, label: string): Recipe {
  if (!sameType(reference.type, recipeType)) throw new Error(`${label} must reference an SVS Recipe`);
  const value = reference.record?.value;
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must reference an authored Recipe value`);
  }
  return value as unknown as Recipe;
}

function trackKind(reference: SurfaceResolvedReference): "visual" | "audio" {
  if (sameType(reference.type, compositionTypes.visualTrack)) return "visual";
  if (sameType(reference.type, compositionTypes.audioTrack)) return "audio";
  throw new Error(`Film Track ${reference.path} must be a VisualTrack or AudioTrack`);
}

export const decodeFilmSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "canvas", "timeline", "appearance"]);
  const id = stringAttribute(element, "id");
  const canvas = requiredReference(element, "canvas", resolveReference);
  if (!sameType(canvas.type, spatialTypes.canvas)) {
    throw new Error(`${element.name}.canvas must reference Canvas`);
  }
  const context = resolveTemporalContext({ element, resolveReference });
  const appearanceReference = requiredReference(element, "appearance", resolveReference);
  const appearance = filmAppearanceFromRecipe(
    recipe(appearanceReference, `${element.name}.appearance`).properties,
  );

  const tracks: Array<FilmTrackInput & { readonly source: SurfaceResolvedReference }> = [];
  const audio: number[] = [];
  const sourceSlots = new Map<string, number>();
  const addTrack = (child: StructuredElement, allowAudio: boolean): FilmVisualPlanMember | undefined => {
    const source = requiredReference(child, "source", resolveReference);
    const kind = trackKind(source);
    exactAttributes(child, kind === "visual" ? ["id", "source"] : ["source"]);
    if (kind === "audio" && !allowAudio) throw new Error(`${child.name} inside Stack must reference VisualTrack`);
    const key = source.ref.kind === "record"
      ? JSON.stringify(["record", source.ref.id])
      : JSON.stringify(["component-output", source.ref.component, source.ref.output]);
    const existingSlot = sourceSlots.get(key);
    if (kind === "audio" && existingSlot !== undefined) {
      throw new Error(`${element.name} cannot include the same AudioTrack more than once; route repeated sound explicitly through Audio Mix`);
    }
    const slot = existingSlot ?? tracks.length;
    if (existingSlot === undefined) {
      sourceSlots.set(key, slot);
      tracks.push({ name: `track-${slot + 1}`, kind, source });
    }
    if (kind === "audio") {
      audio.push(slot);
      return undefined;
    }
    return { kind: "track", id: stringAttribute(child, "id"), slot };
  };
  const visualChildren = (parent: StructuredElement, root: boolean): FilmVisualPlanMember[] => {
    const members: FilmVisualPlanMember[] = [];
    const memberIds = new Set<string>();
    for (const child of parent.children) {
      if (child.kind === "text") {
        if (child.value.trim().length > 0) throw new Error(`${parent.name} accepts only Track and Stack children`);
        continue;
      }
      const tag = localName(child.name);
      if (tag === "Track") {
        const member = addTrack(child, root);
        if (member !== undefined) {
          if (memberIds.has(member.id)) throw new Error(`${parent.name} contains duplicate visual member id ${member.id}`);
          memberIds.add(member.id);
          members.push(member);
        }
        continue;
      }
      if (tag !== "Stack") throw new Error(`${parent.name} accepts only Track and Stack children`);
      exactAttributes(child, ["id"]);
      const stackId = stringAttribute(child, "id");
      if (memberIds.has(stackId)) throw new Error(`${parent.name} contains duplicate visual member id ${stackId}`);
      memberIds.add(stackId);
      const children = visualChildren(child, false);
      if (children.length === 0) throw new Error(`${child.name} requires at least one visual child`);
      members.push({ kind: "stack", id: stackId, members: children });
    }
    return members;
  };
  const visual = { members: visualChildren(element, true) };
  const programId = `${id}.program`;
  const program = sealFilmProgram({
    id,
    clearColor: appearance.clearColor,
    visual,
    audio,
  });
  const fragment = createFilmAssemblyFragment({ name: "@hypit/film/surface-assembly@1", tracks });

  return {
    records: [{
      id: programId,
      type: filmTypes.program,
      value: (program),
      range: element.range,
    }],
    components: [{
      id,
      fragment,
      inputs: {
        program: { kind: "record", id: programId },
        canvas: canvas.ref,
        timeline: context.timeline.ref,
        ...Object.fromEntries(tracks.map((track) => [track.name, track.source.ref])),
      },
      outputs: { composition: `${id}.composition` },
      range: element.range,
    }],
  };
};
