import type { NodeCompiler } from "@narratage/compiler-node";
import type { NodePackageBinding, NodePackageContribution } from "@narratage/package-loader-node";
import type { NodeRuntimeHost } from "@narratage/runtime-adapter-node";

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
  /** Host location from which installed locked packages resolve. A caller may explicitly override it. */
  readonly packageRoot?: string;
  /** Explicit Host bootstrap packages; never inferred from Source contents. */
  readonly bootstrapPackages: readonly NodePackageBinding[];
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
    readonly packages?: readonly NodePackageBinding[];
  }): Promise<{
    readonly selected: readonly string[];
    readonly logical?: readonly import("@narratage/package-loader-node").LogicalPackageAddress[];
  }>;
  /** Load the Runtime Host selected by the Profile's locked `runtime.use` package. */
  openRuntimeHost(path: string): Promise<NodeRuntimeHost>;
};
