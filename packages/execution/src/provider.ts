import type { EndpointQuote, ExecutionResourceSource, InvocationFailure, JsonValue, PublicationResource, QuoteInputs } from "./index.js";
import type { Capability, InvocationInputs } from "./model.js";

export type ProviderReceipt = {
  /** Public, non-secret task or request identity. */
  readonly id: string;
  /** Private JSON resume data. Do not include credentials. */
  readonly resume?: JsonValue;
};

export type ProviderContext<Request extends JsonValue = JsonValue> = {
  /** Stable across the Invocation. Providers can use this as an idempotency key. */
  readonly invocation: string;
  readonly request: Request;
  readonly signal: AbortSignal;
  openInput(name: string): ExecutionResourceSource;
};

export type ProviderRecoveryContext<Request extends JsonValue = JsonValue> = ProviderContext<Request> & {
  readonly receipt: ProviderReceipt;
};

export type ProviderPending = { readonly status: "pending"; readonly retryAfterMs: number; readonly progress?: string };
export type ProviderFailure = { readonly status: "failed"; readonly failure: InvocationFailure; readonly receipt?: ProviderReceipt };
export type ProviderCancelled = { readonly status: "cancelled" };
export type ProviderSubmission =
  | ProviderFailure
  | (ProviderPending & { readonly receipt: ProviderReceipt })
  | { readonly status: "ready"; readonly receipt: ProviderReceipt };
export type ProviderPoll = ProviderPending | ProviderFailure | ProviderCancelled | { readonly status: "ready" };

export type ProviderOutputWriter = {
  /** Stream a resource into this attempt. Await every write before returning the outputs. */
  writeResource(output: string, name: string, source: ExecutionResourceSource): Promise<PublicationResource>;
};

export type ProviderCollectionContext<Request extends JsonValue = JsonValue> =
  ProviderRecoveryContext<Request> & ProviderOutputWriter;

export type ProviderDirectContext<Request extends JsonValue = JsonValue> = ProviderContext<Request> & ProviderOutputWriter & {
  /** Persist a real service receipt when the service offers a result lookup. */
  checkpointReceipt(receipt: ProviderReceipt): Promise<void>;
};

export type ProviderOutputs = { readonly status: "complete"; readonly values: Readonly<Record<string, JsonValue>> };
export type ProviderCollection = ProviderPending | ProviderFailure | ProviderOutputs;

type EndpointBase<Request extends JsonValue> = {
  readonly id: string;
  readonly capability: Capability<Request>;
  /** Validate deployment constraints before staging inputs or submitting work. */
  check?(request: Request, inputs: InvocationInputs): void;
  quote?(request: Request, inputs: QuoteInputs, signal: AbortSignal): Promise<EndpointQuote>;
};

export type ProviderJobEndpoint<Request extends JsonValue = JsonValue> = EndpointBase<Request> & {
  readonly kind: "job";
  submit(context: ProviderContext<Request>): Promise<ProviderSubmission>;
  poll(context: ProviderRecoveryContext<Request>): Promise<ProviderPoll>;
  collect(context: ProviderCollectionContext<Request>): Promise<ProviderCollection>;
  /** Optional read-only lookup by the durable Invocation id. */
  reconcile?(context: ProviderContext<Request>): Promise<ProviderSubmission | undefined>;
  /** Cancellation requests must be safe to repeat after the worker restarts. */
  cancel?(context: ProviderRecoveryContext<Request>): Promise<"confirmed" | "accepted" | "unsupported" | "too-late" | "failed">;
};

export type ProviderDirectEndpoint<Request extends JsonValue = JsonValue> = EndpointBase<Request> & {
  readonly kind: "direct";
  run(context: ProviderDirectContext<Request>): Promise<ProviderOutputs | ProviderFailure>;
  /** Recover the output of a previously accepted request by read-only lookup. */
  recover?(context: ProviderRecoveryContext<Request> & ProviderOutputWriter): Promise<ProviderCollection>;
};

export type ProviderEndpoint<Request extends JsonValue = JsonValue> =
  ProviderJobEndpoint<Request> | ProviderDirectEndpoint<Request>;

/** Bind a typed adapter at the deployment boundary for heterogeneous Invocation requests. */
export function bindProviderEndpoint<Request extends JsonValue>(endpoint: ProviderEndpoint<Request>): ProviderEndpoint {
  const request = <Context extends ProviderContext>(context: Context): Omit<Context, "request"> & { request: Request } =>
    ({ ...context, request: endpoint.capability.readRequest(context.request) });
  const base = {
    id: endpoint.id,
    capability: endpoint.capability,
    ...(endpoint.check === undefined ? {} : {
      check: (input: JsonValue, inputs: InvocationInputs) => endpoint.check!(endpoint.capability.readRequest(input), inputs),
    }),
    ...(endpoint.quote === undefined ? {} : {
      quote: (input: JsonValue, inputs: QuoteInputs, signal: AbortSignal) =>
        endpoint.quote!(endpoint.capability.readRequest(input), inputs, signal),
    }),
  };
  if (endpoint.kind === "direct") return {
    ...base, kind: "direct",
    run: context => endpoint.run(request(context)),
    ...(endpoint.recover === undefined ? {} : { recover: context => endpoint.recover!(request(context)) }),
  };
  return {
    ...base, kind: "job",
    submit: context => endpoint.submit(request(context)),
    poll: context => endpoint.poll(request(context)),
    collect: context => endpoint.collect(request(context)),
    ...(endpoint.reconcile === undefined ? {} : { reconcile: context => endpoint.reconcile!(request(context)) }),
    ...(endpoint.cancel === undefined ? {} : { cancel: context => endpoint.cancel!(request(context)) }),
  };
}
