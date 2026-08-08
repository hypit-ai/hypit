import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileArtifactStore } from "@narratage/artifact-store-fs";
import { MemoryArtifactStore } from "@narratage/driver-node";
import type { RecoverableEndpoint } from "@narratage/endpoint-kit";
import type {
  ComponentPackage,
  EndpointPackage,
} from "@narratage/local";
import { createLocalRuntime, createProjectLocalRuntime } from "@narratage/local";
import { digestOf } from "@narratage/core";
import {
  createNodePackageLock,
  writeNodePackageLock,
} from "@narratage/package-loader-node";
import { LocalBuildScheduler, MemoryBuildStore, defineRuntimeServicePackage } from "@narratage/runtime";
import type { RuntimeModuleManifest } from "@narratage/runtime";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-endpoint", version: "1" } as const;
const providerFacet = { module: providerModule, name: "generation" } as const;
const providerDigest = digestOf("example.local-endpoint/generation@1");
const providerManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@1",
  name: providerModule.name,
  version: providerModule.version,
  facets: [{
    name: providerFacet.name,
    role: "capability-endpoint",
    implementation: { locator: "example.local-endpoint/generation", digest: providerDigest },
    permissions: [],
    fulfills: [{ capability: capabilities.generation, returns: types.generated }],
    lifecycle: "recoverable",
    defaultConcurrency: 1,
  }],
};

test("Artifact GC is explicit, dry-run by default, and only removes unreachable managed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-artifact-gc-"));
  try {
    const artifacts = new FileArtifactStore(join(directory, "artifacts"));
    const orphan = await artifacts.put(new TextEncoder().encode("orphan"), "application/octet-stream");
    const runtime = await createLocalRuntime({
      buildStore: new MemoryBuildStore(),
      artifactStore: artifacts,
    });
    const preview = await runtime.garbageCollectArtifacts();
    assert.deepEqual(preview.unreachable, [orphan.digest]);
    assert.deepEqual(preview.deleted, []);
    assert.equal(await artifacts.has(orphan.digest), true);
    const applied = await runtime.garbageCollectArtifacts({ apply: true });
    assert.deepEqual(applied.deleted, [orphan.digest]);
    assert.equal(await artifacts.has(orphan.digest), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime resumes durable work while component and endpoint packages stay replaceable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-"));
  const initial = createGreetingBuild();
  const catalog = {
    format: "svml.build-catalog-descriptor@1" as const,
    core: initial.id,
    source: { path: join(directory, "main.svml"), closure: digestOf("source:greeting") },
    aliases: [{
      name: "final.document",
      type: initial.plan.goals[0]!.type,
      ref: { kind: "logical-output" as const, id: initial.request.targets[0]!.output },
    }],
  };
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let starts = 0;
  let resumes = 0;
  let cancels = 0;
  const components: ComponentPackage = {
    name: "example.components",
    producers: [
      {
        producer: producers.makePrompt,
        implementationDigest: implementationDigests.makePrompt,
        handler: ({ inputs }) => {
        promptCalls += 1;
        const intent = inputs.intent;
        assert.equal(intent?.value.kind, "inline");
        const name = (intent.value.value as { readonly name: string }).name;
        return { outputs: { prompt: { kind: "inline", value: `Greet ${name}` } }, needs: {} };
        },
      },
      {
        producer: producers.requestText,
        implementationDigest: implementationDigests.requestText,
        handler: ({ inputs }) => {
        requestCalls += 1;
        assert.equal(inputs.prompt?.value.kind, "inline");
        return { outputs: {}, needs: { generation: { prompt: inputs.prompt.value.value } } };
        },
      },
      {
        producer: producers.assemble,
        implementationDigest: implementationDigests.assemble,
        handler: ({ inputs }) => {
        assembleCalls += 1;
        assert.equal(inputs.generated?.value.kind, "inline");
        return {
          outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } },
          needs: {},
        };
        },
      },
    ],
  };
  const recoverableEndpoint: RecoverableEndpoint = {
    start({ operation }) {
      starts += 1;
      return { status: "pending", checkpoint: { remoteJob: operation.submissionKey } };
    },
    resume({ checkpoint }) {
      resumes += 1;
      assert.ok(checkpoint);
      return {
        status: "completed",
        result: {
          value: { kind: "inline", value: "Hello from durable local Runtime" },
          conformance: "exact",
          delivery: "executed",
          metadata: { checkpoint },
        },
      };
    },
    cancel() {
      cancels += 1;
    },
  };
  const endpointPackage: EndpointPackage = {
    name: "example.endpoint.personal",
    manifest: providerManifest,
    instance: { id: "generation.personal", facet: providerFacet },
    bindings: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.personal",
    }],
    install(registry) {
      registry.registerRecoverableEndpoint(
        "generation.personal",
        capabilities.generation,
        types.generated,
        recoverableEndpoint,
        {
          runtimeImplementation: {
            facet: providerFacet,
            digest: providerDigest,
            configurationDigest: digestOf({}),
          },
        },
      );
    },
  };

  try {
    const firstRuntime = await createProjectLocalRuntime({
      root: directory,
      components: [components],
      endpoints: [endpointPackage],
    });
    const first = await firstRuntime.build({ id: "greeting-build", state: initial, catalog });
    assert.equal(first.status, "paused");
    assert.equal(starts, 1);
    assert.equal(resumes, 0);
    await firstRuntime.close();

    const secondRuntime = await createProjectLocalRuntime({
      root: directory,
      components: [components],
      endpoints: [endpointPackage],
    });
    const second = await secondRuntime.build({ id: "greeting-build", state: createGreetingBuild(), catalog });
    assert.equal(second.status, "complete");
    assert.equal(starts, 1);
    assert.equal(resumes, 1);
    assert.equal(promptCalls, 1, "persisted Core facts stop deterministic upstream replay");
    assert.equal(requestCalls, 1, "the Need request Producer is also persisted");
    assert.equal(assembleCalls, 1);
    const clientStatus = await secondRuntime.status("greeting-build");
    assert.equal(clientStatus.catalog?.core, initial.id);
    assert.equal(clientStatus.catalog?.aliases[0]?.name, "final.document");
    assert.deepEqual((await secondRuntime.builds()).map((item) => item.build), ["greeting-build"]);

    const followed = await secondRuntime.build(
      { id: "greeting-follow", state: createGreetingBuild() },
      { follow: true, pollIntervalMs: 1, maxWaitMs: 1_000 },
    );
    assert.equal(followed.status, "complete");
    assert.equal(starts, 2);
    assert.equal(resumes, 2);
    const followedStatus = await secondRuntime.status("greeting-follow");
    assert.equal(followedStatus.build?.state.status, "complete");
    assert.equal(followedStatus.operations.length, 1);

    const waiting = await secondRuntime.build({ id: "greeting-cancel", state: createGreetingBuild() });
    assert.equal(waiting.status, "paused");
    const cancelled = await secondRuntime.cancel("greeting-cancel");
    assert.equal(cancelled?.status, "failed");
    assert.equal(cancels, 1);
    await secondRuntime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime activates locked compute facets without deployment source registration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-locked-components-"));
  const packageRoot = join(directory, "node_modules", "example-greeting-components");
  const lockPath = join(directory, "svml.packages.lock");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-greeting-components",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    svml: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const manifest = ${JSON.stringify(greetingManifest)};
    const module = { name: manifest.name, version: manifest.version };
    const producer = (name) => ({ module, name });
    export default {
      format: "svml.node-package@1",
      name: "example-greeting-components",
      modules: [{ manifest }],
      components: [{
        name: "example-greeting-components/compute",
        producers: [
          {
            producer: producer("make-prompt"),
            implementationDigest: ${JSON.stringify(implementationDigests.makePrompt)},
            handler({ inputs }) {
              const intent = inputs.intent.value.value;
              return { outputs: { prompt: { kind: "inline", value: "Greet " + intent.name } }, needs: {} };
            },
          },
          {
            producer: producer("placeholder-text"),
            implementationDigest: ${JSON.stringify(implementationDigests.placeholderText)},
            handler() {
              return { outputs: { generated: { kind: "inline", value: "Preview greeting" } }, needs: {} };
            },
          },
          {
            producer: producer("assemble"),
            implementationDigest: ${JSON.stringify(implementationDigests.assemble)},
            handler({ inputs }) {
              return { outputs: { document: { kind: "inline", value: { text: inputs.generated.value.value } } }, needs: {} };
            },
          },
        ],
      }],
    };
  `, "utf8");

  try {
    const lock = await createNodePackageLock(["example-greeting-components"], directory);
    await writeNodePackageLock(lockPath, lock);
    const runtime = await createProjectLocalRuntime({
      root: directory,
      packageLock: "svml.packages.lock",
    });
    await assert.rejects(
      async () => await runtime.build({
        id: "unlocked-preview",
        state: createGreetingBuild({ generationRealization: "placeholder", goalAccepts: "substitute" }),
      }),
      /does not bind this Host's implementation package closure/u,
    );
    const result = await runtime.build({
      id: "locked-preview",
      state: createGreetingBuild({
        generationRealization: "placeholder",
        goalAccepts: "substitute",
        implementationClosure: lock.digest,
      }),
    });
    assert.equal(result.status, "complete");
    assert.equal(result.state.records.some((record) => record.id === "document:root"), true);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime infers one supplied Scheduler service without knowing its package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-scheduler-service-"));
  let creates = 0;
  const scheduler = defineRuntimeServicePackage({
    module: { name: "example.scheduler", version: "1" },
    services: [{
      role: "scheduler",
      facet: "scheduler",
      instance: "scheduler.example",
      implementation: {
        locator: "example.scheduler/fair",
        digest: digestOf("example.scheduler/fair@1"),
      },
      service: {
        create(executor, options) {
          creates += 1;
          return new LocalBuildScheduler(executor, options);
        },
      },
    }],
  });
  try {
    const runtime = await createProjectLocalRuntime({
      root: directory,
      runtimeServices: [scheduler],
    });
    assert.equal(creates, 1);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("two Scheduler services are refused and neither gains authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-scheduler-selection-"));
  const creates = { one: 0, two: 0 };
  const closes = { one: 0, two: 0 };
  const scheduler = (name: "one" | "two") => defineRuntimeServicePackage({
    name: `example.scheduler.${name}`,
    module: { name: `example.scheduler.${name}`, version: "1" },
    services: [{
      role: "scheduler",
      facet: "scheduler",
      instance: `scheduler.${name}`,
      implementation: {
        locator: `example.scheduler.${name}/fair`,
        digest: digestOf(`example.scheduler.${name}/fair@1`),
      },
      service: {
        create(executor, options) {
          creates[name] += 1;
          return new LocalBuildScheduler(executor, options);
        },
      },
    }],
    close() { closes[name] += 1; },
  });
  try {
    // Two schedulers is a configuration to correct, not a choice to make later.
    await assert.rejects(
      createProjectLocalRuntime({
        root: directory,
        runtimeServices: [scheduler("one"), scheduler("two")],
      }),
      /configures 2 scheduler implementations/u,
    );
    assert.deepEqual(closes, { one: 1, two: 1 });

    const runtime = await createProjectLocalRuntime({
      root: directory,
      runtimeServices: [scheduler("two")],
    });
    assert.deepEqual(creates, { one: 0, two: 1 });
    await runtime.close();
    assert.deepEqual(closes, { one: 1, two: 2 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime accepts a permission-checked replacement ArtifactStore package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-artifacts-"));
  const module = { name: "example.remote-artifacts", version: "1" } as const;
  const artifactStore = new MemoryArtifactStore();
  const artifacts = defineRuntimeServicePackage({
    name: "example.remote-artifacts",
    module,
    services: [{
        facet: "artifact-store",
        instance: "artifacts.remote",
        role: "artifact-store",
        implementation: {
          locator: "example.remote-artifacts",
          digest: digestOf("example.remote-artifacts@1"),
        },
        permissions: ["network:remote-artifacts"],
        configuration: { bucket: "fixture" },
        service: artifactStore,
    }],
  });
  try {
    await assert.rejects(
      createProjectLocalRuntime({ root: directory, runtimeServices: [artifacts] }),
      /disallowed Runtime permission network:remote-artifacts/u,
    );
    const runtime = await createProjectLocalRuntime({
      root: directory,
      runtimeServices: [artifacts],
      allowedPermissions: ["network:remote-artifacts"],
    });
    const bytes = new Uint8Array([7, 8, 9]);
    const sourceArtifact = {
      kind: "blob" as const,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
      size: bytes.byteLength,
      mediaType: "application/octet-stream",
    };
    assert.equal(await artifactStore.has(sourceArtifact.digest), false);
    await assert.rejects(
      runtime.build({
        id: "source-artifact-staging",
        state: createGreetingBuild(),
        attachments: [{ artifact: sourceArtifact, bytes }],
      }),
      /does not bind demanded capability/u,
    );
    assert.deepEqual(await artifactStore.get(sourceArtifact.digest), bytes);
    await assert.rejects(
      runtime.build({
        id: "tampered-source-artifact",
        state: createGreetingBuild(),
        attachments: [{ artifact: sourceArtifact, bytes: new Uint8Array([0]) }],
      }),
      /does not match its staged bytes/u,
    );
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
