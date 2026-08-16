import {
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import type {
  LambdaClientConfig,
} from "@aws-sdk/client-lambda";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";

/** One canonical JSON exchange; callers may inject any structurally compatible transport. */
export interface JsonInvoker {
  invoke(request: CanonicalValue, options?: { readonly signal?: AbortSignal }): Promise<CanonicalValue>;
}

export type LambdaInvocationInput = {
  readonly functionName: string;
  readonly payload: Uint8Array;
  readonly qualifier?: string;
  readonly tenantId?: string;
};

export type LambdaInvocationOutput = {
  readonly statusCode?: number;
  readonly functionError?: string;
  readonly payload?: Uint8Array;
};

export type LambdaInvocationClient = {
  invoke(input: LambdaInvocationInput, signal?: AbortSignal): Promise<LambdaInvocationOutput>;
};

export type AwsLambdaJsonInvokerOptions = {
  readonly functionName: string;
  readonly qualifier?: string;
  readonly tenantId?: string;
  readonly region?: string;
  readonly endpoint?: string;
  readonly maxPayloadBytes?: number;
  /** Injection point for tests and specially configured trusted AWS clients. */
  readonly client?: LambdaInvocationClient;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

class AwsSdkLambdaInvocationClient implements LambdaInvocationClient {
  readonly #client: LambdaClient;

  constructor(config: LambdaClientConfig = {}) {
    this.#client = new LambdaClient(config);
  }

  async invoke(input: LambdaInvocationInput, signal?: AbortSignal): Promise<LambdaInvocationOutput> {
    const response = await this.#client.send(new InvokeCommand({
      FunctionName: input.functionName,
      InvocationType: "RequestResponse",
      Payload: input.payload,
      ...(input.qualifier === undefined ? {} : { Qualifier: input.qualifier }),
      ...(input.tenantId === undefined ? {} : { TenantId: input.tenantId }),
    }), signal === undefined ? {} : { abortSignal: signal });
    return {
      ...(response.StatusCode === undefined ? {} : { statusCode: response.StatusCode }),
      ...(response.FunctionError === undefined ? {} : { functionError: response.FunctionError }),
      ...(response.Payload === undefined ? {} : { payload: Uint8Array.from(response.Payload) }),
    };
  }
}

/**
 * Synchronous JSON transport. Endpoint packages still own request shape and outcomes.
 */
export class AwsLambdaJsonInvoker implements JsonInvoker {
  readonly #client: LambdaInvocationClient;
  readonly #functionName: string;
  readonly #qualifier: string | undefined;
  readonly #tenantId: string | undefined;
  readonly #maxPayloadBytes: number;

  constructor(options: AwsLambdaJsonInvokerOptions) {
    assert(options.functionName.trim().length > 0, "Lambda functionName must not be empty");
    if (options.qualifier !== undefined) assert(options.qualifier.trim().length > 0, "Lambda qualifier must not be empty");
    if (options.tenantId !== undefined) assert(options.tenantId.trim().length > 0, "Lambda tenantId must not be empty");
    this.#functionName = options.functionName;
    this.#qualifier = options.qualifier;
    this.#tenantId = options.tenantId;
    this.#maxPayloadBytes = positiveInteger(options.maxPayloadBytes ?? 6 * 1024 * 1024, "maxPayloadBytes");
    this.#client = options.client ?? new AwsSdkLambdaInvocationClient({
      ...(options.region === undefined ? {} : { region: options.region }),
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    });
  }

  async invoke(
    request: CanonicalValue,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<CanonicalValue> {
    const payload = new TextEncoder().encode(JSON.stringify(canonicalize(request)));
    assert(payload.byteLength <= this.#maxPayloadBytes,
      `Lambda JSON request is ${payload.byteLength} bytes, over limit ${this.#maxPayloadBytes}`);
    const response = await this.#client.invoke({
      functionName: this.#functionName,
      payload,
      ...(this.#qualifier === undefined ? {} : { qualifier: this.#qualifier }),
      ...(this.#tenantId === undefined ? {} : { tenantId: this.#tenantId }),
    }, options.signal);
    if (response.statusCode !== 200) {
      throw new Error(`Lambda ${this.#functionName} returned invocation status ${response.statusCode ?? "unknown"}`);
    }
    const responsePayload = response.payload ?? new Uint8Array();
    assert(responsePayload.byteLength <= this.#maxPayloadBytes,
      `Lambda JSON response is ${responsePayload.byteLength} bytes, over limit ${this.#maxPayloadBytes}`);
    const text = decode(responsePayload);
    if (response.functionError !== undefined) {
      // Function payloads may contain deployment secrets; do not copy them into framework errors.
      throw new Error(`Lambda ${this.#functionName} failed (${response.functionError})`);
    }
    assert(text.length > 0, `Lambda ${this.#functionName} returned an empty JSON response`);
    return canonicalize(JSON.parse(text));
  }
}
