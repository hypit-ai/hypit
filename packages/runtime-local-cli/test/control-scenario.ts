import type { CliRuntimeControl } from "@hypit/build-operations-cli";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI control scenario`);
}

export function runtimeControl(overrides: Partial<CliRuntimeControl>): CliRuntimeControl {
  const defaults: CliRuntimeControl = {
    async inspect() { return unopened("runtime inspect"); },
    async activity() { return unopened("runtime activity"); },
    async cancel() { return unopened("runtime cancel"); },
    close() {},
  };
  return { ...defaults, ...overrides };
}
