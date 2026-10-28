import type {
  CandidateId,
  CommandId,
  CapabilityRef,
  LogicalOutputId,
  NeedId,
  OperationId,
  ProducerRef,
  RecordId,
  StepId,
  TypeRef,
} from "./identity.js";
import type { ResolvedModuleClosure } from "./module.js";
import type { Value } from "./value.js";

/** One typed value in the graph; semantic validation belongs to its installed Type owner. */
export type TypedRecord = {
  readonly id: RecordId;
  readonly type: TypeRef;
  readonly value: Value;
};

export type Need = {
  readonly id: NeedId;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly constraints: Value;
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

export type CandidateRoot =
  | RecordRef
  | { readonly kind: "value"; readonly record: RecordId; readonly value: Value }
  /** A zero-input value whose source is materialized only after this Candidate is selected. */
  | { readonly kind: "supply"; readonly record: RecordId }
  | { readonly kind: "operation"; readonly result: OperationResultRef };

export type Candidate = {
  readonly id: CandidateId;
  /** Type of the independent value exported by the Author or Run Graph. */
  readonly type: TypeRef;
  readonly root: CandidateRoot;
};

export type AuthorGraph = {
  readonly format: "hypit.graph@1";
  readonly outputs: readonly LogicalOutput[];
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
};

export type Satisfaction = {
  readonly output: LogicalOutputId;
  readonly candidate: CandidateId;
};

export type ProducerStep = {
  readonly id: StepId;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, RecordId>>;
  readonly result: OperationResult;
};

export type BuildPlan = {
  readonly format: "hypit.plan@1";
  readonly steps: readonly ProducerStep[];
  /** Unique Record identities whose existence completes this finite execution. */
  readonly goals: readonly RecordId[];
};

/** The complete execution intent compiled from one `.svrun` source. */
export type RunGraph = {
  readonly format: "hypit.run-graph@1";
  /** Literal values authored by this Run and reached only through its selected Fragments. */
  readonly records: readonly TypedRecord[];
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
  readonly satisfactions: readonly Satisfaction[];
  readonly targets: readonly LogicalOutputId[];
};

export type LinkedProgram = {
  readonly closure: ResolvedModuleClosure;
  readonly records: readonly TypedRecord[];
};

export type StepState = {
  readonly id: StepId;
  readonly status: "pending" | "complete";
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

export type BuildCommand = InvokeProducerCommand | FulfillNeedCommand;

export type ProducerCompletedEvent = {
  readonly kind: "producer-completed";
  readonly command: CommandId;
  readonly result:
    | { readonly kind: "output"; readonly value: Value }
    | { readonly kind: "need"; readonly constraints: Value };
};

export type NeedFulfilledEvent = {
  readonly kind: "need-fulfilled";
  readonly command: CommandId;
  readonly value: Value;
};

export type CommandFailedEvent = {
  readonly kind: "command-failed";
  readonly command: CommandId;
  readonly code: string;
  readonly message: string;
};

/** One execution result offered to Core. */
export type CommandResult = ProducerCompletedEvent | NeedFulfilledEvent | CommandFailedEvent;

export type BuildDiagnostic = {
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

/** Immutable finite program selected by one Author Graph plus one Run Graph. */
export type BuildDefinition = {
  readonly format: "hypit.build-definition@1";
  /** Complete sealed execution program, including every already-established starting Record. */
  readonly program: LinkedProgram;
  readonly plan: BuildPlan;
};

type BuildFactBase = {
  readonly format: "hypit.build-fact@1";
  readonly command: CommandId;
};

/** One Producer result accepted by Core. Every added value is stored exactly once. */
export type ProducerAppliedFact = BuildFactBase & {
  readonly kind: "producer-applied";
  readonly step: StepId;
  readonly result:
    | { readonly kind: "output"; readonly record: TypedRecord }
    | { readonly kind: "need"; readonly need: Need };
};

/** One external Need result accepted by Core. */
export type NeedAppliedFact = BuildFactBase & {
  readonly kind: "need-applied";
  readonly need: NeedId;
  readonly record: TypedRecord;
};

/** One terminal command failure accepted by Core. */
export type CommandFailedFact = BuildFactBase & {
  readonly kind: "command-failed";
  readonly diagnostic: BuildDiagnostic;
};

/** Fixed Core facts, not an extensible event or patch system. */
export type BuildFact = ProducerAppliedFact | NeedAppliedFact | CommandFailedFact;
