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
import type { ProducerRef } from "@narratage/protocol";

const implementationDigest = `sha256:${"1".repeat(64)}`;
const producerDigest = `sha256:${"3".repeat(64)}`;

async function fixture(): Promise<{
  readonly root: string;
  readonly activation: string;
  readonly dependency: string;
  readonly source: string;
  readonly lock: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "svml-package-loader-"));
  const packageRoot = join(root, "node_modules", "example-card");
  const dependencyRoot = join(root, "node_modules", "example-helper");
  const typesRoot = join(root, "node_modules", "example-types");
  const extraRoot = join(root, "node_modules", "example-extra");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(dependencyRoot, { recursive: true });
  await mkdir(typesRoot, { recursive: true });
  await mkdir(extraRoot, { recursive: true });
  const activation = join(packageRoot, "activation.mjs");
  const dependency = join(dependencyRoot, "index.mjs");
  await writeFile(join(dependencyRoot, "package.json"), JSON.stringify({
    name: "example-helper",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs",
  }, null, 2), "utf8");
  await writeFile(dependency, "export const helper = true;\n", "utf8");
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
          dependencies: [],
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
        abi: "svml.text-surface-host@1",
        identity: {
          contract: "svml.text-surface-host-facet@1",
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
  await writeFile(source, `<?svml using="@narratage/text@1"?>
<svml>
    <import as="example" from="example.card@1"/>
    <example:Card/>
  </svml>`, "utf8");
  return { root, activation, dependency, source, lock: join(root, "svml.packages.lock") };
}

test("an installed locked package carries inert Host facets and activatable compute", async () => {
  const item = await fixture();
  const lock = await createNodePackageLock(["example-card"], item.root);
  assert.deepEqual(lock.artifacts.map((artifact) => artifact.name), ["example-card", "example-helper", "example-types"]);
  await writeNodePackageLock(item.lock, lock);
  const packages = await loadNodePackageContributions(item.lock, item.root);

  assert.equal(packages[0]?.name, "example-card");
  assert.equal(packages[0]?.hostFacets?.[0]?.abi, "svml.text-surface-host@1");

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

test("an unrelated selected package does not contaminate another package's implementation closure", async () => {
  const item = await fixture();
  const alone = await createNodePackageLock(["example-card"], item.root);
  const together = await createNodePackageLock(["example-card", "example-extra"], item.root);
  const left = alone.packages.find((value) => value.specifier === "example-card")!;
  const right = together.packages.find((value) => value.specifier === "example-card")!;
  assert.equal(left.closureDigest, right.closureDigest);
  assert.notEqual(alone.digest, together.digest);
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
        create(context) {
          const facet = { module, name: "endpoint" };
          return {
            name: context.instance,
            manifest: {
              format: "svml.runtime-module@1",
              name: module.name,
              version: module.version,
              facets: [{
                name: facet.name,
                role: "capability-endpoint",
                implementation: { locator: "example-runtime-adapter/endpoint", digest: declared },
                permissions: [],
                fulfills: [{ capability, returns }],
                lifecycle: "immediate",
                defaultConcurrency: 1,
                credentialSlots: [],
              }],
            },
            instance: { id: context.instance, facet, configurationDigest: configuration },
            bindings: [{ capability, returns, endpoint: context.instance }],
            install(registry) {
              registry.registerImmediateEndpoint(
                context.instance,
                capability,
                returns,
                () => ({
                  value: { kind: "inline", value: "external" },
                  conformance: "exact",
                  delivery: { kind: "inline" },
                  metadata: null,
                }),
                { runtimeImplementation: { facet, digest: declared, configurationDigest: configuration } },
              );
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
