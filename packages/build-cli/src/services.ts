import type { Compiler } from "@hypit/generation-authoring/compiler";
import type { LoadedPackage, LogicalPackageAddress, PackageContribution } from "@hypit/loader";
import type { Workspace } from "@hypit/generation-authoring/workspace";
import type { BuildCliContextServices, BuildOperationsCliServices } from "@hypit/build-operations-cli";

export type BuildCliCompilerOptions = {
  readonly workspaceRoot?: string;
  readonly assetRoots?: readonly string[];
  readonly packageRoot?: string;
  readonly distributionPackageRoot?: string;
  readonly packageContributions: readonly PackageContribution[];
};

/** Services used only to compile and submit one Author Source. */
export type SourceBuildCliServices = BuildCliContextServices & {
  readonly bootstrapPackages: readonly LoadedPackage[];
  createWorkspace(options: Pick<BuildCliCompilerOptions,
    "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">): Workspace;
  createCompiler(options: BuildCliCompilerOptions): Compiler;
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

/** Test/application composition that provides both independently owned command ports. */
export type BuildCliServices = SourceBuildCliServices & BuildOperationsCliServices;
