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
import { timelineTypes } from "@hypit/timeline";

import { createAudioMixFragment } from "./fragment.js";
import { audioMixModuleRef, audioMixTypes } from "./manifest.js";
import { sealAudioMixHeader, sealAudioMixInputSpec } from "./program.js";

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

function outputBinding(component: string, name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output: "audio" }, type };
}

export const audioMixAuthorDeclaration: AuthorDeclarationCompiler = {
  module: audioMixModuleRef,
  declaration: "track",
  outputs: [audioMixTypes.header, audioMixTypes.inputSpec, compositionTypes.audioTrack],
  shape: {
    summary: "Closes peer AudioTrack signal graphs into one explicit additive mix.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resulting AudioTrack." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its absolute Timeline." },
    ],
    children: [{
      name: "Input", cardinality: "many", summary: "Adds one closed AudioTrack with optional scalar gain.", fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the routing edge." },
        { name: "source", kind: "reference", required: true, accepts: [compositionTypes.audioTrack], summary: "Selects the input signal." },
        { name: "gain", kind: "literal", required: false, summary: "Applies a non-negative scalar; defaults to 1." },
      ],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, `${id}.audio`, compositionTypes.audioTrack)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    if (declaration.children.length === 0) throw new Error(`${declaration.name} requires at least one Input.`);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const records = [{
      id: `${id}.header`,
      type: audioMixTypes.header,
      value: sealAudioMixHeader({ id }),
      range: declaration.range,
    }];
    const inputs: Record<string, AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
      header: { kind: "record", id: `${id}.header` },
      timeline: timeline.ref,
    };
    for (const [index, child] of declaration.children.entries()) {
      const source = await resolved(child, "source", compositionTypes.audioTrack, resolveReference);
      const rawGain = field(child, "gain");
      const gain = rawGain === undefined ? 1 : Number(rawGain.kind === "literal" ? rawGain.value : Number.NaN);
      const suffix = String(index + 1).padStart(4, "0");
      const specId = `${id}.input.${suffix}.spec`;
      records.push({
        id: specId,
        type: audioMixTypes.inputSpec,
        value: sealAudioMixInputSpec({ id: literal(child, "id"), gain }),
        range: child.range ?? declaration.range,
      });
      inputs[`spec-${suffix}`] = { kind: "record", id: specId };
      inputs[`track-${suffix}`] = source.ref;
    }
    return {
      records,
      components: [{
        id,
        fragment: createAudioMixFragment(declaration.children.length),
        inputs,
        outputs: { audio: `${id}.audio` },
        range: declaration.range,
      }],
    };
  },
};

export const audioMixAuthorDeclarations = [audioMixAuthorDeclaration] as const;

export const audioMixMarkupDeclarations = [{ name: "track", tag: "Track" }] as const;
