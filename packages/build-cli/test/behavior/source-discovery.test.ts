import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareCodeUnits, modulePackageAbi } from "@hypit/protocol";
import { createAuthorFrontendFacet } from "@hypit/author";
import { sourceFrontendPackageAbi } from "@hypit/source";

import { discoverSourcePackages } from "../../src/source-discovery.js";

test("third-party Frontends discover same-named ABI requirements through physical package bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-third-party-discovery-"));
  try {
    await writeFile(join(root, "main.story"), `<?svml using="@logical/story@1"?>\nstory`, "utf8");
    await writeFile(join(root, "child.svml"), `<?svml using="@unknown/child@1"?>\nchild`, "utf8");
    const packages = [
      {
        specifier: "@physical/story-suite",
        contribution: { format: "hypit.package@1" as const, facets: [createAuthorFrontendFacet({
          id: "@logical/story@1",
          discover: () => ({
            modules: ["@logical/shared@1"],
            sources: [{ from: "./child.svml", alias: "child" }],
          }),
          decode: () => { throw new Error("discovery must not decode Author Source"); },
        })] },
      },
      {
        specifier: "@physical/module-suite",
        contribution: { format: "hypit.package@1" as const, modules: [{
          manifest: {
            format: "hypit.module@1" as const,
            name: "@logical/shared",
            version: "1",
            dependencies: [], types: [], capabilities: [], producers: [],
          },
          specifiers: ["@logical/shared@1"],
        }] },
      },
    ];
    const discovered = await discoverSourcePackages(join(root, "main.story"), {
      workspaceRoot: root,
      packages,
    });
    assert.deepEqual(discovered.selected, [
      "@physical/module-suite",
      "@physical/story-suite",
      "@unknown/child",
    ]);
    assert.deepEqual(discovered.logical, [
      { abi: modulePackageAbi, name: "@logical/shared@1" },
      { abi: sourceFrontendPackageAbi, name: "@logical/story@1" },
      { abi: sourceFrontendPackageAbi, name: "@unknown/child@1" },
    ].sort((left, right) => compareCodeUnits(
      JSON.stringify([left.abi, left.name]),
      JSON.stringify([right.abi, right.name]),
    )));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an in-root Source whose basename starts with .. is still inside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-dotdot-name-"));
  try {
    const source = join(root, "..keep.svml");
    await writeFile(source, `<?svml using="@logical/author@1"?>\nauthor`, "utf8");
    const discovered = await discoverSourcePackages(source, { workspaceRoot: root, packages: [] });
    assert.deepEqual(discovered.logical, [
      { abi: sourceFrontendPackageAbi, name: "@logical/author@1" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
