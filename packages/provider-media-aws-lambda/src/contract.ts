import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue, StoredValue } from "@narratage/protocol";

/**
 * The envelope between the Endpoint and the function it invokes.
 *
 * Both sides parse it. The Endpoint parses because a function is a deployed
 * artifact that may be older than the caller; the function parses because an
 * invocation is an untrusted input even when the account is trusted. Neither
 * side treats the other's output as already valid.
 */
export const MEDIA_LAMBDA_REQUEST = "narratage.media-lambda-request@1";
export const MEDIA_LAMBDA_RESPONSE = "narratage.media-lambda-response@1";

export const mediaLambdaOperations = [
  "inspect",
  "normalize",
  "transform",
  "extract-audio",
  "extract-frame",
  "project-speech-evidence-audio",
  "render-audio",
  "mux",
] as const;

export type MediaLambdaOperation = (typeof mediaLambdaOperations)[number];

/**
 * The bucket the function reads sources from and writes results to.
 *
 * A synchronous invocation carries at most a few megabytes, so media never
 * travels in the payload — only the location it already occupies. This is why
 * the AWS media Provider requires an S3 ArtifactStore rather than merely
 * preferring one.
 */
export type MediaLambdaArtifactLocation = {
  readonly bucket: string;
  readonly prefix?: string;
};

export type MediaLambdaRequest = {
  readonly contract: typeof MEDIA_LAMBDA_REQUEST;
  readonly operation: MediaLambdaOperation;
  readonly artifacts: MediaLambdaArtifactLocation;
  /** The Need's constraints, verbatim. The function validates them itself. */
  readonly constraints: CanonicalValue;
};

export type MediaLambdaResponse =
  | {
    readonly contract: typeof MEDIA_LAMBDA_RESPONSE;
    readonly operation: MediaLambdaOperation;
    readonly ok: true;
    readonly value: StoredValue;
  }
  | {
    readonly contract: typeof MEDIA_LAMBDA_RESPONSE;
    readonly operation: MediaLambdaOperation;
    readonly ok: false;
    readonly code: string;
    readonly message: string;
  };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be a non-empty string`);
  return value;
}

function operation(value: unknown, subject: string): MediaLambdaOperation {
  assert(typeof value === "string" && (mediaLambdaOperations as readonly string[]).includes(value),
    `${subject} must be one of ${mediaLambdaOperations.join(", ")}`);
  return value as MediaLambdaOperation;
}

function storedValue(value: unknown, subject: string): StoredValue {
  const item = object(value, subject);
  if (item.kind === "inline") {
    assert(item.value !== null && typeof item.value === "object", `${subject}.value must be canonical data`);
    return item as unknown as StoredValue;
  }
  assert(item.kind === "blob" && typeof item.digest === "string"
    && Number.isSafeInteger(item.size) && (item.size as number) >= 0
    && typeof item.mediaType === "string" && item.mediaType.length > 0,
  `${subject} must be an inline or blob StoredValue`);
  return item as unknown as StoredValue;
}

export function sealMediaLambdaRequest(request: MediaLambdaRequest): CanonicalValue {
  parseMediaLambdaRequest(request);
  return canonicalize(request as unknown as CanonicalValue);
}

/** Used by the function on every invocation. */
export function parseMediaLambdaRequest(value: unknown): MediaLambdaRequest {
  const item = object(value, "MediaLambdaRequest");
  assert(item.contract === MEDIA_LAMBDA_REQUEST,
    `MediaLambdaRequest contract must be ${MEDIA_LAMBDA_REQUEST}`);
  const artifacts = object(item.artifacts, "MediaLambdaRequest.artifacts");
  const prefix = artifacts.prefix;
  assert(prefix === undefined || typeof prefix === "string",
    "MediaLambdaRequest.artifacts.prefix must be a string when present");
  assert(item.constraints !== null && typeof item.constraints === "object",
    "MediaLambdaRequest.constraints must be an object");
  return {
    contract: MEDIA_LAMBDA_REQUEST,
    operation: operation(item.operation, "MediaLambdaRequest.operation"),
    artifacts: {
      bucket: nonEmptyString(artifacts.bucket, "MediaLambdaRequest.artifacts.bucket"),
      ...(prefix === undefined || prefix.length === 0 ? {} : { prefix }),
    },
    constraints: item.constraints as CanonicalValue,
  };
}

/**
 * Used by the Endpoint on every reply.
 *
 * Failures arrive here rather than as a Lambda FunctionError, because the
 * transport deliberately refuses to copy a failed function's payload into its
 * error — that payload may carry deployment detail. A function that only threw
 * would reach the Endpoint as the word "Unhandled".
 */
export function parseMediaLambdaResponse(value: unknown): MediaLambdaResponse {
  const item = object(value, "MediaLambdaResponse");
  assert(item.contract === MEDIA_LAMBDA_RESPONSE,
    `MediaLambdaResponse contract must be ${MEDIA_LAMBDA_RESPONSE}`);
  const named = operation(item.operation, "MediaLambdaResponse.operation");
  if (item.ok === false) {
    return {
      contract: MEDIA_LAMBDA_RESPONSE,
      operation: named,
      ok: false,
      code: nonEmptyString(item.code, "MediaLambdaResponse.code"),
      message: nonEmptyString(item.message, "MediaLambdaResponse.message"),
    };
  }
  assert(item.ok === true, "MediaLambdaResponse.ok must be a boolean");
  return {
    contract: MEDIA_LAMBDA_RESPONSE,
    operation: named,
    ok: true,
    value: storedValue(item.value, "MediaLambdaResponse.value"),
  };
}
