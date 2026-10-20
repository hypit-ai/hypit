import type { CommandResult } from "@hypit/protocol";

type CommandExecutionIdentity = {
  readonly build: string;
  readonly command: string;
};

export type CommandExecutionActivity = {
  readonly endpoint: string;
  readonly progress: import("./operations.js").OperationProgress;
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

/** Live handoff for an immediate command between invocation and the accepted Kernel fact. */
export type CommandExecutionStore = {
  begin(build: string, command: string): Promise<CommandExecutionBegin>;
  reportProgress(build: string, command: string, activity: CommandExecutionActivity): Promise<void>;
  complete(build: string, command: string, event: CommandResult): Promise<CommandExecutionReceipt>;
  list(build: string): Promise<readonly CommandExecutionReceipt[]>;
  removeBuild(build: string): Promise<void>;
};
