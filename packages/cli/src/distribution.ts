import type { NodeCompiler } from "@hypit/compiler-node";
import type { LoadedPackage, NodePackageContribution } from "@hypit/package-loader-node";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import type { BuildResultRepository } from "@hypit/build-result";
import type { BuildResultRepositoryLocation } from "@hypit/build-result-kit";
import type { BuildResultRepositoryDiagnostic } from "@hypit/build-result-kit";

export type CliCompilerOptions = {
  /** Canonical containment boundary for Author and Run Sources plus source assets. */
  readonly workspaceRoot?: string;
  /** Additional Host-authorized asset roots. These never widen Source imports. */
  readonly assetRoots?: readonly string[];
  readonly packageContributions: readonly NodePackageContribution[];
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
  createCompiler(options: CliCompilerOptions): NodeCompiler;
  /**
   * Read the self-described Run Source and its Author Source closure, then return
   * only the installed package roots those sources explicitly select.
   *
   * This is Distribution syntax work. The generic CLI never scans a directory,
   * guesses an entry filename or teaches Core about package names.
   */
  discoverSourcePackages?(path: string, options?: {
    readonly workspaceRoot?: string;
    /** Exact packages already trusted for the current fixed-point discovery pass. */
    readonly packages?: readonly LoadedPackage[];
  }): Promise<{
    readonly selected: readonly string[];
    readonly logical?: readonly import("@hypit/package-loader-node").LogicalPackageAddress[];
  }>;
  /** Open the Runtime Profile with this application's Runtime implementation. */
  openRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<NodeRuntimeHost>;
  /** Open project-owned Result history even when no Runtime Profile is selected. */
  openProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location: BuildResultRepositoryLocation;
    readonly repository: BuildResultRepository;
    close(): void | Promise<void>;
  }>;
  /** Actively diagnose this project's selected Result Store without reading its history. */
  diagnoseProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location?: BuildResultRepositoryLocation;
    readonly diagnostics: readonly BuildResultRepositoryDiagnostic[];
  }>;
};
