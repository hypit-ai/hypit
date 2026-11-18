export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type InvocationAddress = { readonly environment: string; readonly invocation: string };
export class InvocationIdentityConflict extends Error {
  constructor(readonly address: InvocationAddress) { super(`Invocation ${address.invocation} already exists in ${address.environment}.`); }
}
export type InvocationRequest = {
  readonly capability: string;
  readonly input: JsonValue;
  readonly endpoint?: string;
};

export type QuoteInputs = Readonly<Record<string, {
  readonly mediaType: string;
  readonly size?: number;
  readonly durationSeconds?: number;
}>>;

export type EndpointQuote =
  | { readonly kind: "estimate"; readonly model: string; readonly source: string; readonly pricing: JsonValue;
      readonly estimatedUSD: number; readonly estimatedCredits: number; readonly units: JsonValue; readonly dimensions: JsonValue }
  | { readonly kind: "pricing"; readonly model: string; readonly source: string; readonly pricing: JsonValue;
      readonly missing: readonly string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

export type ExecutionQuote = EndpointQuote & {
  readonly environment: string;
  readonly capability: string;
  readonly endpoint: string;
};

export type ExecutionFinding = {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
};

export type InvocationPhase =
  | "queued" | "submitting" | "running" | "collecting" | "received"
  | "complete" | "failed" | "cancelled";

export type InvocationFailure = { readonly code: string; readonly message: string };
export type InvocationCancellation = "requested" | "accepted" | "confirmed" | "unsupported" | "too-late" | "failed";

export type InvocationObservation = {
  readonly address: InvocationAddress;
  readonly capability: string;
  readonly endpoint: string;
  readonly phase: InvocationPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly receipt?: { readonly id: string };
  readonly progress?: string;
  readonly failure?: InvocationFailure;
  readonly cancellation?: InvocationCancellation;
};

export type ExecutionResourceSource = {
  readonly mediaType: string;
  readonly size?: number;
  readonly bytes: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
};

export type PublicationResource = {
  readonly path: string;
  readonly mediaType: string;
  readonly size: number;
};

export type PublicationOutput = {
  readonly type: string;
  readonly value: JsonValue;
  readonly resources: Readonly<Record<string, PublicationResource>>;
};

export type Publication = {
  readonly format: "hypit.publication";
  readonly address: InvocationAddress;
  readonly capability: string;
  readonly publishedAt: string;
  readonly outputs: Readonly<Record<string, PublicationOutput>>;
};

export type ExecutionCapabilityProjection = {
  readonly capability: string;
  readonly title: string;
  readonly endpoints: readonly string[];
};

export type ExecutionClient = {
  readonly environment: string;
  capabilities(): readonly ExecutionCapabilityProjection[];
  quote(request: InvocationRequest, options?: { readonly inputs?: QuoteInputs; readonly signal?: AbortSignal }): Promise<ExecutionQuote>;
  start(request: InvocationRequest, options?: {
    readonly inputs?: Readonly<Record<string, ExecutionResourceSource>>;
    readonly invocation?: string;
    readonly signal?: AbortSignal;
  }): Promise<InvocationAddress>;
  get(address: InvocationAddress): Promise<InvocationObservation | undefined>;
  wait(address: InvocationAddress, options?: { readonly signal?: AbortSignal }): Promise<InvocationObservation>;
  cancel(address: InvocationAddress): Promise<InvocationObservation>;
  publication(address: InvocationAddress): Promise<Publication | undefined>;
  openResource(address: InvocationAddress, output: string, resource: string): Promise<ExecutionResourceSource>;
};

export type ExecutionClientLease = {
  readonly client: ExecutionClient;
  close(): void | Promise<void>;
};

export type ExecutionEnvironment = {
  readonly projection: { readonly id: string; readonly kind: string; readonly title: string };
  connect(): ExecutionClientLease;
  doctor?(capability: string | undefined, signal: AbortSignal): Promise<readonly ExecutionFinding[]>;
  close(): void | Promise<void>;
};
