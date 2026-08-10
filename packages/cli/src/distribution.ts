import type { NodeCompiler } from "@narratage/compiler-node";
import type { LocalRuntime } from "@narratage/local";
import type { ExternalServiceReport, RuntimeConfigDoctorResult } from "@narratage/local";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import type { RunFrontend } from "@narratage/run";

export type CliCompilerOptions = {
  /** Canonical containment boundary for Author and Run Sources plus source assets. */
  readonly workspaceRoot?: string;
  readonly packageContributions: readonly NodePackageContribution[];
};

/**
 * Explicit application assembly for the generic command engine.
 *
 * A Distribution selects author vocabulary/compiler semantics and trusted Runtime-config adapters.
 * It is Host configuration, never Core state or source-import authority.
 */
export type CliDistribution = {
  readonly name: string;
  /** Host location from which installed locked packages resolve. A caller may explicitly override it. */
  readonly packageRoot?: string;
  readonly builtInPackageContributions: readonly NodePackageContribution[];
  /** Explicitly trusted Run Frontends; source Headers select among them without suffix defaults. */
  readonly runFrontends: readonly RunFrontend[];
  createCompiler(options: CliCompilerOptions): NodeCompiler;
  createRuntimeFromConfig(path: string): Promise<LocalRuntime>;
  doctorRuntimeConfig(path: string): Promise<RuntimeConfigDoctorResult>;
  /** The external programs a Runtime Profile implies: probe, prepare and start them. */
  readonly externalServices: {
    up(path: string, options: { maxWaitMs?: number }): Promise<ExternalServiceResult>;
    down(path: string): Promise<ExternalServiceResult>;
    report(path: string): Promise<ExternalServiceResult>;
  };
};

export type ExternalServiceResult = {
  readonly root: string;
  readonly services: readonly ExternalServiceReport[];
};
