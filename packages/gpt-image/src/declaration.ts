import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent, type FieldModelAuthorArtifactInput } from "@hypit/generation/model-fields/author";
import { createFieldModelPrimaryFragment } from "@hypit/generation/model-fields";
import { imageTransformTypes } from "@hypit/image-operations";

import { gptImageCleanupProgram } from "./cleanup-program.js";
import { createGptImageCleanFragment } from "./fragment.js";
import { gptImageCleanModuleRef, gptImageEndpoints, gptImageModuleRef, sealGptImage2Draft } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;
const endpoint = gptImageEndpoints.image!;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`GPT Image ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`GPT Image ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`GPT Image ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

const fields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the generated image." },
  { name: "prompt", kind: "reference" as const, required: true, accepts: [textTypes.text], summary: "Selects the generation prompt." },
  { name: "aspect-ratio", kind: "literal" as const, required: true,
    values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21", "5:4", "4:5"],
    summary: "Sets the output frame shape." },
  { name: "resolution", kind: "literal" as const, required: true, values: ["1K", "2K", "4K"], summary: "Sets the output size band." },
  { name: "background", kind: "literal" as const, required: false, values: ["transparent", "opaque", "auto"], summary: "Controls generated background transparency." },
];

function compiler(clean: boolean): AuthorDeclarationCompiler {
  return {
    module: clean ? gptImageCleanModuleRef : gptImageModuleRef,
    declaration: "image",
    outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type,
      ...(clean ? [imageTransformTypes.program] : []), blobTypes.blob],
    shape: { summary: clean
      ? "Generates an image with GPT Image 2 and applies the package cleanup Program."
      : "Generates an image with GPT Image 2.",
      fields,
      children: [{ name: "Reference", cardinality: "many", summary: "Attaches one reference image.",
        fields: [{ name: "image", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the reference image." }] }] },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: `${id}.image`, ref: { kind: "component-output", component: id, output: "image" }, type: blobTypes.blob }];
    },
    async compile({ declaration, resolveReference }) {
      if (declaration.children.length > 16) throw new Error("GPT Image accepts at most 16 Reference children.");
      const id = literal(declaration, "id");
      const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
      const images: FieldModelAuthorArtifactInput[] = [];
      for (const child of declaration.children) {
        if (child.name !== "Reference") throw new Error(`GPT Image does not accept ${child.name}.`);
        images.push({ name: `image-${String(images.length + 1).padStart(4, "0")}`, field: "images", role: "image",
          source: await reference(child, "image", blobTypes.blob, resolveReference) });
      }
      const background = optionalLiteral(declaration, "background");
      const draft = sealGptImage2Draft({ aspectRatio: [literal(declaration, "aspect-ratio")],
        resolution: [literal(declaration, "resolution")],
        ...(background === undefined ? {} : { background: [background] }) });
      const media = images.map(({ name, field }) => ({ name, field }));
      const text = [{ name: "prompt", field: "prompt" }] as const;
      const output = fieldModelAuthorComponent({ id, range: declaration.range, endpoint, draft,
        fragment: clean ? createGptImageCleanFragment(media, text) : createFieldModelPrimaryFragment(endpoint, media, text),
        outputs: { image: `${id}.image` }, artifacts: images,
        text: [{ name: "prompt", field: "prompt", source: prompt }] });
      if (!clean) return output;
      return {
        records: [...output.records, { id: `${id}.cleanup`, type: imageTransformTypes.program,
          value: canonicalize(gptImageCleanupProgram), range: declaration.range }],
        components: output.components.map((component) => ({ ...component,
          inputs: { ...component.inputs, cleanup: { kind: "record", id: `${id}.cleanup` } } })),
      };
    },
  };
}

export const gptImageAuthorDeclaration = compiler(false);
export const cleanGptImageAuthorDeclaration = compiler(true);
export const gptImageAuthorDeclarations = [gptImageAuthorDeclaration, cleanGptImageAuthorDeclaration] as const;
export const gptImageMarkupDeclarations = [
  { module: gptImageModuleRef, declaration: { name: "image", tag: "Image" } },
  { module: gptImageCleanModuleRef, declaration: { name: "image", tag: "Image" } },
] as const;
