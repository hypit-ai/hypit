import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { isBlobRef, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent, type FieldModelAuthorArtifactInput } from "@hypit/generation/model-fields/author";
import { sealModelFieldBuilder, type FieldModelOperation,
  type ModelFieldValue } from "@hypit/generation/model-fields";

import { createSeedanceAssembledGenerationFragment } from "./fragment.js";
import { seedanceEndpoints, seedanceModuleRef } from "./index.js";
import { validateSeedanceAudio } from "./validation.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Seedance ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Seedance ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Seedance ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function selectEndpoint(declaration: AuthorDeclaration): FieldModelOperation {
  const model = literal(declaration, "model");
  if (model === "standard" || model === "seedance-2") return seedanceEndpoints.standard!;
  if (model === "fast" || model === "seedance-2-fast") return seedanceEndpoints.fast!;
  if (model === "mini" || model === "seedance-2-mini") return seedanceEndpoints.mini!;
  if (model === "2.5" || model === "seedance-2.5") return seedanceEndpoints.v25!;
  throw new Error("Seedance model must be standard, fast, mini or 2.5.");
}

function integer(declaration: AuthorDeclaration, name: string): number {
  const value = Number(literal(declaration, name));
  if (!Number.isSafeInteger(value)) throw new Error(`Seedance ${declaration.name}.${name} must be an integer.`);
  return value;
}

function flag(declaration: DeclarationLike, name: string, fallback: boolean): boolean {
  const value = optionalLiteral(declaration, name);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Seedance ${declaration.name}.${name} must be true or false.`);
}

function personFields(declaration: DeclarationLike, name: string) {
  if (declarationField(declaration, name) === undefined) {
    throw new Error(`Seedance ${declaration.name}.${name} is required for this visual reference.`);
  }
  return { personReference: flag(declaration, name, false) };
}

const commonFields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the generated video." },
  { name: "model", kind: "literal" as const, required: true,
    values: ["standard", "seedance-2", "fast", "seedance-2-fast", "mini", "seedance-2-mini", "2.5", "seedance-2.5"],
    summary: "Chooses the exact Seedance model." },
  { name: "prompt", kind: "reference" as const, required: true, accepts: [textTypes.text], summary: "Selects the generation prompt." },
  { name: "duration", kind: "literal" as const, required: true, summary: "Sets the generated duration." },
  { name: "resolution", kind: "literal" as const, required: false,
    values: ["480p", "720p", "1080p", "4k"], summary: "Sets the output size band." },
  { name: "aspect-ratio", kind: "literal" as const, required: false,
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"], summary: "Sets the output frame shape." },
  { name: "generate-audio", kind: "literal" as const, required: false, values: ["true", "false"], summary: "Requests generated audio." },
];

const outputs = Object.values(seedanceEndpoints).flatMap((endpoint) => [endpoint.draftType,
  ...Object.values(endpoint.mediaBindings).map((binding) => binding.type)]).concat(blobTypes.blob);

function bindings(declaration: AuthorDeclaration) {
  const id = literal(declaration, "id");
  return [{ name: `${id}.video`, ref: { kind: "component-output" as const, component: id, output: "video" }, type: blobTypes.blob }];
}

async function output(declaration: AuthorDeclaration,
  resolveReference: Parameters<AuthorDeclarationCompiler["compile"]>[0]["resolveReference"],
  endpoint: FieldModelOperation, media: readonly FieldModelAuthorArtifactInput[], extra: Record<string, readonly ModelFieldValue[]> = {}) {
  const id = literal(declaration, "id");
  const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
  const draft = sealModelFieldBuilder(endpoint.fields, {
    duration: [integer(declaration, "duration")],
    resolution: [optionalLiteral(declaration, "resolution") ?? "720p"],
    aspectRatio: [optionalLiteral(declaration, "aspect-ratio") ?? "9:16"],
    generateAudio: [flag(declaration, "generate-audio", false)],
    webSearch: [false],
    ...extra,
  });
  return fieldModelAuthorComponent({ id, range: declaration.range, endpoint, draft,
    fragment: createSeedanceAssembledGenerationFragment(endpoint,
      media.map(({ name, field }) => ({ name, field })), [{ name: "prompt", field: "prompt" }]),
    outputs: { video: `${id}.video` }, artifacts: media,
    text: [{ name: "prompt", field: "prompt", source: prompt }] });
}

export const seedanceTextVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: seedanceModuleRef,
  declaration: "text-video",
  outputs,
  shape: { summary: "Generates a Seedance video from a Text prompt.", fields: [
    ...commonFields,
    { name: "web-search", kind: "literal", required: false, values: ["true", "false"], summary: "Allows the model to consult Web Search." },
  ] },
  bindings,
  async compile({ declaration, resolveReference }) {
    return await output(declaration, resolveReference, selectEndpoint(declaration), [],
      { webSearch: [flag(declaration, "web-search", false)] });
  },
};

export const seedanceFrameVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: seedanceModuleRef,
  declaration: "frame-video",
  outputs,
  shape: { summary: "Generates a Seedance video from explicit first and optional last frames.", fields: [
    ...commonFields,
    { name: "first-frame", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the first frame image." },
    { name: "last-frame", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects the last frame image." },
    { name: "first-frame-person-reference", kind: "literal", required: true, values: ["true", "false"], summary: "States whether the first frame contains a person." },
    { name: "last-frame-person-reference", kind: "literal", required: false, values: ["true", "false"], summary: "States whether the last frame contains a person." },
  ] },
  bindings,
  async compile({ declaration, resolveReference }) {
    if (declarationField(declaration, "last-frame-person-reference") !== undefined
      && declarationField(declaration, "last-frame") === undefined) {
      throw new Error("Seedance last-frame-person-reference requires last-frame.");
    }
    const media: FieldModelAuthorArtifactInput[] = [{ name: "media-0001", field: "firstFrame", role: "image",
      fields: personFields(declaration, "first-frame-person-reference"),
      source: await reference(declaration, "first-frame", blobTypes.blob, resolveReference) }];
    if (declarationField(declaration, "last-frame") !== undefined) media.push({ name: "media-0002", field: "lastFrame", role: "image",
      fields: personFields(declaration, "last-frame-person-reference"),
      source: await reference(declaration, "last-frame", blobTypes.blob, resolveReference) });
    return await output(declaration, resolveReference, selectEndpoint(declaration), media);
  },
};

export const seedanceReferenceVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: seedanceModuleRef,
  declaration: "reference-video",
  outputs,
  shape: { summary: "Generates a Seedance video from explicit image, video or audio references.",
    fields: commonFields,
    children: [{ name: "Reference", cardinality: "many", summary: "Attaches exactly one reference Artifact.", fields: [
      { name: "person-reference", kind: "literal", required: false, values: ["true", "false"], summary: "States whether a visual reference contains a person." },
      { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an image reference." },
      { name: "video", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects a video reference." },
      { name: "audio", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an audio reference." },
    ] }] },
  bindings,
  async compile({ declaration, resolveReference }) {
    if (declaration.children.length === 0) throw new Error("Seedance ReferenceVideo requires at least one Reference.");
    const fields = { image: "referenceImage", video: "referenceVideo", audio: "referenceAudio" } as const;
    const media: FieldModelAuthorArtifactInput[] = [];
    for (const child of declaration.children) {
      if (child.name !== "Reference") throw new Error(`Seedance ReferenceVideo does not accept ${child.name}.`);
      const roles = (["image", "video", "audio"] as const).filter((name) => declarationField(child, name) !== undefined);
      if (roles.length !== 1) throw new Error("Seedance Reference requires exactly one of image, video or audio.");
      const role = roles[0]!;
      if (role === "audio" && declarationField(child, "person-reference") !== undefined) {
        throw new Error("Seedance person-reference applies to image or video, not audio.");
      }
      const source = await reference(child, role, blobTypes.blob, resolveReference);
      if (role === "audio" && source.record !== undefined && isBlobRef(source.record.value)) {
        validateSeedanceAudio(source.record.value, "Seedance Reference.audio");
      }
      media.push({ name: `media-${String(media.length + 1).padStart(4, "0")}`, field: fields[role], role, source,
        ...(role === "audio" ? {} : { fields: personFields(child, "person-reference") }) });
    }
    return await output(declaration, resolveReference, selectEndpoint(declaration), media);
  },
};

export const seedanceAuthorDeclarations = [seedanceTextVideoAuthorDeclaration,
  seedanceFrameVideoAuthorDeclaration, seedanceReferenceVideoAuthorDeclaration] as const;
export const seedanceMarkupDeclarations = [{ name: "text-video", tag: "TextVideo" },
  { name: "frame-video", tag: "FrameVideo" }, { name: "reference-video", tag: "ReferenceVideo" }] as const;
