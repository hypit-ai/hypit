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
