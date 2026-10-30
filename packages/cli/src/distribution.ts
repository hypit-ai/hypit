import type { Compiler } from "@hypit/compiler";
import type { LoadedPackage, LogicalPackageAddress, PackageContribution } from "@hypit/loader";
import type { BuildResultHistory, ResultOutputExporter } from "@hypit/result";
import type { TypeRef } from "@hypit/protocol";
import type { Workspace } from "@hypit/workspace";
import type { CliDiagnostic, CliResultRepositoryLocation, CliRuntimeHost } from "./runtime-port.js";

export type CliCompilerOptions = {
  /** Canonical containment boundary for Author Sources plus source assets. */
  readonly workspaceRoot?: string;
  /** Additional Host-authorized asset roots. These never widen Source imports. */
  readonly assetRoots?: readonly string[];
  /** Project-owned package resolution boundary for package Source imports. */
  readonly packageRoot?: string;
  /** Read-only application Distribution containing protected Host packages and extension fallbacks. */
  readonly distributionPackageRoot?: string;
  readonly packageContributions: readonly PackageContribution[];
};

/**
 * Explicit application assembly for the generic command engine.
 *
 * A Distribution selects author vocabulary/compiler semantics and trusted Runtime-config adapters.
 * It is Host configuration, never Core state or source-import authority.
 */
export type CliDistribution = {
  /** Packages shipped with this CLI distribution. */
  readonly packageRoot?: string;
  /** Explicit Host bootstrap packages; never inferred from Source contents. */
  readonly bootstrapPackages: readonly LoadedPackage[];
  /** Resolve the execution environment explicitly selected for this project, if the Distribution supports one. */
  resolveProjectRuntime?(projectRoot: string): Promise<{ readonly profile: string } | undefined>;
  /** Open the definition environment selected by this product Distribution. */
  createWorkspace(options: Pick<CliCompilerOptions,
    "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">): Workspace;
  createCompiler(options: CliCompilerOptions): Compiler;
  /**
   * Read the selected Source and its explicit closure, then return only the installed
   * package roots those sources select.
   *
   * This is Distribution syntax work. The generic CLI never scans a directory,
   * guesses an entry filename or teaches Core about package names.
   */
  discoverSourcePackages?(path: string, options?: {
    readonly workspaceRoot?: string;
    readonly packageRoot?: string;
    readonly distributionPackageRoot?: string;
    /** Exact packages already trusted for the current fixed-point discovery pass. */
    readonly packages?: readonly LoadedPackage[];
  }): Promise<{
    readonly selected: readonly string[];
    readonly logical?: readonly LogicalPackageAddress[];
  }>;
  /** Open the Runtime Profile with this application's Runtime implementation. */
  openRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<CliRuntimeHost>;
  /** Open project-owned Result history even when no Runtime Profile is selected. */
  openProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location: CliResultRepositoryLocation;
    readonly repository: BuildResultHistory;
    close(): void | Promise<void>;
  }>;
  /** Resolve the package-owned author export for one retained structured Type. */
  resolveResultOutputExporter?(type: TypeRef, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<ResultOutputExporter | undefined>;
  /** Actively diagnose this project's Result storage without reading its history. */
  diagnoseProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location?: CliResultRepositoryLocation;
    readonly diagnostics: readonly CliDiagnostic[];
  }>;
};
