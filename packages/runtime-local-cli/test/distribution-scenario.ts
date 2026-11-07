import type { CliDistribution } from "@hypit/cli";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI scenario`);
}

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
