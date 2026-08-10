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

async function sourceFiles(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const path = new URL(`./${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) found.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
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
  "@narratage/credential-store-keychain",
  "@narratage/transport",
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

test("Caption Playground cannot add semantics or metadata to production packages", async () => {
  let productionSource = "";
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = new URL(`./${entry.name}/src/`, packageRoot);
    for (const file of await sourceFiles(sourceRoot)) {
      const source = await readFile(file, "utf8");
      productionSource += source;
      assert.ok(!/\bplayground\b/iu.test(source),
        `${file.pathname} mentions Playground; the dependency must point from the tool to production only`);
    }
  }

  const typeDeclarations = await readFile(new URL("./protocol/src/module.ts", packageRoot), "utf8");
  assert.ok(!/readonly\s+default\??\s*:/u.test(typeDeclarations),
    "TypeDeclaration must not carry preview defaults");

  const valueSchemas = await readFile(new URL("./protocol/src/value.ts", packageRoot), "utf8");
  assert.ok(!/readonly\s+format\??\s*:/u.test(valueSchemas),
    "ValueSchema must not carry presentation hints for a tool");

  const componentKit = await readFile(new URL("./component-kit/src/index.ts", packageRoot), "utf8");
  assert.ok(!/\bRecipeFacet\b|readonly\s+recipes\??\s*:/u.test(componentKit),
    "ComponentPackage must not grow an editor or Playground Recipe facet");

  for (const helper of [
    "defaultProgramSpace", "defaultCanvasSpace", "defaultFilmProgram", "defaultScreenOverlayProgram",
  ]) {
    assert.ok(!productionSource.includes(helper),
      `${helper} is a preview starting value and must stay outside production packages`);
  }
});

test("Caption Playground is a selected source editor, not a component registry", async () => {
  const root = new URL("../tools/caption-playground/src/", import.meta.url);
  const allowedPackages = new Set([
    "@narratage/caption",
    "@narratage/caption-fine",
    "@narratage/composition",
    "@narratage/fonts-open",
    "@narratage/host",
    "@narratage/narrative",
    "@narratage/package-loader-node",
    "@narratage/program-space",
    "@narratage/protocol",
    "@narratage/svs",
    "@narratage/video-cli",
  ]);
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/["'](@narratage\/[a-z0-9-]+)["']/gu)) {
      assert.ok(allowedPackages.has(match[1]), `${file.pathname} unexpectedly names ${match[1]}`);
    }
    assert.ok(!/\b(?:Story|Scenario|Recipe)Registry\b/u.test(source),
      `${file.pathname} introduces a parallel Caption Playground registry`);
    assert.ok(!/import\.meta\.glob|discoverPreviewProducers/u.test(source),
      `${file.pathname} scans the workspace instead of editing the explicitly selected Caption source`);
  }
});

test("Markup syntax, graph Text and video Typography keep distinct package identities", async () => {
  const packages = await workspacePackages();
  for (const name of [
    "@narratage/markup",
    "@narratage/run-markup",
    "@narratage/compiler-markup-node",
    "@narratage/text",
    "@narratage/typography-track",
  ]) assert.ok(packages.has(name), `${name} is absent`);
  for (const retired of [
    "@narratage/run-text",
    "@narratage/compiler-text-node",
    "@narratage/text-track",
    "@narratage/prompt-kit",
  ]) assert.ok(!packages.has(retired), `${retired} must stay retired`);
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

test("a Provider reaches no exact-model package, so models and services stay N+M", async () => {
  const packages = await workspacePackages();
  const graph = productionGraph(packages);
  const models = [
    "@narratage/gemini-omni",
    "@narratage/gpt-image",
    "@narratage/grok-imagine",
    "@narratage/minimax-h3",
    "@narratage/nano-banana",
    "@narratage/seedance",
    "@narratage/seedream",
  ];
  for (const name of [...packages.keys()].filter((item) => item.startsWith("@narratage/provider-"))) {
    const reached = transitive(graph, name);
    assert.deepEqual(
      models.filter((model) => reached.has(model)),
      [],
      `${name} depends on an exact-model package; a Provider must map declared ports instead`,
    );
  }
  // The shared port and wire-mapping vocabulary is the only legitimate meeting point.
  assert.ok(transitive(graph, "@narratage/provider-kie").has("@narratage/generation"));
  assert.ok(transitive(graph, "@narratage/seedance").has("@narratage/generation"));
});

test("the speech time map is an opaque handle: no consumer reads its fields", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const packages = new URL("../packages/", import.meta.url);
  // Locating is a lookup through semantic-map. A consumer that destructured the
  // map could sort, merge or clip located spans against one another; those are
  // the caller's decisions to make on its own values, never the map's to make
  // for it.
  const reach = /\bmap\.(tokens|anchors|segments)\b/u;
  for (const entry of await readdir(packages, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "semantic-map" || entry.name === "speech-alignment") continue;
    const source = new URL(`./${entry.name}/src/`, packages);
    let files = [];
    try {
      files = await readdir(source);
    } catch {
      continue;
    }
    for (const file of files.filter((name) => name.endsWith(".ts"))) {
      const content = await readFile(new URL(file, source), "utf8");
      assert.ok(!reach.test(content),
        `${entry.name}/src/${file} reads a SemanticMap field directly; call a semantic-map lookup instead`);
    }
  }
});

test("Markup compilation is one explicit leaf assembly, not a Package Loader or Local Runtime dependency", async () => {
  const graph = productionGraph(await workspacePackages());
  assert.ok(transitive(graph, "@narratage/compiler-markup-node").has("@narratage/markup"));
  assert.ok(!transitive(graph, "@narratage/package-loader-node").has("@narratage/markup"));
  assert.ok(!transitive(graph, "@narratage/local").has("@narratage/markup"));
});

test("generic and video CLIs reach no Provider package and video CLI activates no author aggregate", async () => {
  const packages = await workspacePackages();
  const graph = productionGraph(packages);
  const dependencies = transitive(graph, "@narratage/cli");
  const providers = [...packages.keys()].filter((name) => name.startsWith("@narratage/provider-"));
  assert.deepEqual(providers.filter((name) => dependencies.has(name)), []);
  const videoDependencies = transitive(graph, "@narratage/video-cli");
  assert.deepEqual(providers.filter((name) => videoDependencies.has(name)), []);
  assert.ok(!videoDependencies.has("@narratage/script"));
  assert.ok(!videoDependencies.has("@narratage/media-track"));
  assert.ok(!videoDependencies.has("@narratage/typography-track"));
  assert.ok(!videoDependencies.has("@narratage/film"));
  assert.ok(videoDependencies.has("@narratage/cli"));
});

test("domain packages confine their Markup dependency to Surface and activation entries", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const surfaceOnly = [
    "caption", "caption-gemini", "estimate", "film", "render-hyperframes",
    "image-transform", "media", "media-pipeline", "media-track", "seedance", "speech-spine", "whisperx",
  ];
  const allowed = new Set(["surface.ts", "activation.ts"]);
  for (const name of surfaceOnly) {
    const root = new URL(`../packages/${name}/src/`, import.meta.url);
    for (const file of await readdir(root)) {
      if (!file.endsWith(".ts") || allowed.has(file)) continue;
      const content = await readFile(new URL(file, root), "utf8");
      assert.ok(!content.includes("\"@narratage/markup\""),
        `${name}/src/${file} imports @narratage/markup outside its Surface boundary`);
    }
  }
});

test("every package is reachable: imported, activatable, or a declared entry point", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const packages = await workspacePackages();
  // A CLI is nobody's dependency by construction; it is what a person runs.
  const entryPoints = new Set(["@narratage/video-cli", "@narratage/test-support"]);

  // Anything imported by non-test source anywhere in the workspace, including
  // the deployment services, which are real consumers even though they are not
  // workspace packages.
  const imported = new Set();
  const scan = async (directory, owner) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory() && entry.name !== "node_modules") await scan(path, owner);
      else if (entry.name.endsWith(".ts")) {
        for (const match of (await readFile(path, "utf8")).matchAll(/"(@narratage\/[a-z0-9-]+)"/gu)) {
          if (match[1] !== owner) imported.add(match[1]);
        }
      }
    }
  };
  for (const name of packages.keys()) await scan(`packages/${name.replace("@narratage/", "")}/src`, name);
  await scan("services", undefined);

  // A package with an activation entry is loaded by the Package Loader from a
  // lock, never by an import, so having no importer is what it is supposed to
  // look like.
  const activatable = new Set([...packages]
    .filter(([, manifest]) => manifest.svml?.activation !== undefined)
    .map(([name]) => name));

  // A data-only author package can deliberately export self-describing Source
  // Modules without shipping executable activation code. Those exports are
  // public entry points just as surely as a CLI binary is.
  const sourceResources = new Set([...packages]
    .filter(([, manifest]) => manifest.exports !== null
      && typeof manifest.exports === "object"
      && Object.values(manifest.exports).some((target) => typeof target === "string" && target.endsWith(".svs")))
    .map(([name]) => name));

  const unreachable = [...packages.keys()]
    .filter((name) => !imported.has(name)
      && !activatable.has(name)
      && !sourceResources.has(name)
      && !entryPoints.has(name))
    .sort();
  assert.deepEqual(unreachable, [],
    "packages nothing imports, nothing can activate, and no one runs — delete them or give them a consumer");
});
