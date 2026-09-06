import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  distributionExternalPackageRequirements,
  loadNodePackageSelection,
} from "@hypit/package-loader-node";

async function installedPackage(
  root: string,
  name: string,
  contribution: string,
): Promise<void> {
  const directory = join(root, "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name,
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    hypit: { activation: "./activation.mjs" },
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

test("loads an explicitly selected installed package", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-package-loader-"));
  try {
    await installedPackage(root, "example-cards", `{
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.cards@1", offers: ["cards"] }]
    }`);
    const loaded = await loadNodePackageSelection(["example-cards"], root);
    assert.deepEqual(loaded.map((item) => item.specifier), ["example-cards"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Distribution requirements leave project packages to npm and follow internal dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-distribution-requirements-"));
  try {
    await projectPackage(root, "@hypit/provider-example", `{
      format: "hypit.node-package@1"
    }`, {
      "@hypit/transport-example": "workspace:*",
      "example-sdk": "2.3.4",
    });
    await projectPackage(root, "@hypit/transport-example", `{
      format: "hypit.node-package@1"
    }`, {
      "example-transport": "1.2.3",
    });
    assert.deepEqual(await distributionExternalPackageRequirements(
      ["@hypit/provider-example", "@studio/provider-art", "another-provider"], root,
    ), [
      { name: "example-sdk", version: "2.3.4", specifier: "example-sdk@2.3.4" },
      { name: "example-transport", version: "1.2.3", specifier: "example-transport@1.2.3" },
    ]);
    assert.deepEqual(await distributionExternalPackageRequirements(["@studio/provider-art"], root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Distribution package accepts an exact CLI-only dependency from the machine npm home", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-cli-only-project-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-cli-only-distribution-"));
  const machine = await mkdtemp(join(tmpdir(), "hypit-cli-only-machine-"));
  try {
    await projectPackage(distribution, "@hypit/provider-example", `{
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.provider@1", offers: ["example"] }]
    }`, { "cli-only": "1.2.3" });
    const cli = join(machine, "node_modules", "cli-only");
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
      externalRoots: [machine],
    });
    assert.deepEqual(loaded.map((item) => item.specifier), ["@hypit/provider-example"]);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
    await rm(machine, { recursive: true, force: true });
  }
});

test("resolves a logical request to its conventional installed package", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-package-selection-"));
  try {
    await installedPackage(root, "example-provider", `{
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.endpoint@1", offers: ["example-provider"] }]
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
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.cards@1", offers: ["cards"] }]
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
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.cards@1", offers: ["cards"] }]
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

test("the active Distribution owns the reserved @hypit namespace", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-project-root-"));
  const distribution = await mkdtemp(join(tmpdir(), "hypit-distribution-root-"));
  try {
    await installedPackage(project, "@hypit/cards", `{
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.cards@1", offers: ["project-shadow"] }]
    }`);
    await installedPackage(distribution, "@hypit/cards", `{
      format: "hypit.node-package@1",
      hostFacets: [{ abi: "example.cards@1", offers: ["distribution"] }]
    }`);
    const loaded = await loadNodePackageSelection(["@hypit/cards"], project, {
      fallbackRoots: [distribution],
    });
    assert.deepEqual(loaded.map((item) => item.specifier), ["@hypit/cards"]);
    assert.deepEqual(loaded[0]!.contribution.hostFacets?.[0]?.offers, ["distribution"]);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(distribution, { recursive: true, force: true });
  }
});
