import { assertOrderedBuildId } from "@hypit/protocol";
import type { TypeRef } from "@hypit/protocol";

import {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertBuildResultValueDocument,
} from "./types.js";
import type {
  BuildResultManifest,
  BuildResultOutput,
  BuildResultOutputValue,
  BuildResultValueDocument,
} from "./types.js";
import type { BuildResultWriterState } from "./writer.js";

function object(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function optionalText(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : text(value, subject);
}

function optionalString(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${subject} must be a string`);
  return value;
}

function texts(value: unknown, subject: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  return value.map((item, index) => text(item, `${subject}[${index}]`));
}

function buildId(value: unknown, subject: string): string {
  const id = text(value, subject);
  try {
    assertOrderedBuildId(id);
  } catch (error) {
    throw new Error(`${subject} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return id;
}

function typeRef(value: unknown, subject: string): TypeRef {
  const item = object(value, subject);
  const module = object(item.module, `${subject}.module`);
  return {
    module: {
      name: text(module.name, `${subject}.module.name`),
      version: text(module.version, `${subject}.module.version`),
    },
    name: text(item.name, `${subject}.name`),
  };
}

function resultPath(value: unknown, subject: string): string {
  assertBuildResultPath(value, subject);
  return value;
}

function outputValue(value: unknown, subject: string): BuildResultOutputValue {
  const item = object(value, subject);
  if (item.kind === "build-file" || item.kind === "external-file") {
    assertBuildResultFileRef(item, subject);
    return { ...item };
  }
  if (item.kind === "build-output") {
    return {
      kind: "build-output",
      build: buildId(item.build, `${subject}.build`),
      output: text(item.output, `${subject}.output`),
    };
  }
  if (item.kind === "inline") {
    const scalar = item.value;
    if (scalar !== null && typeof scalar !== "boolean" && typeof scalar !== "string"
      && !(typeof scalar === "number" && Number.isFinite(scalar))) {
      throw new Error(`${subject}.value must be a scalar`);
    }
    return { kind: "inline", value: scalar };
  }
  if (item.kind === "value") {
    return { kind: "value", path: resultPath(item.path, `${subject}.path`) };
  }
  throw new Error(`${subject}.kind is not a Result value kind`);
}

function outputs(value: unknown, subject: string): Readonly<Record<string, BuildResultOutput>> {
  const raw = object(value, subject);
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => {
    text(name, `${subject} Output name`);
    const item = object(value, `${subject}[${JSON.stringify(name)}]`);
    return [name, {
      ...(item.displayName === undefined ? {} : { displayName: text(item.displayName, `${subject}.displayName`) }),
      type: typeRef(item.type, `${subject}[${JSON.stringify(name)}].type`),
      value: outputValue(item.value, `${subject}[${JSON.stringify(name)}].value`),
    }] as const;
  }));
}

function optionalTime(value: unknown, subject: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${subject} must be a non-negative integer timestamp`);
  }
  return value;
}

/** Decode JSON bytes without letting invalid UTF-8 or an anonymous SyntaxError escape the Result boundary. */
export function decodeBuildResultJson(value: Uint8Array, subject: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as unknown;
  } catch (error) {
    throw new Error(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function progressNumber(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${subject} must be non-negative`);
  return value;
}

function operationReceipts(value: unknown, subject: string): NonNullable<BuildResultManifest["operations"]> {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  return value.map((raw) => {
    const item = object(raw, subject);
    const status = item.status;
    if (status !== "pending" && status !== "completed" && status !== "failed" && status !== "cancelled") throw new Error(`${subject} has an invalid Operation status`);
    const need = item.need === undefined ? undefined : object(item.need, `${subject}.need`);
    const progress = item.progress === undefined ? undefined : object(item.progress, `${subject}.progress`);
    const cancellation = item.cancellation === undefined ? undefined : object(item.cancellation, `${subject}.cancellation`);
    if (cancellation !== undefined && !["confirmed", "accepted", "unsupported", "too-late", "failed"].includes(String(cancellation.outcome))) {
      throw new Error(`${subject} has an invalid cancellation acknowledgement`);
    }
    const receipt = item.receipt === undefined ? undefined : object(item.receipt, `${subject}.receipt`);
    const failure = item.failure === undefined ? undefined : object(item.failure, `${subject}.failure`);
    const credentials = item.credentials === undefined ? undefined : Object.fromEntries(Object.entries(object(item.credentials, `${subject}.credentials`)).map(([slot, rawRef]) => {
      const ref = object(rawRef, `${subject}.credential`);
      return [slot, { store: text(ref.store, "credential store"), key: text(ref.key, "credential reference") }];
    }));
    return {
      ...(need === undefined ? {} : { need: { id: text(need.id, "Need id"), capability: typeRef(need.capability, "Need capability") } }),
      ...(item.createdAt === undefined ? {} : { createdAt: optionalTime(item.createdAt, "Operation createdAt")! }),
      ...(item.acknowledgedAt === undefined ? {} : { acknowledgedAt: optionalTime(item.acknowledgedAt, "Operation acknowledgedAt")! }),
      ...(item.endedAt === undefined ? {} : { endedAt: optionalTime(item.endedAt, "Operation endedAt")! }),
      ...(progress === undefined ? {} : { progress: {
        phase: text(progress.phase, "Operation phase"),
        ...(progress.completed === undefined ? {} : { completed: progressNumber(progress.completed, "Operation completed units") }),
        ...(progress.total === undefined ? {} : { total: progressNumber(progress.total, "Operation total units") }),
        ...(progress.unit === undefined ? {} : { unit: text(progress.unit, "Operation unit") }),
      } }),
      ...(cancellation === undefined ? {} : { cancellation: {
        outcome: cancellation.outcome as "confirmed" | "accepted" | "unsupported" | "too-late" | "failed",
        ...(cancellation.message === undefined ? {} : { message: text(cancellation.message, "Cancellation error") }),
      } }),
      operation: text(item.operation, "Operation id"), command: text(item.command, "Operation command"),
      endpoint: text(item.endpoint, "Operation Endpoint"), status,
      ...(item.pool === undefined ? {} : { pool: text(item.pool, "Operation pool") }),
      ...(credentials === undefined ? {} : { credentials }),
      ...(receipt === undefined ? {} : { receipt: { id: text(receipt.id, "Remote receipt id"),
        ...(receipt.url === undefined ? {} : { url: text(receipt.url, "Remote receipt URL") }) } }),
      ...(failure === undefined ? {} : { failure: { code: text(failure.code, "Operation failure code"), message: text(failure.message, "Operation failure message") } }),
    };
  });
}

/** Decode one Result document and attach the Build identity supplied by its repository address. */
export function decodeBuildResultManifest(
  value: unknown,
  build: string,
  subject = `Build ${build} result.json`,
): BuildResultManifest {
  const id = buildId(build, "Build Result address");
  const item = object(value, subject);
  if (item.format !== "hypit.build-result@1") throw new Error(`${subject} is not a Hypit Build Result`);
  const source = object(item.source, `${subject}.source`);
  const run = item.run === undefined ? undefined : object(item.run, `${subject}.run`);
  const title = optionalText(item.title, `${subject}.title`);
  const note = optionalText(item.note, `${subject}.note`);
  const highlightedOutputs = item.highlightedOutputs === undefined
    ? undefined
    : texts(item.highlightedOutputs, `${subject}.highlightedOutputs`);
  const finishedAt = optionalTime(item.finishedAt, `${subject}.finishedAt`);
  let outcome: BuildResultManifest["outcome"];
  if (item.outcome !== undefined) {
    if (item.outcome !== "complete" && item.outcome !== "failed" && item.outcome !== "cancelled") {
      throw new Error(`${subject}.outcome is not a Build Result outcome`);
    }
    outcome = item.outcome;
  }
  if ((outcome === undefined) !== (finishedAt === undefined)) {
    throw new Error(`${subject} must be either unfinished or have both outcome and finishedAt`);
  }
  const failure = optionalString(item.failure, `${subject}.failure`);
  return {
    format: "hypit.build-result@1",
    id,
    ...(title === undefined ? {} : { title }),
    ...(note === undefined ? {} : { note }),
    ...(highlightedOutputs === undefined ? {} : { highlightedOutputs }),
    source: { path: text(source.path, `${subject}.source.path`) },
    ...(run === undefined ? {} : { run: { path: text(run.path, `${subject}.run.path`) } }),
    targets: texts(item.targets, `${subject}.targets`),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(failure === undefined ? {} : { failure }),
    outputs: outputs(item.outputs, `${subject}.outputs`),
    ...(item.operations === undefined ? {} : { operations: operationReceipts(item.operations, `${subject}.operations`) }),
  };
}

/** Persist only Result content. The repository address is the single Build identity. */
export function encodeBuildResultManifest(manifest: BuildResultManifest): Omit<BuildResultManifest, "id"> {
  const { id: _id, ...document } = manifest;
  return document;
}

function pathMap(value: unknown, subject: string): Readonly<Record<string, string>> {
  const item = object(value, subject);
  return Object.fromEntries(Object.entries(item).map(([identity, path]) => [
    text(identity, `${subject} identity`),
    resultPath(path, `${subject}[${JSON.stringify(identity)}]`),
  ]));
}

/** Decode the private, unfinished-Result writer state used by both physical repositories. */
export function decodeBuildResultWriterState(
  value: unknown,
  subject = "Build Result writer state",
): BuildResultWriterState {
  const item = object(value, subject);
  if (!Array.isArray(item.publishedOutputs)) throw new Error(`${subject}.publishedOutputs must be an array`);
  if (!Array.isArray(item.forwards)) throw new Error(`${subject}.forwards must be an array`);
  const names = new Set<string>();
  const logicalOutputs = new Set<string>();
  const publishedOutputs = item.publishedOutputs.map((value, index) => {
    const published = object(value, `${subject}.publishedOutputs[${index}]`);
    const name = text(published.name, `${subject}.publishedOutputs[${index}].name`);
    const output = text(published.output, `${subject}.publishedOutputs[${index}].output`);
    if (names.has(name)) throw new Error(`${subject} repeats published name ${name}`);
    if (logicalOutputs.has(output)) throw new Error(`${subject} publishes Logical Output ${output} more than once`);
    names.add(name);
    logicalOutputs.add(output);
    return { name, output, ...(published.displayName === undefined ? {} : { displayName: text(published.displayName, `${subject}.displayName`) }) };
  });
  const forwardedOutputs = new Set<string>();
  const forwards = item.forwards.map((value, index) => {
    const forward = object(value, `${subject}.forwards[${index}]`);
    const output = text(forward.output, `${subject}.forwards[${index}].output`);
    if (forwardedOutputs.has(output)) throw new Error(`${subject} forwards Logical Output ${output} more than once`);
    forwardedOutputs.add(output);
    return {
      output,
      build: buildId(forward.build, `${subject}.forwards[${index}].build`),
      sourceOutput: text(forward.sourceOutput, `${subject}.forwards[${index}].sourceOutput`),
    };
  });
  return {
    ...(item.resourceReferences === undefined ? {} : { resourceReferences: Object.fromEntries(
      Object.entries(object(item.resourceReferences, `${subject}.resourceReferences`)).map(([resource, reference]) => {
        assertBuildResultFileRef(reference, `${subject}.resourceReferences.${resource}`);
        return [resource, reference];
      }),
    ) }),
    resources: pathMap(item.resources, `${subject}.resources`),
    values: pathMap(item.values, `${subject}.values`),
    publishedOutputs,
    forwards,
  };
}

export function decodeBuildResultValueDocument(
  value: unknown,
  subject = "Build Result value",
): BuildResultValueDocument {
  assertBuildResultValueDocument(value, subject);
  return value;
}
