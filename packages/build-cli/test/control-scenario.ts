import type { CliCredentialControl, CliRuntimeControl } from "../src/runtime-port.js";

function unopened(name: string): never {
  throw new Error(`${name} must not open in this CLI control scenario`);
}

type RuntimeControlScenario = Partial<CliRuntimeControl>;

export function runtimeControl(overrides: RuntimeControlScenario): CliRuntimeControl {
  const defaults: CliRuntimeControl = {
    async inspect() { return unopened("runtime inspect"); },
    async activity() { return unopened("runtime activity"); },
    async cancel() { return unopened("runtime cancel"); },
    close() {},
  };
  return { ...defaults, ...overrides };
}

type CredentialControlScenario = Partial<CliCredentialControl>;

export function credentialControl(overrides: CredentialControlScenario): CliCredentialControl {
  const defaults: CliCredentialControl = {
    async describeCredentials() { return unopened("credential description"); },
    async credentials() { return unopened("credential status"); },
    async putCredential() { return unopened("credential write"); },
    async deleteCredential() { return unopened("credential deletion"); },
    close() {},
  };
  return { ...defaults, ...overrides };
}
