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
import {
  createFieldModelPrimaryFragment,
  sealModelFieldBuilder,
  type FieldModelOperation,
} from "@hypit/generation/model-fields";

import { nanoBananaEndpoints, nanoBananaModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Nano Banana ${declaration.name}.${name} must be a non-empty literal.`);
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
  if (field?.kind !== "reference") throw new Error(`Nano Banana ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) {
    throw new Error(`Nano Banana ${declaration.name}.${name} has the wrong Type.`);
  }
  return value;
}

function compiler(options: {
  readonly declaration: "image" | "pro-image";
  readonly endpoint: FieldModelOperation;
  readonly ratios: readonly string[];
  readonly maxImages: number;
}): AuthorDeclarationCompiler {
  return {
    module: nanoBananaModuleRef,
    declaration: options.declaration,
    outputs: [options.endpoint.draftType, options.endpoint.mediaBindings.images!.type, blobTypes.blob],
    shape: {
      summary: `Generates an image with ${options.endpoint.fields.model}.`,
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the generated image." },
        { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
          summary: "Selects the generation prompt." },
        { name: "aspect-ratio", kind: "literal", required: true, values: options.ratios,
          summary: "Sets the output frame shape." },
        { name: "resolution", kind: "literal", required: true, values: ["1K", "2K", "4K"],
          summary: "Sets the output size band." },
        { name: "output-format", kind: "literal", required: true, values: ["png", "jpg"],
          summary: "Sets the returned image encoding." },
      ],
      children: [{ name: "Reference", cardinality: "many", summary: "Attaches one reference image.",
        fields: [{ name: "image", kind: "reference", required: true, accepts: [blobTypes.blob],
          summary: "Selects the reference image." }] }],
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: `${id}.image`, ref: { kind: "component-output", component: id, output: "image" },
        type: blobTypes.blob }];
    },
    async compile({ declaration, resolveReference }) {
      if (declaration.children.length > options.maxImages) {
        throw new Error(`${options.endpoint.fields.model} accepts at most ${options.maxImages} reference images.`);
      }
      const id = literal(declaration, "id");
      const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
      const images: FieldModelAuthorArtifactInput[] = [];
      for (const child of declaration.children) {
        if (child.name !== "Reference") throw new Error(`${declaration.name} does not accept ${child.name}.`);
        images.push({
          name: `image-${String(images.length + 1).padStart(4, "0")}`,
          field: "images",
          role: "image",
          source: await reference(child, "image", blobTypes.blob, resolveReference),
        });
      }
      const draft = sealModelFieldBuilder(options.endpoint.fields, {
        aspectRatio: [literal(declaration, "aspect-ratio")],
        resolution: [literal(declaration, "resolution")],
        outputFormat: [literal(declaration, "output-format")],
      });
      return fieldModelAuthorComponent({
        id,
        range: declaration.range,
        endpoint: options.endpoint,
        draft,
        fragment: createFieldModelPrimaryFragment(options.endpoint,
          images.map(({ name, field }) => ({ name, field })), [{ name: "prompt", field: "prompt" }]),
        outputs: { image: `${id}.image` },
        artifacts: images,
        text: [{ name: "prompt", field: "prompt", source: prompt }],
      });
    },
  };
}

export const nanoBananaImageAuthorDeclaration = compiler({
  declaration: "image",
  endpoint: nanoBananaEndpoints.v2!,
  ratios: ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"],
  maxImages: 14,
});
export const nanoBananaProImageAuthorDeclaration = compiler({
  declaration: "pro-image",
  endpoint: nanoBananaEndpoints.pro!,
  ratios: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  maxImages: 8,
});
export const nanoBananaAuthorDeclarations = [
  nanoBananaImageAuthorDeclaration,
  nanoBananaProImageAuthorDeclaration,
] as const;
export const nanoBananaMarkupDeclarations = [
  { name: "image", tag: "Image" },
  { name: "pro-image", tag: "ProImage" },
] as const;
