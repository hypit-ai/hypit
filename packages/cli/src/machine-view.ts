import type { CliBuildResultView, CliBuildStatusView, CliOutputView } from "./view.js";

type AttentionView = { readonly message: string; readonly action?: string };

export type OperationalMachineView =
  | { readonly format: "hypit.cli-logs@1"; readonly build: string; readonly source: "runtime" | "result" | "unavailable"; readonly records: readonly import("@hypit/runtime").ExecutionLogRecord[]; readonly omittedRecords: number }
  | { readonly format: "hypit.cli-auth-status@1"; readonly endpoint: string; readonly credentials: readonly { readonly endpoint: string; readonly slot: string; readonly label: string; readonly kind: string; readonly configured: boolean; readonly writable: boolean; readonly acquisition?: { readonly kind: string; readonly authorizationEndpoint: string } }[]; readonly omittedCredentials?: number }
  | { readonly format: "hypit.cli-auth-change@1"; readonly endpoint: string; readonly slot: string; readonly configured: boolean; readonly changed?: boolean }
  | { readonly format: "hypit.cli-builds@1"; readonly builds: readonly { readonly id: string; readonly createdAt: string; readonly title?: string; readonly outcome: string; readonly run?: string; readonly targetCount: number; readonly targets?: readonly string[]; readonly omittedTargets?: number; readonly outputCount: number }[]; readonly next?: string }
  | { readonly format: "hypit.cli-history@1"; readonly output: string; readonly source?: string; readonly entries: readonly { readonly build: string; readonly title?: string; readonly createdAt: string; readonly outcome: string; readonly output: CliOutputView }[]; readonly next?: string }
  | { readonly format: "hypit.cli-inspect@1"; readonly build: CliBuildResultView }
  | { readonly format: "hypit.cli-result-edit@1"; readonly build: string; readonly title: string | null; readonly note: string | null; readonly highlightedOutputCount: number; readonly highlightedOutputs: readonly string[]; readonly omittedHighlightedOutputs?: number }
  | { readonly format: "hypit.cli-get@1"; readonly build: string; readonly output: string; readonly type: string; readonly representation: "inline" | "file" | "value-document"; readonly path: string }
  | { readonly format: "hypit.cli-status@1"; readonly build: CliBuildStatusView | null }
  | { readonly format: "hypit.cli-activity@1"; readonly at: number; readonly execution: string; readonly builds: readonly { readonly id: string; readonly work: CliBuildStatusView["work"]; readonly phases: Readonly<Record<string, number>>; readonly attention?: AttentionView }[]; readonly omittedBuilds?: number; readonly capacity?: readonly import("@hypit/runtime").CapacityReservation[] }
  | { readonly format: "hypit.cli-result-discard@1"; readonly build: string; readonly discarded: boolean }
  | { readonly format: "hypit.cli-result-finish@1"; readonly build: string; readonly found?: false; readonly outcome?: string; readonly attention?: AttentionView }
  | { readonly format: "hypit.cli-cancel@1"; readonly requested: boolean; readonly build: CliBuildStatusView | null }
  | { readonly format: "hypit.cli-build@1"; readonly build: CliBuildStatusView };
