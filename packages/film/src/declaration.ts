import { parseTemporalRate, parseTemporalDuration } from "@hypit/temporal";
import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { assertVisualScopeTransform, assertVisualProcessEffect, compositionTypes } from "@hypit/composition";
import type { VisualScopeTransform, VisualProcessEffect } from "@hypit/composition";
import { assertSourceCrop, type SourceCrop, spatialTypes } from "@hypit/spatial";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { compoundKeyframes } from "./compound-motion.js";
import { createFilmAssemblyFragment } from "./fragment.js";
import { filmModuleRef, filmTypes } from "./manifest.js";
import { sealFilmProgram } from "./program.js";
import { filmAppearanceFromRecipe } from "./recipe.js";
import type { FilmGroup, FilmLink, FilmTrackInput, FilmVisualPlanMember } from "./types.js";

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

function compoundTransform(node: AuthorDeclarationChild): VisualScopeTransform | undefined {
  const pose = node.children.find(child => child.name === 'Pose');
  if (!pose) return undefined;
  const number = (name: string, fallback: number) => field(pose, name) ? Number(literal(pose, name)) : fallback;
  const value = { x: number('x', 0), y: number('y', 0), scaleX: number('scale-x', number('scale', 1)), scaleY: number('scale-y', number('scale', 1)), rotation: number('rotate', 0), opacity: number('opacity', 1), originX: number('origin-x', .5), originY: number('origin-y', .5) };
  assertVisualScopeTransform(value);
  return value;
}

function compoundCrop(node: AuthorDeclarationChild): SourceCrop | undefined {
  const crop = node.children.find(child => child.name === 'Crop');
  if (!crop) return undefined;
  const number = (name: string, fallback?: number) => field(crop, name) ? Number(literal(crop, name)) : fallback!;
  const value = { x: number('x'), y: number('y'), width: number('width'), height: number('height'), zoom: number('zoom', 1), rotation: number('rotate', 0) };
  assertSourceCrop(value);
  return value;
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
    ],
    children: { group: "members" },
    childGroups: {
      members: [{
        name: "Group",
        cardinality: "many",
        summary: "Selects and moves clips together while retaining their Track placement.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the selection group." }],
        children: { group: "grouped-clips" },
      }, {
        name: "Link",
        cardinality: "many",
        summary: "Groups Track clips for coordinated editing within this Film.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the editing group." }],
        children: { group: "linked-clips" },
      }, {
        name: "Track",
        cardinality: "many",
        summary: "Places one VisualTrack or adds one root AudioTrack.",
        fields: [
          { name: "id", kind: "identifier", required: false, summary: "Names a visual occurrence." },
          { name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack], summary: "Selects the Track value." },
        ],
      }, {
        name: "Compound",
        cardinality: "many",
        summary: "Places a referenced audiovisual Composition on this Timeline.",
        children: { group: "compound-picture" },
        fields: [
          { name: "id", kind: "identifier", required: true, summary: "Names this Compound occurrence." },
          { name: "source", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the local Composition." },
          { name: "during", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects the parent placement interval." },
          { name: "from", kind: "reference", required: true, accepts: [temporalTypes.instant], summary: "Selects the source position on the local Timeline." },
          { name: "rate", kind: "literal", required: false, summary: "Sets a positive source-to-parent playback rate." },
          { name: "source-offset", kind: "literal", required: false, summary: "Adds an exact duration to the source Instant." },
        ],
      }, {
        name: "Stack",
        cardinality: "many",
        summary: "Closes one recursively nested visual scope.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the visual scope occurrence." }],
        children: { group: "members" },
      }, {
        name: "Transition", cardinality: "many", summary: "Transitions between adjacent Compound or Track Clip pictures.",
        fields: [
          { name: "id", kind: "identifier", required: true, summary: "Names this transition." },
          { name: "outgoing", kind: "literal", required: true, summary: "Selects the outgoing Compound ID or Track occurrence/Clip path." },
          { name: "incoming", kind: "literal", required: true, summary: "Selects the incoming Compound ID or Track occurrence/Clip path." },
          { name: "for", kind: "literal", required: true, summary: "Sets the centered transition duration in frames." },
          { name: "effect", kind: "reference", required: true, accepts: [compositionTypes.visualProcessEffect], summary: "Selects a process with outgoing and incoming picture inputs." },
        ],
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
      "compound-picture": [{
        name: "Pose", cardinality: "optional", summary: "Transforms the complete compound picture in its parent Canvas.",
        fields: ["x", "y", "scale", "scale-x", "scale-y", "rotate", "opacity", "origin-x", "origin-y"].map(name => ({ name, kind: "literal" as const, required: false, summary: `Supplies the compound Pose ${name} parameter.` })),
      }, {
        name: "Keyframe", cardinality: "many", summary: "Animates one compound transform property on its local occurrence clock.",
        fields: [
          { name: "property", kind: "literal", required: true, summary: "Selects x, y, scale-x, scale-y, rotate or opacity." },
          { name: "at", kind: "literal", required: true, summary: "Sets a local frame, start, end or percentage." },
          { name: "value", kind: "literal", required: true, summary: "Sets the property value." },
          { name: "easing", kind: "literal", required: false, summary: "Sets interpolation to the next keyframe." },
        ],
      }, {
        name: "Effect", cardinality: "many", summary: "Applies an ordered unary process to this complete picture.", fields: [{ name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualProcessEffect], summary: "Selects a process with one content input." }, { name: "enabled", kind: "literal", required: false, values: ["true", "false"], summary: "Includes this effect in the picture." }],
      }, {
        name: "Crop", cardinality: "optional", summary: "Selects a normalized region of the local Canvas before its outer Pose.",
        fields: ["x", "y", "width", "height", "zoom", "rotate"].map(name => ({ name, kind: "literal" as const, required: ["x", "y", "width", "height"].includes(name), summary: `Supplies the compound Crop ${name} parameter.` })),
      }],
      "grouped-clips": [{
        name: "Member", cardinality: "many", summary: "Identifies a Track clip.",
        fields: [
          { name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack], summary: "Selects a Track included in this Film." },
          { name: "clip", kind: "literal", required: true, summary: "Selects a clip in that Track." },
        ],
      }, {
        name: "Occurrence", cardinality: "many", summary: "Identifies a visual Track or Compound occurrence.",
        fields: [{ name: "path", kind: "literal", required: true, summary: "Selects a slash-separated Compound path through this Film's visual scopes." }],
      }],
      "linked-clips": [{
        name: "Member",
        cardinality: "many",
        summary: "Identifies one clip in a Film Track input.",
        fields: [
          { name: "source", kind: "reference", required: true, accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack], summary: "Selects a Track included in this Film." },
          { name: "clip", kind: "literal", required: true, summary: "Selects the clip identity within the Track." },
        ],
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
    const tracks: Array<FilmTrackInput & { readonly source: AuthorResolvedReference; readonly during?: AuthorResolvedReference; readonly from?: AuthorResolvedReference }> = [];
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
        if (child.name === "Link" || child.name === "Group") {
          if (!root) throw new Error(`${child.name} must be declared directly inside Film.`);
          continue;
        }
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
        if (child.name === "Transition") {
          const duration = /^(\d+)f$/.exec(literal(child, 'for'));
          if (!duration || !Number.isSafeInteger(Number(duration[1])) || Number(duration[1]) < 1) throw new Error('Transition.for requires a positive frame duration.');
          const effect = await resolved(child, 'effect', compositionTypes.visualProcessEffect, resolveReference);
          if (!effect.record) throw new Error('Transition.effect must reference an authored picture process.');
          members.push({ kind: 'transition', id: memberId, outgoing: literal(child, 'outgoing'), incoming: literal(child, 'incoming'), durationFrames: Number(duration[1]), effect: structuredClone(effect.record.value) as unknown as VisualProcessEffect });
          continue;
        }
        if (child.name === "Compound") {
          const source = await resolved(child, 'source', compositionTypes.composition, resolveReference);
          const during = await resolved(child, 'during', temporalTypes.window, resolveReference);
          const from = await resolved(child, 'from', temporalTypes.instant, resolveReference);
          const slot = tracks.length;
          tracks.push({ name: `track-${slot + 1}`, kind: 'compound', source, during, from });
          const effects = await Promise.all(child.children.filter(node => node.name === "Effect" && (!field(node, "enabled") || literal(node, "enabled") !== "false")).map(async node => { const value = await resolved(node, "source", compositionTypes.visualProcessEffect, resolveReference); if (!value.record) throw new Error("Effect.source requires an authored process."); return structuredClone(value.record.value) as unknown as VisualProcessEffect; }));
          const transform = compoundTransform(child), crop = compoundCrop(child), keyframes = compoundKeyframes(child);
          members.push({ kind: 'compound', id: memberId, slot, rate: parseTemporalRate(field(child, 'rate') ? literal(child, 'rate') : '1', 'Compound rate'), ...(field(child, 'source-offset') ? { sourceOffset: parseTemporalDuration(literal(child, 'source-offset'), 'Compound source offset') } : {}), ...(effects.length ? { effects } : {}), ...(keyframes ? { keyframes } : {}), ...(transform ? { transform } : {}), ...(crop ? { crop } : {}) });
          continue;
        }
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
    const links: FilmLink[] = [];
    for (const link of declaration.children.filter(child => child.name === 'Link')) {
      const members: { slot: number; clip: string }[] = [];
      for (const member of link.children) {
        const source = await trackReference(member, resolveReference);
        const slot = sourceSlots.get(referenceKey(source));
        if (slot === undefined) throw new Error('Link Member must reference a Track included in this Film.');
        members.push({ slot, clip: literal(member, 'clip') });
      }
      links.push({ id: literal(link, 'id'), members });
    }
    const occurrences = new Map<string, number>();
    const indexOccurrences = (members: readonly FilmVisualPlanMember[], prefix: string[] = []) => {
      for (const member of members) {
        const path = [...prefix, member.id];
        if (member.kind === 'compound' || member.kind === 'track') occurrences.set(path.join('/'), member.slot);
        if (member.kind === 'stack') indexOccurrences(member.members, path);
        if (member.kind === 'process') for (const input of member.inputs) indexOccurrences(input.members, [...path, input.name]);
      }
    };
    indexOccurrences(visual.members);
    const groups: FilmGroup[] = [];
    for (const group of declaration.children.filter(child => child.name === 'Group')) {
      const members: FilmGroup['members'][number][] = [];
      for (const member of group.children) {
        if (member.name === 'Occurrence') {
          const occurrence = literal(member, 'path'), slot = occurrences.get(occurrence);
          if (slot === undefined) throw new Error('Group Occurrence must identify a visual Track or Compound in this Film.');
          members.push({ slot, occurrence });
        } else {
          const source = await trackReference(member, resolveReference);
          const slot = sourceSlots.get(referenceKey(source));
          if (slot === undefined) throw new Error('Group Member must reference a Track included in this Film.');
          members.push({ slot, clip: literal(member, 'clip') });
        }
      }
      groups.push({ id: literal(group, 'id'), members });
    }
    const programId = `${id}.program`;
    return {
      records: [{
        id: programId,
        type: filmTypes.program,
        value: sealFilmProgram({ id, clearColor: appearance.clearColor, visual, audio, ...(links.length ? { links } : {}), ...(groups.length ? { groups } : {}) }),
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
          ...Object.fromEntries(tracks.flatMap((track) => [[track.name, track.source.ref], ...(track.during && track.from ? [[`${track.name}:during`, track.during.ref], [`${track.name}:from`, track.from.ref]] : [])])),
        },
        outputs: { composition: `${id}.composition` },
        range: declaration.range,
      }],
    };
  },
};

export const filmAuthorDeclarations = [filmAuthorDeclaration] as const;

export const filmMarkupDeclarations = [{ name: "film", tag: "Film" }] as const;
