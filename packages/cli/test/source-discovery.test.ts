import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { digestOf, modulePackageAbi } from "@narratage/protocol";
import { createAuthorFrontendHostFacet } from "@narratage/elaborator";
import { createRunFrontendHostFacet, runFragmentHostAbi } from "@narratage/run";
import { sourceFrontendPackageAbi } from "@narratage/source";

import { discoverSourcePackages } from "../src/source-discovery.js";

test("third-party Frontends discover same-named ABI requirements through physical package bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-cli-third-party-discovery-"));
  try {
    await writeFile(join(root, "build.svrun"), `<?svml using="@logical/run@1"?>\nrun`, "utf8");
    await writeFile(join(root, "main.story"), `<?svml using="@logical/story@1"?>\nstory`, "utf8");
    await writeFile(join(root, "child.svml"), `<?svml using="@unknown/child@1"?>\nchild`, "utf8");
    const packages = [
      {
        specifier: "@physical/run-suite",
        contribution: { format: "svml.node-package@1" as const, hostFacets: [createRunFrontendHostFacet({
          id: "@logical/run@1",
          implementationDigest: digestOf("third-party-run"),
          discover: () => ({
            author: { source: "./main.story" },
            imports: [{ from: "@logical/shared@1", as: "preview" }],
          }),
          decode: () => { throw new Error("discovery must not decode Run Source"); },
        })] },
      },
      {
        specifier: "@physical/story-suite",
        contribution: { format: "svml.node-package@1" as const, hostFacets: [createAuthorFrontendHostFacet({
          id: "@logical/story@1",
          implementationDigest: digestOf("third-party-story"),
          discover: () => ({
            modules: ["@logical/shared@1"],
            sources: [{ from: "./child.svml", alias: "child" }],
          }),
          decode: () => { throw new Error("discovery must not decode Author Source"); },
        })] },
      },
      {
        specifier: "@physical/module-suite",
        contribution: { format: "svml.node-package@1" as const, modules: [{
          manifest: {
            format: "svml.module@1" as const,
            name: "@logical/shared",
            version: "1",
            dependencies: [], types: [], capabilities: [], producers: [],
          },
          specifiers: ["@logical/shared@1"],
        }] },
      },
      {
        specifier: "@physical/fragment-suite",
        contribution: { format: "svml.node-package@1" as const, hostFacets: [{
          abi: runFragmentHostAbi,
          offers: ["@logical/shared@1"],
          identity: { contract: "example.fragment@1" },
          implementation: {},
        }] },
      },
    ];
    const discovered = await discoverSourcePackages(join(root, "build.svrun"), {
      workspaceRoot: root,
      packages,
    });
    assert.deepEqual(discovered.selected, [
      "@physical/fragment-suite",
      "@physical/module-suite",
      "@physical/run-suite",
      "@physical/story-suite",
      "@unknown/child",
    ]);
    assert.deepEqual(discovered.logical, [
      { abi: modulePackageAbi, name: "@logical/shared@1" },
      { abi: runFragmentHostAbi, name: "@logical/shared@1" },
      { abi: sourceFrontendPackageAbi, name: "@logical/run@1" },
      { abi: sourceFrontendPackageAbi, name: "@logical/story@1" },
      { abi: sourceFrontendPackageAbi, name: "@unknown/child@1" },
    ].sort((left, right) => `${left.abi}\u0000${left.name}`.localeCompare(`${right.abi}\u0000${right.name}`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
