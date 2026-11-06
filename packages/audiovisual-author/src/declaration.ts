import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationFieldValue,
  type AuthorResolvedReference,
  type AuthorValueRef,
} from "@hypit/hypit/author";
import { canonicalize, sameType, type TypeRef } from "@hypit/hypit/protocol";
import { audiovisualTypes } from "@hypit/audiovisual";
import { spatialTypes } from "@hypit/spatial";
import {
  sealLocalSpatialDomain,
  type LocalSpatialDomain,
  type SpatialRegion,
} from "@hypit/spatial/algebra";
import { temporalTypes } from "@hypit/temporal";
import {
  exactTemporalValue,
  exactTemporalZero,
  type ExactTemporalRelation,
  type ExactTemporalRelationSpec,
  type ExactTemporalRelativePoint,
  type ExactTemporalRelativeRange,
  type ExactTemporalValue,
  type TemporalRange,
} from "@hypit/temporal/algebra";

import {
  createAudiovisualProgramDomainFragment,
  createOccurrenceBoundOccurrenceUseFragment,
  createOccurrenceClosureFragment,
  createOccurrenceUseFragment,
  createSourceBoundOccurrenceUseFragment,
  createUniqueSourceEventPositionFragment,
  createResolvedAudiovisualProgramFragment,
} from "./fragment.js";
import { audiovisualAuthorModuleRef, audiovisualAuthorTypes } from "./manifest.js";
import type {
  AudiovisualAuthorAudioExpression,
  AudiovisualAuthorControlBinding,
  AudiovisualAuthorOccurrence,
  AudiovisualAuthorPictureExpression,
  AudiovisualAuthorSpec,
  AudiovisualAuthorValue,
} from "./types.js";
import { assertAudiovisualAuthorSpec } from "./validation.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function field(value: DeclarationLike, name: string) {
  return declarationField(value, name);
}

function label(value: DeclarationLike): string {
  if (value.label === undefined || value.label.trim().length === 0) {
    throw new Error(`Audiovisual ${value.name} requires a non-empty label.`);
  }
  return value.label;
}

function reference(value: DeclarationLike, name: string): string {
  const result = field(value, name);
  if (result?.kind !== "reference") throw new Error(`Audiovisual ${value.name}.${name} must be a reference.`);
  return result.path;
}

function optionalReference(value: DeclarationLike, name: string): string | undefined {
  return field(value, name) === undefined ? undefined : reference(value, name);
}

function literal(value: DeclarationLike, name: string): string {
  const result = field(value, name);
  if (result?.kind !== "literal" || result.value.trim().length === 0) {
    throw new Error(`Audiovisual ${value.name}.${name} must be a non-empty literal.`);
  }
  return result.value.trim();
}

function exact(value: string, subject: string): ExactTemporalValue {
  const match = /^(\d+)(?:\.(\d+))?(ms|s)$/u.exec(value);
  if (match === null) throw new Error(`${subject} must be exact seconds or milliseconds; frame numbers are output policy.`);
  const fraction = match[2] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(match[1]!) * scale + BigInt(fraction.length === 0 ? "0" : fraction);
  const unit = match[3];
  return exactTemporalValue({ numerator, denominator: scale * (unit === "ms" ? 1000n : 1n) });
}

type FutureValue = {
  readonly kind: "exact" | "temporal-map" | "spatial-map";
  readonly binding: string;
  readonly reference: AuthorResolvedReference;
};

function useComponentId(program: string, occurrence: string): string {
  return `${program}:occurrence:${occurrence}:use`;
}

function occurrenceEndPath(path: string): string | undefined {
  const parts = path.split(".");
  return parts.length === 3 && parts[0] === "occurrence" && parts[2] === "end"
    ? parts[1]
    : undefined;
}

async function authorValue(
  value: ReturnType<typeof field>,
  subject: string,
  binding: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  futures: FutureValue[],
): Promise<AudiovisualAuthorValue<ExactTemporalValue>> {
  if (value?.kind === "literal") return exact(value.value.trim(), subject);
  if (value?.kind !== "reference") throw new Error(`${subject} must be an exact literal or typed reference.`);
  const resolved = await resolve(value.path);
  if (resolved === undefined) throw new Error(`${subject} references missing value ${value.path}.`);
  futures.push({ kind: "exact", binding, reference: resolved });
  return { kind: "binding", name: binding };
}

function entries(value: AuthorDeclarationFieldValue, subject: string): Map<string, AuthorDeclarationFieldValue> {
  if (value.kind !== "record") throw new Error(`${subject} must be a record.`);
  return new Map(value.entries.map((entry) => [entry.name, entry.value]));
}

function literalValue(value: AuthorDeclarationFieldValue | undefined, subject: string): string {
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${subject} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function numberValue(value: AuthorDeclarationFieldValue | undefined, subject: string): number {
  const result = Number(literalValue(value, subject).replace(/px$/u, ""));
  if (!Number.isFinite(result)) throw new Error(`${subject} must be finite.`);
  return result;
}

function temporalRange(value: AuthorDeclarationFieldValue, subject: string): TemporalRange {
  const fields = entries(value, subject);
  return {
    start: exact(literalValue(fields.get("from"), `${subject}.from`), `${subject}.from`),
    end: exact(literalValue(fields.get("until"), `${subject}.until`), `${subject}.until`),
  };
}

function spatialRegion(value: AuthorDeclarationFieldValue, subject: string): SpatialRegion {
  const fields = entries(value, subject);
  return {
    x: numberValue(fields.get("x"), `${subject}.x`),
    y: numberValue(fields.get("y"), `${subject}.y`),
    width: numberValue(fields.get("width"), `${subject}.width`),
    height: numberValue(fields.get("height"), `${subject}.height`),
  };
}

const fullRange = (): ExactTemporalRelativeRange => ({
  from: { edge: "start", offset: exactTemporalZero() },
  until: { edge: "end", offset: exactTemporalZero() },
});

function relativePoint(
  value: AuthorDeclarationFieldValue | undefined,
  subject: string,
  fallback: "start" | "end",
): ExactTemporalRelativePoint {
  if (value === undefined) return { edge: fallback, offset: exactTemporalZero() };
  if (value.kind === "literal") {
    const edge = value.value.trim();
    if (edge !== "start" && edge !== "end") throw new Error(`${subject} must be start, end or a point record.`);
    return { edge, offset: exactTemporalZero() };
  }
  const fields = entries(value, subject);
  const edge = literalValue(fields.get("edge"), `${subject}.edge`);
  if (edge !== "start" && edge !== "end") throw new Error(`${subject}.edge must be start or end.`);
  const offset = fields.get("offset");
  return { edge, offset: offset === undefined ? exactTemporalZero()
    : exact(literalValue(offset, `${subject}.offset`), `${subject}.offset`) };
}

function relativeRange(
  value: AuthorDeclarationFieldValue | undefined,
  subject: string,
): ExactTemporalRelativeRange {
  if (value === undefined) return fullRange();
  const fields = entries(value, subject);
  return {
    from: relativePoint(fields.get("from"), `${subject}.from`, "start"),
    until: relativePoint(fields.get("until"), `${subject}.until`, "end"),
  };
}

function rate(value: AuthorDeclarationFieldValue | undefined, subject: string) {
  if (value === undefined) return { numerator: 1, denominator: 1 };
  if (value.kind === "literal") {
    const match = /^(-?\d+)(?:\/(\d+))?$/u.exec(value.value.trim());
    if (match === null) throw new Error(`${subject} must be an integer or rational literal.`);
    return { numerator: Number(match[1]), denominator: Number(match[2] ?? "1") };
  }
  const fields = entries(value, subject);
  return {
    numerator: numberValue(fields.get("numerator"), `${subject}.numerator`),
    denominator: numberValue(fields.get("denominator"), `${subject}.denominator`),
  };
}

function relation(value: AuthorDeclarationFieldValue, subject: string): ExactTemporalRelation {
  const fields = entries(value, subject);
  const kind = literalValue(fields.get("kind"), `${subject}.kind`);
  const target = relativeRange(fields.get("target"), `${subject}.target`);
  if (kind === "fit") return {
    kind, target, source: relativeRange(fields.get("source"), `${subject}.source`),
  };
  if (kind === "rate") return {
    kind,
    target,
    targetAt: relativePoint(fields.get("target-at"), `${subject}.target-at`, "start"),
    sourceAt: relativePoint(fields.get("source-at"), `${subject}.source-at`, "start"),
    rate: rate(fields.get("rate"), `${subject}.rate`),
    source: relativeRange(fields.get("source"), `${subject}.source`),
    ...(fields.get("wrap") === undefined ? {} : {
      wrap: relativeRange(fields.get("wrap"), `${subject}.wrap`),
    }),
  };
  if (kind === "cubic") return {
    kind,
    target,
    sourceAtStart: relativePoint(fields.get("source-at-start"), `${subject}.source-at-start`, "start"),
    sourceControl1: relativePoint(fields.get("source-control-1"), `${subject}.source-control-1`, "start"),
    sourceControl2: relativePoint(fields.get("source-control-2"), `${subject}.source-control-2`, "end"),
    sourceAtEnd: relativePoint(fields.get("source-at-end"), `${subject}.source-at-end`, "end"),
  };
  throw new Error(`${subject}.kind must be rate, fit or cubic.`);
}

function relationSpec(value: AuthorDeclarationFieldValue, subject: string): ExactTemporalRelationSpec {
  const fields = value.kind === "record" ? new Map(value.entries.map((entry) => [entry.name, entry.value])) : undefined;
  const authored = fields?.get("relations") ?? value;
  const values = authored.kind === "list" ? authored.items : [authored];
  if (values.length === 0) throw new Error(`${subject} requires at least one relation.`);
  return { relations: values.map((item, index) => relation(item, `${subject}.${index}`)) };
}

async function futureValue(
  value: AuthorDeclarationFieldValue,
  subject: string,
  binding: string,
  kind: FutureValue["kind"],
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  futures: FutureValue[],
) {
  if (value.kind !== "reference") throw new Error(`${subject} must be a typed reference.`);
  const resolved = await resolve(value.path);
  if (resolved === undefined || !sameType(resolved.type, expected)) throw new Error(`${subject} has the wrong Type.`);
  futures.push({ kind, binding, reference: resolved });
  return { kind: "binding" as const, name: binding };
}

function local(path: string, group: string, subject: string): readonly string[] {
  const parts = path.split(".");
  if (parts[0] !== group || parts.length < 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`${subject} must reference @${group}.<name>.`);
  }
  return parts.slice(1);
}

async function outputs(
  value: DeclarationLike,
  id: string,
  occurrence: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  reconstructions: Array<{ readonly name: string; readonly reference: AuthorResolvedReference;
    readonly range: AuthorDeclarationChild["range"] }>,
): Promise<AudiovisualAuthorOccurrence["outputs"]> {
  const result = field(value, "outputs");
  if (result?.kind !== "record" || result.entries.length === 0) {
    throw new Error(`Audiovisual ${value.name}.outputs must be a non-empty record.`);
  }
  return Object.fromEntries(await Promise.all(result.entries.map(async (entry) => {
    if (entry.value.kind !== "record") {
      throw new Error(`Audiovisual ${value.name}.outputs.${entry.name} must be a record.`);
    }
    const fields = new Map(entry.value.entries.map((item) => [item.name, item.value]));
    const reconstruction = fields.get("reconstruction");
    let reconstructionName: string | undefined;
    if (reconstruction !== undefined) {
      if (reconstruction.kind !== "reference") {
        throw new Error(`Audiovisual ${value.name}.outputs.${entry.name}.reconstruction must be a reference.`);
      }
      const resolved = await resolve(reconstruction.path);
      if (resolved === undefined || !sameType(resolved.type, audiovisualTypes.signalReconstruction)) {
        throw new Error(`Audiovisual ${value.name}.outputs.${entry.name}.reconstruction has the wrong Type.`);
      }
      reconstructionName = `${id}:occurrence:${occurrence}:${entry.name}:reconstruction`;
      reconstructions.push({ name: reconstructionName, reference: resolved, range: value.range });
    }
    return [entry.name, {
      ...(fields.get("relation") === undefined ? {} : {
        relation: relationSpec(fields.get("relation")!,
          `Audiovisual ${value.name}.outputs.${entry.name}.relation`),
      }),
      ...(reconstructionName === undefined ? {} : { reconstruction: reconstructionName }),
    }];
  })));
}

function localReferenceList(value: DeclarationLike, name: string, group: string): readonly string[] {
  const result = field(value, name);
  if (result?.kind !== "list" || result.items.length === 0) {
    throw new Error(`Audiovisual ${value.name}.${name} must be a non-empty reference list.`);
  }
  return result.items.map((item) => {
    if (item.kind !== "reference") throw new Error(`Audiovisual ${value.name}.${name} accepts references.`);
    return local(item.path, group, `Audiovisual ${value.name}.${name}`)[0]!;
  });
}

async function controlBindings(
  value: DeclarationLike,
  id: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  futures: FutureValue[],
): Promise<Readonly<Record<string, AudiovisualAuthorControlBinding>>> {
  const controls = field(value, "controls");
  if (controls === undefined) return {};
  if (controls.kind !== "record") throw new Error(`Audiovisual ${value.name}.controls must be a record.`);
  return Object.fromEntries(await Promise.all(controls.entries.map(async (entry) => {
    const binding = entry.value;
    if (binding.kind === "literal") {
      if (binding.value !== "programme") {
        throw new Error(`Audiovisual ${value.name}.controls.${entry.name} has an unsupported binding.`);
      }
      return [entry.name, { kind: "program" as const }];
    }
    if (binding.kind === "record") {
      return [entry.name, { kind: "relation" as const,
        relation: relationSpec(binding, `Audiovisual ${value.name}.controls.${entry.name}`) }];
    }
    if (binding.kind !== "reference") {
      throw new Error(`Audiovisual ${value.name}.controls.${entry.name} has an invalid binding.`);
    }
    if (binding.path.startsWith("occurrence.")) {
      const parts = local(binding.path, "occurrence", `Audiovisual ${value.name}.controls.${entry.name}`);
      if (parts.length === 1) return [entry.name, { kind: "occurrence" as const, occurrence: parts[0]! }];
      if (parts.length === 2) return [entry.name, {
        kind: "source" as const,
        occurrence: parts[0]!,
        output: parts[1]!,
      }];
      throw new Error(`Audiovisual ${value.name}.controls.${entry.name} has an invalid occurrence endpoint.`);
    }
    const name = `${id}:control:${entry.name}:mapping`;
    return [entry.name, { kind: "mapping" as const, mapping: await futureValue(
      binding, `Audiovisual ${value.name}.controls.${entry.name}`, name,
      "temporal-map", temporalTypes.map, resolve, futures,
    ) }];
  })));
}

function localExpression(value: AuthorDeclarationChild, name: string, group: "picture" | "audio") {
  const path = reference(value, name);
  const [binding, ...rest] = local(path, group, `Audiovisual ${group} ${label(value)}.${name}`);
  if (rest.length > 0) throw new Error(`Audiovisual ${group} ${label(value)}.${name} must address one binding.`);
  return { kind: "reference" as const, name: binding! };
}

async function pictureExpression(
  value: AuthorDeclarationChild,
  id: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  futures: FutureValue[],
): Promise<AudiovisualAuthorPictureExpression> {
  const use = optionalReference(value, "use");
  const over = field(value, "over");
  const transparent = field(value, "transparent");
  const apply = optionalReference(value, "apply");
  const restrict = field(value, "restrict");
  const crop = field(value, "crop");
  const remap = field(value, "remap");
  const modes = [use !== undefined, over !== undefined, transparent !== undefined, apply !== undefined,
    restrict !== undefined, crop !== undefined, remap !== undefined]
    .filter(Boolean).length;
  if (modes !== 1) throw new Error(`Audiovisual picture ${label(value)} requires exactly one expression form.`);
  if (use !== undefined) {
    const [occurrence, output, ...rest] = local(use, "occurrence", `Audiovisual picture ${label(value)}.use`);
    if (output === undefined || rest.length > 0) throw new Error(`Audiovisual picture use must address one occurrence output.`);
    return { kind: "use", occurrence: occurrence!, output };
  }
  if (over !== undefined) {
    return { kind: "over", inputs: localReferenceList(value, "over", "picture")
      .map((name) => ({ kind: "reference", name })) };
  }
  if (transparent !== undefined) {
    if (literal(value, "transparent") !== "true") throw new Error("Audiovisual picture.transparent must be true.");
    return { kind: "transparent" };
  }
  if (restrict !== undefined) return {
    kind: "restrict", input: localExpression(value, "input", "picture"),
    range: temporalRange(restrict, `Audiovisual picture ${label(value)}.restrict`),
  };
  if (crop !== undefined) return {
    kind: "crop", input: localExpression(value, "input", "picture"),
    region: spatialRegion(crop, `Audiovisual picture ${label(value)}.crop`),
  };
  if (remap !== undefined) return {
    kind: "remap", input: localExpression(value, "input", "picture"),
    mapping: await futureValue(remap, `Audiovisual picture ${label(value)}.remap`,
      `${id}:picture:${label(value)}:mapping`, "spatial-map", spatialTypes.map, resolve, futures),
  };
  const inputs = field(value, "inputs");
  if (inputs?.kind !== "record" || inputs.entries.length === 0) {
    throw new Error(`Audiovisual picture ${label(value)} operator requires named inputs.`);
  }
  return {
    kind: "apply",
    operator: label(value),
    inputs: Object.fromEntries(inputs.entries.map((entry) => {
      if (entry.value.kind !== "reference") throw new Error("Audiovisual picture operator inputs must be references.");
      const [name, ...rest] = local(entry.value.path, "picture", `Audiovisual picture ${label(value)} input`);
      if (rest.length > 0) throw new Error("Audiovisual picture input must address one picture binding.");
      return [entry.name, { kind: "reference" as const, name: name! }];
    })),
    controlBindings: await controlBindings(value, `${id}:picture:${label(value)}`, resolve, futures),
  };
}

async function audioExpression(
  value: AuthorDeclarationChild,
  id: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
  futures: FutureValue[],
): Promise<AudiovisualAuthorAudioExpression> {
  const use = optionalReference(value, "use");
  const mix = field(value, "mix");
  const silence = field(value, "silence");
  const apply = optionalReference(value, "apply");
  const restrict = field(value, "restrict");
  const modes = [use !== undefined, mix !== undefined, silence !== undefined, apply !== undefined,
    restrict !== undefined]
    .filter(Boolean).length;
  if (modes !== 1) throw new Error(`Audiovisual audio ${label(value)} requires exactly one expression form.`);
  if (use !== undefined) {
    const [occurrence, output, ...rest] = local(use, "occurrence", `Audiovisual audio ${label(value)}.use`);
    if (output === undefined || rest.length > 0) throw new Error("Audiovisual audio use must address one occurrence output.");
    return { kind: "use", occurrence: occurrence!, output };
  }
  if (mix !== undefined) {
    return { kind: "mix", inputs: localReferenceList(value, "mix", "audio")
      .map((name) => ({ kind: "reference", name })) };
  }
  if (silence !== undefined) {
    if (literal(value, "silence") !== "true") throw new Error("Audiovisual audio.silence must be true.");
    return { kind: "silence" };
  }
  if (restrict !== undefined) return {
    kind: "restrict", input: localExpression(value, "input", "audio"),
    range: temporalRange(restrict, `Audiovisual audio ${label(value)}.restrict`),
  };
  const inputs = field(value, "inputs");
  if (inputs?.kind !== "record" || inputs.entries.length === 0) {
    throw new Error(`Audiovisual audio ${label(value)} operator requires named inputs.`);
  }
  return {
    kind: "apply",
    operator: label(value),
    inputs: Object.fromEntries(inputs.entries.map((entry) => {
      if (entry.value.kind !== "reference") throw new Error("Audiovisual audio operator inputs must be references.");
      const [name, ...rest] = local(entry.value.path, "audio", `Audiovisual audio ${label(value)} input`);
      if (rest.length > 0) throw new Error("Audiovisual audio input must address one audio binding.");
      return [entry.name, { kind: "reference" as const, name: name! }];
    })),
    controlBindings: await controlBindings(value, `${id}:audio:${label(value)}`, resolve, futures),
  };
}

function pictureDomain(value: ReturnType<typeof field>, id: string): LocalSpatialDomain | undefined {
  if (value === undefined || value.kind === "reference") return undefined;
  if (value.kind !== "record") throw new Error("Audiovisual Program.picture-domain must be a record or typed reference.");
  const entries = new Map(value.entries.map((entry) => [entry.name, entry.value]));
  const dimension = (name: "width" | "height"): number => {
    const item = entries.get(name);
    if (item?.kind !== "literal") throw new Error(`Audiovisual picture-domain.${name} must be a positive px literal.`);
    const match = /^(\d+(?:\.\d+)?)px$/u.exec(item.value.trim());
    const number = match === null ? Number.NaN : Number(match[1]);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`Audiovisual picture-domain.${name} is invalid.`);
    return number;
  };
  return sealLocalSpatialDomain({ id: `${id}:picture-space`, region: {
    x: 0, y: 0, width: dimension("width"), height: dimension("height"),
  } });
}

function record(id: string, type: TypeRef, value: unknown, range: AuthorDeclaration["range"]) {
  return { id, type, value: canonicalize(value), range };
}

const sourceChild = {
  name: "source",
  label: "required" as const,
  cardinality: "many" as const,
  summary: "Binds one independently authored ProgramSource under a Programme-local name.",
  fields: [{ name: "value", kind: "reference" as const, required: true, accepts: [audiovisualTypes.programSource],
    summary: "Selects the typed Source value." }],
};

const occurrenceChild = {
  name: "occurrence",
  label: "required" as const,
  cardinality: "many" as const,
  summary: "Places one use of a Programme-local Source.",
  fields: [
    { name: "source", kind: "reference" as const, referenceScope: "declaration" as const, required: true,
      summary: "Selects a Programme-local Source binding." },
    { name: "at", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Places the occurrence at an exact position supplied by the authoring layer." },
    { name: "duration", kind: "expression" as const, referenceScope: "declaration" as const,
      required: false, accepts: [temporalTypes.exactValue],
      summary: "Optionally fixes the occurrence duration; omission waits for actual Source domains." },
    { name: "outputs", kind: "expression" as const, referenceScope: "declaration" as const, required: true,
      summary: "Selects Source outputs and optionally authors each output's relation and reconstruction." },
  ],
  children: [{
    name: "time",
    label: "forbidden" as const,
    cardinality: "optional" as const,
    summary: "Binds this use to source time, occurrence time or one source-local event.",
    fields: [
      { name: "bound", kind: "literal" as const, required: true,
        values: ["source", "occurrence", "event"], summary: "Selects the time binding algebra." },
      { name: "to", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
        summary: "Selects an occurrence or one of its outputs for source/occurrence binding." },
      { name: "through", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
        summary: "Selects the occurrence output Mapping used for an event preimage." },
      { name: "event", kind: "reference" as const, required: false, accepts: [temporalTypes.regionSet],
        summary: "Selects a domain-bearing source-local event region set." },
      { name: "require", kind: "literal" as const, required: false, values: ["unique"],
        summary: "Requires the event preimage to contain exactly one sided point." },
      { name: "offset", kind: "expression" as const, required: false, accepts: [temporalTypes.exactValue],
        summary: "Adds an explicit exact offset after event projection." },
    ],
  }],
};

const pictureChild = {
  name: "picture",
  label: "required" as const,
  cardinality: "many" as const,
  summary: "Names one Programme-local Picture expression.",
  fields: [
    { name: "use", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
      summary: "Uses one occurrence output." },
    { name: "over", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Composites named Picture expressions in paint order." },
    { name: "transparent", kind: "literal" as const, required: false, values: ["true"],
      summary: "Creates a transparent Picture expression." },
    { name: "apply", kind: "reference" as const, required: false, accepts: [audiovisualTypes.pictureOperator],
      summary: "Applies a package-owned Picture Operator." },
    { name: "inputs", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Binds named Picture Operator inputs." },
    { name: "controls", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Binds Operator Controls to Programme, occurrence or selected Source time." },
    { name: "input", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
      summary: "Selects the input of restrict, crop or remap." },
    { name: "restrict", kind: "expression" as const, required: false,
      summary: "Restricts the input to an exact seconds-based range." },
    { name: "crop", kind: "expression" as const, required: false,
      summary: "Crops the input to one spatial region." },
    { name: "remap", kind: "reference" as const, required: false, accepts: [spatialTypes.map],
      summary: "Samples the input through a typed Spatial Map." },
  ],
};

const audioChild = {
  name: "audio",
  label: "required" as const,
  cardinality: "many" as const,
  summary: "Names one Programme-local Audio expression.",
  fields: [
    { name: "use", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
      summary: "Uses one occurrence output." },
    { name: "mix", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Mixes named Audio expressions." },
    { name: "silence", kind: "literal" as const, required: false, values: ["true"],
      summary: "Creates a silent Audio expression." },
    { name: "apply", kind: "reference" as const, required: false, accepts: [audiovisualTypes.audioOperator],
      summary: "Applies a package-owned Audio Operator." },
    { name: "inputs", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Binds named Audio Operator inputs." },
    { name: "controls", kind: "expression" as const, referenceScope: "declaration" as const, required: false,
      summary: "Binds Operator Controls to Programme, occurrence or selected Source time." },
    { name: "input", kind: "reference" as const, referenceScope: "declaration" as const, required: false,
      summary: "Selects the input of restrict." },
    { name: "restrict", kind: "expression" as const, required: false,
      summary: "Restricts the input to an exact seconds-based range." },
  ],
};

export const audiovisualProgramAuthorDeclaration: AuthorDeclarationCompiler = {
  module: audiovisualAuthorModuleRef,
  declaration: "Program",
  outputs: [
    audiovisualTypes.program,
    temporalTypes.exactValue,
    audiovisualAuthorTypes.spec,
    audiovisualAuthorTypes.valueBinding,
    audiovisualAuthorTypes.operatorBinding,
    audiovisualAuthorTypes.reconstructionBinding,
    audiovisualAuthorTypes.occurrenceUseSpec,
    audiovisualAuthorTypes.occurrenceUse,
    audiovisualAuthorTypes.sourceBoundSpec,
    audiovisualAuthorTypes.occurrenceBoundSpec,
    audiovisualAuthorTypes.occurrenceOutputSpec,
    audiovisualAuthorTypes.programDomainSpec,
    audiovisualAuthorTypes.occurrence,
    temporalTypes.localDomain,
  ],
  shape: {
    summary: "Authors a finite audiovisual Programme from typed Sources and package-owned signal expressions.",
    label: "required",
    fields: [
      { name: "duration", kind: "expression", referenceScope: "declaration", required: true,
        accepts: [temporalTypes.exactValue],
        summary: "Defines the exact Programme-local output domain." },
      { name: "picture-domain", kind: "expression", required: false, accepts: [spatialTypes.localDomain],
        summary: "Defines or references the Programme Picture output domain." },
    ],
    children: [sourceChild, occurrenceChild, pictureChild, audioChild, {
      name: "output",
      label: "forbidden",
      cardinality: "one",
      summary: "Selects the Programme roots.",
      fields: [
        { name: "picture", kind: "reference", referenceScope: "declaration", required: false,
          summary: "Selects one named Picture expression." },
        { name: "audio", kind: "reference", referenceScope: "declaration", required: false,
          summary: "Selects one named Audio expression." },
      ],
    }],
  },
  bindings(declaration) {
    const id = label(declaration);
    return [{
      name: id,
      ref: { kind: "component-output", component: `${id}:program`, output: "program" },
      type: audiovisualTypes.program,
    }];
  },
  async compile({ declaration, resolveReference }) {
    const id = label(declaration);
    const sources = declaration.children.filter((child) => child.name === "source");
    const occurrences = declaration.children.filter((child) => child.name === "occurrence");
    const pictures = declaration.children.filter((child) => child.name === "picture");
    const audios = declaration.children.filter((child) => child.name === "audio");
    const output = declaration.children.find((child) => child.name === "output")!;
    const futures: FutureValue[] = [];
    const reconstructionReferences: Array<{ readonly name: string; readonly reference: AuthorResolvedReference;
      readonly range: AuthorDeclarationChild["range"] }> = [];
    const constructionRecords: ReturnType<typeof record>[] = [];
    const constructionRecordIds = new Set<string>();
    const eventReferences = new Map<string, AuthorResolvedReference>();
    const occurrenceByName = new Map(occurrences.map((child) => [label(child), child]));
    const exactReference = async (
      value: ReturnType<typeof field>,
      subject: string,
      literalId: string,
      range: AuthorDeclarationChild["range"] | AuthorDeclaration["range"],
    ): Promise<AuthorResolvedReference> => {
      if (value?.kind === "literal") {
        if (!constructionRecordIds.has(literalId)) {
          constructionRecords.push(record(literalId, temporalTypes.exactValue,
            exact(value.value.trim(), subject), range ?? declaration.range));
          constructionRecordIds.add(literalId);
        }
        return { ref: { kind: "record", id: literalId }, type: temporalTypes.exactValue };
      }
      if (value?.kind !== "reference") {
        throw new Error(`${subject} must be an exact literal or typed reference.`);
      }
      const occurrenceEnd = occurrenceEndPath(value.path);
      if (occurrenceEnd !== undefined) {
        if (!occurrenceByName.has(occurrenceEnd)) {
          throw new Error(`${subject} references missing occurrence ${occurrenceEnd}.`);
        }
        return {
          ref: { kind: "component-output", component: useComponentId(id, occurrenceEnd), output: "end" },
          type: temporalTypes.exactValue,
        };
      }
      const resolved = await resolveReference(value.path);
      if (resolved === undefined) throw new Error(`${subject} references missing value ${value.path}.`);
      if (!sameType(resolved.type, temporalTypes.exactValue)) {
        throw new Error(`${subject} must reference an ExactTemporalValue.`);
      }
      return resolved;
    };
    const authoredProgramDuration = field(declaration, "duration");
    const durationBinding = `${id}:duration`;
    const duration = authoredProgramDuration?.kind === "literal"
      ? exact(authoredProgramDuration.value.trim(), `Audiovisual Program ${id}.duration`)
      : { kind: "binding" as const, name: durationBinding };
    if (authoredProgramDuration?.kind !== "literal") futures.push({
      kind: "exact",
      binding: durationBinding,
      reference: await exactReference(authoredProgramDuration, `Audiovisual Program ${id}.duration`,
        `${durationBinding}:literal`, declaration.range),
    });
    const occurrenceValues: Record<string, AudiovisualAuthorOccurrence> = {};
    for (const child of occurrences) {
      const occurrence = label(child);
      const [source, ...rest] = local(reference(child, "source"), "source", `Audiovisual occurrence ${occurrence}.source`);
      if (rest.length > 0) throw new Error(`Audiovisual occurrence ${occurrence}.source must address one Source binding.`);
      const authoredAt = field(child, "at");
      const time = child.children.find((candidate) => candidate.name === "time");
      if ((authoredAt === undefined) === (time === undefined)) {
        throw new Error(`Audiovisual occurrence ${occurrence} must declare exactly one of at or time.`);
      }
      const atBinding = `${id}:occurrence:${occurrence}:at`;
      const at = authoredAt === undefined ? undefined : authoredAt.kind === "literal"
        ? exact(authoredAt.value.trim(), `Audiovisual occurrence ${occurrence}.at`)
        : { kind: "binding" as const, name: atBinding };
      if (authoredAt !== undefined && authoredAt.kind !== "literal") {
        futures.push({
          kind: "exact",
          binding: atBinding,
          reference: await exactReference(authoredAt, `Audiovisual occurrence ${occurrence}.at`,
            `${atBinding}:literal`, child.range),
        });
      }
      let timeValue: AudiovisualAuthorOccurrence["time"];
      if (time !== undefined) {
        const bound = literal(time, "bound");
        if (bound === "source") {
          const [target, output, ...rest] = local(reference(time, "to"), "occurrence",
            `Audiovisual occurrence ${occurrence} source binding`);
          if (output === undefined || rest.length > 0) {
            throw new Error(`Audiovisual occurrence ${occurrence} source binding must target @occurrence.<name>.<output>.`);
          }
          timeValue = { kind: "source", occurrence: target!, output };
        } else if (bound === "occurrence") {
          const [target, ...rest] = local(reference(time, "to"), "occurrence",
            `Audiovisual occurrence ${occurrence} occurrence binding`);
          if (rest.length > 0) {
            throw new Error(`Audiovisual occurrence ${occurrence} occurrence binding must target @occurrence.<name>.`);
          }
          timeValue = { kind: "occurrence", occurrence: target! };
        } else if (bound === "event") {
          const [target, output, ...rest] = local(reference(time, "through"), "occurrence",
            `Audiovisual occurrence ${occurrence} event binding`);
          if (output === undefined || rest.length > 0) {
            throw new Error(`Audiovisual occurrence ${occurrence} event binding must pass through @occurrence.<name>.<output>.`);
          }
          if (literal(time, "require") !== "unique") {
            throw new Error(`Audiovisual occurrence ${occurrence} event binding must require unique.`);
          }
          const resolvedEvent = await resolveReference(reference(time, "event"));
          if (resolvedEvent === undefined || !sameType(resolvedEvent.type, temporalTypes.regionSet)) {
            throw new Error(`Audiovisual occurrence ${occurrence} event has the wrong Type.`);
          }
          eventReferences.set(occurrence, resolvedEvent);
          const eventBinding = `${id}:occurrence:${occurrence}:event`;
          const authoredOffset = field(time, "offset");
          timeValue = {
            kind: "event", occurrence: target!, output, require: "unique",
            event: { kind: "binding", name: eventBinding },
            ...(authoredOffset === undefined ? {} : {
              offset: authoredOffset.kind === "literal"
                ? exact(authoredOffset.value.trim(), `Audiovisual occurrence ${occurrence} event offset`)
                : { kind: "binding", name: `${id}:occurrence:${occurrence}:event-offset` },
            }),
          };
        } else {
          throw new Error(`Audiovisual occurrence ${occurrence} time.bound must be source, occurrence or event.`);
        }
      }
      occurrenceValues[occurrence] = {
        source: source!,
        ...(at === undefined ? {} : { at }),
        ...(timeValue === undefined ? {} : { time: timeValue }),
        ...(field(child, "duration") === undefined ? {} : (() => {
          const authoredDuration = field(child, "duration")!;
          const binding = `${id}:occurrence:${occurrence}:duration`;
          if (authoredDuration.kind === "literal") return {
            duration: exact(authoredDuration.value.trim(), `Audiovisual occurrence ${occurrence}.duration`),
          };
          return { duration: { kind: "binding" as const, name: binding } };
        })()),
        outputs: await outputs(child, id, occurrence, resolveReference, reconstructionReferences),
      };
      const authoredDuration = field(child, "duration");
      if (authoredDuration !== undefined && authoredDuration.kind !== "literal") {
        const binding = `${id}:occurrence:${occurrence}:duration`;
        futures.push({
          kind: "exact",
          binding,
          reference: await exactReference(authoredDuration,
            `Audiovisual occurrence ${occurrence}.duration`, `${binding}:literal`, child.range),
        });
      }
    }

    const sourceReferences: Array<{ readonly name: string; readonly reference: AuthorResolvedReference;
      readonly range: AuthorDeclaration["range"] }> = [];
    for (const child of sources) {
      const name = label(child);
      const resolved = await resolveReference(reference(child, "value"));
      if (resolved === undefined) throw new Error(`Audiovisual Source ${name} is unresolved.`);
      sourceReferences.push({ name, reference: resolved, range: child.range ?? declaration.range });
    }
    const sourceByName = new Map(sourceReferences.map((source) => [source.name, source]));
    const useRecords: ReturnType<typeof record>[] = [];
    const eventPositionComponents: Array<{
      readonly id: string;
      readonly fragment: ReturnType<typeof createUniqueSourceEventPositionFragment>;
      readonly inputs: Record<string, AuthorValueRef>;
      readonly outputs: { readonly position: string };
      readonly range: AuthorDeclaration["range"];
    }> = [];
    const useComponents = await Promise.all(occurrences.map(async (child) => {
      const occurrence = label(child);
      const declarationValue = occurrenceValues[occurrence]!;
      const sourceReference = sourceByName.get(declarationValue.source);
      if (sourceReference === undefined) {
        throw new Error(`Audiovisual occurrence ${occurrence} references missing Source ${declarationValue.source}.`);
      }
      if (declarationValue.time?.kind === "source" || declarationValue.time?.kind === "occurrence") {
        if (Object.values(declarationValue.outputs).some((output) => output.reconstruction !== undefined)) {
          throw new Error(`Audiovisual occurrence ${occurrence} bound outputs cannot override reconstruction yet.`);
        }
        const specId = `${id}:occurrence:${occurrence}:${declarationValue.time.kind}-bound-spec`;
        const target = declarationValue.time.occurrence;
        if (!occurrenceByName.has(target)) {
          throw new Error(`Audiovisual occurrence ${occurrence} time binding references missing occurrence ${target}.`);
        }
        if (declarationValue.time.kind === "source") {
          useRecords.push(record(specId, audiovisualAuthorTypes.sourceBoundSpec, {
            id: occurrence,
            targetOutput: declarationValue.time.output,
            outputs: Object.keys(declarationValue.outputs),
          }, child.range ?? declaration.range));
          return {
            id: useComponentId(id, occurrence),
            fragment: createSourceBoundOccurrenceUseFragment(),
            inputs: {
              spec: { kind: "record" as const, id: specId },
              target: { kind: "component-output" as const,
                component: useComponentId(id, target), output: "use" },
              source: sourceReference.reference.ref,
            },
            outputs: { use: `${id}.occurrence.${occurrence}.use`, end: `${id}.occurrence.${occurrence}.end` },
            range: child.range ?? declaration.range,
          };
        }
        useRecords.push(record(specId, audiovisualAuthorTypes.occurrenceBoundSpec, {
          id: occurrence, outputs: Object.keys(declarationValue.outputs),
        }, child.range ?? declaration.range));
        return {
          id: useComponentId(id, occurrence),
          fragment: createOccurrenceBoundOccurrenceUseFragment(),
          inputs: {
            spec: { kind: "record" as const, id: specId },
            target: { kind: "component-output" as const,
              component: useComponentId(id, target), output: "use" },
            source: sourceReference.reference.ref,
          },
          outputs: { use: `${id}.occurrence.${occurrence}.use`, end: `${id}.occurrence.${occurrence}.end` },
          range: child.range ?? declaration.range,
        };
      }
      const specId = `${id}:occurrence:${occurrence}:use-spec`;
      useRecords.push(record(specId, audiovisualAuthorTypes.occurrenceUseSpec, {
        id: occurrence,
        domainId: `${id}:occurrence:${occurrence}:time`,
        outputs: declarationValue.outputs,
      }, child.range ?? declaration.range));
      const useReconstructions = Object.values(declarationValue.outputs)
        .flatMap((selection) => selection.reconstruction === undefined ? [] : [selection.reconstruction])
        .map((name) => {
          const found = reconstructionReferences.find((reference) => reference.name === name);
          if (found === undefined) throw new Error(`Audiovisual occurrence ${occurrence} reconstruction ${name} is unresolved.`);
          return found;
        });
      const inputs: Record<string, AuthorValueRef> = {
        spec: { kind: "record", id: specId },
        source: sourceReference.reference.ref,
      };
      if (declarationValue.time?.kind === "event") {
        const target = declarationValue.time.occurrence;
        if (!occurrenceByName.has(target)) {
          throw new Error(`Audiovisual occurrence ${occurrence} event references missing occurrence ${target}.`);
        }
        const outputSpecId = `${id}:occurrence:${occurrence}:event-output-spec`;
        useRecords.push(record(outputSpecId, audiovisualAuthorTypes.occurrenceOutputSpec, {
          output: declarationValue.time.output,
        }, child.range ?? declaration.range));
        const eventReference = eventReferences.get(occurrence)!;
        const time = child.children.find((candidate) => candidate.name === "time")!;
        const eventInputs: Record<string, AuthorValueRef> = {
          spec: { kind: "record", id: outputSpecId },
          target: { kind: "component-output", component: useComponentId(id, target), output: "use" },
          event: eventReference.ref,
        };
        if (field(time, "offset") !== undefined) {
          eventInputs.offset = (await exactReference(field(time, "offset"),
            `Audiovisual occurrence ${occurrence} event offset`,
            `${id}:occurrence:${occurrence}:event-offset:literal`, time.range)).ref;
        }
        const eventComponent = {
          id: `${id}:occurrence:${occurrence}:event-position`,
          fragment: createUniqueSourceEventPositionFragment({ offset: field(time, "offset") !== undefined }),
          inputs: eventInputs,
          outputs: { position: `${id}.occurrence.${occurrence}.event-position` },
          range: time.range ?? child.range ?? declaration.range,
        };
        eventPositionComponents.push(eventComponent);
        inputs.start = { kind: "component-output", component: eventComponent.id, output: "position" };
      } else {
        inputs.start = (await exactReference(field(child, "at"), `Audiovisual occurrence ${occurrence}.at`,
          `${id}:occurrence:${occurrence}:at:literal`, child.range)).ref;
      }
      if (field(child, "duration") !== undefined) {
        inputs.duration = (await exactReference(field(child, "duration"),
          `Audiovisual occurrence ${occurrence}.duration`,
          `${id}:occurrence:${occurrence}:duration:literal`, child.range)).ref;
      }
      useReconstructions.forEach((reconstruction, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        const bindingId = `${reconstruction.name}:binding`;
        useRecords.push(record(bindingId, audiovisualAuthorTypes.reconstructionBinding,
          { name: reconstruction.name }, reconstruction.range ?? declaration.range));
        inputs[`reconstruction-binding-${suffix}`] = { kind: "record", id: bindingId };
        inputs[`reconstruction-${suffix}`] = reconstruction.reference.ref;
      });
      return {
        id: useComponentId(id, occurrence),
        fragment: createOccurrenceUseFragment({
          inferDuration: field(child, "duration") === undefined,
          reconstructions: useReconstructions.length,
        }),
        inputs,
        outputs: {
          use: `${id}.occurrence.${occurrence}.use`,
          end: `${id}.occurrence.${occurrence}.end`,
        },
        range: child.range ?? declaration.range,
      };
    }));

    const pictureOperators: Array<{ readonly name: string; readonly reference: AuthorResolvedReference;
      readonly range: AuthorDeclaration["range"] }> = [];
    for (const child of pictures) {
      const path = optionalReference(child, "apply");
      if (path === undefined) continue;
      const resolved = await resolveReference(path);
      if (resolved === undefined) throw new Error(`Audiovisual Picture Operator ${path} is unresolved.`);
      pictureOperators.push({ name: label(child), reference: resolved, range: child.range ?? declaration.range });
    }
    const audioOperators: typeof pictureOperators = [];
    for (const child of audios) {
      const path = optionalReference(child, "apply");
      if (path === undefined) continue;
      const resolved = await resolveReference(path);
      if (resolved === undefined) throw new Error(`Audiovisual Audio Operator ${path} is unresolved.`);
      audioOperators.push({ name: label(child), reference: resolved, range: child.range ?? declaration.range });
    }

    const authoredPictureDomain = field(declaration, "picture-domain");
    let domain: AudiovisualAuthorSpec["pictureDomain"];
    let domainReference: AuthorResolvedReference | undefined;
    if (authoredPictureDomain?.kind === "reference") {
      domainReference = await resolveReference(authoredPictureDomain.path);
      if (domainReference === undefined) throw new Error(`Audiovisual Program ${id}.picture-domain is unresolved.`);
      domain = { kind: "binding", name: `${id}:picture-domain` };
    } else {
      domain = pictureDomain(authoredPictureDomain, id);
    }

    const pictureOutput = optionalReference(output, "picture");
    const audioOutput = optionalReference(output, "audio");
    if (pictureOutput === undefined && audioOutput === undefined) throw new Error(`Audiovisual Program ${id} output is empty.`);
    const outputName = (path: string, group: string): string => {
      const [name, ...rest] = local(path, group, `Audiovisual Program ${id} output`);
      if (rest.length > 0) throw new Error(`Audiovisual Program ${id} output must address one ${group} binding.`);
      return name!;
    };
    const pictureBindings = Object.fromEntries(await Promise.all(pictures.map(async (child) =>
      [label(child), await pictureExpression(child, id, resolveReference, futures)] as const)));
    const audioBindings = Object.fromEntries(await Promise.all(audios.map(async (child) =>
      [label(child), await audioExpression(child, id, resolveReference, futures)] as const)));
    const spec: AudiovisualAuthorSpec = {
      id,
      duration,
      ...(domain === undefined ? {} : { pictureDomain: domain }),
      sources: Object.fromEntries(sourceReferences.map((source) => [source.name, { binding: source.name }])),
      occurrences: occurrenceValues,
      ...(pictureOutput === undefined ? {} : { picture: {
        bindings: pictureBindings,
        output: { kind: "reference", name: outputName(pictureOutput, "picture") },
      } }),
      ...(audioOutput === undefined ? {} : { audio: {
        bindings: audioBindings,
        output: { kind: "reference", name: outputName(audioOutput, "audio") },
      } }),
    };
    assertAudiovisualAuthorSpec(spec);

    const domainSpecId = `${id}:domain-spec`;
    const records = [
      ...constructionRecords,
      ...useRecords,
      record(domainSpecId, audiovisualAuthorTypes.programDomainSpec, { id }, declaration.range),
      record(`${id}:spec`, audiovisualAuthorTypes.spec, spec, declaration.range),
    ];
    const domainComponent = {
      id: `${id}:domain`,
      fragment: createAudiovisualProgramDomainFragment(),
      inputs: {
        spec: { kind: "record" as const, id: domainSpecId },
        duration: (await exactReference(field(declaration, "duration"),
          `Audiovisual Program ${id}.duration`, `${id}:duration:literal`, declaration.range)).ref,
      },
      outputs: { domain: `${id}.domain` },
      range: declaration.range,
    };
    const closedOccurrenceComponents = occurrences.map((child) => {
      const occurrence = label(child);
      return {
        id: `${id}:occurrence:${occurrence}:close`,
        fragment: createOccurrenceClosureFragment(),
        inputs: {
          use: { kind: "component-output" as const,
            component: useComponentId(id, occurrence), output: "use" },
          parent: { kind: "component-output" as const, component: domainComponent.id, output: "domain" },
        },
        outputs: { occurrence: `${id}.occurrence.${occurrence}` },
        range: child.range ?? declaration.range,
      };
    });
    const inputs: Record<string, AuthorValueRef> = {
      spec: { kind: "record", id: `${id}:spec` },
      domain: { kind: "component-output", component: domainComponent.id, output: "domain" },
    };
    closedOccurrenceComponents.forEach((component, index) => {
      inputs[`occurrence-${String(index + 1).padStart(4, "0")}`] = {
        kind: "component-output", component: component.id, output: "occurrence",
      };
    });
    const closureFutureKinds = ["temporal-map", "spatial-map"] as const;
    for (const kind of closureFutureKinds) {
      futures.filter((future) => future.kind === kind).forEach((future, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        const bindingId = `${future.binding}:binding`;
        records.push(record(bindingId, audiovisualAuthorTypes.valueBinding,
          { name: future.binding }, declaration.range));
        inputs[`${kind}-binding-${suffix}`] = { kind: "record", id: bindingId };
        inputs[`${kind}-${suffix}`] = future.reference.ref;
      });
    }
    pictureOperators.forEach((operator, index) => {
      const suffix = String(index + 1).padStart(4, "0");
      const bindingId = `${id}:picture-operator:${operator.name}:binding`;
      records.push(record(bindingId, audiovisualAuthorTypes.operatorBinding, { name: operator.name }, operator.range));
      inputs[`picture-operator-binding-${suffix}`] = { kind: "record", id: bindingId };
      inputs[`picture-operator-${suffix}`] = operator.reference.ref;
    });
    audioOperators.forEach((operator, index) => {
      const suffix = String(index + 1).padStart(4, "0");
      const bindingId = `${id}:audio-operator:${operator.name}:binding`;
      records.push(record(bindingId, audiovisualAuthorTypes.operatorBinding, { name: operator.name }, operator.range));
      inputs[`audio-operator-binding-${suffix}`] = { kind: "record", id: bindingId };
      inputs[`audio-operator-${suffix}`] = operator.reference.ref;
    });
    if (domainReference !== undefined) {
      const bindingId = `${id}:picture-domain:binding`;
      records.push(record(bindingId, audiovisualAuthorTypes.valueBinding,
        { name: `${id}:picture-domain` }, declaration.range));
      inputs["spatial-domain-binding-0001"] = { kind: "record", id: bindingId };
      inputs["spatial-domain-0001"] = domainReference.ref;
    }
    return {
      records,
      components: [...useComponents, ...eventPositionComponents, domainComponent,
        ...closedOccurrenceComponents, {
        id: `${id}:program`,
        fragment: createResolvedAudiovisualProgramFragment({
          occurrences: occurrences.length,
          temporalMaps: futures.filter((future) => future.kind === "temporal-map").length,
          spatialMaps: futures.filter((future) => future.kind === "spatial-map").length,
          pictureOperators: pictureOperators.length,
          audioOperators: audioOperators.length,
          spatialDomains: domainReference === undefined ? 0 : 1,
        }),
        inputs,
        outputs: { program: id },
        range: declaration.range,
      }],
    };
  },
};

export const audiovisualAuthorDeclarations = [audiovisualProgramAuthorDeclaration] as const;
