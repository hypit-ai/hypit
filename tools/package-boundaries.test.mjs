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
  "@narratage/protocol",
  "@narratage/artifact",
  "@narratage/core",
  "@narratage/source",
  "@narratage/elaborator",
  "@narratage/run",
  "@narratage/validation",
  "@narratage/host",
  "@narratage/compiler-node",
  "@narratage/workspace-fs-node",
  "@narratage/component-kit",
  "@narratage/runtime",
  "@narratage/runtime-adapter",
  "@narratage/runtime-adapter-node",
  "@narratage/endpoint-kit",
  "@narratage/driver-node",
  "@narratage/package-loader-node",
  "@narratage/store-sqlite",
  "@narratage/artifact-store-fs",
  "@narratage/artifact-store-s3",
  "@narratage/credential-store-env",
  "@narratage/transport",
  "@narratage/transport-process",
  "@narratage/transport-aws-lambda",
  "@narratage/local",
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
      dependency.startsWith("@narratage/") && !domainNeutralPackages.has(dependency));
    assert.deepEqual(outside, [], `${name} reaches packages outside the domain-neutral distribution`);
  }
  assert.deepEqual(graph.get("@narratage/core"), ["@narratage/protocol"]);
});

test("Text compilation is one explicit leaf assembly, not a Package Loader or Local Runtime dependency", async () => {
  const graph = productionGraph(await workspacePackages());
  assert.ok(transitive(graph, "@narratage/compiler-text-node").has("@narratage/text"));
  assert.ok(!transitive(graph, "@narratage/package-loader-node").has("@narratage/text"));
  assert.ok(!transitive(graph, "@narratage/local").has("@narratage/text"));
});

test("generic and video CLIs reach no Provider package and video CLI activates no author aggregate", async () => {
  const graph = productionGraph(await workspacePackages());
  const dependencies = transitive(graph, "@narratage/cli");
  const videoAssembly = [
    "@narratage/provider-google-vertex",
    "@narratage/provider-hyperframes-local",
    "@narratage/provider-image-opencv-local",
    "@narratage/provider-kie",
    "@narratage/provider-media-local",
    "@narratage/provider-whisperx-local",
  ];
  assert.deepEqual(videoAssembly.filter((name) => dependencies.has(name)), []);
  const videoDependencies = transitive(graph, "@narratage/video-cli");
  assert.deepEqual(videoAssembly.filter((name) => videoDependencies.has(name)), []);
  assert.ok(!videoDependencies.has("@narratage/script"));
  assert.ok(!videoDependencies.has("@narratage/seedance-speaker"));
  assert.ok(!videoDependencies.has("@narratage/broll"));
  assert.ok(!videoDependencies.has("@narratage/text-track"));
  assert.ok(!videoDependencies.has("@narratage/film"));
  assert.ok(videoDependencies.has("@narratage/cli"));
});

test("domain packages confine their Text dependency to Surface and activation entries", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const surfaceOnly = [
    "broll", "caption", "caption-gemini", "estimate", "film", "render-hyperframes",
    "image-transform", "media", "seedance", "seedance-speaker", "speech-spine", "whisperx",
  ];
  const allowed = new Set(["surface.ts", "activation.ts"]);
  for (const name of surfaceOnly) {
    const root = new URL(`../packages/${name}/src/`, import.meta.url);
    for (const file of await readdir(root)) {
      if (!file.endsWith(".ts") || allowed.has(file)) continue;
      const content = await readFile(new URL(file, root), "utf8");
      assert.ok(!content.includes("\"@narratage/text\""),
        `${name}/src/${file} imports @narratage/text outside its Surface boundary`);
    }
  }
});

test("every workspace package is exercised by some test, directly or through a tested consumer", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const packages = await workspacePackages();
  const graph = productionGraph(packages);
  const directlyTested = new Set();
  for (const name of packages.keys()) {
    const short = name.replace("@narratage/", "");
    let entries = [];
    try {
      entries = await readdir(new URL(`../packages/${short}/test/`, import.meta.url));
    } catch {
      continue;
    }
    if (entries.some((file) => file.endsWith(".test.ts"))) directlyTested.add(name);
  }
  const testedImports = new Set(directlyTested);
  for (const name of directlyTested) {
    for (const dependency of transitive(graph, name)) testedImports.add(dependency);
    const short = name.replace("@narratage/", "");
    const testRoot = new URL(`../packages/${short}/test/`, import.meta.url);
    for (const file of await readdir(testRoot)) {
      if (!file.endsWith(".ts")) continue;
      const source = await readFile(new URL(file, testRoot), "utf8");
      for (const match of source.matchAll(/"(@narratage\/[a-z-]+)"/gu)) {
        testedImports.add(match[1]);
        for (const dependency of transitive(graph, match[1])) testedImports.add(dependency);
      }
    }
  }
  const uncovered = [...packages.keys()].filter((name) => !testedImports.has(name)).sort();
  assert.deepEqual(uncovered, [], "packages reachable from no test at all");
});
