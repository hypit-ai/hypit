import type { NodeCompiler } from "@hypit/compiler-node";
import type { LoadedPackage, NodePackageContribution } from "@hypit/package-loader-node";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";

export type CliCompilerOptions = {
  /** Canonical containment boundary for Author and Run Sources plus source assets. */
  readonly workspaceRoot?: string;
  /** Additional Host-authorized asset roots. These never widen Source imports. */
  readonly assetRoots?: readonly string[];
  readonly packageContributions: readonly NodePackageContribution[];
};

/**
 * One picture asked for directly, with no Source, Build, Record or Runtime Profile.
 *
 * A component package's own chrome — a paper texture, a board, a panel — is authoring
 * input that ships inside the package, so it is never anybody's Output. Credentials are
 * the only thing this needs.
 */
export type CliPictureRequest = {
  /** Installed package specifier naming the exact model family; the Distribution defaults it. */
  readonly model?: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  /** Project package root; the Distribution remains a separate read-only resolution root. */
  readonly packageRoot: string;
  /** Read-only packages shipped by the active Distribution. */
  readonly distributionPackageRoot?: string;
};

export type CliPicture = {
  /** Installed package specifier that declared the exact model. */
  readonly package: string;
  /** Exact model name, as the model package declares it. */
  readonly model: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
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
  /**
   * Generate one picture for a package asset.
   *
   * Which exact models exist is a model package's declaration and which Provider fulfils
   * them is this Distribution's choice, so both stay here. The generic engine only reads
   * the prompt, writes the file and reports where it went.
   */
  generatePicture?(request: CliPictureRequest): Promise<CliPicture>;
};
