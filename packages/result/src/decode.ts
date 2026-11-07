import {
  assertOrderedBuildId,
  createModuleRef,
  createTypeRef,
} from "@hypit/protocol";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { assertProductFileRef, assertProductPath } from "@hypit/product";
import type { ProductFileRef, ProductValueDocument, StoredProduct } from "@hypit/product";
import type { BuildResultOperation } from "./types.js";

export type StoredBuildResultFile = {
  readonly kind: "build-file";
  readonly path: string;
  readonly size: number;
  readonly mediaType: string;
};

export type StoredBuildResultOutput = StoredProduct;

export type StoredBuildResultValueDocument = ProductValueDocument;

export type StoredFinishedBuildResult = {
  readonly format: "hypit.build-result@1";
  readonly id: string;
  readonly sourcePath: string;
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, StoredBuildResultOutput>>;
  readonly executionLog?: StoredBuildResultFile;
  readonly operations?: readonly BuildResultOperation[];
} & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

function object(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function canonicalValue(value: unknown, subject: string): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalValue(child, `${subject}[${index}]`));
  }
  return Object.fromEntries(Object.entries(object(value, subject))
    .map(([name, child]) => [name, canonicalValue(child, `${subject}.${name}`)]));
}

function text(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function resultPath(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`${subject} is not a Result-relative path`);
  }
  return value;
}

function fileRef(value: unknown, subject: string): StoredBuildResultFile {
  const item = object(value, subject);
  if (item.kind !== "build-file" || typeof item.size !== "number" || !Number.isSafeInteger(item.size)
    || item.size < 0 || typeof item.mediaType !== "string" || item.mediaType.length === 0) {
    throw new Error(`${subject} is not a valid Build file reference`);
  }
  return {
    kind: "build-file",
    path: resultPath(item.path, `${subject}.path`),
    size: item.size,
    mediaType: item.mediaType,
  };
}

function productFileRef(value: unknown, subject: string): ProductFileRef {
  assertProductFileRef(value, subject);
  return { kind: "product-file", path: value.path, size: value.size, mediaType: value.mediaType };
}

function typeRef(value: unknown, subject: string): TypeRef {
  const item = object(value, subject);
  const module = object(item.module, `${subject}.module`);
  return createTypeRef(createModuleRef(
    text(module.name, `${subject}.module.name`),
    text(module.version, `${subject}.module.version`),
  ), text(item.name, `${subject}.name`));
}

function outputs(value: unknown, subject: string): Readonly<Record<string, StoredBuildResultOutput>> {
  return Object.fromEntries(Object.entries(object(value, subject)).map(([name, raw]) => {
    text(name, `${subject} Output name`);
    const item = object(raw, `${subject}[${JSON.stringify(name)}]`);
    const stored = object(item.value, `${subject}[${JSON.stringify(name)}].value`);
    let decoded: StoredBuildResultOutput["value"];
    if (stored.kind === "product-file") decoded = productFileRef(stored, `${subject}[${JSON.stringify(name)}].value`);
    else if (stored.kind === "value") decoded = {
      kind: "value",
      path: (() => {
        assertProductPath(stored.path, `${subject}[${JSON.stringify(name)}].value.path`);
        return stored.path;
      })(),
    };
    else if (stored.kind === "inline") {
      const scalar = stored.value;
      if (scalar !== null && typeof scalar !== "boolean" && typeof scalar !== "string"
        && !(typeof scalar === "number" && Number.isFinite(scalar))) {
        throw new Error(`${subject}[${JSON.stringify(name)}].value must be a scalar`);
      }
      decoded = { kind: "inline", value: scalar };
    } else throw new Error(`${subject}[${JSON.stringify(name)}].value.kind is invalid`);
    return [name, {
      type: typeRef(item.type, `${subject}[${JSON.stringify(name)}].type`),
      publisher: text(item.publisher, `${subject}[${JSON.stringify(name)}].publisher`),
      ...(item.publicationParameters === undefined
        ? {}
        : { publicationParameters: canonicalValue(item.publicationParameters,
            `${subject}[${JSON.stringify(name)}].publicationParameters`) }),
      value: decoded,
    }];
  }));
}

function operations(value: unknown, subject: string): readonly BuildResultOperation[] {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  return value.map((raw, index) => {
    const item = object(raw, `${subject}[${index}]`);
    const outcome = item.outcome;
    if (outcome !== "unsettled" && outcome !== "complete" && outcome !== "failed" && outcome !== "cancelled") {
      throw new Error(`${subject}[${index}] has an invalid Operation outcome`);
    }
    const receipt = item.receipt === undefined ? undefined : object(item.receipt, `${subject}[${index}].receipt`);
    const evidence = {
      request: text(item.request, `${subject}[${index}].request`),
      endpoint: text(item.endpoint, `${subject}[${index}].endpoint`),
      ...(receipt === undefined ? {} : { receipt: {
        id: text(receipt.id, `${subject}[${index}].receipt.id`),
        ...(receipt.url === undefined ? {} : { url: text(receipt.url, `${subject}[${index}].receipt.url`) }),
      } }),
    };
    if (outcome === "failed") {
      const failure = object(item.failure, `${subject}[${index}].failure`);
      if (item.cancellation !== undefined) throw new Error(`${subject}[${index}] failed Operation has cancellation evidence`);
      return { ...evidence, outcome, failure: {
        code: text(failure.code, `${subject}[${index}].failure.code`),
        message: text(failure.message, `${subject}[${index}].failure.message`),
      } };
    }
    if (item.failure !== undefined) throw new Error(`${subject}[${index}] ${outcome} Operation has failure evidence`);
    if (outcome === "cancelled") {
      const cancellation = object(item.cancellation, `${subject}[${index}].cancellation`);
      const acknowledgement = cancellation.outcome;
      if (acknowledgement !== "confirmed" && acknowledgement !== "accepted" && acknowledgement !== "unsupported"
        && acknowledgement !== "too-late" && acknowledgement !== "failed") {
        throw new Error(`${subject}[${index}] has an invalid cancellation acknowledgement`);
      }
      return { ...evidence, outcome, cancellation: {
        outcome: acknowledgement,
        ...(cancellation.message === undefined ? {} : {
          message: text(cancellation.message, `${subject}[${index}].cancellation.message`),
        }),
      } };
    }
    if (item.cancellation !== undefined) throw new Error(`${subject}[${index}] ${outcome} Operation has cancellation evidence`);
    return { ...evidence, outcome };
  });
}

/** Decode JSON bytes without leaking invalid UTF-8 or an anonymous SyntaxError. */
export function decodeBuildResultJson(value: Uint8Array, subject: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as unknown;
  } catch (error) {
    throw new Error(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Decode only immutable history. An open Runtime draft deliberately has no history value. */
export function decodeFinishedBuildResult(
  value: unknown,
  build: string,
  subject = `Build ${build} result.json`,
): StoredFinishedBuildResult | undefined {
  assertOrderedBuildId(build);
  const item = object(value, subject);
  if (item.format !== "hypit.build-result@1") throw new Error(`${subject} is not a Hypit Build Result`);
  const common = {
    format: "hypit.build-result@1" as const,
    id: build,
    sourcePath: text(item.sourcePath, `${subject}.sourcePath`),
    targets: Array.isArray(item.targets)
      ? item.targets.map((target, index) => text(target, `${subject}.targets[${index}]`))
      : (() => { throw new Error(`${subject}.targets must be an array`); })(),
    outputs: outputs(item.outputs, `${subject}.outputs`),
  };
  if (item.outcome === undefined) {
    if (item.finishedAt !== undefined || item.failure !== undefined || item.operations !== undefined
      || item.executionLog !== undefined) throw new Error(`${subject} unfinished Result contains terminal evidence`);
    return undefined;
  }
  if (item.outcome !== "complete" && item.outcome !== "failed" && item.outcome !== "cancelled") {
    throw new Error(`${subject}.outcome is invalid`);
  }
  if (typeof item.finishedAt !== "number" || !Number.isSafeInteger(item.finishedAt) || item.finishedAt < 0) {
    throw new Error(`${subject}.finishedAt must be a non-negative integer timestamp`);
  }
  const evidence = {
    ...common,
    ...(item.executionLog === undefined ? {} : { executionLog: fileRef(item.executionLog, `${subject}.executionLog`) }),
    ...(item.operations === undefined ? {} : { operations: operations(item.operations, `${subject}.operations`) }),
  };
  if (item.outcome === "complete") {
    if (item.failure !== undefined) throw new Error(`${subject} complete Result cannot have a failure`);
    return { ...evidence, outcome: "complete", finishedAt: item.finishedAt };
  }
  const failure = text(item.failure, `${subject}.failure`);
  return { ...evidence, outcome: item.outcome, finishedAt: item.finishedAt, failure };
}

export function decodeBuildResultValueDocument(
  value: unknown,
  subject = "Product value",
): StoredBuildResultValueDocument {
  const item = object(value, subject);
  if (item.format !== "hypit.product-value@1") throw new Error(`${subject} is not a Product value document`);
  if (!Array.isArray(item.resources)) throw new Error(`${subject}.resources must be an array`);
  return {
    format: "hypit.product-value@1",
    value: canonicalValue(item.value, `${subject}.value`),
    resources: item.resources.map((raw, index) => {
      const binding = object(raw, `${subject}.resources[${index}]`);
      if (!Array.isArray(binding.at) || binding.at.length === 0) {
        throw new Error(`${subject}.resources[${index}].at must be a non-empty array`);
      }
      const at = binding.at.map((segment, segmentIndex) => {
        if (typeof segment === "string") return segment;
        if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) return segment;
        throw new Error(`${subject}.resources[${index}].at[${segmentIndex}] is invalid`);
      });
      return { at, file: productFileRef(binding.file, `${subject}.resources[${index}].file`) };
    }),
  };
}
