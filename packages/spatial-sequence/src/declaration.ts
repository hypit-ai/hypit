import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { timelineRegionSequenceFragment } from "./fragment.js";
import { spatialSequenceModuleRef, spatialSequenceTypes } from "./manifest.js";
import { decodeRegionSequenceDocument } from "./sequence.js";

const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function identifier(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal" || !RECORD_ID.test(value.value)) {
    throw new Error(`${declaration.name}.id must be a canonical lower-case identifier.`);
  }
  return value.value;
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const resolved = await resolveReference(value.path);
  if (resolved === undefined || !sameType(resolved.type, type)) {
    throw new Error(`${declaration.name}.${name} must reference ${type.name}.`);
  }
  return resolved;
}

export const regionSequenceDocumentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialSequenceModuleRef,
  declaration: "regions",
  outputs: [spatialSequenceTypes.document],
  shape: {
    summary: "Publishes one editable frame-exact spatial sequence document.",
    fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the RegionSequenceDocument." }],
    text: "Exact JSON regions in normalized final-program coordinates with an explicit Clock and frameCount.",
  },
  bindings(declaration) {
    const id = identifier(declaration);
    return [{ name: id, ref: { kind: "record", id }, type: spatialSequenceTypes.document }];
  },
  compile({ sourceName, declaration }) {
    const id = identifier(declaration);
    const document = decodeRegionSequenceDocument((declaration.text ?? "").trim(), `${sourceName} <Regions>`);
    return {
      records: [{ id, type: spatialSequenceTypes.document, value: canonicalize(document), range: declaration.range }],
      components: [],
    };
  },
};

function outputBinding(id: string): AuthorDeclarationBinding {
  return {
    name: id,
    ref: { kind: "component-output", component: id, output: "regions" },
    type: spatialSequenceTypes.timelineRegions,
  };
}

export const timelineRegionSequenceAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialSequenceModuleRef,
  declaration: "timeline-regions",
  outputs: [spatialSequenceTypes.timelineRegions],
  shape: {
    summary: "Attaches one complete spatial sequence document exactly to one Timeline and final Canvas.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the TimelineRegionSequence." },
      { name: "document", kind: "reference", required: true, accepts: [spatialSequenceTypes.document], summary: "Selects the external RegionSequenceDocument." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the exact Timeline frame domain." },
      { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas], summary: "Selects the final program Canvas." },
    ],
  },
  bindings(declaration) {
    return [outputBinding(identifier(declaration))];
  },
  async compile({ declaration, resolveReference }) {
    const id = identifier(declaration);
    const document = await reference(declaration, "document", spatialSequenceTypes.document, resolveReference);
    const timeline = await reference(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const canvas = await reference(declaration, "canvas", spatialTypes.canvas, resolveReference);
    return {
      records: [],
      components: [{
        id,
        fragment: timelineRegionSequenceFragment,
        inputs: { document: document.ref, timeline: timeline.ref, canvas: canvas.ref },
        outputs: { regions: id },
        range: declaration.range,
      }],
    };
  },
};

export const spatialSequenceAuthorDeclarations = [
  regionSequenceDocumentAuthorDeclaration,
  timelineRegionSequenceAuthorDeclaration,
] as const;

export const spatialSequenceMarkupDeclarations = [
  { name: "regions", tag: "Regions", body: "opaque" },
  { name: "timeline-regions", tag: "TimelineRegions" },
] as const;
