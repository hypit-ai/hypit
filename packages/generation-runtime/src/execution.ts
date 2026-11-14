import type { CommandResult } from "@hypit/generation-build";

type CommandExecutionIdentity = {
  readonly build: string;
  readonly command: string;
};

export type CommandExecutionActivity = {
  readonly endpoint: string;
  readonly progress: import("@hypit/execution-environment").OperationProgress;
};

export type CommandExecutionReceipt = CommandExecutionIdentity & (
  | {
      readonly status: "started";
  /** Current Provider-reported activity; discarded when this call completes. */
      readonly activity?: CommandExecutionActivity;
    }
  | { readonly status: "completed"; readonly event: CommandResult; readonly activity?: never }
);

export type CommandExecutionBegin = {
  readonly created: boolean;
  readonly receipt: CommandExecutionReceipt;
};

/** Live handoff between command execution and the accepted Generation Build fact. */
export type CommandExecutionStore = {
  begin(build: string, command: string): Promise<CommandExecutionBegin>;
  reportProgress(build: string, command: string, activity: CommandExecutionActivity): Promise<void>;
  complete(build: string, command: string, event: CommandResult): Promise<CommandExecutionReceipt>;
  list(build: string): Promise<readonly CommandExecutionReceipt[]>;
  removeBuild(build: string): Promise<void>;
};
