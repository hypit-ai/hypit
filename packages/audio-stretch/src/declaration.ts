import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { audioTrackTypes } from "@hypit/audio-track";

import { audioStretchModuleRef } from "./manifest.js";
import { preservePitch } from "./program.js";

function id(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.id must be a non-empty identifier.`);
  }
  return value.value.trim();
}

export const preservePitchAuthorDeclaration: AuthorDeclarationCompiler = {
  module: audioStretchModuleRef,
  declaration: "preserve-pitch",
  outputs: [audioTrackTypes.reconstruction],
  shape: {
    summary: "Selects pitch-preserving reconstruction for one sampled audio occurrence.",
    fields: [{ name: "id", kind: "identifier", required: true, summary: "Names this reusable reconstruction policy." }],
  },
  bindings(declaration) {
    const name = id(declaration);
    return [{ name, ref: { kind: "record", id: name }, type: audioTrackTypes.reconstruction }];
  },
  compile({ declaration }) {
    const name = id(declaration);
    return {
      records: [{ id: name, type: audioTrackTypes.reconstruction, value: preservePitch(), range: declaration.range }],
      components: [],
    };
  },
};

export const audioStretchAuthorDeclarations = [preservePitchAuthorDeclaration] as const;
export const audioStretchMarkupDeclarations = [{ name: "preserve-pitch", tag: "PreservePitch" }] as const;
