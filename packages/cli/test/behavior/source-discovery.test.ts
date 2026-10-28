import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareCodeUnits, modulePackageAbi } from "@hypit/protocol";
import { createAuthorFrontendFacet } from "@hypit/author";
import { createInvocationFrontendFacet } from "@hypit/invocation";
import { sourceFrontendPackageAbi } from "@hypit/source";

import { discoverSourcePackages } from "../../src/source-discovery.js";

test("third-party Frontends discover same-named ABI requirements through physical package bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-third-party-discovery-"));
  try {
    await writeFile(join(root, "build.svrun"), `<?svml using="@logical/invocation@1"?>\ninvocation`, "utf8");
    await writeFile(join(root, "main.story"), `<?svml using="@logical/story@1"?>\nstory`, "utf8");
    await writeFile(join(root, "child.svml"), `<?svml using="@unknown/child@1"?>\nchild`, "utf8");
    const packages = [
      {
        specifier: "@physical/invocation-suite",
        contribution: { format: "hypit.package@1" as const, facets: [createInvocationFrontendFacet({
          id: "@logical/invocation@1",
          discover: () => ({ author: { source: "./main.story" } }),
          decode: () => { throw new Error("discovery must not decode Invocation Source"); },
        })] },
      },
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
    const discovered = await discoverSourcePackages(join(root, "build.svrun"), {
      workspaceRoot: root,
      packages,
    });
    assert.deepEqual(discovered.selected, [
      "@physical/invocation-suite",
      "@physical/module-suite",
      "@physical/story-suite",
      "@unknown/child",
    ]);
    assert.deepEqual(discovered.logical, [
      { abi: modulePackageAbi, name: "@logical/shared@1" },
      { abi: sourceFrontendPackageAbi, name: "@logical/invocation@1" },
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
    const source = join(root, "..keep.svrun");
    await writeFile(source, `<?svml using="@logical/invocation@1"?>\ninvocation`, "utf8");
    const discovered = await discoverSourcePackages(source, { workspaceRoot: root, packages: [] });
    assert.deepEqual(discovered.logical, [
      { abi: sourceFrontendPackageAbi, name: "@logical/invocation@1" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
