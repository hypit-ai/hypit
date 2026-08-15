import type {
  CandidateId,
  CommandId,
  CapabilityRef,
  DerivationId,
  Digest,
  EventId,
  LogicalOutputId,
  NeedId,
  OperationId,
  ProducerRef,
  ReceiptId,
  RecordId,
  StepId,
  TypeRef,
} from "./identity.js";
import type { ResolvedModuleClosure } from "./module.js";
import type { CanonicalValue, StoredValue } from "./value.js";

export type SourceRange = {
  readonly start: number;
  readonly end: number;
};

export type AuthoredOrigin = {
  readonly kind: "authored";
};

export type DerivedOrigin = {
  readonly kind: "derived";
  readonly derivation: DerivationId;
};

export type ObservedOrigin = {
  readonly kind: "observed";
  readonly receipt: ReceiptId;
};

export type ProvidedOrigin = {
  readonly kind: "provided";
};

export type RecordOrigin = AuthoredOrigin | DerivedOrigin | ObservedOrigin | ProvidedOrigin;

/** One typed value in the graph; semantic validation happens at the Host admission boundary. */
export type TypedRecord = {
  readonly id: RecordId;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly digest: Digest;
  readonly origin: RecordOrigin;
};

export type Need = {
  readonly id: NeedId;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly constraints: CanonicalValue;
  readonly requestedBy: DerivationId;
  readonly result: RecordId;
  readonly requestDigest: Digest;
};

/** Exact request, selected Endpoint and returned value for one fulfilled Need. */
export type Receipt = {
  readonly id: ReceiptId;
  readonly need: NeedId;
  readonly requestDigest: Digest;
  readonly fulfiller: string;
  readonly output: RecordId;
  readonly outputDigest: Digest;
  readonly event: {
    readonly id: EventId;
    readonly digest: Digest;
  };
};

export type RecordDigestBinding = {
  readonly id: RecordId;
  readonly digest: Digest;
};

export type NeedDigestBinding = {
  readonly id: NeedId;
  readonly requestDigest: Digest;
};

export type Derivation = {
  readonly id: DerivationId;
  readonly step: StepId;
  readonly producer: ProducerRef;
  readonly inputs: readonly RecordDigestBinding[];
  readonly outputs: readonly RecordDigestBinding[];
  readonly needs: readonly NeedDigestBinding[];
  readonly event: {
    readonly id: EventId;
    readonly digest: Digest;
  };
};

export type NeedBinding = {
  readonly id: NeedId;
  readonly result: RecordId;
};

export type RecordRef = {
  readonly kind: "record";
  readonly id: RecordId;
};

export type LogicalOutputRef = {
  readonly kind: "logical-output";
  readonly id: LogicalOutputId;
};

export type OperationResultRef = {
  readonly kind: "operation-result";
  readonly operation: OperationId;
};

export type GraphValueRef = RecordRef | LogicalOutputRef | OperationResultRef;

export type LogicalOutput = {
  readonly id: LogicalOutputId;
  readonly type: TypeRef;
  readonly primary: CandidateId;
};

export type OperationResult =
  | {
      readonly kind: "output";
      readonly name: string;
      readonly record: RecordId;
    }
  | {
      readonly kind: "need";
      readonly name: string;
      readonly id: NeedId;
      readonly record: RecordId;
    };

export type OperationNode = {
  readonly id: OperationId;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, GraphValueRef>>;
  readonly result: OperationResult;
};

export type ProvidedValue = {
  readonly id: RecordId;
  readonly value: StoredValue;
};

export type CandidateRoot =
  | { readonly kind: "value"; readonly value: ProvidedValue }
  | { readonly kind: "operation"; readonly result: OperationResultRef };

export type Candidate = {
  readonly id: CandidateId;
  /** Type of the independent value exported by the Author or Run Graph. */
  readonly type: TypeRef;
  readonly root: CandidateRoot;
};

export type CompiledGraph = {
  readonly format: "narratage.graph@1";
  readonly id: Digest;
  readonly program: Digest;
  readonly outputs: readonly LogicalOutput[];
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
};

export type BuildTarget = {
  readonly output: LogicalOutputId;
};

export type Satisfaction = {
  readonly output: LogicalOutputId;
  readonly candidate: CandidateId;
};

export type BuildRequest = {
  readonly format: "narratage.build-request@1";
  readonly graph: Digest;
  readonly targets: readonly BuildTarget[];
  readonly digest: Digest;
};

export type BuildSelection = {
  readonly output: LogicalOutputId;
  readonly candidate: CandidateId;
  readonly record: RecordId;
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
};

export type BuildPlan = {
  readonly format: "narratage.plan@1";
  readonly id: Digest;
  readonly graph: Digest;
  readonly request: Digest;
  readonly steps: readonly ProducerStep[];
  readonly goals: readonly BuildGoal[];
  readonly selections: readonly BuildSelection[];
};

export type LinkedProgram = {
  readonly closure: ResolvedModuleClosure;
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

export type CoreCommand = InvokeProducerCommand | FulfillNeedCommand;

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
  readonly format: "narratage.build@1";
  readonly id: Digest;
  readonly program: LinkedProgram;
  readonly graph: CompiledGraph;
  readonly request: BuildRequest;
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
