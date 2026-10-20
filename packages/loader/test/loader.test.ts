import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadNodePackageSelection } from "@hypit/loader/node";

async function installedPackage(
  root: string,
  name: string,
  contribution: string,
  dependencies: Readonly<Record<string, string>> = {},
): Promise<void> {
  const directory = join(root, "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name,
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    hypit: { activation: "./activation.mjs" },
    dependencies,
  }), "utf8");
  await writeFile(join(directory, "activation.mjs"), `export default ${contribution};\n`, "utf8");
}

async function projectPackage(
  root: string,
  name: string,
  contribution: string,
  dependencies: Readonly<Record<string, string>> = {},
): Promise<void> {
  const directory = join(root, "packages", name.split("/").at(-1)!);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name,
    version: "0.0.0-dev",
    type: "module",
    hypit: { activation: "./activation.mjs" },
    dependencies,
  }), "utf8");
  await writeFile(join(directory, "activation.mjs"), `export default ${contribution};\n`, "utf8");
}

async function exposeEmbeddedPackage(root: string, name: string): Promise<void> {
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "test-distribution", exports: { "./embedded": `./packages/${name.split("/").at(-1)}/activation.mjs` },
  }));
}

test("loads an explicitly selected installed package", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-package-loader-"));
  try {
    await installedPackage(root, "example-cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "cards" }]
    }`);
    const loaded = await loadNodePackageSelection(["example-cards"], root);
    assert.deepEqual(loaded.map((item) => item.specifier), ["example-cards"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an independently installed package must own its missing @hypit dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-package-owner-"));
  try {
    await installedPackage(root, "example-cards", `{ format: "hypit.package@1" }`, {
      "@hypit/missing-extension": "1.0.0",
    });
    await assert.rejects(
      loadNodePackageSelection(["example-cards"], root),
      /example-cards requires @hypit\/missing-extension@1\.0\.0/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an embedded Distribution package resolves a dependency installed with its Distribution", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-cli-only-project-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-cli-only-distribution-"));
  try {
    await projectPackage(distribution, "@hypit/provider-example", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.provider@1", address: "example" }]
    }`, { "cli-only": "1.2.3" });
    const cli = join(distribution, "node_modules", "cli-only");
    await mkdir(join(cli, "bin"), { recursive: true });
    await writeFile(join(cli, "package.json"), JSON.stringify({
      name: "cli-only",
      version: "1.2.3",
      type: "module",
      bin: { "cli-only": "./bin/cli.mjs" },
    }), "utf8");
    await writeFile(join(cli, "bin", "cli.mjs"), "export {};\n", "utf8");
    const loaded = await loadNodePackageSelection(["@hypit/provider-example"], project, {
      fallbackRoots: [distribution],
    });
    assert.deepEqual(loaded.map((item) => item.specifier), ["@hypit/provider-example"]);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});

test("resolves a logical request to its conventional installed package", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-package-selection-"));
  try {
    await installedPackage(root, "example-provider", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.endpoint@1", address: "example-provider" }]
    }`);
    const loaded = await loadNodePackageSelection({
      selected: [],
      logical: [{ abi: "example.endpoint@1", name: "example-provider" }],
    }, root);
    assert.deepEqual(loaded.map((item) => item.specifier), ["example-provider"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loads an explicit project package without linking it into the Distribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-package-"));
  try {
    await projectPackage(root, "@acme/cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "cards" }]
    }`);
    const loaded = await loadNodePackageSelection(["@acme/cards"], root);
    assert.deepEqual(loaded.map((item) => item.specifier), ["@acme/cards"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("falls back to an explicit read-only Distribution root", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-project-root-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-distribution-root-"));
  try {
    await installedPackage(distribution, "@hypit/cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "cards" }]
    }`);
    const loaded = await loadNodePackageSelection(["@hypit/cards"], project, {
      fallbackRoots: [distribution],
    });
    assert.deepEqual(loaded.map((item) => item.specifier), ["@hypit/cards"]);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});

test("a project-installed official extension wins over the Distribution fallback", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-project-root-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-distribution-root-"));
  try {
    await installedPackage(project, "@hypit/cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "project-shadow" }]
    }`);
    await installedPackage(distribution, "@hypit/cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "distribution" }]
    }`);
    const loaded = await loadNodePackageSelection(["@hypit/cards"], project, {
      fallbackRoots: [distribution],
    });
    assert.deepEqual(loaded.map((item) => item.specifier), ["@hypit/cards"]);
    assert.equal(loaded[0]!.contribution.facets?.[0]?.address, "project-shadow");
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});

test("an exact package embedded by the active Distribution cannot be shadowed", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-project-root-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-distribution-root-"));
  try {
    await installedPackage(project, "example-cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "project-shadow" }]
    }`);
    await projectPackage(distribution, "example-cards", `{
      format: "hypit.package@1",
      facets: [{ abi: "example.cards@1", address: "embedded-host" }]
    }`);
    await exposeEmbeddedPackage(distribution, "example-cards");
    const loaded = await loadNodePackageSelection(["example-cards"], project, {
      fallbackRoots: [distribution],
    });
    assert.equal(loaded[0]!.contribution.facets?.[0]?.address, "embedded-host");
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});

test("official extensions use the Build module scope while embedded host packages stay shared", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-project-root-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-distribution-root-"));
  try {
    await installedPackage(distribution, "@hypit/cards", `{ format: "hypit.package@1" }`);
    await projectPackage(distribution, "@hypit/facet-cards", `{ format: "hypit.package@1" }`);
    await exposeEmbeddedPackage(distribution, "@hypit/facet-cards");
    const scoped: string[] = [];
    const importModule = async (url: string): Promise<unknown> => {
      scoped.push(url);
      return await import(url);
    };
    await loadNodePackageSelection(["@hypit/cards"], project, {
      fallbackRoots: [distribution], importModule,
    });
    assert.equal(scoped.length, 1);
    await loadNodePackageSelection(["@hypit/facet-cards"], project, {
      fallbackRoots: [distribution], importModule,
    });
    assert.equal(scoped.length, 1);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});

test("explicit default owners resolve nested capabilities without node_modules hoisting", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-default-project-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-default-distribution-"));
  try {
    await writeFile(join(distribution, "package.json"), JSON.stringify({
      name: "test-distribution", dependencies: { "video-defaults": "1.0.0" },
      hypit: { packageSources: ["video-defaults"] },
    }));
    await installedPackage(distribution, "video-defaults", `{ format: "hypit.package@1" }`, { "example-cards": "1.0.0" });
    const owner = join(distribution, "node_modules", "video-defaults");
    await installedPackage(owner, "example-cards", `{
      format: "hypit.package@1", facets: [{ abi: "cards@1", address: "default" }]
    }`);
    const options = { fallbackRoots: [distribution] };
    assert.equal((await loadNodePackageSelection(["example-cards"], project, options))[0]!.contribution.facets?.[0]?.address, "default");
    await installedPackage(project, "example-cards", `{
      format: "hypit.package@1", facets: [{ abi: "cards@1", address: "project" }]
    }`);
    assert.equal((await loadNodePackageSelection(["example-cards"], project, options))[0]!.contribution.facets?.[0]?.address, "project");
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});
