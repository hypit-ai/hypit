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

import { MemoryArtifactStore } from "@svml/driver-node";
import type { ProviderEndpoint } from "@svml/driver-node";
import type {
  NodeArtifactStorePackage,
  NodeComponentPackage,
  NodeProviderPackage,
} from "@svml/local";
import { createProjectLocalRuntime } from "@svml/local";
import { digestOf } from "@svml/core";
import {
  createNodePackageLock,
  writeNodePackageLock,
} from "@svml/package-loader-node";
import type { RuntimeModuleManifest } from "@svml/runtime";

import {
  capabilities,
  createGreetingBuild,
  implementationDigests,
  manifest as greetingManifest,
  producers,
  types,
} from "../../core/test/greeting-fixture.js";

const providerModule = { name: "example.local-provider", version: "1" } as const;
const providerFacet = { module: providerModule, name: "generation" } as const;
const providerDigest = digestOf("example.local-provider/generation@1");
const providerManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@1",
  name: providerModule.name,
  version: providerModule.version,
  facets: [{
    name: providerFacet.name,
    role: "provider-endpoint",
    implementation: { locator: "example.local-provider/generation", digest: providerDigest },
    permissions: [],
    fulfills: [{ capability: capabilities.generation, returns: types.generated }],
    lifecycle: "recoverable",
    defaultConcurrency: 1,
  }],
};

test("project local runtime resumes durable work while component and provider packages stay replaceable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-"));
  let promptCalls = 0;
  let requestCalls = 0;
  let assembleCalls = 0;
  let starts = 0;
  let resumes = 0;
  let cancels = 0;
  const components: NodeComponentPackage = {
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
  const endpoint: ProviderEndpoint = {
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
  const provider: NodeProviderPackage = {
    name: "example.provider.personal",
    manifest: providerManifest,
    instance: { id: "generation.personal", facet: providerFacet },
    bindings: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "generation.personal",
    }],
    install(registry) {
      registry.registerProviderEndpoint(
        "generation.personal",
        capabilities.generation,
        types.generated,
        endpoint,
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
      providers: [provider],
    });
    const first = await firstRuntime.build({ id: "client-video", state: createGreetingBuild() });
    assert.equal(first.status, "paused");
    assert.equal(starts, 1);
    assert.equal(resumes, 0);
    await firstRuntime.close();

    const secondRuntime = await createProjectLocalRuntime({
      root: directory,
      components: [components],
      providers: [provider],
    });
    const second = await secondRuntime.build({ id: "client-video", state: createGreetingBuild() });
    assert.equal(second.status, "complete");
    assert.equal(starts, 1);
    assert.equal(resumes, 1);
    assert.equal(promptCalls, 1, "persisted Core facts stop deterministic upstream replay");
    assert.equal(requestCalls, 1, "the Need request Producer is also persisted");
    assert.equal(assembleCalls, 1);

    const followed = await secondRuntime.build(
      { id: "follow-video", state: createGreetingBuild() },
      { follow: true, pollIntervalMs: 1, maxWaitMs: 1_000 },
    );
    assert.equal(followed.status, "complete");
    assert.equal(starts, 2);
    assert.equal(resumes, 2);
    const followedStatus = await secondRuntime.status("follow-video");
    assert.equal(followedStatus.build?.state.status, "complete");
    assert.equal(followedStatus.operations.length, 1);

    const waiting = await secondRuntime.build({ id: "cancel-video", state: createGreetingBuild() });
    assert.equal(waiting.status, "paused");
    const cancelled = await secondRuntime.cancel("cancel-video");
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

test("project local runtime accepts a permission-checked replacement ArtifactStore package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-local-artifacts-"));
  const module = { name: "example.remote-artifacts", version: "1" } as const;
  const facet = { module, name: "artifact-store" } as const;
  const artifacts: NodeArtifactStorePackage = {
    name: "example.remote-artifacts",
    manifest: {
      format: "svml.runtime-module@1",
      name: module.name,
      version: module.version,
      facets: [{
        name: facet.name,
        role: "artifact-store",
        implementation: {
          locator: "example.remote-artifacts",
          digest: digestOf("example.remote-artifacts@1"),
        },
        permissions: ["network:remote-artifacts"],
      }],
    },
    instance: {
      id: "artifacts.remote",
      facet,
      configurationDigest: digestOf({ bucket: "fixture" }),
    },
    store: new MemoryArtifactStore(),
  };
  try {
    await assert.rejects(
      createProjectLocalRuntime({ root: directory, artifacts }),
      /disallowed Runtime permission network:remote-artifacts/u,
    );
    const runtime = await createProjectLocalRuntime({
      root: directory,
      artifacts,
      allowedPermissions: ["network:remote-artifacts"],
    });
    const bytes = new Uint8Array([7, 8, 9]);
    const sourceArtifact = {
      kind: "blob" as const,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
      size: bytes.byteLength,
      mediaType: "application/octet-stream",
    };
    assert.equal(await artifacts.store.has(sourceArtifact.digest), false);
    await assert.rejects(
      runtime.build({
        id: "source-artifact-staging",
        state: createGreetingBuild(),
        sourceArtifacts: [{ artifact: sourceArtifact, bytes }],
      }),
      /does not bind demanded capability/u,
    );
    assert.deepEqual(await artifacts.store.get(sourceArtifact.digest), bytes);
    await assert.rejects(
      runtime.build({
        id: "tampered-source-artifact",
        state: createGreetingBuild(),
        sourceArtifacts: [{ artifact: sourceArtifact, bytes: new Uint8Array([0]) }],
      }),
      /does not match its staged bytes/u,
    );
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
