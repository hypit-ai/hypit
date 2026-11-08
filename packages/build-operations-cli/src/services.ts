import type { ProductExporter, ProductHistory } from "@hypit/product";
import type { BuildResultHistory } from "@hypit/result";
import type { TypeRef } from "@hypit/protocol";
import type { CliDiagnostic, CliPublicationStoreLocation, CliRuntimeHost } from "./runtime-port.js";

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
