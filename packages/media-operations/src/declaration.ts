import {
  declarationBody,
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationFieldValue,
  type AuthorDeclarationOutput,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import { parseTemporalDuration, temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import {
  extractAudioFragment,
  extractFrameFragment,
  createStillVideoFragment,
} from "./fragment.js";
import { mediaOperationsModuleRef, mediaOperationsTypes } from "./manifest.js";
import {
  sealAudioExtractionRequest,
  sealFrameExtractionRequest,
} from "./operations.js";
import type {
  AudioExtractionRequest,
  FrameExtractionRequest,
} from "./types.js";

type DeclarationText = {
  readonly kind: "text";
  readonly value: string;
  readonly range: AuthorDeclaration["range"];
};
type DeclarationElement = {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, AuthorDeclarationFieldValue>>;
  readonly children: readonly (DeclarationText | DeclarationElement)[];
  readonly range: AuthorDeclaration["range"];
};
type DeclarationResolvedReference = AuthorResolvedReference;
type DeclarationDecoder = (context: {
  readonly element: DeclarationElement;
  readonly resolveReference: (path: string) => DeclarationResolvedReference | undefined;
}) => AuthorDeclarationOutput;

function declarationElement(
  node: AuthorDeclaration | AuthorDeclarationChild,
  fallback: AuthorDeclaration["range"],
): DeclarationElement {
  const range = node.range ?? fallback;
  return {
    kind: "element",
    name: node.name,
    attributes: Object.fromEntries(node.fields.map((field) => [field.name, field.value])),
    children: declarationBody(node).map((part) => part.kind === "text"
      ? { kind: "text", value: part.value, range: part.range ?? range }
      : declarationElement(part.child, range)),
    range,
  };
}

async function resolvedReferences(
  declaration: AuthorDeclaration,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<Map<string, AuthorResolvedReference>> {
  const result = new Map<string, AuthorResolvedReference>();
  const visit = async (node: AuthorDeclaration | AuthorDeclarationChild): Promise<void> => {
    for (const field of node.fields) {
      if (field.value.kind !== "reference" || result.has(field.value.path)) continue;
      const resolved = await resolveReference(field.value.path);
      if (resolved !== undefined) result.set(field.value.path, resolved);
    }
    for (const child of node.children) await visit(child);
  };
  await visit(declaration);
  return result;
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

function empty(element: DeclarationElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
}

function text(element: DeclarationElement, name: string): string {
  const value = element.attributes[name];
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be text.`);
  }
  return value.value.trim();
}

function optionalLiteral(
  value: AuthorDeclarationFieldValue | undefined,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) throw new Error(`${label} must be text.`);
  return value.value.trim();
}

function ref(
  raw: AuthorDeclarationFieldValue | undefined,
  label: string,
  resolve: (path: string) => DeclarationResolvedReference | undefined,
): DeclarationResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, blobTypes.blob)) throw new Error(`${label} must resolve to Blob.`);
  return value;
}

function typedReference(
  raw: AuthorDeclarationFieldValue | undefined,
  label: string,
  expected: DeclarationResolvedReference["type"],
  resolve: (path: string) => DeclarationResolvedReference | undefined,
): DeclarationResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function exactAttributes(element: DeclarationElement, required: readonly string[], optional: readonly string[] = []): void {
  const expected = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !expected.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(`${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`));
  }
}

function seconds(value: string, subject: string, allowZero = true): number {
  const match = /^(\d+(?:\.\d+)?)(?:s)?$/u.exec(value.trim());
  if (match === null) throw new Error(`${subject} must be seconds such as 0.25s or 2`);
  const result = Number(match[1]);
  if (!Number.isFinite(result) || result < 0 || (!allowZero && result === 0)) {
    throw new Error(`${subject} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return result;
}

function audioSelector(value: string): AudioExtractionRequest["audio"] {
  if (value === "default") return { mode: "default" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error("ExtractAudio.audio must be default or stream:<index>.");
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function videoSelector(value: string): FrameExtractionRequest["video"] {
  if (value === "primary-moving") return { mode: "primary-moving" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error("video must be primary-moving or stream:<index>.");
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

/** The pictures of a StillVideo in authored order, with their weights: one `source`, or Still children. */
function stillPictures(
  element: DeclarationElement,
  resolveReference: (path: string) => DeclarationResolvedReference | undefined,
): readonly { readonly source: DeclarationResolvedReference; readonly weight: number }[] {
  const children = element.children.filter((child) => child.kind === "element" || child.value.trim().length > 0);
  if (element.attributes.source !== undefined) {
    if (children.length > 0) throw new Error(`${element.name} takes either source or Still children, not both.`);
    return [{ source: ref(element.attributes.source, `${element.name}.source`, resolveReference), weight: 1 }];
  }
  const pictures = children.map((child) => {
    if (child.kind !== "element" || localName(child.name) !== "Still") {
      throw new Error(`${element.name} accepts only Still children.`);
    }
    exactAttributes(child, ["source"], ["weight"]);
    empty(child);
    const rawWeight = child.attributes.weight;
    let weight = 1;
    if (rawWeight !== undefined) {
      weight = Number(optionalLiteral(rawWeight, `${child.name}.weight`));
      if (!Number.isFinite(weight) || weight <= 0) throw new Error(`${child.name}.weight must be a positive number.`);
    }
    return { source: ref(child.attributes.source, `${child.name}.source`, resolveReference), weight };
  });
  if (pictures.length === 0) throw new Error(`${element.name} requires a source or at least one Still child.`);
  return pictures;
}

const decodeStillVideoDeclaration: DeclarationDecoder = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "duration", "clock"], ["source"]);
  const id = text(element, "id");
  const pictures = stillPictures(element, resolveReference);
  // The author supplies an exact temporal value. Planning later proves that it lands on a whole
  // frame for the selected Clock; no speech-specific duration or rounding policy is involved.
  const duration = parseTemporalDuration(text(element, "duration"), `${element.name}.duration`);
  const durationId = `${id}.duration`;
  const layoutId = `${id}.layout`;
  const clock = typedReference(
    element.attributes.clock,
    `${element.name}.clock`,
    timelineTypes.clock,
    resolveReference,
  );
  const fragment = createStillVideoFragment(pictures.length);
  return {
    records: [{
      id: durationId,
      type: temporalTypes.duration,
      value: (duration),
      range: element.range,
    }, {
      id: layoutId,
      type: mediaOperationsTypes.stillVideoLayout,
      value: ({
        weights: pictures.map((picture) => picture.weight),
      }),
      range: element.range,
    }],
    components: [{
      id,
      fragment,
      inputs: {
        duration: { kind: "record", id: durationId },
        clock: clock.ref,
        layout: { kind: "record", id: layoutId },
        ...Object.fromEntries(pictures.map((picture, index) => [`source-${index}`, picture.source.ref])),
      },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
  };
};

const decodeExtractAudioDeclaration: DeclarationDecoder = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source", "audio"]);
  empty(element);
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const request = sealAudioExtractionRequest({
    audio: audioSelector(text(element, "audio")),
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaOperationsTypes.audioExtractionRequest,
      value: (request), range: element.range }],
    components: [{
      id,
      fragment: extractAudioFragment,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { audio: `${id}.audio` },
      range: element.range,
    }],
  };
};

function frameSelector(value: string, subject: string): FrameExtractionRequest["at"] {
  if (value === "first") return { kind: "first" };
  if (value === "last") return { kind: "last" };
  const frame = /^frame:(\d+)$/u.exec(value);
  if (frame !== null) return { kind: "frame", index: Number(frame[1]) };
  const time = /^time:(.+)$/u.exec(value);
  if (time !== null) return { kind: "time", seconds: seconds(time[1]!, subject) };
  throw new Error(`${subject} must be first, last, frame:<index> or time:<seconds>.`);
}

const decodeExtractFrameDeclaration: DeclarationDecoder = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source", "video", "at"]);
  empty(element);
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const request = sealFrameExtractionRequest({
    video: videoSelector(text(element, "video")),
    at: frameSelector(text(element, "at"), `${element.name}.at`),
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaOperationsTypes.frameExtractionRequest,
      value: (request), range: element.range }],
    components: [{
      id,
      fragment: extractFrameFragment,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { image: `${id}.image` },
      range: element.range,
    }],
  };
};

function declarationCompiler(
  declaration: string,
  outputs: AuthorDeclarationCompiler["outputs"],
  shape: AuthorDeclarationCompiler["shape"],
  bindings: (declaration: AuthorDeclaration) => readonly AuthorDeclarationBinding[],
  decode: DeclarationDecoder,
): AuthorDeclarationCompiler {
  return {
    module: mediaOperationsModuleRef,
    declaration,
    outputs,
    shape,
    bindings,
    async compile({ declaration: value, resolveReference }) {
      const resolved = await resolvedReferences(value, resolveReference);
      return decode({
        element: declarationElement(value, value.range),
        resolveReference: (path) => resolved.get(path),
      });
    },
  };
}

const identifierField = () => ({
  name: "id",
  kind: "identifier" as const,
  required: true,
  summary: "Names this authored operation.",
});
const literalField = (name: string, required = false, values?: readonly string[]) => ({
  name,
  kind: "literal" as const,
  required,
  summary: `Defines ${name}.`,
  ...(values === undefined ? {} : { values }),
});
const referenceField = (name: string, type: TypeRef | readonly TypeRef[], required: boolean) => ({
  name,
  kind: "reference" as const,
  required,
  accepts: Array.isArray(type) ? type as readonly TypeRef[] : [type as TypeRef],
  summary: `Selects ${name}.`,
});

function declarationId(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${declaration.name}.id must be text.`);
  }
  return value.value.trim();
}

function outputBindings(
  declaration: AuthorDeclaration,
  outputs: readonly { readonly name: string; readonly type: TypeRef }[],
): readonly AuthorDeclarationBinding[] {
  const id = declarationId(declaration);
  return outputs.map((output) => ({
    name: `${id}.${output.name}`,
    ref: { kind: "component-output" as const, component: id, output: output.name },
    type: output.type,
  }));
}

export const stillVideoAuthorDeclaration = declarationCompiler(
  "still-video",
  [temporalTypes.duration, mediaOperationsTypes.stillVideoLayout,
    mediaOperationsTypes.stillVideoRequest, blobTypes.blob],
  {
    summary: "Spreads authored images over an exact duration as one ordinary video Blob.",
    fields: [
      identifierField(),
      referenceField("source", blobTypes.blob, false),
      literalField("duration", true),
      referenceField("clock", timelineTypes.clock, true),
    ],
    children: [{
      name: "Still",
      cardinality: "many",
      summary: "Adds one authored image and relative duration weight.",
      fields: [referenceField("source", blobTypes.blob, true), literalField("weight")],
    }],
  },
  (declaration) => outputBindings(declaration, [{ name: "video", type: blobTypes.blob }]),
  decodeStillVideoDeclaration,
);

export const extractAudioAuthorDeclaration = declarationCompiler(
  "extract-audio",
  [mediaOperationsTypes.audioExtractionRequest, blobTypes.blob],
  {
    summary: "Extracts one audio stream as a deterministic PCM WAV Blob.",
    fields: [identifierField(), referenceField("source", blobTypes.blob, true), literalField("audio", true)],
  },
  (declaration) => outputBindings(declaration, [{ name: "audio", type: blobTypes.blob }]),
  decodeExtractAudioDeclaration,
);

export const extractFrameAuthorDeclaration = declarationCompiler(
  "extract-frame",
  [mediaOperationsTypes.frameExtractionRequest, blobTypes.blob],
  {
    summary: "Extracts one still frame as a PNG Blob.",
    fields: [
      identifierField(),
      referenceField("source", blobTypes.blob, true),
      literalField("video", true),
      literalField("at", true),
    ],
  },
  (declaration) => outputBindings(declaration, [{ name: "image", type: blobTypes.blob }]),
  decodeExtractFrameDeclaration,
);

export const mediaOperationsAuthorDeclarations = [
  stillVideoAuthorDeclaration,
  extractAudioAuthorDeclaration,
  extractFrameAuthorDeclaration,
] as const;

export const mediaOperationsMarkupDeclarations = [
  { name: "still-video", tag: "StillVideo" },
  { name: "extract-audio", tag: "ExtractAudio" },
  { name: "extract-frame", tag: "ExtractFrame" },
] as const;
