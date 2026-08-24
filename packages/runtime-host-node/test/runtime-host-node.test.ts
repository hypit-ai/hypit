import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  diagnoseRuntimeExecutable,
  hypitHostPackageRoot,
  parseRegistryPackageSpec,
  prepareHostPackages,
  resolveRuntimeExecutable,
} from "@hypit/runtime-host-node";

test("configured executable paths are rooted at the Runtime Profile project", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-host-node-"));
  try {
    const path = join(root, "tools", "fixture");
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(path, "#!/bin/sh\n", "utf8");
    await chmod(path, 0o755);
    assert.equal(resolveRuntimeExecutable(root, "./tools/fixture"), path);
    assert.deepEqual(await diagnoseRuntimeExecutable({
      root,
      configured: "./tools/fixture",
      fallback: "unused",
      subject: "fixture",
    }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("machine packages are exact npm packages reused from one Host root", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-machine-packages-"));
  try {
    const packageRoot = hypitHostPackageRoot(root);
    await mkdir(join(packageRoot, "node_modules", "hyperframes"), { recursive: true });
    await writeFile(join(packageRoot, "node_modules", "hyperframes", "package.json"), JSON.stringify({
      name: "hyperframes",
      version: "0.7.101",
    }));
    assert.deepEqual(parseRegistryPackageSpec("hyperframes@0.7.101"), {
      name: "hyperframes",
      version: "0.7.101",
      specifier: "hyperframes@0.7.101",
    });
    assert.throws(() => parseRegistryPackageSpec("@hypit/seedance@1.0.0"), /external npm registry package/u);
    const reports = await prepareHostPackages(["hyperframes@0.7.101"], { root: packageRoot });
    assert.equal(reports[0]?.action, "already-installed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
