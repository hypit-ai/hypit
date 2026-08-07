import type { NodeCompiler } from "@svml/compiler-node";
import type { LocalRuntime } from "@svml/local";
import type { NodePackageContribution } from "@svml/package-loader-node";

export type CliCompilerOptions = {
  readonly root?: string;
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
  readonly builtInPackageContributions: readonly NodePackageContribution[];
  createCompiler(options: CliCompilerOptions): NodeCompiler;
  createRuntimeFromConfig(path: string): Promise<LocalRuntime>;
};
