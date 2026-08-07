import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import test from "node:test";

const packageRoot = new URL("../packages/", import.meta.url);

async function workspacePackages() {
  const manifests = new Map();
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = new URL(`./${entry.name}/package.json`, packageRoot);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    manifests.set(manifest.name, manifest);
  }
  return manifests;
}

function productionGraph(packages) {
  return new Map([...packages].map(([name, manifest]) => [
    name,
    Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    }).filter((dependency) => packages.has(dependency)),
  ]));
}

function transitive(graph, entry) {
  const found = new Set();
  const visit = (name) => {
    for (const dependency of graph.get(name) ?? []) {
      if (found.has(dependency)) continue;
      found.add(dependency);
      visit(dependency);
    }
  };
  visit(entry);
  return found;
}

const domainNeutralPackages = new Set([
  "@svml/protocol",
  "@svml/artifact",
  "@svml/core",
  "@svml/source",
  "@svml/elaborator",
  "@svml/realization",
  "@svml/run",
  "@svml/validation",
  "@svml/host",
  "@svml/compiler-node",
  "@svml/workspace-fs-node",
  "@svml/component-kit",
  "@svml/runtime",
  "@svml/endpoint-kit",
  "@svml/driver-node",
  "@svml/package-loader-node",
  "@svml/store-sqlite",
  "@svml/artifact-store-fs",
  "@svml/artifact-store-s3",
  "@svml/credential-store-env",
  "@svml/transport",
  "@svml/transport-process",
  "@svml/transport-aws-lambda",
  "@svml/local",
]);

test("official production packages have no dependency cycle", async () => {
  const graph = productionGraph(await workspacePackages());
  const visiting = new Set();
  const complete = new Set();
  const visit = (name, trail) => {
    if (visiting.has(name)) assert.fail(`production dependency cycle: ${[...trail, name].join(" -> ")}`);
    if (complete.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency, [...trail, name]);
    visiting.delete(name);
    complete.add(name);
  };
  for (const name of graph.keys()) visit(name, []);
});

test("the declared domain-neutral distribution closes without syntax, AIGC or video packages", async () => {
  const packages = await workspacePackages();
  const graph = productionGraph(packages);
  for (const name of domainNeutralPackages) {
    assert.ok(packages.has(name), `domain-neutral package ${name} is absent`);
    const outside = [...transitive(graph, name)].filter((dependency) =>
      dependency.startsWith("@svml/") && !domainNeutralPackages.has(dependency));
    assert.deepEqual(outside, [], `${name} reaches packages outside the domain-neutral distribution`);
  }
  assert.deepEqual(graph.get("@svml/core"), ["@svml/protocol"]);
});

test("Text compilation is one explicit leaf assembly, not a Package Loader or Local Runtime dependency", async () => {
  const graph = productionGraph(await workspacePackages());
  assert.ok(transitive(graph, "@svml/compiler-text-node").has("@svml/text"));
  assert.ok(!transitive(graph, "@svml/package-loader-node").has("@svml/text"));
  assert.ok(!transitive(graph, "@svml/local").has("@svml/text"));
});

test("the generic CLI engine reaches no video Prelude or Endpoint package", async () => {
  const graph = productionGraph(await workspacePackages());
  const dependencies = transitive(graph, "@svml/cli");
  const videoAssembly = [
    "@svml/prelude-video",
    "@svml/provider-google-vertex",
    "@svml/provider-hyperframes-local",
    "@svml/provider-kie",
    "@svml/provider-media-local",
    "@svml/provider-whisperx-local",
  ];
  assert.deepEqual(videoAssembly.filter((name) => dependencies.has(name)), []);
  assert.ok(transitive(graph, "@svml/video-cli").has("@svml/prelude-video"));
  assert.ok(transitive(graph, "@svml/video-cli").has("@svml/cli"));
});
