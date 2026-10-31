import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import type { AudioReconstructionProgram } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import {
  assertTemporalRelationSpec,
  parseTemporalCubicRelationFields,
  parseTemporalDuration,
  parseTemporalRelationFields,
  temporalCubicRelationFieldNames,
  temporalRelationFieldNames,
  temporalTypes,
  type TemporalCubicRelationLiteralFields,
  type TemporalRelationLiteralFields,
  type TemporalRelationSpec,
} from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { createAudioTrackFragment } from "./fragment.js";
import { audioTrackModuleRef, audioTrackTypes } from "./manifest.js";
import { sealAudioClipSpec, sealAudioTrackHeader } from "./program.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string, fallback?: string): string {
  const value = field(node, name);
  if (value === undefined && fallback !== undefined) return fallback;
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

function authoredReconstruction(reference: AuthorResolvedReference, label: string): AudioReconstructionProgram {
  const value = reference.record?.value;
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must reference an authored Audio Reconstruction.`);
  }
  return value as unknown as AudioReconstructionProgram;
}

function numeric(node: DeclarationNode, name: string, fallback: number): number {
  const raw = field(node, name);
  if (raw === undefined) return fallback;
  const value = Number(raw.kind === "literal" ? raw.value : Number.NaN);
  if (!Number.isFinite(value)) throw new Error(`${node.name}.${name} must be a finite number.`);
  return value;
}

function relation(child: AuthorDeclarationChild): ReturnType<typeof parseTemporalRelationFields> {
  if (child.name === "Curve") {
    const fields = Object.fromEntries(temporalCubicRelationFieldNames
      .filter((name) => field(child, name) !== undefined).map((name) => [name, literal(child, name)]));
    return parseTemporalCubicRelationFields(fields as TemporalCubicRelationLiteralFields, child.name);
  }
  const fields: Partial<Record<typeof temporalRelationFieldNames[number], string>> = {};
  for (const name of temporalRelationFieldNames) {
    const value = field(child, name);
    if (value !== undefined) fields[name] = literal(child, name);
  }
  return parseTemporalRelationFields(fields as TemporalRelationLiteralFields, child.name);
}

function outputBinding(component: string, output: "program" | "audio", type: TypeRef): AuthorDeclarationBinding {
  return {
    name: `${component}.${output}`,
    ref: { kind: "component-output", component, output },
    type,
  };
}

export const audioClipDefaults = { gain: 1, "fade-in": "0f", "fade-out": "0f" } as const;

const relationFields = temporalRelationFieldNames.map((name) => ({
  name,
  kind: "literal" as const,
  required: false,
  summary: `Supplies the exact Temporal Map ${name} parameter.`,
}));
const curveFields = temporalCubicRelationFieldNames.map((name) => ({
  name,
  kind: "literal" as const,
  required: name.startsWith("source-"),
  summary: `Supplies the exact cubic Temporal Map ${name} position.`,
}));

export const audioTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: audioTrackModuleRef,
  declaration: "track",
  outputs: [audioTrackTypes.header, audioTrackTypes.clipSpec, audioTrackTypes.program, compositionTypes.audioTrack],
  shape: {
    summary: "Places prepared audio Clips on one completed Timeline.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Audio Track." },
      { name: "muted", kind: "literal", required: false, summary: "Silences the Track while retaining authored Clip gains." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its absolute Timeline." },
    ],
    children: [{
      name: "Clip",
      cardinality: "many",
      summary: "Places one prepared audio occurrence.",
      fields: [
        { name: "id", kind: "identifier", required: false, summary: "Optionally names the Clip occurrence." },
        { name: "source", kind: "reference", required: true, accepts: [mediaTypes.prepared], summary: "Selects prepared audio media." },
        { name: "during", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects its resolved destination Window." },
        { name: "reconstruction", kind: "reference", required: false, accepts: [audioTrackTypes.reconstruction], summary: "Explicitly selects how the sampled occurrence becomes an audible signal." },
        { name: "gain", kind: "literal", required: false, summary: "Supplies linear gain." },
        { name: "fade-in", kind: "literal", required: false, summary: "Supplies an exact fade-in duration." },
        { name: "fade-out", kind: "literal", required: false, summary: "Supplies an exact fade-out duration." },
      ],
      children: [{
        name: "Map",
        cardinality: "many",
        summary: "Adds one exact partial target-to-source temporal relation.",
        fields: relationFields,
      }, {
        name: "Curve",
        cardinality: "many",
        summary: "Adds one exact monotone cubic source-position relation.",
        fields: curveFields,
      }],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [
      outputBinding(id, "program", audioTrackTypes.program),
      outputBinding(id, "audio", compositionTypes.audioTrack),
    ];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const muted = literal(declaration, "muted", "false");
    if (muted !== "true" && muted !== "false") throw new Error("Audio Track muted must be true or false.");
    const headerId = `${id}.header`;
    const records = [{
      id: headerId,
      type: audioTrackTypes.header,
      value: sealAudioTrackHeader({ id }),
      range: declaration.range,
    }];
    const clips: Parameters<typeof createAudioTrackFragment>[0][number][] = [];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: headerId },
      timeline: timeline.ref,
    };
    for (const [index, child] of declaration.children.entries()) {
      const suffix = String(index + 1).padStart(4, "0");
      const clipId = field(child, "id") === undefined ? `${id}.clip.${suffix}` : literal(child, "id");
      const source = await resolved(child, "source", mediaTypes.prepared, resolveReference);
      const window = await resolved(child, "during", temporalTypes.window, resolveReference);
      const reconstruction = field(child, "reconstruction") === undefined
        ? undefined
        : authoredReconstruction(
          await resolved(child, "reconstruction", audioTrackTypes.reconstruction, resolveReference),
          `${child.name}.reconstruction`,
        );
      const sampling: TemporalRelationSpec | undefined = child.children.length === 0
        ? undefined
        : { relations: child.children.map(relation) };
      if (sampling !== undefined) assertTemporalRelationSpec(sampling);
      const gain = numeric(child, "gain", audioClipDefaults.gain);
      if (gain < 0) throw new Error("Audio Clip gain must be nonnegative.");
      const spec = sealAudioClipSpec({
        id: clipId,
        ...(sampling === undefined ? {} : { sampling }),
        ...(reconstruction === undefined ? {} : { reconstruction }),
        mix: {
          gain: gain * (muted === "true" ? 0 : 1),
          fadeIn: parseTemporalDuration(literal(child, "fade-in", audioClipDefaults["fade-in"]), `${child.name}.fade-in`),
          fadeOut: parseTemporalDuration(literal(child, "fade-out", audioClipDefaults["fade-out"]), `${child.name}.fade-out`),
        },
      });
      const windowName = `clip-${suffix}-window`;
      const mediaName = `clip-${suffix}-media`;
      const specName = `clip-${suffix}-spec`;
      const specId = `${id}.clip.${suffix}.spec`;
      records.push({ id: specId, type: audioTrackTypes.clipSpec, value: spec, range: child.range ?? declaration.range });
      inputs[windowName] = window.ref;
      inputs[mediaName] = source.ref;
      inputs[specName] = { kind: "record", id: specId };
      clips.push({ mediaName, specName, windowName });
    }
    return {
      records,
      components: [{
        id,
        fragment: createAudioTrackFragment(clips),
        inputs,
        outputs: { program: `${id}.program`, audio: `${id}.audio` },
        range: declaration.range,
      }],
    };
  },
};

export const audioTrackAuthorDeclarations = [audioTrackAuthorDeclaration] as const;

export const audioTrackMarkupDeclarations = [{ name: "track", tag: "Track" }] as const;
