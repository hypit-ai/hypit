import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineEndpoint } from "@hypit/endpoint";
import { MemoryResourceStore } from "@hypit/resource-store";
import {
  createExecutionEnvironmentEndpointAdapterFacet,
  ExecutionEnvironmentAdapterRegistry,
} from "@hypit/execution-environment-local/extension";
import { LocalExecutionEnvironmentDeployment } from "@hypit/execution-environment-local/deployment";
import { createLocalExecutionEnvironmentHost } from "@hypit/execution-environment-local/host";
import {
  diagnoseEnvironmentExecutable,
  resolveEnvironmentExecutable,
} from "@hypit/execution-environment-local/node";

test("configured executable paths are rooted at the Environment data root", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-host-node-"));
  try {
    const path = join(root, "tools", "fixture");
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(path, "#!/bin/sh\n", "utf8");
    await chmod(path, 0o755);
    assert.equal(resolveEnvironmentExecutable(root, "./tools/fixture"), path);
    assert.deepEqual(await diagnoseEnvironmentExecutable({
      root,
      configured: "./tools/fixture",
      fallback: "unused",
      subject: "fixture",
    }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the Environment Host invokes an immediate capability without a Generation Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-host-"));
  const capability = { module: { name: "example.environment" }, name: "observe" } as const;
  const returns = { module: { name: "example.value" }, name: "Observation" } as const;
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(createExecutionEnvironmentEndpointAdapterFacet({
    use: "example.environment",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        capabilities: [{
          capability,
          returns,
          lifecycle: "immediate",
          handler: ({ request }) => ({ observed: request.constraints }),
        }],
      }),
    }),
  }));
  try {
    const deployment = new LocalExecutionEnvironmentDeployment({
      format: "hypit.execution-environment-local@1",
      dataRoot: ".",
      credentials: [],
      endpoints: [{ use: "example.environment", instance: "example", pool: "example" }],
      bindings: {},
    }, root, { packageRoot: root, registry });
    const host = createLocalExecutionEnvironmentHost(join(root, "hypit.environment.json"), deployment);
    assert.deepEqual(await host.invoke({ capability, returns, constraints: { value: 7 } }, new MemoryResourceStore()), {
      observed: { value: 7 },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
