/** Provider-authored, non-secret acknowledgement suitable for Results and user inspection. */
export type OperationReceipt = {
  readonly id: string;
  readonly url?: string;
};

export type OperationFailure = {
  readonly code: string;
  readonly message: string;
};

/** Provider-neutral, human-observable progress for one asynchronous invocation. */
export type OperationProgress = {
  readonly phase: string;
  readonly completed?: number;
  readonly total?: number;
  readonly unit?: string;
};

export type OperationCancellation = {
  readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed";
  readonly message?: string;
};

export type OperationEvidence = {
  readonly receipt?: OperationReceipt;
  readonly progress?: OperationProgress;
};

/** Provider-authored diagnostic text suitable for users; never credentials or request bodies. */
export type ExecutionDiagnostic = {
  readonly level: "info" | "warning" | "error";
  readonly message: string;
  readonly stream?: "stdout" | "stderr";
};
