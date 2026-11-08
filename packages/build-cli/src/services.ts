import type { Compiler } from "@hypit/compiler";
import type { LoadedPackage, LogicalPackageAddress, PackageContribution } from "@hypit/loader";
import type { ProductExporter, ProductHistory } from "@hypit/product";
import type { BuildResultHistory } from "@hypit/result";
import type { TypeRef } from "@hypit/protocol";
import type { Workspace } from "@hypit/workspace";
import type { CliDiagnostic, CliPublicationStoreLocation, CliRuntimeHost } from "./runtime-port.js";

export type BuildCliCompilerOptions = {
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

/** Project and Runtime access genuinely shared by authoring and accepted-Build operations. */
export type BuildCliContextServices = {
  /** Packages shipped with this CLI distribution. */
  readonly packageRoot?: string;
  /** Resolve the execution environment explicitly selected for this project, when supported. */
  resolveProjectRuntime?(projectRoot: string): Promise<{ readonly profile: string } | undefined>;
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
    readonly location: CliPublicationStoreLocation;
    readonly history: BuildResultHistory;
    readonly products: ProductHistory;
    close(): void | Promise<void>;
  }>;
};

/** Services used only to compile and submit one Author Source. */
export type SourceBuildCliServices = BuildCliContextServices & {
  /** Explicit Host bootstrap packages; never inferred from Source contents. */
  readonly bootstrapPackages: readonly LoadedPackage[];
  /** Open the definition environment selected by this application. */
  createWorkspace(options: Pick<BuildCliCompilerOptions,
    "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">): Workspace;
  createCompiler(options: BuildCliCompilerOptions): Compiler;
  /** Read the selected Source closure and return only its explicitly selected packages. */
  discoverSourcePackages?(path: string, options?: {
    readonly workspaceRoot?: string;
    readonly packageRoot?: string;
    readonly distributionPackageRoot?: string;
    readonly packages?: readonly LoadedPackage[];
  }): Promise<{
    readonly selected: readonly string[];
    readonly logical?: readonly LogicalPackageAddress[];
  }>;
};

/** Services used to inspect accepted Builds, Results and Runtime environment state. */
export type BuildOperationsCliServices = BuildCliContextServices & {
  /** Resolve the package-owned author export for one published structured Type. */
  resolveProductExporter?(type: TypeRef, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<ProductExporter | undefined>;
  /** Actively diagnose this project's Result storage without reading its history. */
  diagnoseProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location?: CliPublicationStoreLocation;
    readonly diagnostics: readonly CliDiagnostic[];
  }>;
};

/** Full official application assembly; command modules consume only their own slice. */
export type BuildCliServices = SourceBuildCliServices & BuildOperationsCliServices;
