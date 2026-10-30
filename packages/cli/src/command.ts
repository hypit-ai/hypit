import type { CliOutputOptions } from "./output.js";

/**
 * Root command names owned by the domain-neutral long-compilation CLI.
 *
 * Application command modules may add other roots, but cannot shadow these.
 * Keeping the names beside the command union makes command ownership explicit
 * without teaching Core or the package loader about CLI presentation.
 */
export const genericCliCommandNames = [
  "version",
  "cli",
  "check",
  "plan",
  "pricing",
  "build",
  "builds",
  "history",
  "inspect",
  "logs",
  "status",
  "activity",
  "cancel",
  "result",
  "auth",
  "doctor",
] as const;

type CommandBase = {
  readonly presentation: CliOutputOptions;
};

export type RuntimeOption = ProjectOption & {
  readonly runtimeProfile: string | undefined;
};

export type ProjectOption = {
  readonly projectRoot?: string;
};

type SourceOptions = ProjectOption & {
  readonly source: string;
  readonly assetRoots: readonly string[];
  readonly packageRoot?: string;
  readonly limit: number;
};

type TargetOptions = {
  readonly targets: readonly string[];
};

export type AuthorCommand =
  | (CommandBase & SourceOptions & { readonly command: "check" })
  | (CommandBase & SourceOptions & TargetOptions & RuntimeOption & { readonly command: "plan" })
  | (CommandBase & Omit<SourceOptions, "limit"> & TargetOptions & RuntimeOption & {
      readonly command: "pricing";
      readonly limit?: number;
    })
  | (CommandBase & SourceOptions & TargetOptions & RuntimeOption & {
      readonly command: "build";
      readonly follow: boolean;
      readonly maxWaitMs?: number;
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
      readonly command: "result";
      readonly action: "export";
      readonly build: string;
      readonly outputName: string;
      readonly destination: string;
    });

export type ExecutionCommand =
  | (CommandBase & RuntimeOption & { readonly command: "logs"; readonly build: string; readonly lines: number })
  | (CommandBase & RuntimeOption & {
      readonly command: "status";
      readonly build: string;
      readonly watch: boolean;
      readonly maxWaitMs?: number;
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
  | AuthCommand
  | (CommandBase & ProjectOption & RuntimeOption & {
      readonly command: "doctor";
      readonly endpoints?: readonly string[];
      readonly limit: number;
    });

export type CliCommand =
  | AuthorCommand
  | ProjectResultCommand
  | ExecutionCommand
  | EnvironmentCommand
  ;
