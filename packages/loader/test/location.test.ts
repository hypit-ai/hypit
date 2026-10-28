import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  locateNodePackage,
  resolveNodePackageExecutable,
  resolveNodePackageModule,
  resolveNodePackageResource,
  resolveNodePackageResourceSpecifier,
  resolveNodePackageSource,
} from "@hypit/loader/node";

async function installedPackage(
  owner: string,
  name: string,
  manifest: Readonly<Record<string, unknown>>,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = join(owner, "node_modules", ...name.split("/"));
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
  try {
    const cli = await installedPackage(distribution, "cli-only", {
      version: "1.2.3",
      type: "module",
      bin: { tool: "./bin/tool.mjs" },
    }, { "bin/tool.mjs": "export {};\n" });
    const resource = await installedPackage(distribution, "resource-only", {
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
    } as const;

    const canonicalCli = await realpath(cli);
    const canonicalResource = await realpath(resource);
    assert.equal(locateNodePackage("cli-only", options).root, canonicalCli);
    assert.equal(resolveNodePackageExecutable("cli-only", "tool", options), join(canonicalCli, "bin", "tool.mjs"));
    assert.throws(
      () => resolveNodePackageExecutable("cli-only", "toString", options),
      /does not declare executable toString/u,
    );
    assert.equal(resolveNodePackageResource("resource-only", "files/value.txt", options), join(canonicalResource, "files", "value.txt"));
    assert.throws(() => locateNodePackage("resource-only", {
      from: join(project, "package.mjs"),
    }), /cannot locate installed package/u);
  } finally {
    await rm(distribution, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("package Source resolution reads one public export without activating package code", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-package-source-project-"));
  try {
    const root = await installedPackage(project, "@acme/image-kits", {
      version: "1.2.3",
      type: "module",
      exports: {
        ".": "./activation-that-must-not-run.mjs",
        "./phone-ugc-v1": "./kits/phone-ugc-v1.svs",
      },
      hypit: { activation: "./activation-that-must-not-run.mjs" },
    }, {
      "activation-that-must-not-run.mjs": "throw new Error('activation ran');\n",
      "kits/phone-ugc-v1.svs": "<?svml using=\"@hypit/recipe@1\"?>\n<sheet version=\"1\"/>\n",
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

test("package module resolution follows an explicit conditional import export", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-package-module-project-"));
  try {
    const root = await installedPackage(project, "@acme/commands", {
      version: "1.2.3",
      type: "module",
      exports: { "./cli": { types: "./cli.d.ts", import: "./cli.mjs" } },
    }, {
      "cli.d.ts": "export {};\n",
      "cli.mjs": "export const cliCommandModules = [];\n",
    });
    const canonical = await realpath(root);
    assert.deepEqual(resolveNodePackageModule("@acme/commands/cli", {
      from: join(project, "package.json"),
    }), {
      specifier: "@acme/commands/cli",
      package: "@acme/commands",
      root: canonical,
      module: join(canonical, "cli.mjs"),
    });
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("package asset locators resolve one contained file without importing package code", async () => {
  const project = await mkdtemp(join(tmpdir(), "hypit-package-asset-project-"));
  try {
    const root = await installedPackage(project, "@acme/brand-fonts", {
      version: "1.0.0",
      exports: ".",
    }, {
      "files/brand.woff2": "font bytes",
      "index.js": "throw new Error('package code ran');\n",
    });
    const located = resolveNodePackageResourceSpecifier(
      "package:@acme/brand-fonts/files/brand.woff2",
      { from: join(project, "main.svml") },
    );
    assert.deepEqual(located, {
      specifier: "package:@acme/brand-fonts/files/brand.woff2",
      package: "@acme/brand-fonts",
      root: await realpath(root),
      resource: join(await realpath(root), "files", "brand.woff2"),
    });
    assert.throws(
      () => resolveNodePackageResourceSpecifier("package:@acme/brand-fonts/../outside", {
        from: join(project, "main.svml"),
      }),
      /invalid package Source export path/u,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
