function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI scenario`);
}

export type LocalRuntimeCliScenario = {
  readonly packageRoot?: string;
  openRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<unknown>;
};

export function buildCliServices(
  overrides: Partial<LocalRuntimeCliScenario> = {},
): LocalRuntimeCliScenario {
  const defaults: LocalRuntimeCliScenario = {
    async openRuntimeHost() { return unopened("runtime"); },
  };
  return { ...defaults, ...overrides };
}
