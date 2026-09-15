import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  installExternalPackageResolution,
  externalPackageInstallRoot,
  locateNodePackage,
  resolveNodePackageExecutable,
  resolveNodePackageResource,
  resolveNodePackageSource,
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
    const cli = await machinePackage(externalPackageInstallRoot(machine, "cli-only", "1.2.3"), "cli-only", {
      version: "1.2.3",
      type: "module",
      bin: { tool: "./bin/tool.mjs" },
    }, { "bin/tool.mjs": "export {};\n" });
    const resource = await machinePackage(externalPackageInstallRoot(machine, "resource-only", "2.3.4"), "resource-only", {
      version: "2.3.4",
    }, { "files/value.txt": "value\n" });
    const fromDistribution = join(distribution, "packages", "provider", "activation.mjs");
    await mkdir(join(fromDistribution, ".."), { recursive: true });
    await writeFile(join(fromDistribution, "..", "package.json"), JSON.stringify({
      dependencies: { "cli-only": "1.2.3", "resource-only": "2.3.4" },
    }));
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

test("machine npm fallback preserves ESM conditions and each importing package's version", async () => {
  const machine = await mkdtemp(join(tmpdir(), "hypit-esm-machine-"));
  try {
    for (const [version, value] of [["1.0.0", 42], ["2.0.0", 84]] as const) {
      await machinePackage(externalPackageInstallRoot(machine, "import-only", version), "import-only", {
        version, type: "module", exports: { ".": { import: "./index.mjs" } },
      }, { "index.mjs": `export const value = ${value};\n` });
      const consumer = join(machine, `consumer-${version}`);
      await mkdir(consumer);
      await writeFile(join(consumer, "package.json"), JSON.stringify({ dependencies: { "import-only": version } }));
      await writeFile(join(consumer, "entry.mjs"), 'export { value } from "import-only";\n');
    }
    installExternalPackageResolution([machine]);
    const first = await import(pathToFileURL(join(machine, "consumer-1.0.0", "entry.mjs")).href);
    const second = await import(pathToFileURL(join(machine, "consumer-2.0.0", "entry.mjs")).href);
    assert.equal(first.value, 42);
    assert.equal(second.value, 84);
  } finally { await rm(machine, { recursive: true, force: true }); }
});

test("package Source resolution reads one public export without activating package code", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-package-source-project-"));
  try {
    const root = await machinePackage(project, "@acme/image-kits", {
      version: "1.2.3",
      type: "module",
      exports: {
        ".": "./activation-that-must-not-run.mjs",
        "./phone-ugc-v1": "./kits/phone-ugc-v1.svs",
      },
      hypit: { activation: "./activation-that-must-not-run.mjs" },
    }, {
      "activation-that-must-not-run.mjs": "throw new Error('activation ran');\n",
      "kits/phone-ugc-v1.svs": "<?svml using=\"@hypit/svs@1\"?>\n<sheet version=\"1\"/>\n",
    });
    const options = { from: join(project, "main.svml") } as const;
    assert.deepEqual(resolveNodePackageSource("@acme/image-kits/phone-ugc-v1", options), {
      specifier: "@acme/image-kits/phone-ugc-v1",
      package: "@acme/image-kits",
      root: await realpath(root),
      source: join(await realpath(root), "kits", "phone-ugc-v1.svs"),
    });
    assert.throws(
      () => resolveNodePackageSource("@acme/image-kits/private", options),
      /does not export Source/u,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("a machine npm fallback resolves an upstream asset the importer declares optionally", async () => {
  const distribution = await mkdtemp(join(tmpdir(), "hypit-optional-distribution-"));
  const machine = await mkdtemp(join(tmpdir(), "hypit-optional-machine-"));
  try {
    const asset = await machinePackage(
      externalPackageInstallRoot(machine, "optional-only", "3.2.1"), "optional-only",
      { version: "3.2.1" }, { "files/asset.css": "/* asset */\n" });
    const importer = join(distribution, "packages", "fonts", "surface.mjs");
    await mkdir(join(importer, ".."), { recursive: true });
    // `hypit packages install <name>@<version>` tells the author to install exactly this asset, so
    // the version selection must read the same declaration the install was addressed to.
    await writeFile(join(importer, "..", "package.json"), JSON.stringify({
      optionalDependencies: { "optional-only": "3.2.1" },
    }));
    const options = {
      from: importer,
      distributionRoots: [distribution],
      externalRoots: [machine],
    } as const;

    const canonical = await realpath(asset);
    assert.equal(locateNodePackage("optional-only", options).root, canonical);
    assert.equal(
      resolveNodePackageResource("optional-only", "files/asset.css", options),
      join(canonical, "files", "asset.css"),
    );
  } finally {
    await rm(distribution, { recursive: true, force: true });
    await rm(machine, { recursive: true, force: true });
  }
});
