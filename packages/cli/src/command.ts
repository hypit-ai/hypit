import type { CliOutputOptions } from "./output.js";

type CommandBase = {
  readonly presentation: CliOutputOptions;
};

export type RuntimeOption = {
  readonly runtimeProfile: string | undefined;
};

export type ProjectOption = {
  readonly workspaceRoot?: string;
};

type SourceOptions = ProjectOption & {
  readonly source: string;
  readonly assetRoots: readonly string[];
  readonly packageRoot?: string;
  readonly limit: number;
};

export type AuthorCommand =
  | (CommandBase & SourceOptions & { readonly command: "check" })
  | (CommandBase & SourceOptions & RuntimeOption & { readonly command: "plan" })
  | (CommandBase & SourceOptions & RuntimeOption & {
      readonly command: "build";
      readonly follow: boolean;
      readonly maxWaitMs?: number;
      readonly title?: string;
    });

export type ProjectResultCommand =
  | (CommandBase & ProjectOption & {
      readonly command: "builds";
      readonly limit: number;
      readonly before?: string;
    })
  | (CommandBase & ProjectOption & {
      readonly command: "history";
      readonly outputName: string;
      readonly source?: string;
      readonly limit: number;
      readonly before?: string;
    })
  | (CommandBase & ProjectOption & {
      readonly command: "inspect";
      readonly build: string;
      readonly outputName?: string;
      readonly limit: number;
    })
  | (CommandBase & ProjectOption & {
      readonly command: "get";
      readonly build: string;
      readonly outputName: string;
      readonly destination: string;
    })
  | (CommandBase & ProjectOption & {
      readonly command: "result";
      readonly action: "edit";
      readonly build: string;
      readonly title?: string;
      readonly note?: string;
      readonly highlightedOutputs: readonly string[];
      readonly clearTitle: boolean;
      readonly clearNote: boolean;
      readonly clearHighlights: boolean;
      readonly limit: number;
    });

export type ExecutionCommand =
  | (CommandBase & RuntimeOption & {
      readonly command: "status";
      readonly build: string;
      readonly watch: boolean;
      readonly maxWaitMs?: number;
      readonly limit: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "activity";
      readonly watch: boolean;
      readonly limit: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "cancel";
      readonly build: string;
      readonly reason?: string;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "result";
      readonly action: "finish" | "discard";
      readonly build: string;
    });

export type RuntimeSelectionCommand =
  | (CommandBase & ProjectOption & {
      readonly command: "runtime";
      readonly action: "use";
      readonly profile: string;
    })
  | (CommandBase & ProjectOption & {
      readonly command: "runtime";
      readonly action: "unset";
    });

export type RuntimeOperationCommand =
  | (CommandBase & RuntimeOption & {
      readonly command: "runtime";
      readonly action: "up";
      readonly maxWaitMs?: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "runtime";
      readonly action: "down";
      readonly maxWaitMs?: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "runtime";
      readonly action: "status";
      readonly limit: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "runtime";
      readonly action: "logs";
      readonly lines: number;
    });

export type ProgramsCommand =
  | (CommandBase & RuntimeOption & {
      readonly command: "programs";
      readonly action: "up";
      readonly maxWaitMs?: number;
      readonly limit: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "programs";
      readonly action: "down" | "status";
      readonly limit: number;
    });

export type AuthCommand =
  | (CommandBase & RuntimeOption & {
      readonly command: "auth";
      readonly action: "status";
      readonly endpoint: string;
      readonly slot?: string;
      readonly limit: number;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "auth";
      readonly action: "login";
      readonly endpoint: string;
      readonly slot?: string;
      readonly credentialFile?: string;
    })
  | (CommandBase & RuntimeOption & {
      readonly command: "auth";
      readonly action: "logout";
      readonly endpoint: string;
      readonly slot?: string;
    });

export type EnvironmentCommand =
  | RuntimeOperationCommand
  | ProgramsCommand
  | AuthCommand
  | (CommandBase & RuntimeOption & {
      readonly command: "paths";
    })
  | (CommandBase & {
      readonly command: "packages";
      readonly action: "install" | "status";
      readonly package: string;
    })
  | (CommandBase & ProjectOption & RuntimeOption & {
      readonly command: "doctor";
      readonly limit: number;
    });

export type WorkerCommand = CommandBase & {
  readonly command: "_worker";
  readonly profile: string;
  readonly readyFile: string;
  readonly workerOwner: string;
  readonly packageRoot?: string;
};

export type CliCommand =
  | AuthorCommand
  | ProjectResultCommand
  | ExecutionCommand
  | RuntimeSelectionCommand
  | EnvironmentCommand
  | WorkerCommand;
