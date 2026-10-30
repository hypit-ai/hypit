import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationBinding, type AuthorDeclarationCompiler, type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent, type FieldModelAuthorArtifactInput } from "@hypit/generation/model-fields/author";
import { createFieldModelPrimaryFragment, sealModelFieldBuilder,
  type FieldModelOperation, type ModelFieldValue } from "@hypit/generation/model-fields";

import { pixverseEndpoints, pixverseEndpointsByModel, pixverseModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`PixVerse ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`PixVerse ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`PixVerse ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function selectEndpoint(declaration: AuthorDeclaration): FieldModelOperation {
  const model = literal(declaration, "model");
  if (model === "v6" || model === "pixverse-v6") return pixverseEndpointsByModel["pixverse-v6"];
  if (model === "c1" || model === "pixverse-c1") return pixverseEndpointsByModel["pixverse-c1"];
  throw new Error("PixVerse model must be v6 or c1.");
}

function optionalInteger(declaration: AuthorDeclaration, name: string): readonly ModelFieldValue[] | undefined {
  const value = optionalLiteral(declaration, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) throw new Error(`PixVerse ${declaration.name}.${name} must be a whole number.`);
  return [Number(value)];
}

function requiredInteger(declaration: AuthorDeclaration, name: string): readonly ModelFieldValue[] {
  const value = optionalInteger(declaration, name);
  if (value === undefined) throw new Error(`PixVerse ${declaration.name}.${name} is required.`);
  return value;
}

function optionalFlag(declaration: AuthorDeclaration, name: string): readonly ModelFieldValue[] | undefined {
  const value = optionalLiteral(declaration, name);
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") throw new Error(`PixVerse ${declaration.name}.${name} must be true or false.`);
  return [value === "true"];
}

const commonFields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the generated video." },
  { name: "model", kind: "literal" as const, required: true,
    values: ["v6", "pixverse-v6", "c1", "pixverse-c1"], summary: "Chooses the exact PixVerse model." },
  { name: "prompt", kind: "reference" as const, required: true, accepts: [textTypes.text], summary: "Selects the generation prompt." },
  { name: "quality", kind: "literal" as const, required: true, values: ["540p", "720p"], summary: "Sets the output size band." },
  { name: "aspect-ratio", kind: "literal" as const, required: false,
    values: ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9", "auto"],
    summary: "Sets the output frame shape." },
  { name: "generate-audio", kind: "literal" as const, required: false, values: ["true", "false"], summary: "Requests generated audio." },
  { name: "seed", kind: "literal" as const, required: false, summary: "Sets the V6 sampling seed." },
];

const outputs = Object.values(pixverseEndpoints).flatMap((endpoint) => [endpoint.draftType,
  ...Object.values(endpoint.mediaBindings).map((binding) => binding.type)]).concat(blobTypes.blob);

function bindings(declaration: AuthorDeclaration): readonly AuthorDeclarationBinding[] {
  const id = literal(declaration, "id");
  return [{ name: `${id}.video`, ref: { kind: "component-output" as const, component: id, output: "video" }, type: blobTypes.blob,
    retained: true }];
}

async function output(declaration: AuthorDeclaration, resolveReference: Parameters<AuthorDeclarationCompiler["compile"]>[0]["resolveReference"],
  endpoint: FieldModelOperation, media: readonly FieldModelAuthorArtifactInput[], stated: Record<string, readonly ModelFieldValue[] | undefined>) {
  const id = literal(declaration, "id");
  const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
  const draft = sealModelFieldBuilder(endpoint.fields, Object.fromEntries(
    Object.entries(stated).filter((entry): entry is [string, readonly ModelFieldValue[]] => entry[1] !== undefined)));
  return fieldModelAuthorComponent({ id, range: declaration.range, endpoint, draft,
    fragment: createFieldModelPrimaryFragment(endpoint, media.map(({ name, field }) => ({ name, field })),
      [{ name: "prompt", field: "prompt" }]),
    outputs: { video: `${id}.video` }, artifacts: media,
    text: [{ name: "prompt", field: "prompt", source: prompt }] });
}

export const pixverseVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: pixverseModuleRef,
  declaration: "video",
  outputs,
  shape: { summary: "Generates a PixVerse video from a prompt and optional boundary frames.", fields: [
    ...commonFields,
    { name: "duration", kind: "literal", required: true, summary: "Sets duration in whole seconds." },
    { name: "first-frame", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects the first frame." },
    { name: "last-frame", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects the last frame." },
    { name: "multi-clip", kind: "literal", required: false, values: ["true", "false"], summary: "Enables V6 multi-clip generation." },
  ] },
  bindings,
  async compile({ declaration, resolveReference }) {
    const endpoint = selectEndpoint(declaration);
    const media: FieldModelAuthorArtifactInput[] = [];
    for (const [field, name] of [["firstFrame", "first-frame"], ["lastFrame", "last-frame"]] as const) {
      if (declarationField(declaration, name) !== undefined) media.push({ name: `media-${String(media.length + 1).padStart(4, "0")}`,
        field, role: "image", source: await reference(declaration, name, blobTypes.blob, resolveReference) });
    }
    const aspectRatio = optionalLiteral(declaration, "aspect-ratio");
    return await output(declaration, resolveReference, endpoint, media, {
      duration: requiredInteger(declaration, "duration"), quality: [literal(declaration, "quality")],
      aspectRatio: aspectRatio === undefined ? undefined : [aspectRatio],
      generateAudio: optionalFlag(declaration, "generate-audio"),
      multiClip: optionalFlag(declaration, "multi-clip"), seed: optionalInteger(declaration, "seed"),
    });
  },
};

export const pixverseReferenceVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: pixverseModuleRef,
  declaration: "reference-video",
  outputs,
  shape: { summary: "Generates a PixVerse video from explicit image or video references.", fields: [
    ...commonFields, { name: "duration", kind: "literal", required: false, summary: "Sets duration when references do not carry it." },
  ], children: [{ name: "Reference", cardinality: "many", summary: "Attaches exactly one image or video reference.", fields: [
    { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an image reference." },
    { name: "video", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects a video reference." },
  ] }] },
  bindings,
  async compile({ declaration, resolveReference }) {
    if (declaration.children.length === 0) throw new Error("PixVerse ReferenceVideo requires at least one Reference.");
    const endpoint = selectEndpoint(declaration);
    const media: FieldModelAuthorArtifactInput[] = [];
    for (const child of declaration.children) {
      if (child.name !== "Reference") throw new Error(`PixVerse ReferenceVideo does not accept ${child.name}.`);
      const roles = (["image", "video"] as const).filter((name) => declarationField(child, name) !== undefined);
      if (roles.length !== 1) throw new Error("PixVerse Reference requires exactly one of image or video.");
      const role = roles[0]!;
      media.push({ name: `media-${String(media.length + 1).padStart(4, "0")}`,
        field: role === "image" ? "referenceImage" : "referenceVideo", role,
        source: await reference(child, role, blobTypes.blob, resolveReference) });
    }
    const videos = media.some((item) => item.role === "video");
    const duration = optionalInteger(declaration, "duration");
    if (videos && duration !== undefined) throw new Error("PixVerse ReferenceVideo takes no duration with video references.");
    if (!videos && duration === undefined) throw new Error("PixVerse ReferenceVideo requires duration without video references.");
    const aspectRatio = optionalLiteral(declaration, "aspect-ratio");
    return await output(declaration, resolveReference, endpoint, media, {
      duration, quality: [literal(declaration, "quality")],
      aspectRatio: aspectRatio === undefined ? undefined : [aspectRatio],
      generateAudio: optionalFlag(declaration, "generate-audio"), seed: optionalInteger(declaration, "seed"),
    });
  },
};

export const pixverseAuthorDeclarations = [pixverseVideoAuthorDeclaration, pixverseReferenceVideoAuthorDeclaration] as const;
export const pixverseMarkupDeclarations = [{ name: "video", tag: "Video" },
  { name: "reference-video", tag: "ReferenceVideo" }] as const;
