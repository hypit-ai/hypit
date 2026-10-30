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
  createFieldModelGenerationFragment,
  sealModelFieldBuilder,
  type FieldModelOperation,
  type ModelFieldValue,
} from "@hypit/generation/model-fields";

import { wanEndpoints, wanModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Wan ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

async function reference(
  declaration: DeclarationLike,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Wan ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Wan ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function optionalInteger(declaration: AuthorDeclaration, name: string): readonly ModelFieldValue[] | undefined {
  const value = optionalLiteral(declaration, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) throw new Error(`Wan ${declaration.name}.${name} must be a whole number.`);
  return [Number(value)];
}

function optionalFlag(declaration: AuthorDeclaration, name: string): readonly ModelFieldValue[] | undefined {
  const value = optionalLiteral(declaration, name);
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") throw new Error(`Wan ${declaration.name}.${name} must be true or false.`);
  return [value === "true"];
}

function compiler(options: {
  readonly declaration: "image" | "pro-image";
  readonly endpoint: FieldModelOperation;
  readonly resolutions: readonly string[];
}): AuthorDeclarationCompiler {
  return {
    module: wanModuleRef,
    declaration: options.declaration,
    outputs: [options.endpoint.draftType, options.endpoint.mediaBindings.images!.type,
      options.endpoint.returns, blobTypes.blob],
    shape: {
      summary: `Generates one or more images with ${options.endpoint.fields.model}.`,
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the generated image set." },
        { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the generation prompt." },
        { name: "resolution", kind: "literal", required: false, values: options.resolutions, summary: "Sets the output size band." },
        { name: "count", kind: "literal", required: false, summary: "Sets the number of requested images." },
        { name: "image-set", kind: "literal", required: false, values: ["true", "false"], summary: "Requests a coherent image set." },
        { name: "extended-reasoning", kind: "literal", required: false, values: ["true", "false"], summary: "Enables extended reasoning." },
        { name: "watermark", kind: "literal", required: false, values: ["true", "false"], summary: "Controls the model watermark." },
        { name: "seed", kind: "literal", required: false, summary: "Sets the model seed." },
      ],
      children: [{ name: "Reference", cardinality: "many", summary: "Attaches one reference image.",
        fields: [{ name: "image", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the reference image." }] }],
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [
        { name: `${id}.images`, ref: { kind: "component-output", component: id, output: "images" }, type: options.endpoint.returns },
        { name: `${id}.image`, ref: { kind: "component-output", component: id, output: "image" }, type: blobTypes.blob,
          retained: true },
      ];
    },
    async compile({ declaration, resolveReference }) {
      if (declaration.children.length > 9) throw new Error(`${options.endpoint.fields.model} accepts at most 9 reference images.`);
      const id = literal(declaration, "id");
      const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
      const images: FieldModelAuthorArtifactInput[] = [];
      for (const child of declaration.children) {
        if (child.name !== "Reference") throw new Error(`${declaration.name} does not accept ${child.name}.`);
        images.push({ name: `image-${String(images.length + 1).padStart(4, "0")}`, field: "images", role: "image",
          source: await reference(child, "image", blobTypes.blob, resolveReference) });
      }
      const resolution = optionalLiteral(declaration, "resolution");
      const stated: Record<string, readonly ModelFieldValue[] | undefined> = {
        resolution: resolution === undefined ? undefined : [resolution],
        count: optionalInteger(declaration, "count"),
        imageSet: optionalFlag(declaration, "image-set"),
        extendedReasoning: optionalFlag(declaration, "extended-reasoning"),
        watermark: optionalFlag(declaration, "watermark"),
        seed: optionalInteger(declaration, "seed"),
      };
      const draft = sealModelFieldBuilder(options.endpoint.fields, Object.fromEntries(
        Object.entries(stated).filter((entry): entry is [string, readonly ModelFieldValue[]] => entry[1] !== undefined),
      ));
      return fieldModelAuthorComponent({
        id,
        range: declaration.range,
        endpoint: options.endpoint,
        draft,
        fragment: createFieldModelGenerationFragment(options.endpoint,
          images.map(({ name, field }) => ({ name, field })), [{ name: "prompt", field: "prompt" }],
          { result: "images", primary: "image" }),
        outputs: { images: `${id}.images`, image: `${id}.image` },
        artifacts: images,
        text: [{ name: "prompt", field: "prompt", source: prompt }],
      });
    },
  };
}

export const wanImageAuthorDeclaration = compiler({ declaration: "image", endpoint: wanEndpoints.image!, resolutions: ["1K", "2K"] });
export const wanProImageAuthorDeclaration = compiler({ declaration: "pro-image", endpoint: wanEndpoints.pro!, resolutions: ["1K", "2K", "4K"] });
export const wanAuthorDeclarations = [wanImageAuthorDeclaration, wanProImageAuthorDeclaration] as const;
export const wanMarkupDeclarations = [{ name: "image", tag: "Image" }, { name: "pro-image", tag: "ProImage" }] as const;
