import type { NodeCompiler } from "@narratage/compiler-node";
import type { NodePackageBinding, NodePackageContribution } from "@narratage/package-loader-node";
import type { LoadedNodePackageSet } from "@narratage/package-loader-node";
import type { CapabilityRef } from "@narratage/protocol";
import type {
  CliCredentialControl,
  CliExternalServiceProgress,
  CliExternalServiceReport,
  CliRuntime,
  CliRuntimeControl,
  CliRuntimeDoctorResult,
} from "./runtime-port.js";

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
  /**
   * Resolve the deterministic implementation lock named by a declarative
   * Runtime Profile without constructing that Runtime. Trusted executable
   * Runtime modules may decline and require an explicit CLI package lock.
   */
  resolveCompilationPackages?(path: string): Promise<{
    /** Stable project Source boundary selected by this Runtime Profile. */
    readonly root?: string;
    readonly packageLock?: string;
    readonly runtimePackageLock?: string;
    readonly packageRoot?: string;
    /** ABI-qualified Runtime adapters selected by the Profile. */
    readonly runtimeSelection?: import("@narratage/package-loader-node").NodePackageSelectionRequest;
  }>;
  /** Opaque revision of the Profile and every deployment input that requires a fresh Worker. */
  runtimeProfileRevision(path: string): Promise<string>;
  createRuntimeFromConfig(path: string, options?: {
    /** Same-process package set already verified for compilation. */
    readonly implementationPackages?: LoadedNodePackageSet;
  }): Promise<CliRuntime>;
  /** Open only durable Stores for observation, cancellation, egress and maintenance. */
  createRuntimeControlFromConfig(path: string, options?: { readonly readOnly?: boolean }): Promise<CliRuntimeControl>;
  /** Open only the selected Endpoint declaration and configured CredentialStores. */
  createRuntimeCredentialsFromConfig(path: string, endpoint: string): Promise<CliCredentialControl>;
  /** Re-enter this exact Distribution as the hidden durable Worker process. */
  runtimeWorkerLaunch(): { readonly command: string; readonly args: readonly string[] };
  doctorRuntimeConfig(path: string, options?: {
    readonly capabilities?: readonly CapabilityRef[];
    readonly implementationPackages?: LoadedNodePackageSet;
  }): Promise<CliRuntimeDoctorResult>;
  /** The external programs a Runtime Profile implies: probe, prepare and start them. */
  readonly externalServices: {
    up(path: string, options: {
      readonly maxWaitMs?: number;
      readonly onProgress?: (event: CliExternalServiceProgress) => void;
      readonly capabilities?: readonly CapabilityRef[];
    }): Promise<ExternalServiceResult>;
    down(path: string): Promise<ExternalServiceResult>;
    report(path: string): Promise<ExternalServiceResult>;
  };
};

export type ExternalServiceResult = {
  readonly root: string;
  readonly services: readonly CliExternalServiceReport[];
};
