import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationBinding,
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
  type ModelArtifactRole,
  type ModelFieldValue,
} from "@hypit/generation/model-fields";

import { minimaxH3Endpoints, minimaxH3ModuleRef } from "./index.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`MiniMax H3 ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  const value = declarationField(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`MiniMax H3 ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

async function reference(
  declaration: DeclarationLike,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`MiniMax H3 ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) {
    throw new Error(`MiniMax H3 ${declaration.name}.${name} has the wrong Type.`);
  }
  return value;
}

function commonFields(aspectRatio: boolean) {
  return [
    { name: "id", kind: "identifier" as const, required: true, summary: "Names the generated video." },
    { name: "prompt", kind: "reference" as const, required: true, accepts: [textTypes.text],
      summary: "Selects the generation prompt." },
    { name: "duration", kind: "literal" as const, required: true,
      summary: "Sets whole seconds from 4 through 15." },
    { name: "resolution", kind: "literal" as const, required: false, values: ["768P", "2K"], fallback: "2K",
      summary: "Chooses the model output tier." },
    ...(aspectRatio ? [{ name: "aspect-ratio", kind: "literal" as const, required: false,
      values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
      summary: "Sets the output frame shape." }] : []),
  ];
}

async function common(
  declaration: AuthorDeclaration,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
) {
  const prompt = await reference(declaration, "prompt", textTypes.text, resolveReference);
  const duration = Number(literal(declaration, "duration"));
  if (!Number.isSafeInteger(duration)) throw new Error("MiniMax H3 duration must be an integer.");
  const fields: Record<string, readonly ModelFieldValue[]> = { duration: [duration] };
  const resolution = optionalLiteral(declaration, "resolution");
  if (resolution !== undefined) fields.resolution = [resolution];
  const aspectRatio = optionalLiteral(declaration, "aspect-ratio");
  if (aspectRatio !== undefined) fields.aspectRatio = [aspectRatio];
  return { prompt, fields };
}

async function output(
  declaration: AuthorDeclaration,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  media: readonly FieldModelAuthorArtifactInput[],
) {
  const id = literal(declaration, "id");
  const endpoint = minimaxH3Endpoints.video!;
  const { prompt, fields } = await common(declaration, resolveReference);
  const mediaInputs = media.map(({ name, field }) => ({ name, field }));
  return fieldModelAuthorComponent({
    id,
    range: declaration.range,
    endpoint,
    draft: sealModelFieldBuilder(endpoint.fields, fields),
    fragment: createFieldModelPrimaryFragment(endpoint, mediaInputs, [{ name: "prompt", field: "prompt" }]),
    outputs: { video: `${id}.video` },
    artifacts: media,
    text: [{ name: "prompt", field: "prompt", source: prompt }],
  });
}

function bindings(declaration: AuthorDeclaration): readonly AuthorDeclarationBinding[] {
  const id = literal(declaration, "id");
  return [{ name: `${id}.video`, ref: { kind: "component-output" as const, component: id, output: "video" },
    type: blobTypes.blob, retained: true }];
}

const endpoint = minimaxH3Endpoints.video!;
const outputTypes = (fields: readonly (keyof typeof endpoint.mediaBindings)[]) => [
  endpoint.draftType,
  ...fields.map((field) => endpoint.mediaBindings[field]!.type),
  blobTypes.blob,
];

export const minimaxH3TextVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: minimaxH3ModuleRef,
  declaration: "text-video",
  outputs: outputTypes([]),
  shape: { summary: "Generates video from a Text prompt with MiniMax H3.", fields: commonFields(true) },
  bindings,
  async compile({ declaration, resolveReference }) {
    return await output(declaration, resolveReference, []);
  },
};

export const minimaxH3FrameVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: minimaxH3ModuleRef,
  declaration: "frame-video",
  outputs: outputTypes(["firstFrame", "lastFrame"]),
  shape: { summary: "Generates video from an explicit first frame, last frame or both.", fields: [
    ...commonFields(false),
    { name: "first-frame", kind: "reference", required: false, accepts: [blobTypes.blob],
      summary: "Selects the opening image." },
    { name: "last-frame", kind: "reference", required: false, accepts: [blobTypes.blob],
      summary: "Selects the closing image." },
  ] },
  bindings,
  async compile({ declaration, resolveReference }) {
    const media: FieldModelAuthorArtifactInput[] = [];
    if (declarationField(declaration, "first-frame") !== undefined) media.push({
      name: "media-0001", field: "firstFrame", role: "image",
      source: await reference(declaration, "first-frame", blobTypes.blob, resolveReference),
    });
    if (declarationField(declaration, "last-frame") !== undefined) media.push({
      name: `media-${String(media.length + 1).padStart(4, "0")}`, field: "lastFrame", role: "image",
      source: await reference(declaration, "last-frame", blobTypes.blob, resolveReference),
    });
    if (media.length === 0) throw new Error("MiniMax H3 FrameVideo requires first-frame, last-frame or both.");
    return await output(declaration, resolveReference, media);
  },
};

const referenceFields = [
  { name: "image", kind: "reference" as const, required: false, accepts: [blobTypes.blob], summary: "Attaches image media." },
  { name: "video", kind: "reference" as const, required: false, accepts: [blobTypes.blob], summary: "Attaches video media." },
  { name: "audio", kind: "reference" as const, required: false, accepts: [blobTypes.blob], summary: "Attaches audio media." },
];

export const minimaxH3ReferenceVideoAuthorDeclaration: AuthorDeclarationCompiler = {
  module: minimaxH3ModuleRef,
  declaration: "reference-video",
  outputs: outputTypes(["referenceImage", "referenceVideo", "referenceAudio"]),
  shape: { summary: "Generates video from a prompt and explicit reference media.", fields: commonFields(true),
    children: [{ name: "Reference", cardinality: "many", summary: "Attaches exactly one media reference.",
      fields: referenceFields }] },
  bindings,
  async compile({ declaration, resolveReference }) {
    const mapping = {
      image: ["referenceImage", "image"],
      video: ["referenceVideo", "video"],
      audio: ["referenceAudio", "audio"],
    } as const;
    const media: FieldModelAuthorArtifactInput[] = [];
    for (const child of declaration.children) {
      const used = (Object.keys(mapping) as (keyof typeof mapping)[])
        .filter((name) => declarationField(child, name) !== undefined);
      if (used.length !== 1) throw new Error("MiniMax H3 Reference requires exactly one of image, video or audio.");
      const role = used[0]!;
      media.push({
        name: `media-${String(media.length + 1).padStart(4, "0")}`,
        field: mapping[role][0],
        role: mapping[role][1] as ModelArtifactRole,
        source: await reference(child, role, blobTypes.blob, resolveReference),
      });
    }
    if (media.length === 0) throw new Error("MiniMax H3 ReferenceVideo requires at least one Reference.");
    if (media.some((item) => item.role === "audio")
      && !media.some((item) => item.role === "image" || item.role === "video")) {
      throw new Error("MiniMax H3 reference audio requires an image or video companion.");
    }
    return await output(declaration, resolveReference, media);
  },
};

export const minimaxH3AuthorDeclarations = [
  minimaxH3TextVideoAuthorDeclaration,
  minimaxH3FrameVideoAuthorDeclaration,
  minimaxH3ReferenceVideoAuthorDeclaration,
] as const;

export const minimaxH3MarkupDeclarations = [
  { name: "text-video", tag: "TextVideo" },
  { name: "frame-video", tag: "FrameVideo" },
  { name: "reference-video", tag: "ReferenceVideo" },
] as const;
