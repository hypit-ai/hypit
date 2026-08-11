import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeEndpointAdapterFacet,
  createRuntimeServiceAdapterFacet,
} from "@narratage/runtime-adapter";
import { digestOf } from "@narratage/protocol";
import { credentialRef, defineRuntimeServicePackage } from "@narratage/runtime";

import {
  createRuntimeFromConfig,
  doctorRuntimeConfig,
  parseRuntimeConfig,
  RuntimeAdapterRegistry,
} from "@narratage/local";

const services = {
  scheduler: "execution.scheduler",
  worker: "execution.worker",
  stores: {
    build: "state.builds",
    operations: "state.operations",
    dispatch: "state.dispatch",
    journal: "state.journal",
    artifacts: "artifacts",
    credentials: ["credentials"],
  },
};

const required = { runtimeServices: [], services, scheduling: { maxConcurrency: 3 } } as const;

function endpointPackage(instance: string, credentials: readonly unknown[] = []) {
  return {
    name: instance,
    manifest: { facets: [] },
    instance: { id: instance },
    bindings: [],
    credentials,
    install() {},
  } as never;
}

test("declarative Runtime config has no implicit local services", () => {
  assert.throws(() => parseRuntimeConfig({
    format: "svml.runtime-config@1",
    endpoints: [],
    permissions: [],
  }), /runtimeServices/u);
});

test("an explicit empty Runtime service set fails instead of manufacturing local defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-empty-services-"));
  const path = join(root, "svml.runtime.json");
  try {
    await writeFile(path, JSON.stringify({
      format: "svml.runtime-config@1",
      ...required,
      endpoints: [],
      permissions: [],
    }));
    await assert.rejects(
      async () => await createRuntimeFromConfig(path, { registry: new RuntimeAdapterRegistry() }),
      /unknown instance execution\.scheduler/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime config is closed data and rejects unknown environment authority", () => {
  const parsed = parseRuntimeConfig({
    format: "svml.runtime-config@1",
    ...required,
    packageRoot: "/opt/narratage",
    endpoints: [],
    permissions: [],
  });
  assert.equal(parsed.packageRoot, "/opt/narratage");
  assert.throws(() => parseRuntimeConfig({
    format: "svml.runtime-config@1",
    ...required,
    endpoints: [],
    permissions: [],
    apiKey: "must-not-live-here",
  }), /does not accept apiKey/u);
});

test("declarative adapters are explicit and never guessed", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-adapter-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    ...required,
    endpoints: [{ use: "example.missing", instance: "missing", config: {} }],
    permissions: [],
  }));
  await assert.rejects(
    async () => await createRuntimeFromConfig(path, { registry: new RuntimeAdapterRegistry() }),
    /adapter example\.missing is not registered/u,
  );
});

test("runtimeServices names the Runtime's own replaceable parts, apart from external services", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-config-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    ...required,
    runtimeServices: [{ use: "@example/store", instance: "artifacts.example" }],
    endpoints: [],
    permissions: [],
  }));
  const document = parseRuntimeConfig(JSON.parse(await readFile(path, "utf8")));
  assert.deepEqual(document.runtimeServices, [{ use: "@example/store", instance: "artifacts.example" }]);

  assert.deepEqual(document.services, services);
  await rm(root, { recursive: true, force: true });
});

test("doctor names the external program a Provider needs, and the command that supplies it", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-external-service-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    ...required,
    endpoints: [
      { use: "example.absent", instance: "absent", config: {} },
      { use: "example.wrong", instance: "wrong", config: {} },
      { use: "example.exploding", instance: "exploding", config: {} },
    ],
    permissions: [],
  }));

  const registry = new RuntimeAdapterRegistry();
  const declare = (use: string, service: unknown) =>
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      activate: (context) => ({ endpoint: endpointPackage(context.instance), externalService: service as never }),
    }));
  declare("example.absent", {
    id: "absent-one",
    start: { command: "uv", args: ["run", "serve"] },
    probe: async () => ({ state: "down", detail: "nothing is answering at http://127.0.0.1:1" }),
  });
  declare("example.wrong", {
    id: "wrong-one",
    probe: async () => ({ state: "mismatch", detail: "model is large-v3, expected small" }),
  });
  declare("example.exploding", {
    id: "exploding-one",
    probe: async () => { throw new Error("the probe itself is broken"); },
  });

  const { diagnostics } = await doctorRuntimeConfig(path, { registry });
  const seen = diagnostics.map((item) => `${item.code}: ${item.message}`);

  assert.deepEqual(seen, [
    "EXTERNAL_SERVICE_DOWN: absent-one is not usable: nothing is answering at http://127.0.0.1:1."
      + " Bring it up with: narratage services up",
    // Nothing to prepare and nothing to start: report the difference, name no command.
    "EXTERNAL_SERVICE_MISMATCH: wrong-one is running but differs from this Runtime Profile:"
      + " model is large-v3, expected small",
    // A broken probe is a broken Provider, never a silently healthy service.
    "EXTERNAL_SERVICE_PROBE_FAILED: the probe itself is broken",
  ]);
  await rm(root, { recursive: true, force: true });
});

test("doctor activates one pure Endpoint declaration without constructing Runtime services", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-read-only-doctor-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    ...required,
    runtimeServices: [{ use: "example.store", instance: "store", config: { mode: "valid" } }],
    endpoints: [
      { use: "example.invalid", instance: "invalid", config: { mode: "bad" } },
      { use: "example.missing-credential", instance: "missing-credential", config: {} },
    ],
    permissions: [],
  }));

  let constructed = 0;
  let invalidDoctorCalls = 0;
  let serviceDeclarations = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.store",
    validate(context) {
      assert.deepEqual(context.config, { mode: "valid" });
    },
    create() {
      constructed += 1;
      throw new Error("doctor constructed the Runtime service");
    },
    doctor: () => [{ severity: "info", code: "STORE_OK", message: "store config is valid" }],
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.invalid",
    activate() {
      throw new Error("mode is invalid");
    },
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.missing-credential",
    activate(context) {
      serviceDeclarations += 1;
      return {
        endpoint: endpointPackage(context.instance),
        diagnose: () => {
          invalidDoctorCalls += 1;
          return [{
            severity: "error" as const,
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: "one declared credential is absent",
          }];
        },
        externalService: { id: "should-not-be-probed", probe: async () => ({ state: "ready" as const }) },
      };
    },
  }));

  const { diagnostics } = await doctorRuntimeConfig(path, { registry });
  assert.deepEqual(diagnostics.map(({ severity, code, message, subject }) => ({
    severity, code, message, ...(subject === undefined ? {} : { subject }),
  })), [
    { severity: "info", code: "STORE_OK", message: "store config is valid" },
    { severity: "error", code: "RUNTIME_ENDPOINT_CONFIG_INVALID", message: "mode is invalid", subject: "invalid" },
    { severity: "error", code: "RUNTIME_CREDENTIAL_MISSING", message: "one declared credential is absent" },
  ]);
  assert.equal(constructed, 0);
  assert.equal(invalidDoctorCalls, 1);
  assert.equal(serviceDeclarations, 1);
  await rm(root, { recursive: true, force: true });
});

test("doctor resolves credentials from the same Endpoint declaration used by execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-credential-doctor-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    ...required,
    runtimeServices: [{ use: "example.credentials", instance: "credentials", config: {} }],
    endpoints: [{ use: "example.provider", instance: "provider", config: {} }],
    permissions: [],
  }));

  let endpointActivations = 0;
  let credentialStoreConstructions = 0;
  let credentialStoreCloses = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.provider",
    activate(context) {
      endpointActivations += 1;
      return { endpoint: endpointPackage(context.instance, [{
        endpoint: context.instance,
        slot: "token",
        label: "Example token",
        kind: "secret",
        ref: credentialRef("env", "EXAMPLE_TOKEN_THAT_IS_NOT_SET"),
      }]) };
    },
  }));
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.credentials",
    validate() {},
    create(context) {
      credentialStoreConstructions += 1;
      return defineRuntimeServicePackage({
        name: context.instance,
        module: { name: "example.credentials", version: "1" },
        services: [{
          role: "credential-store",
          facet: "credentials",
          instance: context.instance,
          implementation: { locator: "example.credentials", digest: digestOf("example.credentials@1") },
          service: { async resolve() { return undefined; } },
        }],
        close() { credentialStoreCloses += 1; },
      });
    },
  }));

  const { diagnostics } = await doctorRuntimeConfig(path, { registry });
  assert.deepEqual(diagnostics.map(({ code, message, subject }) => ({ code, message, subject })), [{
    code: "RUNTIME_CREDENTIAL_MISSING",
    message: "Example token for Endpoint provider is not configured in CredentialStore env",
    subject: "provider.token",
  }]);
  assert.equal(endpointActivations, 1);
  assert.equal(credentialStoreConstructions, 1);
  assert.equal(credentialStoreCloses, 1);
  await rm(root, { recursive: true, force: true });
});
