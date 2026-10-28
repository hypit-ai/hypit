import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import {
  createFieldModelPrimaryFragment,
  sealModelFieldBuilder,
} from "@hypit/generation/model-fields";
import { fieldModelAuthorComponent } from "@hypit/generation/model-fields/author";

import { portraitMattingEndpoint, volcengineMattingModuleRef } from "./model.js";

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Portrait.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function optionalLiteral(declaration: AuthorDeclaration, name: string): string | undefined {
  const value = declarationField(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Portrait.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Portrait.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Portrait.${name} has the wrong Type.`);
  return value;
}

export const portraitMattingAuthorDeclaration: AuthorDeclarationCompiler = {
  module: volcengineMattingModuleRef,
  declaration: "portrait",
  outputs: [portraitMattingEndpoint.draftType, portraitMattingEndpoint.mediaBindings.source!.type, blobTypes.blob],
  shape: {
    summary: "Removes a video's background and publishes transparent video.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the processed video." },
      { name: "source", kind: "reference", required: true, accepts: [blobTypes.blob],
        summary: "Selects the source video Artifact." },
      { name: "format", kind: "literal", required: false, values: ["WEBM", "MOV"], fallback: "WEBM",
        summary: "Chooses the transparent output container." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.video`, ref: { kind: "component-output", component: id, output: "video" }, type: blobTypes.blob }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const source = await reference(declaration, "source", blobTypes.blob, resolveReference);
    const format = optionalLiteral(declaration, "format") ?? "WEBM";
    if (format !== "WEBM" && format !== "MOV") throw new Error("Portrait.format must be WEBM or MOV.");
    const draft = sealModelFieldBuilder(portraitMattingEndpoint.fields, { format: [format] });
    const fragment = createFieldModelPrimaryFragment(portraitMattingEndpoint,
      [{ name: "source", field: "source" }], []);
    return fieldModelAuthorComponent({
      id,
      range: declaration.range,
      endpoint: portraitMattingEndpoint,
      draft,
      fragment,
      outputs: { video: `${id}.video` },
      artifacts: [{ name: "source", field: "source", role: "video", source }],
    });
  },
};

export const volcengineMattingAuthorDeclarations = [portraitMattingAuthorDeclaration] as const;
export const volcengineMattingMarkupDeclarations = [{ name: "portrait", tag: "Portrait" }] as const;
