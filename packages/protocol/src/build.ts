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

export type ProvidedOrigin = {
  readonly kind: "provided";
  readonly candidate: CandidateId;
  readonly requestDigest: Digest;
  readonly provenance?: CanonicalValue;
};

export type RecordOrigin = AuthoredOrigin | DerivedOrigin | ObservedOrigin | ProvidedOrigin;

/** Content-bound Host assertion that the Type owner's locked validator accepted this exact value. */
export type TypeValidationReceipt = {
  readonly format: "svml.type-validation@1";
  readonly id: Digest;
  readonly type: TypeRef;
  readonly recordDigest: Digest;
  readonly validatorDigest: Digest;
};

export type TypedRecord = {
  readonly id: RecordId;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly digest: Digest;
  readonly conformance: Conformance;
  readonly origin: RecordOrigin;
  readonly validation?: TypeValidationReceipt;
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
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly constraints: CanonicalValue;
  readonly requestedBy: DerivationId;
  readonly result: RecordId;
  readonly accepts: NeedAcceptance;
  /** Worst conformance inherited from the Producer inputs that requested this Need. */
  readonly conformanceFloor: Conformance;
  readonly requestDigest: Digest;
};

export type Receipt = {
  readonly id: ReceiptId;
  readonly need: NeedId;
  readonly requestDigest: Digest;
  readonly fulfiller: string;
  /** Conformance reported by the external fulfiller before upstream quality is applied. */
  readonly fulfillmentConformance: Conformance;
  /** Effective conformance after applying the Need's inherited floor. */
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly output: RecordId;
  readonly outputDigest: Digest;
  readonly metadata: CanonicalValue;
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
  readonly implementationDigest: Digest;
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
  readonly accepts: NeedAcceptance;
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

/** A domain-neutral equality claim between a logical result and one source fact. */
export type AffinityConstraint = {
  readonly resultPointer: string;
  readonly source: GraphValueRef;
  readonly sourcePointer: string;
};

export type LogicalOutput = {
  readonly id: LogicalOutputId;
  readonly type: TypeRef;
  readonly primary: CandidateId;
  readonly candidates: readonly CandidateId[];
  /** Author-visible facts that a Candidate may transitively depend upon. */
  readonly semanticInputs: readonly GraphValueRef[];
  readonly affinity?: readonly AffinityConstraint[];
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
      readonly accepts: NeedAcceptance;
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
  readonly provenance?: CanonicalValue;
  readonly validation?: TypeValidationReceipt;
};

export type CandidateRoot =
  | { readonly kind: "value"; readonly value: ProvidedValue }
  | { readonly kind: "operation"; readonly result: OperationResultRef };

export type Candidate = {
  readonly id: CandidateId;
  readonly output: LogicalOutputId;
  readonly root: CandidateRoot;
  /** Fidelity to the Logical Output promise, independent of Provider fulfillment. */
  readonly fidelity: Conformance;
};

export type CompiledGraph = {
  readonly format: "svml.graph@1";
  readonly id: Digest;
  readonly program: Digest;
  /** Digest of the author graph before external Candidate attachment. */
  readonly source: Digest;
  /** Digest of the empty realization set or the locked Realization Closure. */
  readonly realization: Digest;
  readonly outputs: readonly LogicalOutput[];
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
};

export type BuildTarget = {
  readonly output: LogicalOutputId;
  readonly accepts: NeedAcceptance;
};

export type CandidateBinding = {
  readonly output: LogicalOutputId;
  readonly candidate: CandidateId;
};

export type BuildRequest = {
  readonly format: "svml.build-request@1";
  readonly graph: Digest;
  readonly targets: readonly BuildTarget[];
  readonly bindings: readonly CandidateBinding[];
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
  readonly fidelity: Conformance;
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
  readonly format: "svml.plan@1";
  readonly id: Digest;
  readonly graph: Digest;
  readonly request: Digest;
  readonly initialValues: readonly TypedRecord[];
  readonly steps: readonly ProducerStep[];
  readonly goals: readonly BuildGoal[];
  readonly selections: readonly BuildSelection[];
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
  readonly validations?: Readonly<Record<string, TypeValidationReceipt>>;
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
  readonly validation?: TypeValidationReceipt;
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
  readonly format: "svml.build@1";
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

export type CoreTransition = {
  readonly state: BuildState;
  readonly commands: readonly CoreCommand[];
};
