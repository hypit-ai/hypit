import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createNodePackageLock,
  installNodePackageComponents,
  loadNodePackageSet,
  loadNodePackageContributions,
  writeNodePackageLock,
} from "@narratage/package-loader-node";
import { RuntimeAdapterRegistry } from "@narratage/runtime-adapter";
import { TypeValidatorRegistry } from "@narratage/validation";
import { digestOf } from "@narratage/protocol";
import type { ProducerRef } from "@narratage/protocol";

const implementationDigest = `sha256:${"1".repeat(64)}`;
const producerDigest = `sha256:${"3".repeat(64)}`;

async function fixture(): Promise<{
  readonly root: string;
  readonly activation: string;
  readonly dependency: string;
  readonly helperDigest: string;
  readonly source: string;
  readonly lock: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "svml-package-loader-"));
  const packageRoot = join(root, "node_modules", "example-card");
  // Keep the logical Module provider nested: normal loading must rediscover it from the selected
  // root's physical closure, not assume every activated dependency is resolvable from Workspace root.
  const dependencyRoot = join(packageRoot, "node_modules", "example-helper");
  const typesRoot = join(root, "node_modules", "example-types");
  const extraRoot = join(root, "node_modules", "example-extra");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(dependencyRoot, { recursive: true });
  await mkdir(typesRoot, { recursive: true });
  await mkdir(extraRoot, { recursive: true });
  const activation = join(packageRoot, "activation.mjs");
  const dependency = join(dependencyRoot, "index.mjs");
  const helperManifest = {
    format: "svml.module@1" as const,
    name: "example.helper",
    version: "1",
    dependencies: [],
    types: [],
    capabilities: [],
    surfaces: [],
    producers: [],
  };
  await writeFile(join(dependencyRoot, "package.json"), JSON.stringify({
    name: "example-helper",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs",
    svml: { activation: "./index.mjs" },
  }, null, 2), "utf8");
  await writeFile(dependency, `export default {
    format: "svml.node-package@1",
    name: "example-helper",
    modules: [{ manifest: ${JSON.stringify(helperManifest)} }],
  };\n`, "utf8");
  await writeFile(join(typesRoot, "package.json"), JSON.stringify({
    name: "example-types",
    version: "1.0.0",
    main: "",
    types: "index.d.ts",
  }, null, 2), "utf8");
  await writeFile(join(typesRoot, "index.d.ts"), "export type Marker = true;\n", "utf8");
  await writeFile(join(extraRoot, "package.json"), JSON.stringify({
    name: "example-extra",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    dependencies: { "example-types": "1.0.0" },
    svml: { activation: "./activation.mjs" },
  }, null, 2), "utf8");
  await writeFile(join(extraRoot, "activation.mjs"), `export default {
    format: "svml.node-package@1",
    name: "example-extra",
  };\n`, "utf8");
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-card",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    dependencies: { "example-helper": "1.0.0", "example-types": "1.0.0" },
    peerDependencies: { "example-optional-peer": "1.0.0" },
    peerDependenciesMeta: { "example-optional-peer": { optional: true } },
    svml: { activation: "./activation.mjs" },
  }, null, 2), "utf8");
  await writeFile(activation, `
    const module = { name: "example.card", version: "1" };
    const digest = ${JSON.stringify(implementationDigest)};
    const producerDigest = ${JSON.stringify(producerDigest)};
    const resultType = { module, name: "CardResult" };
    const producer = { module, name: "make-card" };
    export default {
      format: "svml.node-package@1",
      name: "example-card",
      modules: [{
        manifest: {
          format: "svml.module@1",
          name: module.name,
          version: module.version,
          dependencies: [{
            module: { name: "example.helper", version: "1" },
            digest: ${JSON.stringify(digestOf(helperManifest))},
          }],
          types: [{
            name: resultType.name,
            schema: { kind: "string", minLength: 1 },
            validator: {
              abi: "svml.type-validator@1",
              implementation: {
                kind: "registered",
                locator: "example-card/validate-card-result",
                digest,
              },
            },
          }],
          capabilities: [],
          surfaces: [{
            name: "card",
            tag: "Card",
            mode: "structured",
            outputs: [resultType],
            implementation: {
              kind: "trusted-frontend-surface",
              locator: "example-card/card",
              digest,
            },
          }],
          producers: [{
            name: producer.name,
            inputs: [],
            outputs: [{ name: "result", type: resultType }],
            needs: [],
            implementation: {
              kind: "registered",
              locator: "example-card/make-card",
              digest: producerDigest,
            },
          }],
        },
        specifiers: ["example.card@1"],
      }],
      hostFacets: [{
        abi: "svml.markup-surface-host@1",
        identity: {
          contract: "svml.markup-surface-host-facet@1",
          module,
          surface: "card",
          mode: "structured",
          implementationDigest: digest,
        },
        implementation({ element }) {
          return {
            records: [{
              id: "card-result",
              type: resultType,
              value: { kind: "inline", value: "accepted" },
              range: element.range,
            }],
            components: [],
            fragments: [],
          };
        },
      }],
      components: [
        {
          name: "example-card/contracts",
          validators: [{
            type: resultType,
            implementationDigest: digest,
            handler({ value }) {
              if (value.kind !== "inline" || value.value !== "accepted") {
                throw new Error("CardResult is not accepted");
              }
            },
          }],
        },
        {
          name: "example-card/compute",
          producers: [{
            producer,
            implementationDigest: producerDigest,
            handler() {
              return { outputs: { result: { kind: "inline", value: "accepted" } }, needs: {} };
            },
          }],
        },
      ],
    };
  `, "utf8");
  const source = join(root, "main.svml");
  await writeFile(source, `<?svml using="@narratage/markup@1"?>
<svml>
    <import as="example" from="example.card@1"/>
    <example:Card/>
  </svml>`, "utf8");
  return {
    root,
    activation,
    dependency,
    helperDigest: digestOf(helperManifest),
    source,
    lock: join(root, "svml.packages.lock"),
  };
}

test("an installed locked package carries inert Host facets and activatable compute", async () => {
  const item = await fixture();
  const lock = await createNodePackageLock(["example-card"], item.root);
  assert.deepEqual(lock.artifacts.map((artifact) => artifact.name), ["example-card", "example-helper", "example-types"]);
  assert.deepEqual(lock.selected, ["example-card"]);
  assert.deepEqual(lock.packages.map((value) => value.specifier), ["example-card", "example-helper"]);
  await writeNodePackageLock(item.lock, lock);
  const packages = await loadNodePackageContributions(item.lock, item.root);

  assert.equal(packages[0]?.name, "example-card");
  assert.equal(packages[1]?.name, "example-helper");
  assert.equal(packages[0]?.hostFacets?.[0]?.abi, "svml.markup-surface-host@1");

  const registered: Array<{ readonly producer: ProducerRef; readonly digest: string }> = [];
  installNodePackageComponents(packages, {
    registerProducer(producer, digest) {
      registered.push({ producer, digest });
    },
  }, new TypeValidatorRegistry());
  assert.deepEqual(registered, [{
    producer: { module: { name: "example.card", version: "1" }, name: "make-card" },
    digest: producerDigest,
  }]);
});

test("an empty local trust selection is a valid authenticated package lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-empty-package-lock-"));
  const path = join(root, "svml.packages.lock");
  const lock = await createNodePackageLock([], root);
  assert.deepEqual(lock.selected, []);
  assert.deepEqual(lock.artifacts, []);
  assert.deepEqual(lock.packages, []);
  await writeNodePackageLock(path, lock);
  assert.deepEqual(await loadNodePackageContributions(path, root), []);
});

test("dependency bytes are rejected before a locked contribution entry is reused", async () => {
  const item = await fixture();
  const lock = await createNodePackageLock(["example-card"], item.root);
  await writeNodePackageLock(item.lock, lock);
  await writeFile(item.dependency, `${await readFile(item.dependency, "utf8")}\n// changed bytes\n`, "utf8");

  await assert.rejects(
    async () => await loadNodePackageContributions(item.lock, item.root),
    /installed Node package bytes do not match the lock/,
  );
});

test("a missing exact Module provider is rejected while the lock is created", async () => {
  const item = await fixture();
  await writeFile(
    item.activation,
    (await readFile(item.activation, "utf8")).replace(item.helperDigest, `sha256:${"9".repeat(64)}`),
    "utf8",
  );

  await assert.rejects(
    async () => await createNodePackageLock(["example-card"], item.root),
    /no installed package .* provides required Module example\.helper@1/u,
  );
});

test("two physical packages cannot ambiguously provide one required Module", async () => {
  const item = await fixture();
  const copyRoot = join(item.root, "node_modules", "example-helper-copy");
  await mkdir(copyRoot, { recursive: true });
  await writeFile(join(copyRoot, "package.json"), JSON.stringify({
    name: "example-helper-copy",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs",
    svml: { activation: "./index.mjs" },
  }, null, 2), "utf8");
  await writeFile(
    join(copyRoot, "index.mjs"),
    (await readFile(item.dependency, "utf8")).replace('name: "example-helper"', 'name: "example-helper-copy"'),
    "utf8",
  );
  const cardPackagePath = join(item.root, "node_modules", "example-card", "package.json");
  const cardPackage = JSON.parse(await readFile(cardPackagePath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  cardPackage.dependencies["example-helper-copy"] = "1.0.0";
  await writeFile(cardPackagePath, JSON.stringify(cardPackage, null, 2), "utf8");

  await assert.rejects(
    async () => await createNodePackageLock(["example-card"], item.root),
    /multiple installed packages .* provide required Module example\.helper@1/u,
  );
});

test("an unrelated selected package does not contaminate another package's implementation closure", async () => {
  const item = await fixture();
  const alone = await createNodePackageLock(["example-card"], item.root);
  const together = await createNodePackageLock(["example-card", "example-extra"], item.root);
  const left = alone.packages.find((value) => value.specifier === "example-card")!;
  const right = together.packages.find((value) => value.specifier === "example-card")!;
  assert.equal(left.closureDigest, right.closureDigest);
  assert.notEqual(alone.digest, together.digest);
});

test("selection mutation keeps a shared dependency only through its retained root", async () => {
  const item = await fixture();
  const old = await createNodePackageLock(["example-card", "example-extra"], item.root);
  const next = await createNodePackageLock(["example-extra"], item.root, {
    retain: { from: old, selected: ["example-extra"] },
  });
  assert.deepEqual(next.selected, ["example-extra"]);
  assert.deepEqual(next.artifacts.map((artifact) => artifact.name), ["example-extra", "example-types"]);
  assert.deepEqual(next.packages.map((value) => value.specifier), ["example-extra"]);
});

test("a compute facet cannot claim another implementation than its static Manifest", async () => {
  const item = await fixture();
  const source = await readFile(item.activation, "utf8");
  await writeFile(
    item.activation,
    source.replace(
      "implementationDigest: producerDigest,\n            handler()",
      `implementationDigest: ${JSON.stringify(`sha256:${"4".repeat(64)}`)},\n            handler()`,
    ),
    "utf8",
  );

  await assert.rejects(
    async () => await createNodePackageLock(["example-card"], item.root),
    /Producer .* differs from its Manifest/u,
  );
});

async function runtimeAdapterFixture(marker: string): Promise<{
  readonly root: string;
  readonly lock: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "svml-external-runtime-adapter-"));
  const packageRoot = join(root, "node_modules", "example-runtime-adapter");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-runtime-adapter",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    svml: { activation: "./activation.mjs" },
  }, null, 2), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    // Physical implementation marker: ${marker}
    const declared = "sha256:${"7".repeat(64)}";
    const configuration = "sha256:${"8".repeat(64)}";
    const module = { name: "example.runtime", version: "1" };
    const capability = { module, name: "Generate" };
    const returns = { module, name: "Result" };
    const runtimeFacet = {
      abi: "svml.runtime-adapter-host@1",
      identity: {
        contract: "svml.runtime-adapter-facet@1",
        use: "example-runtime-adapter",
        kind: "endpoint",
      },
      implementation: {
        activate(context) {
          const facet = { module, name: "endpoint" };
          return { endpoint: {
              name: context.instance,
              manifest: {
                format: "svml.runtime-module@1",
                name: module.name,
                version: module.version,
                facets: [{
                  name: facet.name,
                  role: "capability-endpoint",
                  implementation: { locator: "example-runtime-adapter/endpoint", digest: declared },
                  fulfills: [{ capability, returns }],
                  lifecycle: "immediate",
                  defaultConcurrency: 1,
                  credentialSlots: [],
                }],
              },
              instance: { id: context.instance, facet, configurationDigest: configuration },
              bindings: [{ capability, returns, endpoint: context.instance }],
              credentials: [],
              install(registry) {
                registry.registerImmediateEndpoint(
                  context.instance,
                  capability,
                  returns,
                  () => ({
                    value: { kind: "inline", value: "external" },
                    delivery: { kind: "inline" },
                    metadata: null,
                  }),
                  { runtimeImplementation: { facet, digest: declared, configurationDigest: configuration } },
                );
              },
            },
          };
        },
      },
    };
    export default {
      format: "svml.node-package@1",
      name: "example-runtime-adapter",
      hostFacets: [runtimeFacet],
    };
  `, "utf8");
  return { root, lock: join(root, "runtime.packages.lock") };
}

async function loadedExternalEndpointDigest(marker: string): Promise<string> {
  const item = await runtimeAdapterFixture(marker);
  await writeNodePackageLock(
    item.lock,
    await createNodePackageLock(["example-runtime-adapter"], item.root),
  );
  const loaded = await loadNodePackageSet(item.lock, item.root);
  const contribution = loaded.contributions[0]!;
  const locked = loaded.lock.packages[0]!;
  const artifact = loaded.lock.artifacts.find((value) =>
    value.name === locked.package.name && value.version === locked.package.version)!;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(contribution.hostFacets![0]!, {
    packageName: contribution.name,
    packageArtifactDigest: artifact.digest,
    packageClosureDigest: locked.closureDigest,
  });
  const endpoint = await registry.createEndpoint("example-runtime-adapter", {
    root: item.root,
    instance: "external.fixture",
    config: {},
  });
  return endpoint.manifest.facets[0]!.implementation.digest;
}

test("a third-party Runtime Adapter stays outside the Host and is identified by its actual package bytes", async () => {
  const first = await loadedExternalEndpointDigest("first-build");
  const second = await loadedExternalEndpointDigest("second-build");
  assert.notEqual(first, `sha256:${"7".repeat(64)}`);
  assert.notEqual(first, second);
});

test("a package digest ignores Finder metadata but still binds authored hidden files", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-package-dotfile-"));
  const packageRoot = join(root, "node_modules", "example-dotfile");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-dotfile",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs",
    svml: { activation: "./index.mjs" },
  }, null, 2), "utf8");
  await writeFile(join(packageRoot, "index.mjs"), `export default {
    format: "svml.node-package@1",
    name: "example-dotfile",
  };\n`, "utf8");

  const before = await createNodePackageLock(["example-dotfile"], root);
  // A Finder dropping is not part of the package. Hashing one made a lock written on macOS
  // report every other machine as stale, and the failure read as an unrelated stale-lock error.
  await writeFile(join(packageRoot, ".DS_Store"), "finder", "utf8");
  const after = await createNodePackageLock(["example-dotfile"], root);

  assert.equal(after.digest, before.digest);
  assert.deepEqual(
    after.artifacts.map((artifact) => artifact.digest),
    before.artifacts.map((artifact) => artifact.digest),
  );

  await writeFile(join(packageRoot, ".runtime-config"), "behavior", "utf8");
  const withAuthoredHiddenFile = await createNodePackageLock(["example-dotfile"], root);
  assert.notEqual(withAuthoredHiddenFile.digest, after.digest);
  assert.notDeepEqual(
    withAuthoredHiddenFile.artifacts.map((artifact) => artifact.digest),
    after.artifacts.map((artifact) => artifact.digest),
  );
});
