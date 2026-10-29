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
import { mediaTypes } from "@hypit/media";
import { parseTemporalDuration, parseTemporalRate, temporalTypes } from "@hypit/temporal";
import type { ExactTemporalValue } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";

import {
  extractAudioFragment,
  extractFrameFragment,
  createStillVideoFragment,
  preparedMediaFragment,
  transformMediaFragment,
} from "./fragment.js";
import { mediaOperationsModuleRef, mediaOperationsTypes } from "./manifest.js";
import {
  sealAudioExtractionRequest,
  sealFrameExtractionRequest,
  sealMediaTransformProgram,
} from "./operations.js";
import { namedPictureInterpretation, sealMediaSelectionRequest } from "./selection.js";
import type {
  AudioExtractionRequest,
  FrameExtractionRequest,
  MediaSelectionRequest,
  MediaTransformOperation,
  MediaTransformRateKnot,
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

function authoredRecipe(
  raw: AuthorDeclarationFieldValue | undefined,
  label: string,
  resolve: (path: string) => DeclarationResolvedReference | undefined,
): Recipe {
  const value = typedReference(raw, label, recipeType, resolve);
  if (value.record === undefined) throw new Error(`${label} must be an authored SVS Recipe.`);
  const recipe = value.record.value as unknown as Recipe;
  const unknown = Object.keys(recipe.properties).filter((name) => !["audio", "picture", "span-authority", "video"].includes(name));
  if (unknown.length > 0) throw new Error(`${label} only accepts video, audio, picture and span-authority; found ${unknown.join(", ")}.`);
  return recipe;
}

function recipeText(recipe: Recipe, name: string, label: string): string {
  const value: CanonicalValue | undefined = recipe.properties[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} requires string property ${name}.`);
  }
  return value;
}

function stream(value: string, kind: "video"): MediaSelectionRequest["video"];
function stream(value: string, kind: "audio"): MediaSelectionRequest["audio"];
function stream(value: string, kind: "video" | "audio"): MediaSelectionRequest["video"] | MediaSelectionRequest["audio"] {
  if (kind === "video" && value === "primary-moving") return { mode: "primary-moving" };
  if (kind === "audio" && value === "default") return { mode: "default" };
  if (value === "none") return { mode: "none" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error(`${kind} must be ${kind === "video" ? "primary-moving" : "default"}, none or stream:<index>.`);
  return { mode: "stream-index", streamIndex: Number(match[1]) };
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

function exactSeconds(value: string, subject: string, allowZero = true): import("@hypit/temporal").ExactTemporalValue {
  const match = /^(\d+)(?:\.(\d+))?(?:s)?$/u.exec(value.trim());
  if (match === null) throw new Error(`${subject} must be seconds such as 0.25s or 2`);
  const fraction = match[2] ?? "";
  const ticks = `${match[1]}${fraction}`.replace(/^0+(?=\d)/u, "") || "0";
  if (!allowZero && /^0+$/u.test(ticks)) throw new Error(`${subject} must be positive`);
  const denominator = 10 ** fraction.length;
  if (!Number.isSafeInteger(denominator)) throw new Error(`${subject} has too many decimal places`);
  return { ticks, timeBase: { numerator: 1, denominator } };
}

function nonZeroRate(value: string, subject: string): { readonly numerator: number; readonly denominator: number } {
  const rate = parseTemporalRate(value.trim(), subject);
  if (rate.numerator === 0) throw new Error(`${subject} must be non-zero.`);
  return rate;
}

function localDuration(value: string, label: string): ExactTemporalValue {
  const duration = parseTemporalDuration(value, label);
  if (duration.unit === "frames") {
    throw new Error(`${label} cannot use frames because PreparedMedia has no Film Clock.`);
  }
  return duration.unit === "milliseconds"
    ? { ticks: String(duration.value), timeBase: { numerator: 1, denominator: 1_000 } }
    : { ticks: String(duration.numerator), timeBase: { numerator: 1, denominator: duration.denominator } };
}

function transformPoint(value: string, label: string): MediaTransformRateKnot["at"] {
  const zero = { ticks: "0", timeBase: { numerator: 1, denominator: 1 } } as const;
  if (value === "start" || value === "end") return { edge: value, offset: zero };
  const fromEnd = /^end-(.+)$/u.exec(value);
  if (fromEnd !== null) return { edge: "end", offset: localDuration(fromEnd[1]!, label) };
  const fromStart = /^(?:start\+)?(.+)$/u.exec(value);
  if (fromStart !== null) return { edge: "start", offset: localDuration(fromStart[1]!, label) };
  throw new Error(`${label} must be start, end, a duration from start, start+duration or end-duration.`);
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

function transformOperations(element: DeclarationElement): readonly MediaTransformOperation[] {
  const result: MediaTransformOperation[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Trim and Retime children.`);
      continue;
    }
    const name = localName(child.name);
    if (name === "Trim") {
      empty(child);
      exactAttributes(child, [], ["start", "end", "tail"]);
      const start = child.attributes.start;
      const end = child.attributes.end;
      const tail = child.attributes.tail;
      if (start === undefined && end === undefined && tail === undefined) {
        throw new Error(`${child.name} requires at least one of start, end or tail.`);
      }
      if (end !== undefined && tail !== undefined) throw new Error(`${child.name} cannot combine end and tail.`);
      const startValue = optionalLiteral(start, `${child.name}.start`);
      const endValue = optionalLiteral(end, `${child.name}.end`);
      const tailValue = optionalLiteral(tail, `${child.name}.tail`);
      result.push({
        kind: "trim",
        ...(startValue === undefined ? {} : { start: exactSeconds(startValue, `${child.name}.start`) }),
        ...(endValue === undefined ? {} : { end: exactSeconds(endValue, `${child.name}.end`, false) }),
        ...(tailValue === undefined ? {} : { tail: exactSeconds(tailValue, `${child.name}.tail`, false) }),
      });
      continue;
    }
    if (name === "Retime") {
      exactAttributes(child, [], ["rate"]);
      if (child.attributes.rate !== undefined) {
        empty(child);
        result.push({ kind: "retime", rate: nonZeroRate(text(child, "rate"), `${child.name}.rate`) });
        continue;
      }
      const knots: MediaTransformRateKnot[] = [];
      for (const part of child.children) {
        if (part.kind === "text") {
          if (part.value.trim().length > 0) throw new Error(`${child.name} accepts only Rate children.`);
          continue;
        }
        if (localName(part.name) !== "Rate") throw new Error(`${child.name} accepts only Rate children.`);
        exactAttributes(part, ["at", "value"]);
        empty(part);
        knots.push({
          at: transformPoint(text(part, "at"), `${part.name}.at`),
          rate: parseTemporalRate(text(part, "value"), `${part.name}.value`),
        });
      }
      if (knots.length < 2) throw new Error(`${child.name} requires a rate or at least two Rate children.`);
      result.push({ kind: "retime-profile", knots });
      continue;
    }
    throw new Error(`${element.name} accepts only Trim and Retime children.`);
  }
  if (result.length === 0) throw new Error(`${element.name} requires at least one Trim or Retime child.`);
  return result;
}

const decodePreparedMediaDeclaration: DeclarationDecoder = ({ element, resolveReference }) => {
  const required = ["id", "source"];
  const optional = ["audio", "picture", "recipe", "span-authority", "video"];
  exactAttributes(element, required, optional);
  const hasRecipe = element.attributes.recipe !== undefined;
  const policyCount = ["video", "audio", "span-authority"].filter((name) => element.attributes[name] !== undefined).length;
  if ((hasRecipe && policyCount !== 0) || (!hasRecipe && policyCount !== 3)) {
    throw new Error(`${element.name} requires exactly one of recipe or video/audio/span-authority.`);
  }
  empty(element);
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const recipe = hasRecipe ? authoredRecipe(element.attributes.recipe, `${element.name}.recipe`, resolveReference) : undefined;
  const video = stream(recipe === undefined ? text(element, "video") : recipeText(recipe, "video", `${element.name}.recipe`), "video");
  const audio = stream(recipe === undefined ? text(element, "audio") : recipeText(recipe, "audio", `${element.name}.recipe`), "audio");
  const spanAuthority = recipe === undefined ? text(element, "span-authority")
    : recipeText(recipe, "span-authority", `${element.name}.recipe`);
  if (spanAuthority !== "video" && spanAuthority !== "audio") throw new Error(`${element.name}.span-authority must be video or audio.`);
  const pictureValue = recipe === undefined ? (element.attributes.picture ?? "source")
    : (recipe.properties.picture ?? "source");
  if (typeof pictureValue !== "string") throw new Error(`${element.name}.picture must be text.`);
  const pictureName = pictureValue;
  if (!["source", "sdr-bt709", "bt2100-pq10", "bt2100-hlg10"].includes(pictureName)) {
    throw new Error(`${element.name}.picture must be source, sdr-bt709, bt2100-pq10 or bt2100-hlg10.`);
  }
  const picture = video.mode === "none" ? { mode: "none" as const }
    : pictureName === "source" ? { mode: "source" as const }
    : { mode: "explicit" as const,
      interpretation: namedPictureInterpretation(pictureName as "sdr-bt709" | "bt2100-pq10" | "bt2100-hlg10") };
  const requestId = `${id}.request`;
  const domainId = `${id}.domain-spec`;
  return {
    records: [
      { id: requestId, type: mediaOperationsTypes.selectionRequest,
        value: sealMediaSelectionRequest({ video, audio, spanAuthority, picture }), range: element.range },
      { id: domainId, type: mediaTypes.domainSpec, value: { id }, range: element.range },
    ],
    components: [{
      id,
      fragment: preparedMediaFragment,
      inputs: { source: source.ref, request: { kind: "record", id: requestId }, domain: { kind: "record", id: domainId } },
      outputs: { media: `${id}.media`, domain: `${id}.domain`, extent: `${id}.extent` },
      range: element.range,
    }],
  };
};

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

const decodeTransformMediaDeclaration: DeclarationDecoder = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source"]);
  const id = text(element, "id");
  const source = typedReference(element.attributes.source, `${element.name}.source`, mediaTypes.prepared, resolveReference);
  const program = sealMediaTransformProgram({
    operations: transformOperations(element),
  });
  const programId = `${id}.program`;
  const domainId = `${id}.domain-spec`;
  return {
    records: [
      { id: programId, type: mediaOperationsTypes.transformProgram, value: (program), range: element.range },
      { id: domainId, type: mediaTypes.domainSpec, value: { id }, range: element.range },
    ],
    components: [{
      id,
      fragment: transformMediaFragment,
      inputs: {
        media: source.ref,
        program: { kind: "record", id: programId },
        domain: { kind: "record", id: domainId },
      },
      outputs: { media: `${id}.media`, domain: `${id}.domain`, extent: `${id}.extent` },
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
    output: { container: "wav", codec: "pcm_s16le", sampleRate: 48_000, channels: 2 },
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
    output: { format: "png" },
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

export const preparedMediaAuthorDeclaration = declarationCompiler(
  "prepared-media",
  [mediaOperationsTypes.selectionRequest, mediaTypes.domainSpec, mediaTypes.prepared,
    temporalTypes.localDomain, temporalTypes.extent],
  {
    summary: "Selects time-bearing members from one Blob as execution-independent PreparedMedia.",
    fields: [
      identifierField(),
      referenceField("source", blobTypes.blob, true),
      referenceField("recipe", recipeType, false),
      literalField("video"),
      literalField("audio"),
      literalField("picture", false, ["source", "sdr-bt709", "bt2100-pq10", "bt2100-hlg10"]),
      literalField("span-authority", false, ["video", "audio"]),
    ],
  },
  (declaration) => outputBindings(declaration, [
    { name: "media", type: mediaTypes.prepared },
    { name: "domain", type: temporalTypes.localDomain },
    { name: "extent", type: temporalTypes.extent },
  ]),
  decodePreparedMediaDeclaration,
);

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

export const transformMediaAuthorDeclaration = declarationCompiler(
  "transform-media",
  [mediaOperationsTypes.transformProgram, mediaTypes.domainSpec, mediaTypes.prepared,
    temporalTypes.localDomain, temporalTypes.extent],
  {
    summary: "Composes exact trim and retime relations over PreparedMedia without materializing a file.",
    fields: [identifierField(), referenceField("source", mediaTypes.prepared, true)],
    children: [
      { name: "Trim", cardinality: "many", summary: "Keeps one exact subrange.",
        fields: [literalField("start"), literalField("end"), literalField("tail")] },
      { name: "Retime", cardinality: "many", summary: "Changes local media advance by an exact non-zero ratio; a negative ratio reverses it.",
        fields: [literalField("rate")], children: [{
          name: "Rate", cardinality: "many",
          summary: "Places one signed source-per-target rate on the current PreparedMedia domain.",
          fields: [literalField("at", true), literalField("value", true)],
        }] },
    ],
  },
  (declaration) => outputBindings(declaration, [
    { name: "media", type: mediaTypes.prepared },
    { name: "domain", type: temporalTypes.localDomain },
    { name: "extent", type: temporalTypes.extent },
  ]),
  decodeTransformMediaDeclaration,
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
  preparedMediaAuthorDeclaration,
  stillVideoAuthorDeclaration,
  transformMediaAuthorDeclaration,
  extractAudioAuthorDeclaration,
  extractFrameAuthorDeclaration,
] as const;

export const mediaOperationsMarkupDeclarations = [
  { name: "prepared-media", tag: "Prepare" },
  { name: "still-video", tag: "StillVideo" },
  { name: "transform-media", tag: "Transform" },
  { name: "extract-audio", tag: "ExtractAudio" },
  { name: "extract-frame", tag: "ExtractFrame" },
] as const;
