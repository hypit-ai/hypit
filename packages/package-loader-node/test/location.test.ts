import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  installExternalPackageResolution,
  locateNodePackage,
  resolveNodePackageExecutable,
  resolveNodePackageResource,
} from "@hypit/package-loader-node";

async function machinePackage(
  machine: string,
  name: string,
  manifest: Readonly<Record<string, unknown>>,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = join(machine, "node_modules", ...name.split("/"));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name, ...manifest }), "utf8");
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), contents, "utf8");
  }
  return root;
}

test("one physical locator distinguishes CLI packages, resources and project ownership", async () => {
  const distribution = await mkdtemp(join(tmpdir(), "hypit-locator-distribution-"));
  const project = await mkdtemp(join(tmpdir(), "hypit-locator-project-"));
  const machine = await mkdtemp(join(tmpdir(), "hypit-locator-machine-"));
  try {
    const cli = await machinePackage(machine, "cli-only", {
      version: "1.2.3",
      type: "module",
      bin: { tool: "./bin/tool.mjs" },
    }, { "bin/tool.mjs": "export {};\n" });
    const resource = await machinePackage(machine, "resource-only", {
      version: "2.3.4",
    }, { "files/value.txt": "value\n" });
    const fromDistribution = join(distribution, "packages", "provider", "activation.mjs");
    const options = {
      from: fromDistribution,
      distributionRoots: [distribution],
      externalRoots: [machine],
    } as const;

    const canonicalCli = await realpath(cli);
    const canonicalResource = await realpath(resource);
    assert.equal(locateNodePackage("cli-only", options).root, canonicalCli);
    assert.equal(resolveNodePackageExecutable("cli-only", "tool", options), join(canonicalCli, "bin", "tool.mjs"));
    assert.equal(resolveNodePackageResource("resource-only", "files/value.txt", options), join(canonicalResource, "files", "value.txt"));
    assert.throws(() => locateNodePackage("resource-only", {
      ...options,
      from: join(project, "package.mjs"),
    }), /cannot locate installed package/u);
  } finally {
    await rm(distribution, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(machine, { recursive: true, force: true });
  }
});

test("machine npm fallback preserves ESM import conditions", async () => {
  const machine = await mkdtemp(join(tmpdir(), "hypit-esm-machine-"));
  try {
    await machinePackage(machine, "import-only", {
      version: "1.0.0",
      type: "module",
      exports: { ".": { import: "./index.mjs" } },
    }, { "index.mjs": "export const value = 42;\n" });
    installExternalPackageResolution([machine]);
    const specifier = "import-only";
    const imported = await import(specifier) as { readonly value?: unknown };
    assert.equal(imported.value, 42);
  } finally {
    await rm(machine, { recursive: true, force: true });
  }
});
