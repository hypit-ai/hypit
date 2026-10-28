import type {
  BuildCommand,
  BuildDiagnostic,
  BuildPlan,
  LinkedProgram,
  Need,
  StepState,
  TypedRecord,
} from "@hypit/protocol";

/**
 * Disposable materialization of one Build Definition and its accepted Facts.
 *
 * This is a Kernel read/execution view, not a protocol document or durable authority.
 * Stores persist the Definition and ordered Facts and may reconstruct this view at any time.
 */
export type BuildView = {
  readonly program: LinkedProgram;
  readonly plan: BuildPlan;
  readonly status: "active" | "complete" | "failed";
  readonly records: readonly TypedRecord[];
  readonly steps: readonly StepState[];
  readonly needs: readonly Need[];
  readonly outstanding: readonly BuildCommand[];
  readonly diagnostics: readonly BuildDiagnostic[];
};
