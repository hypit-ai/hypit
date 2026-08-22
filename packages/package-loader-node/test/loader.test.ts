import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadNodePackageSelection } from "@hypit/package-loader-node";

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
): Promise<void> {
  const directory = join(root, "packages", name.split("/").at(-1)!);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name,
    version: "0.0.0-dev",
    type: "module",
    hypit: { activation: "./activation.mjs" },
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
