import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent, type FieldModelAuthorArtifactInput } from "@hypit/generation/model-fields/author";
import { createFieldModelPrimaryFragment, sealModelFieldBuilder } from "@hypit/generation/model-fields";

import { seedreamEndpoints, seedreamModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Seedream ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

async function reference(
  declaration: DeclarationLike,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Seedream ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) {
    throw new Error(`Seedream ${declaration.name}.${name} has the wrong Type.`);
  }
  return value;
}

const endpoint = seedreamEndpoints.image!;
const fields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the generated image." },
  { name: "prompt", kind: "reference" as const, required: true, accepts: [textTypes.text],
    summary: "Selects the generation prompt." },
  { name: "aspect-ratio", kind: "literal" as const, required: true,
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"],
    summary: "Sets the output frame shape." },
  { name: "quality", kind: "literal" as const, required: true, values: ["basic", "high", "ultra"],
    summary: "Sets the model render band." },
  { name: "output-format", kind: "literal" as const, required: true, values: ["png", "jpeg"],
    summary: "Sets the returned image encoding." },
  { name: "nsfw-check", kind: "literal" as const, required: true, values: ["true", "false"],
    summary: "States whether the Provider applies its safety check." },
];

function bindings(declaration: AuthorDeclaration) {
  const id = literal(declaration, "id");
  return [{ name: `${id}.image`, ref: { kind: "component-output" as const, component: id, output: "image" },
    type: blobTypes.blob }];
}

function compiler(referenceMode: boolean): AuthorDeclarationCompiler {
  return {
    module: seedreamModuleRef,
    declaration: referenceMode ? "reference-image" : "text-image",
    outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type, blobTypes.blob],
    shape: {
      summary: referenceMode
        ? "Generates an image from a prompt and explicit reference images with Seedream 5 Lite."
        : "Generates an image from a prompt with Seedream 5 Lite.",
      fields,
      ...(referenceMode ? { children: [{ name: "Reference", cardinality: "many" as const,
        summary: "Attaches one reference image.", fields: [{ name: "image", kind: "reference" as const,
          required: true, accepts: [blobTypes.blob], summary: "Selects the reference image." }] }] } : {}),
    },
    bindings,
    async compile({ declaration, resolveReference }) {
      const id = literal(declaration, "id");
      if (referenceMode && declaration.children.length === 0) {
        throw new Error("Seedream ReferenceImage requires at least one Reference.");
      }
      const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
      const images: FieldModelAuthorArtifactInput[] = [];
      for (const child of declaration.children) {
        if (!referenceMode || child.name !== "Reference") throw new Error(`${declaration.name} does not accept ${child.name}.`);
        images.push({
          name: `image-${String(images.length + 1).padStart(4, "0")}`,
          field: "images",
          role: "image",
          source: await reference(child, "image", blobTypes.blob, resolveReference),
        });
      }
      const nsfw = literal(declaration, "nsfw-check");
      if (nsfw !== "true" && nsfw !== "false") throw new Error("Seedream nsfw-check must be true or false.");
      const draft = sealModelFieldBuilder(endpoint.fields, {
        aspectRatio: [literal(declaration, "aspect-ratio")],
        quality: [literal(declaration, "quality")],
        outputFormat: [literal(declaration, "output-format")],
        nsfwCheck: [nsfw === "true"],
      });
      return fieldModelAuthorComponent({
        id,
        range: declaration.range,
        endpoint,
        draft,
        fragment: createFieldModelPrimaryFragment(endpoint,
          images.map(({ name, field }) => ({ name, field })), [{ name: "prompt", field: "prompt" }]),
        outputs: { image: `${id}.image` },
        artifacts: images,
        text: [{ name: "prompt", field: "prompt", source: prompt }],
      });
    },
  };
}

export const seedreamTextImageAuthorDeclaration = compiler(false);
export const seedreamReferenceImageAuthorDeclaration = compiler(true);
export const seedreamAuthorDeclarations = [
  seedreamTextImageAuthorDeclaration,
  seedreamReferenceImageAuthorDeclaration,
] as const;
export const seedreamMarkupDeclarations = [
  { name: "text-image", tag: "TextImage" },
  { name: "reference-image", tag: "ReferenceImage" },
] as const;
