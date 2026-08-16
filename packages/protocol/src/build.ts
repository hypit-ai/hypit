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
import type { CanonicalValue, StoredValue } from "./value.js";

export type SourceRange = {
  readonly start: number;
  readonly end: number;
};

/** One typed value in the graph; semantic validation happens at the Host admission boundary. */
export type TypedRecord = {
  readonly id: RecordId;
  readonly type: TypeRef;
  readonly value: StoredValue;
};

export type Need = {
  readonly id: NeedId;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly constraints: CanonicalValue;
  readonly result: RecordId;
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
  readonly targets: readonly BuildTarget[];
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
  readonly steps: readonly ProducerStep[];
  readonly goals: readonly BuildGoal[];
  readonly selections: readonly BuildSelection[];
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

export type CoreCommand = InvokeProducerCommand | FulfillNeedCommand;

export type ProducerCompletedEvent = {
  readonly kind: "producer-completed";
  readonly command: CommandId;
  readonly outputs: Readonly<Record<string, StoredValue>>;
  readonly needs: Readonly<Record<string, CanonicalValue>>;
};

export type NeedFulfilledEvent = {
  readonly kind: "need-fulfilled";
  readonly command: CommandId;
  readonly value: StoredValue;
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
  readonly format: "narratage.build-definition@1";
  readonly program: LinkedProgram;
  readonly graph: CompiledGraph;
  readonly request: BuildRequest;
  readonly plan: BuildPlan;
};

type BuildFactBase = {
  readonly format: "narratage.build-fact@1";
  readonly command: CommandId;
};

/** One Producer result admitted by Core. Every added value is stored exactly once. */
export type ProducerAppliedFact = BuildFactBase & {
  readonly kind: "producer-applied";
  readonly step: StepId;
  readonly records: readonly TypedRecord[];
  readonly needs: readonly Need[];
};

/** One external Need result admitted by Core. */
export type NeedAppliedFact = BuildFactBase & {
  readonly kind: "need-applied";
  readonly need: NeedId;
  readonly record: TypedRecord;
};

/** One terminal command failure admitted by Core. */
export type CommandFailedFact = BuildFactBase & {
  readonly kind: "command-failed";
  readonly diagnostic: BuildDiagnostic;
};

/** Fixed Core facts, not an extensible event or patch system. */
export type BuildFact = ProducerAppliedFact | NeedAppliedFact | CommandFailedFact;

/** Materialized read/execution view. Durable Stores persist Definition + Facts, never this object. */
export type BuildState = {
  readonly format: "narratage.build@1";
  readonly program: LinkedProgram;
  readonly graph: CompiledGraph;
  readonly request: BuildRequest;
  readonly plan: BuildPlan;
  readonly status: "active" | "complete" | "failed";
  readonly records: readonly TypedRecord[];
  readonly steps: readonly StepState[];
  readonly needs: readonly Need[];
  readonly outstanding: readonly CoreCommand[];
  readonly diagnostics: readonly BuildDiagnostic[];
};
