import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineEndpoint } from "@hypit/endpoint";
import {
  createExecutionEnvironmentEndpointAdapterFacet,
  ExecutionEnvironmentAdapterRegistry,
} from "@hypit/execution-environment-local/extension";
import {
  prepareManagedPrograms,
  reportManagedPrograms,
  takeManagedProgramsDown,
} from "@hypit/execution-environment-local/programs";

test("Environment Program preparation installs selected resources without inventing a service process", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-program-"));
  const profile = join(root, "hypit.environment.json");
  const dataRoot = join(root, "state");
  const marker = join(root, "tool.ready");
  await writeFile(profile, JSON.stringify({
    format: "hypit.execution-environment-local@1",
    dataRoot,
    credentials: {},
    endpoints: { tool: { use: "example.tool" } },
  }));
  const registry = new ExecutionEnvironmentAdapterRegistry();
  const capability = { module: { name: "example.tool" }, name: "inspect" } as const;
  const returns = { module: { name: "example.value" }, name: "Status" } as const;
  registry.registerFacet(createExecutionEnvironmentEndpointAdapterFacet({
    use: "example.tool",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.instance,
        capabilities: [{ capability, returns, lifecycle: "immediate", handler: () => null }],
      }),
      program: {
        id: "example-tool",
        installation: {
          probe: async () => access(marker).then(
            () => ({ state: "ready" as const }),
            () => ({ state: "down" as const, detail: "tool is missing" }),
          ),
          commands: [{
            command: process.execPath,
            args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'ready')", marker],
          }],
        },
        probe: async () => access(marker).then(
          () => ({ state: "ready" as const }),
          () => ({ state: "down" as const, detail: "tool is missing" }),
        ),
      },
    }),
  }));
  const options = { packageRoot: root, registry };
  try {
    const prepared = await prepareManagedPrograms(profile, options);
    assert.deepEqual(prepared.programs.map((item) => ({ action: item.action, state: item.state.state })), [
      { action: "installed", state: "ready" },
    ]);
    assert.deepEqual((await reportManagedPrograms(profile, options)).programs.map((item) => item.state.state), ["ready"]);
    assert.deepEqual((await takeManagedProgramsDown(profile, options)).programs.map((item) => item.action), ["nothing-to-stop"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
