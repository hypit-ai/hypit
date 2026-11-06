import {
  createAuthorDeclarationFacet,
  declarationField,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { sameType } from "@hypit/hypit/protocol";
import { audiovisualTypes } from "@hypit/audiovisual";
import { mediaTypes } from "@hypit/media";

import { preparedMediaProgramSourceFragment } from "./fragment.js";
import { audiovisualMediaModuleRef } from "./manifest.js";

function label(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0]): string {
  if (declaration.label === undefined || declaration.label.trim().length === 0) {
    throw new Error("Audiovisual Media Source requires a non-empty label.");
  }
  return declaration.label;
}

export const audiovisualMediaSourceAuthorDeclaration: AuthorDeclarationCompiler = {
  module: audiovisualMediaModuleRef,
  declaration: "Source",
  outputs: [audiovisualTypes.programSource],
  shape: {
    summary: "Projects one selected PreparedMedia value into a renderer-independent ProgramSource.",
    label: "required",
    fields: [{
      name: "media",
      kind: "reference",
      required: true,
      accepts: [mediaTypes.prepared],
      summary: "Selects the prepared Media value.",
    }],
  },
  bindings(declaration) {
    const id = label(declaration);
    return [{
      name: id,
      ref: { kind: "component-output", component: `${id}:media-source`, output: "source" },
      type: audiovisualTypes.programSource,
    }];
  },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const value = declarationField(declaration, "media");
    if (value?.kind !== "reference") throw new Error(`Audiovisual Media Source ${id}.media must be a reference.`);
    const media = await resolveReference(value.path);
    if (media === undefined || !sameType(media.type, mediaTypes.prepared)) {
      throw new Error(`Audiovisual Media Source ${id}.media has the wrong Type.`);
    }
    return {
      records: [],
      components: [{
        id: `${id}:media-source`,
        fragment: preparedMediaProgramSourceFragment,
        inputs: { media: media.ref },
        outputs: { source: id },
        range: declaration.range,
      }],
    };
  },
};

export const audiovisualMediaAuthorFacets = [
  createAuthorDeclarationFacet(audiovisualMediaSourceAuthorDeclaration),
] as const;
