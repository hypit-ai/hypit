import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import type { NarrativeSegmentRef } from "@hypit/narrative";
import { narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalTypes } from "@hypit/temporal";

import { speechAlignmentFragment, speechBoundaryAlignmentFragment } from "./fragment.js";
import { speechAlignmentModuleRef } from "./manifest.js";

function identifier(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.id must be text.`);
  }
  return value.value.trim();
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a whole-value reference.`);
  const resolved = await resolveReference(value.path);
  if (resolved === undefined || !sameType(resolved.type, type)) {
    throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  }
  return resolved;
}

function outputBinding(id: string): AuthorDeclarationBinding {
  return {
    name: `${id}.alignment`,
    ref: { kind: "component-output", component: id, output: "alignment" },
    type: narrativeTemporalTypes.narrativeAlignment,
  };
}

export const speechAlignmentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: speechAlignmentModuleRef,
  declaration: "alignment",
  outputs: [narrativeTemporalTypes.narrativeAlignment],
  shape: {
    summary: "Locates one authored Narrative Segment on one local temporal domain.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the NarrativeAlignment output." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative], summary: "Selects the owning Narrative." },
      { name: "segment", kind: "reference", required: true, accepts: [narrativeTypes.segmentRef], summary: "Selects one authored Segment." },
      { name: "domain", kind: "reference", required: true, accepts: [temporalTypes.localDomain], summary: "Selects the local temporal domain." },
      { name: "evidence", kind: "reference", required: false, accepts: [speechEvidenceTypes.transcript], summary: "Selects provider-neutral speech evidence for a token-bearing Segment." },
    ],
  },
  bindings(declaration) {
    return [outputBinding(identifier(declaration))];
  },
  async compile({ declaration, resolveReference }) {
    const id = identifier(declaration);
    const narrative = await reference(declaration, "narrative", narrativeTypes.narrative, resolveReference);
    const segment = await reference(declaration, "segment", narrativeTypes.segmentRef, resolveReference);
    const domain = await reference(declaration, "domain", temporalTypes.localDomain, resolveReference);
    const excerpt = segment.record?.value as unknown as NarrativeSegmentRef | undefined;
    const empty = excerpt !== undefined && excerpt.tokenStart === excerpt.tokenEndExclusive;
    const evidenceField = declarationField(declaration, "evidence");
    if (empty && evidenceField !== undefined) {
      throw new Error(`${declaration.name}.evidence must be omitted for an empty Segment.`);
    }
    if (!empty && evidenceField === undefined) {
      throw new Error(`${declaration.name}.evidence is required for a token-bearing Segment.`);
    }
    const inputs = {
      narrative: narrative.ref,
      segment: segment.ref,
      domain: domain.ref,
      ...(!empty ? { evidence: (await reference(declaration, "evidence", speechEvidenceTypes.transcript, resolveReference)).ref } : {}),
    };
    return {
      records: [],
      components: [{
        id,
        fragment: empty ? speechBoundaryAlignmentFragment : speechAlignmentFragment,
        inputs,
        outputs: { alignment: `${id}.alignment` },
        range: declaration.range,
      }],
    };
  },
};

export const speechAlignmentAuthorDeclarations = [speechAlignmentAuthorDeclaration] as const;

export const speechAlignmentMarkupDeclarations = [{ name: "alignment", tag: "Alignment" }] as const;
