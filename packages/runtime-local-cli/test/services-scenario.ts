import type { BuildCliServices } from "@hypit/build-cli";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI scenario`);
}

type BuildCliServicesScenario = Partial<Record<keyof BuildCliServices, unknown>>;

export function buildCliServices(overrides: BuildCliServicesScenario = {}): BuildCliServices {
  const defaults: BuildCliServices = {
    bootstrapPackages: [],
    createWorkspace() { return unopened("workspace"); },
    createCompiler() { return unopened("compiler"); },
    async openRuntimeHost() { return unopened("runtime"); },
    async openProjectResults() { return unopened("project results"); },
    async diagnoseProjectResults() { return unopened("project result diagnosis"); },
  };
  return { ...defaults, ...overrides } as BuildCliServices;
}
