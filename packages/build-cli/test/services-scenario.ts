import type { BuildCliServices } from "../src/services.js";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI scenario`);
}

/**
 * Complete application port for CLI owner tests.
 *
 * A scenario overrides only the ports it expects to reach. Every other port
 * fails at the boundary, so a command cannot silently acquire a broader Host.
 */
type BuildCliServicesScenario = Partial<Record<keyof BuildCliServices, unknown>>;

export function buildCliServices(overrides: BuildCliServicesScenario = {}): BuildCliServices {
  const defaults: BuildCliServices = {
    bootstrapPackages: [],
    createWorkspace() { return unopened("workspace"); },
    createCompiler() { return unopened("compiler"); },
    async openRuntimeHost() { return unopened("runtime"); },
    async openEnvironmentHost() { return unopened("environment"); },
    async openProjectResults() { return unopened("project results"); },
    async diagnoseProjectResults() { return unopened("project result diagnosis"); },
  };
  return { ...defaults, ...overrides } as BuildCliServices;
}
