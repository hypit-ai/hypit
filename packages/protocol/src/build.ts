import type {
  CommandId,
  DerivationId,
  Digest,
  EventId,
  NeedId,
  ProducerRef,
  ReceiptId,
  RecordId,
  StepId,
  TypeRef,
} from "./identity.js";
import type { ResolvedModuleClosure } from "./module.js";
import type { CanonicalValue, StoredValue } from "./value.js";

export type Conformance = "exact" | "substitute";
export type Delivery = "executed" | "cache" | "manual" | "provided";

export type SourceRange = {
  readonly start: number;
  readonly end: number;
};

export type AuthoredOrigin = {
  readonly kind: "authored";
  readonly sourceDigest: Digest;
  readonly frontendClosureDigest: Digest;
  readonly sourceName?: string;
  readonly range?: SourceRange;
};

export type DerivedOrigin = {
  readonly kind: "derived";
  readonly derivation: DerivationId;
};

export type ObservedOrigin = {
  readonly kind: "observed";
  readonly receipt: ReceiptId;
};

export type RecordOrigin = AuthoredOrigin | DerivedOrigin | ObservedOrigin;

export type TypedRecord = {
  readonly id: RecordId;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly digest: Digest;
  readonly conformance: Conformance;
  readonly origin: RecordOrigin;
};

export type TypedModule = {
  readonly format: "svml.typed-module@0";
  readonly id: string;
  readonly closureDigest: Digest;
  readonly records: readonly TypedRecord[];
  readonly semanticDigest: Digest;
};

export type NeedAcceptance = "exact" | "substitute";

export type Need = {
  readonly id: NeedId;
  readonly wants: TypeRef;
  readonly constraints: CanonicalValue;
  readonly requestedBy: DerivationId;
  readonly result: RecordId;
  readonly accepts: NeedAcceptance;
  readonly requestDigest: Digest;
};

export type Receipt = {
  readonly id: ReceiptId;
  readonly need: NeedId;
  readonly requestDigest: Digest;
  readonly fulfiller: string;
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly output: RecordId;
  readonly outputDigest: Digest;
  readonly metadata: CanonicalValue;
};

export type Derivation = {
  readonly id: DerivationId;
  readonly step: StepId;
  readonly producer: ProducerRef;
  readonly implementationDigest: Digest;
  readonly inputs: readonly RecordId[];
  readonly outputs: readonly RecordId[];
  readonly needs: readonly NeedId[];
};

export type NeedBinding = {
  readonly id: NeedId;
  readonly result: RecordId;
  readonly accepts: NeedAcceptance;
};

export type ProducerStep = {
  readonly id: StepId;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, RecordId>>;
  readonly outputs: Readonly<Record<string, RecordId>>;
  readonly needs: Readonly<Record<string, NeedBinding>>;
};

export type BuildGoal = {
  readonly record: RecordId;
  readonly type: TypeRef;
  readonly accepts: NeedAcceptance;
};

export type BuildPlan = {
  readonly format: "svml.plan@0";
  readonly id: string;
  readonly steps: readonly ProducerStep[];
  readonly goals: readonly BuildGoal[];
};

export type LinkedProgram = {
  readonly closure: ResolvedModuleClosure;
  readonly modules: readonly TypedModule[];
  readonly records: readonly TypedRecord[];
  readonly semanticDigest: Digest;
};

export type StepState = {
  readonly id: StepId;
  readonly status: "pending" | "complete";
  readonly derivation?: DerivationId;
};

export type InvokeProducerCommand = {
  readonly kind: "invoke-producer";
  readonly id: CommandId;
  readonly step: StepId;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, RecordId>>;
};

export type FulfillNeedCommand = {
  readonly kind: "fulfill-need";
  readonly id: CommandId;
  readonly need: Need;
};

export type CompleteCommand = {
  readonly kind: "complete";
  readonly id: CommandId;
  readonly goals: readonly RecordId[];
};

export type CoreCommand = InvokeProducerCommand | FulfillNeedCommand | CompleteCommand;

export type ProducerCompletedEvent = {
  readonly kind: "producer-completed";
  readonly id: EventId;
  readonly command: CommandId;
  readonly outputs: Readonly<Record<string, StoredValue>>;
  readonly needs: Readonly<Record<string, CanonicalValue>>;
};

export type NeedFulfilledEvent = {
  readonly kind: "need-fulfilled";
  readonly id: EventId;
  readonly command: CommandId;
  readonly value: StoredValue;
  readonly requestDigest: Digest;
  readonly fulfiller: string;
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly metadata: CanonicalValue;
};

export type CommandFailedEvent = {
  readonly kind: "command-failed";
  readonly id: EventId;
  readonly command: CommandId;
  readonly code: string;
  readonly message: string;
};

export type BuildEvent = ProducerCompletedEvent | NeedFulfilledEvent | CommandFailedEvent;

export type AcceptedEvent = {
  readonly id: EventId;
  readonly digest: Digest;
};

export type BuildDiagnostic = {
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

export type BuildState = {
  readonly format: "svml.build@0";
  readonly id: Digest;
  readonly program: LinkedProgram;
  readonly plan: BuildPlan;
  readonly status: "active" | "complete" | "failed";
  readonly records: readonly TypedRecord[];
  readonly steps: readonly StepState[];
  readonly needs: readonly Need[];
  readonly receipts: readonly Receipt[];
  readonly derivations: readonly Derivation[];
  readonly outstanding: readonly CoreCommand[];
  readonly acceptedEvents: readonly AcceptedEvent[];
  readonly diagnostics: readonly BuildDiagnostic[];
};

export type CoreTransition = {
  readonly state: BuildState;
  readonly commands: readonly CoreCommand[];
};
