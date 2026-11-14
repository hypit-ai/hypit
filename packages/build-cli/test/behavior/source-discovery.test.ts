import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareCodeUnits } from "@hypit/protocol";
import { createModuleFacet, moduleFacetKind } from "@hypit/module";
import { createAuthorFrontendFacet } from "@hypit/generation-authoring/author";
import { sourceFrontendFacetKind } from "@hypit/generation-authoring/source";

import { discoverSourcePackages } from "../../src/source-discovery.js";

test("third-party Frontends discover same-named Facet requirements through physical package bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-third-party-discovery-"));
  try {
    await writeFile(join(root, "main.story"), `<?svml using="@logical/story"?>\nstory`, "utf8");
    await writeFile(join(root, "child.svml"), `<?svml using="@unknown/child"?>\nchild`, "utf8");
    const packages = [
      {
        specifier: "@physical/story-suite",
        contribution: { facets: [createAuthorFrontendFacet({
          id: "@logical/story",
          discover: () => ({
            modules: ["@logical/shared"],
            sources: [{ from: "./child.svml", alias: "child" }],
          }),
          decode: () => { throw new Error("discovery must not decode Author Source"); },
        })] },
      },
      {
        specifier: "@physical/module-suite",
        contribution: { facets: [createModuleFacet({
            name: "@logical/shared",
            dependencies: [{ name: "@logical/base" }],
            types: [],
        })] },
      },
      {
        specifier: "@physical/base-suite",
        contribution: { facets: [createModuleFacet({
          name: "@logical/base",
          dependencies: [], types: [],
        })] },
      },
    ];
    const discovered = await discoverSourcePackages(join(root, "main.story"), {
      workspaceRoot: root,
      packages,
    });
    assert.deepEqual(discovered.selected, [
      "@physical/base-suite",
      "@physical/module-suite",
      "@physical/story-suite",
      "@unknown/child",
    ]);
    assert.deepEqual(discovered.logical, [
      { kind: moduleFacetKind, name: "@logical/base" },
      { kind: moduleFacetKind, name: "@logical/shared" },
      { kind: sourceFrontendFacetKind, name: "@logical/story" },
      { kind: sourceFrontendFacetKind, name: "@unknown/child" },
    ].sort((left, right) => compareCodeUnits(
      JSON.stringify([left.kind, left.name]),
      JSON.stringify([right.kind, right.name]),
    )));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an in-root Source whose basename starts with .. is still inside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-dotdot-name-"));
  try {
    const source = join(root, "..keep.svml");
    await writeFile(source, `<?svml using="@logical/author"?>\nauthor`, "utf8");
    const discovered = await discoverSourcePackages(source, { workspaceRoot: root, packages: [] });
    assert.deepEqual(discovered.logical, [
      { kind: sourceFrontendFacetKind, name: "@logical/author" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
