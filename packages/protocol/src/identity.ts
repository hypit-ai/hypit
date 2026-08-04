export type Digest = `sha256:${string}`;

export type RecordId = string;
export type NodeId = string;
export type LogicalOutputId = string;
export type CandidateId = string;
export type OperationId = string;
export type NeedId = string;
export type StepId = string;
export type DerivationId = string;
export type ReceiptId = string;
export type CommandId = string;
export type EventId = string;

export type ModuleRef = {
  readonly name: string;
  readonly version: string;
};

export type TypeRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type ProducerRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type CapabilityRef = {
  readonly module: ModuleRef;
  readonly name: string;
};
