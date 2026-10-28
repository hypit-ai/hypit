import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent, type FieldModelAuthorArtifactInput } from "@hypit/generation/model-fields/author";
import { createFieldModelPrimaryFragment, sealModelFieldBuilder,
  type FieldModelOperation } from "@hypit/generation/model-fields";

import { grokImagineEndpoints, grokImagineModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Grok Imagine ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Grok Imagine ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Grok Imagine ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function compiler(options: { declaration: "video" | "preview-video"; endpoint: FieldModelOperation;
  ratios: readonly string[] }): AuthorDeclarationCompiler {
  return {
    module: grokImagineModuleRef,
    declaration: options.declaration,
    outputs: [options.endpoint.draftType, options.endpoint.mediaBindings.images!.type, blobTypes.blob],
    shape: {
      summary: `Generates video with ${options.endpoint.fields.model}.`,
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the generated video." },
        { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the generation prompt." },
        { name: "duration", kind: "literal", required: true, summary: "Sets the duration in whole seconds." },
        { name: "aspect-ratio", kind: "literal", required: true, values: options.ratios, summary: "Sets the output frame shape." },
        { name: "resolution", kind: "literal", required: true, values: ["480p", "720p", "1080p"], summary: "Sets the output height." },
      ],
      children: [{ name: "Reference", cardinality: "many", summary: "Attaches one reference image.",
        fields: [{ name: "image", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the reference image." }] }],
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: `${id}.video`, ref: { kind: "component-output", component: id, output: "video" }, type: blobTypes.blob }];
    },
    async compile({ declaration, resolveReference }) {
      if (declaration.children.length > 7) throw new Error(`${options.endpoint.fields.model} accepts at most 7 reference images.`);
      const duration = Number(literal(declaration, "duration"));
      if (!Number.isSafeInteger(duration)) throw new Error("Grok Imagine duration must be an integer.");
      const id = literal(declaration, "id");
      const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
      const images: FieldModelAuthorArtifactInput[] = [];
      for (const child of declaration.children) {
        if (child.name !== "Reference") throw new Error(`${declaration.name} does not accept ${child.name}.`);
        images.push({ name: `image-${String(images.length + 1).padStart(4, "0")}`, field: "images", role: "image",
          source: await reference(child, "image", blobTypes.blob, resolveReference) });
      }
      const draft = sealModelFieldBuilder(options.endpoint.fields, {
        duration: [duration], aspectRatio: [literal(declaration, "aspect-ratio")],
        resolution: [literal(declaration, "resolution")],
      });
      return fieldModelAuthorComponent({
        id, range: declaration.range, endpoint: options.endpoint, draft,
        fragment: createFieldModelPrimaryFragment(options.endpoint,
          images.map(({ name, field }) => ({ name, field })), [{ name: "prompt", field: "prompt" }]),
        outputs: { video: `${id}.video` }, artifacts: images,
        text: [{ name: "prompt", field: "prompt", source: prompt }],
      });
    },
  };
}

export const grokImagineVideoAuthorDeclaration = compiler({ declaration: "video", endpoint: grokImagineEndpoints.video!,
  ratios: ["2:3", "3:2", "1:1", "16:9", "9:16"] });
export const grokImaginePreviewVideoAuthorDeclaration = compiler({ declaration: "preview-video",
  endpoint: grokImagineEndpoints["preview-1.5"]!, ratios: ["auto", "2:3", "3:2", "1:1", "16:9", "9:16"] });
export const grokImagineAuthorDeclarations = [grokImagineVideoAuthorDeclaration, grokImaginePreviewVideoAuthorDeclaration] as const;
export const grokImagineMarkupDeclarations = [{ name: "video", tag: "Video" },
  { name: "preview-video", tag: "PreviewVideo" }] as const;
