import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { recipeType } from "@hypit/hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { regionEvidenceFragment } from "./fragment.js";
import { regionEvidenceModuleRef, regionEvidenceTypes } from "./manifest.js";

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
  if (value?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const resolved = await resolveReference(value.path);
  if (resolved === undefined || !sameType(resolved.type, type)) {
    throw new Error(`${declaration.name}.${name} must reference ${type.name}.`);
  }
  return resolved;
}

function outputBinding(id: string): AuthorDeclarationBinding {
  return {
    name: id,
    ref: { kind: "component-output", component: id, output: "evidence" },
    type: regionEvidenceTypes.evidence,
  };
}

export const regionEvidenceAuthorDeclaration: AuthorDeclarationCompiler = {
  module: regionEvidenceModuleRef,
  declaration: "evidence",
  outputs: [regionEvidenceTypes.evidence],
  shape: {
    summary: "Resolves externally prepared normalized regions into frame-exact evidence.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the RegionEvidence value." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Selects the program-picture Frame." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the indexing Timeline." },
      { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "Selects prepared normalized region series." },
    ],
  },
  bindings(declaration) {
    return [outputBinding(identifier(declaration))];
  },
  async compile({ declaration, resolveReference }) {
    const id = identifier(declaration);
    const within = await reference(declaration, "within", spatialTypes.frame, resolveReference);
    const timeline = await reference(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const recipe = await reference(declaration, "recipe", recipeType, resolveReference);
    return {
      records: [],
      components: [{
        id,
        fragment: regionEvidenceFragment,
        inputs: { within: within.ref, timeline: timeline.ref, recipe: recipe.ref },
        outputs: { evidence: id },
        range: declaration.range,
      }],
    };
  },
};

export const regionEvidenceAuthorDeclarations = [regionEvidenceAuthorDeclaration] as const;

export const regionEvidenceMarkupDeclarations = [{ name: "evidence", tag: "Evidence" }] as const;
