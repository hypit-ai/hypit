import {
  assertOrderedBuildId,
  assertResultIntent,
  createCapabilityRef,
  createModuleRef,
  createTypeRef,
} from "@hypit/protocol";
import type { CapabilityRef, TypeRef } from "@hypit/protocol";

import {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertBuildResultValueDocument,
} from "./types.js";
import type {
  BuildResultFileRef,
  BuildResultOperation,
  StoredBuildResult,
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
  return createTypeRef(createModuleRef(
    text(module.name, `${subject}.module.name`),
    text(module.version, `${subject}.module.version`),
  ), text(item.name, `${subject}.name`));
}

function capabilityRef(value: unknown, subject: string): CapabilityRef {
  const item = object(value, subject);
  const module = object(item.module, `${subject}.module`);
  return createCapabilityRef(createModuleRef(
    text(module.name, `${subject}.module.name`),
    text(module.version, `${subject}.module.version`),
  ), text(item.name, `${subject}.name`));
}

function resultPath(value: unknown, subject: string): string {
  assertBuildResultPath(value, subject);
  return value;
}

function fileRef(value: unknown, subject: string): BuildResultFileRef {
  assertBuildResultFileRef(value, subject);
  return {
    kind: "build-file",
    path: value.path,
    size: value.size,
    mediaType: value.mediaType,
  };
}

function outputValue(value: unknown, subject: string): BuildResultOutputValue {
  const item = object(value, subject);
  if (item.kind === "build-file") {
    return fileRef(item, subject);
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

function time(value: unknown, subject: string): number {
  const decoded = optionalTime(value, subject);
  if (decoded === undefined) throw new Error(`${subject} is required`);
  return decoded;
}

/** Decode JSON bytes without letting invalid UTF-8 or an anonymous SyntaxError escape the Result boundary. */
export function decodeBuildResultJson(value: Uint8Array, subject: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as unknown;
  } catch (error) {
    throw new Error(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function operationEvidence(value: unknown, subject: string): readonly BuildResultOperation[] {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  return value.map((raw, index) => {
    const item = object(raw, `${subject}[${index}]`);
    const outcome = item.outcome;
    if (outcome !== undefined && outcome !== "complete" && outcome !== "failed" && outcome !== "cancelled") {
      throw new Error(`${subject}[${index}] has an invalid Operation outcome`);
    }
    const cancellation = item.cancellation === undefined ? undefined : object(item.cancellation, `${subject}[${index}].cancellation`);
    if (cancellation !== undefined && !["confirmed", "accepted", "unsupported", "too-late", "failed"].includes(String(cancellation.outcome))) {
      throw new Error(`${subject}[${index}] has an invalid cancellation acknowledgement`);
    }
    const receipt = item.receipt === undefined ? undefined : object(item.receipt, `${subject}[${index}].receipt`);
    const failure = item.failure === undefined ? undefined : object(item.failure, `${subject}[${index}].failure`);
    const evidence = {
      capability: capabilityRef(item.capability, "Operation capability"),
      endpoint: text(item.endpoint, "Operation Endpoint"),
      ...(receipt === undefined ? {} : { receipt: { id: text(receipt.id, "Remote receipt id"),
        ...(receipt.url === undefined ? {} : { url: text(receipt.url, "Remote receipt URL") }) } }),
    };
    if (outcome === "failed") {
      if (failure === undefined) throw new Error(`${subject} failed Operation has no failure`);
      if (item.cancellation !== undefined) throw new Error(`${subject}[${index}] failed Operation cannot have cancellation evidence`);
      return { ...evidence, outcome, failedAt: time(item.failedAt, "Operation failedAt"), failure: {
        code: text(failure.code, "Operation failure code"),
        message: text(failure.message, "Operation failure message"),
      } };
    }
    if (failure !== undefined) throw new Error(`${subject}[${index}] ${outcome ?? "accepted"} Operation cannot have a failure`);
    if (outcome === "cancelled") {
      if (cancellation === undefined) throw new Error(`${subject}[${index}] cancelled Operation has no cancellation evidence`);
      return { ...evidence, outcome, cancelledAt: time(item.cancelledAt, "Operation cancelledAt"), cancellation: {
        outcome: cancellation.outcome as "confirmed" | "accepted" | "unsupported" | "too-late" | "failed",
        ...(cancellation.message === undefined ? {} : { message: text(cancellation.message, "Cancellation error") }),
      } };
    }
    if (cancellation !== undefined) throw new Error(`${subject}[${index}] ${outcome ?? "accepted"} Operation cannot have cancellation evidence`);
    const acknowledgedAt = time(item.acknowledgedAt, "Operation acknowledgedAt");
    if (outcome === "complete") {
      return { ...evidence, outcome, acknowledgedAt,
        providerCompletedAt: time(item.providerCompletedAt, "Operation providerCompletedAt") };
    }
    return { ...evidence, acknowledgedAt,
      ...(item.providerCompletedAt === undefined ? {} : {
        providerCompletedAt: time(item.providerCompletedAt, "Operation providerCompletedAt"),
      }) };
  });
}

/** Decode one Result document and attach the Build identity supplied by its repository address. */
export function decodeStoredBuildResult(
  value: unknown,
  build: string,
  subject = `Build ${build} result.json`,
): StoredBuildResult {
  const id = buildId(build, "Build Result address");
  const item = object(value, subject);
  if (item.format !== "hypit.build-result@1") throw new Error(`${subject} is not a Hypit Build Result`);
  const sourcePath = text(item.sourcePath, `${subject}.sourcePath`);
  const finishedAt = optionalTime(item.finishedAt, `${subject}.finishedAt`);
  let outcome: import("./types.js").BuildResult["outcome"] | undefined;
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
  const executionLog = item.executionLog === undefined
    ? undefined
    : fileRef(item.executionLog, `${subject}.executionLog`);
  const manifest = {
    format: "hypit.build-result@1" as const,
    id,
    sourcePath,
    targets: texts(item.targets, `${subject}.targets`),
    outputs: outputs(item.outputs, `${subject}.outputs`),
  };
  if (outcome === undefined) {
    if (failure !== undefined) throw new Error(`${subject} unfinished Result cannot have a failure`);
    if (executionLog !== undefined || item.operations !== undefined) {
      throw new Error(`${subject} unfinished Result cannot contain terminal execution evidence`);
    }
    return manifest;
  }
  const evidence = {
    ...manifest,
    ...(executionLog === undefined ? {} : { executionLog }),
    ...(item.operations === undefined ? {} : { operations: operationEvidence(item.operations, `${subject}.operations`) }),
  };
  if (outcome === "complete") {
    if (failure !== undefined) throw new Error(`${subject} complete Result cannot have a failure`);
    return { ...evidence, outcome, finishedAt: finishedAt! };
  }
  if (failure === undefined) throw new Error(`${subject} ${outcome} Result has no failure reason`);
  return { ...evidence, outcome, finishedAt: finishedAt!, failure };
}

/** Persist only Result content. The repository address is the single Build identity. */
export function encodeStoredBuildResult(manifest: StoredBuildResult): Omit<StoredBuildResult, "id"> {
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
  const rawIntent = object(item.intent, `${subject}.intent`);
  if (!Array.isArray(rawIntent.outputs)) throw new Error(`${subject}.intent.outputs must be an array`);
  if (Object.keys(rawIntent).some((name) => name !== "outputs")) {
    throw new Error(`${subject}.intent must contain only outputs`);
  }
  const names = new Set<string>();
  const outputs = rawIntent.outputs.map((value, index) => {
    const output = object(value, `${subject}.intent.outputs[${index}]`);
    for (const key of Object.keys(output)) {
      if (key !== "name" && key !== "record") {
        throw new Error(`${subject}.intent.outputs[${index}] has an unexpected ${key} field`);
      }
    }
    const name = text(output.name, `${subject}.intent.outputs[${index}].name`);
    if (names.has(name)) throw new Error(`${subject} repeats retained Output name ${name}`);
    names.add(name);
    const record = text(output.record, `${subject}.intent.outputs[${index}].record`);
    return {
      name,
      record,
    };
  });
  const intent = { outputs };
  assertResultIntent(intent);
  return {
    resources: pathMap(item.resources, `${subject}.resources`),
    values: pathMap(item.values, `${subject}.values`),
    intent,
  };
}

export function decodeBuildResultValueDocument(
  value: unknown,
  subject = "Build Result value",
): BuildResultValueDocument {
  const item = object(value, subject);
  if (item.format !== "hypit.result-value@1") throw new Error(`${subject} is not a Result value document`);
  const canonical = (raw: unknown, location: string): import("@hypit/protocol").CanonicalValue => {
    if (raw === null || typeof raw === "boolean" || typeof raw === "string") return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (Array.isArray(raw)) return raw.map((child, index) => canonical(child, `${location}[${index}]`));
    const record = object(raw, location);
    return Object.fromEntries(Object.entries(record).map(([name, child]) => [name, canonical(child, `${location}.${name}`)]));
  };
  if (!Array.isArray(item.resources)) throw new Error(`${subject}.resources must be an array`);
  const document: BuildResultValueDocument = {
    format: "hypit.result-value@1",
    value: canonical(item.value, `${subject}.value`),
    resources: item.resources.map((raw, index) => {
      const binding = object(raw, `${subject}.resources[${index}]`);
      if (!Array.isArray(binding.at)) throw new Error(`${subject}.resources[${index}].at must be an array`);
      const at = binding.at.map((segment, segmentIndex) => {
        if (typeof segment === "string") return segment;
        if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) return segment;
        throw new Error(`${subject}.resources[${index}].at[${segmentIndex}] is invalid`);
      });
      return {
        at,
        file: fileRef(binding.file, `${subject}.resources[${index}].file`),
      };
    }),
  };
  assertBuildResultValueDocument(document, subject);
  return document;
}
