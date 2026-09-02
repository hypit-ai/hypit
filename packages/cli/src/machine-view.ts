import type { CliBuildResultView, CliBuildStatusView, CliOutputView } from "./view.js";

type ProgramStateView = { readonly id: string; readonly state: string; readonly action?: string };
type AttentionView = { readonly message: string; readonly action?: string };

export type OperationalMachineView =
  | { readonly format: "hypit.cli-runtime-selection@2"; readonly selected: boolean; readonly removed?: boolean; readonly profile?: string; readonly project?: string }
  | { readonly format: "hypit.cli-paths@1"; readonly project: string; readonly projectState: string; readonly profile?: string; readonly runtimeData?: string; readonly hostState: string; readonly machinePackages: string; readonly distribution?: string }
  | { readonly format: "hypit.cli-package@2"; readonly action: "install" | "status"; readonly package: string; readonly ready: boolean }
  | { readonly format: "hypit.cli-programs@2"; readonly action: "up" | "down" | "status"; readonly ready: boolean; readonly programs: readonly ProgramStateView[]; readonly omittedPrograms?: number }
  | { readonly format: "hypit.cli-runtime-up@2"; readonly ready: boolean; readonly worker: string; readonly preparedPackages: number; readonly programs: { readonly total: number; readonly ready: number } }
  | { readonly format: "hypit.cli-runtime-logs@2"; readonly lines: readonly string[]; readonly totalLines: number; readonly omittedLines: number; readonly path?: string }
  | { readonly format: "hypit.cli-runtime-down@2"; readonly worker: string }
  | { readonly format: "hypit.cli-runtime-status@2"; readonly ready: boolean; readonly attention: boolean; readonly worker: { readonly state: string; readonly configuration?: string }; readonly builds: Readonly<Record<string, number>>; readonly programs: { readonly total: number; readonly ready: number; readonly unavailable: readonly ProgramStateView[] }; readonly capacity: { readonly active: number; readonly lanes?: readonly { readonly pool: string; readonly lane: string; readonly inFlight: number }[] } }
  | { readonly format: "hypit.cli-auth-status@2"; readonly endpoint: string; readonly credentials: readonly { readonly endpoint: string; readonly slot: string; readonly label: string; readonly kind: string; readonly configured: boolean; readonly writable: boolean }[]; readonly omittedCredentials?: number }
  | { readonly format: "hypit.cli-auth-change@2"; readonly endpoint: string; readonly slot: string; readonly configured: boolean; readonly changed?: boolean }
  | { readonly format: "hypit.cli-builds@3"; readonly builds: readonly { readonly id: string; readonly createdAt: string; readonly title?: string; readonly outcome: string; readonly run?: string; readonly targetCount: number; readonly targets?: readonly string[]; readonly omittedTargets?: number; readonly outputCount: number }[]; readonly next?: string }
  | { readonly format: "hypit.cli-history@4"; readonly output: string; readonly source?: string; readonly entries: readonly { readonly build: string; readonly title?: string; readonly createdAt: string; readonly outcome: string; readonly output: CliOutputView }[]; readonly next?: string }
  | { readonly format: "hypit.cli-inspect@4"; readonly build: CliBuildResultView }
  | { readonly format: "hypit.cli-result-edit@3"; readonly build: string; readonly title: string | null; readonly note: string | null; readonly highlightedOutputCount: number; readonly highlightedOutputs: readonly string[]; readonly omittedHighlightedOutputs?: number }
  | { readonly format: "hypit.cli-get@4"; readonly build: string; readonly output: string; readonly type: string; readonly kind: "scalar" | "resource" | "composite"; readonly path: string }
  | { readonly format: "hypit.cli-status@3"; readonly build: CliBuildStatusView | null }
  | { readonly format: "hypit.cli-activity@2"; readonly at: number; readonly worker: string; readonly builds: readonly { readonly id: string; readonly work: CliBuildStatusView["work"]; readonly outcome?: string; readonly attention?: AttentionView }[]; readonly omittedBuilds?: number; readonly activeRequests: number; readonly lanes?: readonly { readonly pool: string; readonly lane: string; readonly inFlight: number }[] }
  | { readonly format: "hypit.cli-result-discard@2"; readonly build: string; readonly discarded: boolean }
  | { readonly format: "hypit.cli-result-finish@2"; readonly build: string; readonly found?: false; readonly outcome?: string; readonly attention?: AttentionView }
  | { readonly format: "hypit.cli-cancel@3"; readonly requested: boolean; readonly build: CliBuildStatusView | null }
  | { readonly format: "hypit.cli-build@3"; readonly build: CliBuildStatusView };
