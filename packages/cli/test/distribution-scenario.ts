import type { CliDistribution } from "../src/distribution.js";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI scenario`);
}

/**
 * Complete application port for CLI owner tests.
 *
 * A scenario overrides only the ports it expects to reach. Every other port
 * fails at the boundary, so a command cannot silently acquire a broader Host.
 */
type CliDistributionScenario = Partial<Record<keyof CliDistribution, unknown>>;

export function cliDistribution(overrides: CliDistributionScenario = {}): CliDistribution {
  const defaults: CliDistribution = {
    bootstrapPackages: [],
    createWorkspace() { return unopened("workspace"); },
    createCompiler() { return unopened("compiler"); },
    async openRuntimeHost() { return unopened("runtime"); },
    async openProjectResults() { return unopened("project results"); },
    async diagnoseProjectResults() { return unopened("project result diagnosis"); },
  };
  return { ...defaults, ...overrides } as CliDistribution;
}
