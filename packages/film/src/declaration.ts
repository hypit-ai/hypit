import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { assertVisualProcessEffect, compositionTypes } from "@hypit/composition";
import type { VisualProcessEffect } from "@hypit/composition";
import { spatialTypes } from "@hypit/spatial";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { timelineTypes } from "@hypit/timeline";
import { mediaTypes, SDR_SRGB_WORKING_PICTURE } from "@hypit/media";
import type { WorkingPictureSpec } from "@hypit/media";

import { createFilmAssemblyFragment } from "./fragment.js";
import { filmModuleRef, filmTypes } from "./manifest.js";
import { sealFilmProgram } from "./program.js";
import { filmAppearanceFromRecipe } from "./recipe.js";
import type { FilmTrackInput, FilmVisualPlanMember } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string): string {
  const value = field(node, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

async function resolved(
  node: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

async function trackReference(
  node: AuthorDeclarationChild,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, "source");
  if (value?.kind !== "reference") throw new Error(`${node.name}.source must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || (!sameType(reference.type, compositionTypes.visualTrack)
    && !sameType(reference.type, compositionTypes.audioTrack))) {
    throw new Error(`Film Track ${value.path} must be a VisualTrack or AudioTrack.`);
  }
  return reference;
}

function referenceKey(reference: AuthorResolvedReference): string {
  return reference.ref.kind === "record"
    ? JSON.stringify(["record", reference.ref.id])
    : JSON.stringify(["component-output", reference.ref.component, reference.ref.output]);
}

function outputBinding(component: string): AuthorDeclarationBinding {
  return {
    name: `${component}.composition`,
    ref: { kind: "component-output", component, output: "composition" },
    type: compositionTypes.composition,
  };
}

export const filmAuthorDeclaration: AuthorDeclarationCompiler = {
  module: filmModuleRef,
  declaration: "film",
  outputs: [filmTypes.program, compositionTypes.composition],
  shape: {
    summary: "Assembles recursive visual scopes and root audio signals into one Composition.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Film component." },
      { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas], summary: "Selects the Canvas." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the absolute Timeline." },
      { name: "appearance", kind: "reference", required: true, accepts: [recipeType], summary: "Selects the Film appearance Recipe." },
      { name: "picture", kind: "reference", required: false, accepts: [mediaTypes.workingPicture],
        summary: "Selects an explicit working picture; omitted Films use the SDR sRGB working picture." },
    ],
    children: { group: "members" },
    childGroups: {
      members: [{
        name: "Track",
        cardinality: "many",
        summary: "Places one VisualTrack or adds one root AudioTrack.",
        fields: [
          { name: "id", kind: "identifier", required: false, summary: "Names a visual occurrence." },
          { name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack], summary: "Selects the Track value." },
        ],
      }, {
        name: "Stack",
        cardinality: "many",
        summary: "Closes one recursively nested visual scope.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the visual scope occurrence." }],
        children: { group: "members" },
      }, {
        name: "Process",
        cardinality: "many",
        summary: "Combines named visual input scopes through one package-owned Picture process.",
        fields: [
          { name: "id", kind: "identifier", required: true, summary: "Names the visual Process occurrence." },
          { name: "effect", kind: "reference", required: true, accepts: [compositionTypes.visualProcessEffect],
            summary: "Selects the package-owned Process effect and its named input contract." },
        ],
        children: { group: "inputs" },
      }],
      inputs: [{
        name: "Input",
        cardinality: "many",
        summary: "Supplies one named, recursively composed Picture input.",
        fields: [{ name: "name", kind: "literal", required: true, summary: "Selects one effect input port." }],
        children: { group: "members" },
      }],
    },
  },
  bindings(declaration) {
    return [outputBinding(literal(declaration, "id"))];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const canvas = await resolved(declaration, "canvas", spatialTypes.canvas, resolveReference);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const appearanceReference = await resolved(declaration, "appearance", recipeType, resolveReference);
    const appearanceValue = appearanceReference.record?.value;
    if (appearanceValue === undefined || appearanceValue === null || Array.isArray(appearanceValue)
      || typeof appearanceValue !== "object") {
      throw new Error(`${declaration.name}.appearance must reference an authored Recipe value.`);
    }
    const appearance = filmAppearanceFromRecipe((appearanceValue as unknown as Recipe).properties);
    const pictureValue = field(declaration, "picture");
    let picture: WorkingPictureSpec = structuredClone(SDR_SRGB_WORKING_PICTURE);
    if (pictureValue !== undefined) {
      const pictureReference = await resolved(declaration, "picture", mediaTypes.workingPicture, resolveReference);
      if (pictureReference.record?.value === undefined) {
        throw new Error(`${declaration.name}.picture must reference an authored WorkingPicture value.`);
      }
      picture = structuredClone(pictureReference.record.value as unknown as WorkingPictureSpec);
    }

    const tracks: Array<FilmTrackInput & { readonly source: AuthorResolvedReference }> = [];
    const audio: number[] = [];
    const sourceSlots = new Map<string, number>();
    const addTrack = async (
      child: AuthorDeclarationChild,
      allowAudio: boolean,
    ): Promise<FilmVisualPlanMember | undefined> => {
      const source = await trackReference(child, resolveReference);
      const kind = sameType(source.type, compositionTypes.visualTrack) ? "visual" : "audio";
      const occurrence = field(child, "id");
      if (kind === "visual" && occurrence === undefined) throw new Error("Track requires exactly id, source.");
      if (kind === "audio" && occurrence !== undefined) throw new Error("Track requires exactly source.");
      if (kind === "audio" && !allowAudio) throw new Error("Track inside a visual member must reference VisualTrack.");
      const key = referenceKey(source);
      const existingSlot = sourceSlots.get(key);
      if (kind === "audio" && existingSlot !== undefined) {
        throw new Error("Film cannot include the same AudioTrack more than once; route repeated sound explicitly through Audio Mix.");
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
      return { kind: "track", id: literal(child, "id"), slot };
    };
    const visualChildren = async (
      children: readonly AuthorDeclarationChild[],
      root: boolean,
      subject: string,
    ): Promise<FilmVisualPlanMember[]> => {
      const members: FilmVisualPlanMember[] = [];
      const memberIds = new Set<string>();
      for (const child of children) {
        if (child.name === "Track") {
          const member = await addTrack(child, root);
          if (member !== undefined) {
            if (memberIds.has(member.id)) throw new Error(`${subject} contains duplicate visual member id ${member.id}.`);
            memberIds.add(member.id);
            members.push(member);
          }
          continue;
        }
        const memberId = literal(child, "id");
        if (memberIds.has(memberId)) throw new Error(`${subject} contains duplicate visual member id ${memberId}.`);
        memberIds.add(memberId);
        if (child.name === "Stack") {
          const nested = await visualChildren(child.children, false, child.name);
          if (nested.length === 0) throw new Error(`${child.name} requires at least one visual child.`);
          members.push({ kind: "stack", id: memberId, members: nested });
          continue;
        }
        if (child.name !== "Process") throw new Error(`${subject} contains unsupported visual member ${child.name}.`);
        const effectReference = await resolved(child, "effect", compositionTypes.visualProcessEffect, resolveReference);
        const effectValue = effectReference.record?.value;
        if (effectValue === undefined || effectValue === null || Array.isArray(effectValue)
          || typeof effectValue !== "object") {
          throw new Error(`${child.name}.effect must reference an authored VisualProcessEffect.`);
        }
        const effect = structuredClone(effectValue) as unknown as VisualProcessEffect;
        assertVisualProcessEffect(effect, `${child.name}.effect`);
        const inputs: { readonly name: string; readonly members: readonly FilmVisualPlanMember[] }[] = [];
        const inputNames = new Set<string>();
        for (const input of child.children) {
          if (input.name !== "Input") throw new Error(`${child.name} contains unsupported child ${input.name}.`);
          const name = literal(input, "name");
          if (inputNames.has(name)) throw new Error(`${child.name} repeats Input ${name}.`);
          inputNames.add(name);
          const inputMembers = await visualChildren(input.children, false, input.name);
          if (inputMembers.length === 0) throw new Error(`${input.name} ${name} requires at least one visual child.`);
          inputs.push({ name, members: inputMembers });
        }
        if (inputNames.size !== effect.inputs.length || effect.inputs.some((name) => !inputNames.has(name))) {
          throw new Error(`${child.name} inputs must exactly match ${effect.inputs.join(", ")}.`);
        }
        members.push({ kind: "process", id: memberId, inputs, effect });
      }
      return members;
    };
    const visual = { members: await visualChildren(declaration.children, true, declaration.name) };
    const programId = `${id}.program`;
    return {
      records: [{
        id: programId,
        type: filmTypes.program,
        value: sealFilmProgram({ id, clearColor: appearance.clearColor,
          picture, visual, audio }),
        range: declaration.range,
      }],
      components: [{
        id,
        fragment: createFilmAssemblyFragment({
          name: "@hypit/film/declaration-assembly@1",
          tracks,
        }),
        inputs: {
          program: { kind: "record", id: programId },
          canvas: canvas.ref,
          timeline: timeline.ref,
          ...Object.fromEntries(tracks.map((track) => [track.name, track.source.ref])),
        },
        outputs: { composition: `${id}.composition` },
        range: declaration.range,
      }],
    };
  },
};

export const filmAuthorDeclarations = [filmAuthorDeclaration] as const;

export const filmMarkupDeclarations = [{ name: "film", tag: "Film" }] as const;
