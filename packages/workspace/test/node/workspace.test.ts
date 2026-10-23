import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WorkspaceError } from "@hypit/workspace";
import { NodeFilesystemWorkspace } from "../../src/node/index.js";
import { decodeSourceText } from "@hypit/source";

const rawSourceAdapter = (unit: import("@hypit/source").SourceUnit) => ({ unit, frontend: "test.frontend@1" });

test("an in-root Source whose basename starts with .. is accepted", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-workspace-dotdot-name-"));
  const root = join(parent, "project");
  try {
    await mkdir(root);
    const entryPath = join(root, "..keep.svml");
    await writeFile(entryPath, "inside", "utf8");
    await writeFile(join(parent, "outside.svs"), "outside", "utf8");
    const session = await new NodeFilesystemWorkspace({ root, sourceAdapter: rawSourceAdapter }).open(entryPath);
    assert.equal(decodeSourceText(session.entry.unit), "inside");
    await assert.rejects(
      async () => await session.resolveSource(session.entry.unit, { from: "../outside.svs", alias: "escaped" }),
      (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
    );
    await symlink(parent, join(root, "..linked"), "junction");
    await assert.rejects(
      async () => await session.resolveSource(session.entry.unit, { from: "./..linked/outside.svs", alias: "linked" }),
      (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a Host-resolved package asset stays inside the resolver's explicit root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-workspace-package-asset-"));
  const project = join(parent, "project");
  const installed = join(parent, "installed-font");
  try {
    await mkdir(project);
    await mkdir(join(installed, "files"), { recursive: true });
    const entryPath = join(project, "main.svml");
    const fontPath = join(installed, "files", "brand.woff2");
    await writeFile(entryPath, "source", "utf8");
    await writeFile(fontPath, "font bytes", "utf8");
    const session = await new NodeFilesystemWorkspace({
      root: project,
      sourceAdapter: rawSourceAdapter,
      externalAssetResolver(_importer, request) {
        assert.equal(request.from, "package:@acme/brand-fonts/files/brand.woff2");
        return { root: installed, asset: fontPath };
      },
    }).open(entryPath);
    const resolved = await session.resolveAsset(session.entry.unit, {
      from: "package:@acme/brand-fonts/files/brand.woff2",
      mediaType: "font/woff2",
    });
    assert.equal(resolved.mediaType, "font/woff2");
    assert.equal((await session.attachments()).length, 1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
