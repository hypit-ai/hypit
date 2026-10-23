import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { decodeSourceText } from "@hypit/source";
import { WorkspaceError } from "@hypit/workspace";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

import {
  assetCompiler,
  memoryWorkspace,
  rawSourceAdapter,
  readAttachment,
} from "../compiler-scenario.js";

test("filesystem Workspace captures source text and asset identity once", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-source-host-"));
  const root = join(parent, "project");
  await mkdir(root);
  const entryPath = join(root, "main.svml");
  const includedPath = join(root, "included.svs");
  const outsidePath = join(parent, "outside.svs");
  const assetPath = join(root, "asset.bin");
  await writeFile(entryPath, "first", "utf8");
  await writeFile(includedPath, "included-first", "utf8");
  await writeFile(outsidePath, "outside", "utf8");
  await writeFile(assetPath, new Uint8Array([1, 2, 3]));
  const workspace = await new NodeFilesystemWorkspace({ root, sourceAdapter: rawSourceAdapter }).open(entryPath);
  const entry = workspace.entry;
  await writeFile(entryPath, "second", "utf8");
  assert.equal(decodeSourceText((await new NodeFilesystemWorkspace({ root, sourceAdapter: rawSourceAdapter }).open(entryPath)).entry.unit), "second");
  assert.equal(decodeSourceText(entry.unit), "first");
  assert.equal(await readFile(entryPath, "utf8"), "second");
  const sourceRequest = { from: "./included.svs", alias: "included" };
  const firstIncluded = await workspace.resolveSource(entry.unit, sourceRequest);
  await writeFile(includedPath, "included-second", "utf8");
  assert.deepEqual(await workspace.resolveSource(entry.unit, sourceRequest), firstIncluded);
  assert.equal(decodeSourceText(firstIncluded.unit), "included-first");
  const firstAsset = await workspace.resolveAsset(entry.unit, { from: "./asset.bin", mediaType: "application/octet-stream" });
  await writeFile(assetPath, new Uint8Array([4, 5, 6, 7]));
  const capturedAsset = await workspace.resolveAsset(entry.unit, { from: "./asset.bin", mediaType: "application/octet-stream" });
  assert.deepEqual(capturedAsset, firstAsset, "one Workspace keeps an asset edge bound to the first bytes read");
  const detached = await workspace.attachments();
  assert.deepEqual(await readAttachment(detached[0]), new Uint8Array([4, 5, 6, 7]),
    "attachment bytes are opened lazily; Runtime rejects them if they no longer match the captured identity");
  assert.equal((await workspace.attachments())[0]?.blob.resource, firstAsset.resource);
  await assert.rejects(
    async () => await workspace.resolveSource(entry.unit, {
      from: "../outside.svs",
      alias: "escaped",
    }),
    (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
  );
  await assert.rejects(
    async () => await workspace.resolveAsset(entry.unit, {
      from: "../outside.svs",
      mediaType: "application/octet-stream",
    }),
    (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_ASSET_OUTSIDE_ROOT",
  );
  await t.test("symlink escapes are rejected when the OS permits creating the link", async (t) => {
    try {
      await symlink(outsidePath, join(root, "escaped.svs"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || (code !== "EPERM" && code !== "EACCES")) throw error;
      t.skip("Windows does not grant file symlink creation permission");
      return;
    }
    await assert.rejects(
      async () => await workspace.resolveSource(entry.unit, {
        from: "./escaped.svs",
        alias: "escaped",
      }),
      (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
    );
    await assert.rejects(
      async () => await workspace.resolveAsset(entry.unit, {
        from: "./escaped.svs",
        mediaType: "application/octet-stream",
      }),
      (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_ASSET_OUTSIDE_ROOT",
    );
  });
});

test("an asset root widens bytes without widening Source imports", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-asset-root-"));
  const project = join(parent, "project");
  const library = join(parent, "library");
  await mkdir(project);
  await mkdir(library);
  const entryPath = join(project, "main.svml");
  const assetPath = join(library, "shared.bin");
  const sourcePath = join(library, "shared.svs");
  await writeFile(entryPath, "entry", "utf8");
  await writeFile(assetPath, new Uint8Array([2, 7, 1, 8]));
  await writeFile(sourcePath, "shared source", "utf8");
  const workspace = await new NodeFilesystemWorkspace({ root: project, assetRoots: [library], sourceAdapter: rawSourceAdapter }).open(entryPath);
  assert.equal((await workspace.resolveAsset(workspace.entry.unit, {
    from: "../library/shared.bin",
    mediaType: "application/octet-stream",
  })).size, 4);
  await assert.rejects(async () => await workspace.resolveSource(workspace.entry.unit, {
    from: "../library/shared.svs",
    alias: "shared",
  }), (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT");
});

test("a Host-resolved Source keeps relative imports inside its own read boundary", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-external-source-"));
  const project = join(parent, "project");
  const packageRoot = join(parent, "package");
  await mkdir(project);
  await mkdir(packageRoot);
  const entryPath = join(project, "main.svml");
  const kitPath = join(packageRoot, "kit.svs");
  const childPath = join(packageRoot, "child.svs");
  const outsidePath = join(parent, "outside.svs");
  await writeFile(entryPath, "entry", "utf8");
  await writeFile(kitPath, "kit", "utf8");
  await writeFile(childPath, "child", "utf8");
  await writeFile(outsidePath, "outside", "utf8");
  const workspace = await new NodeFilesystemWorkspace({
    root: project,
    sourceAdapter: rawSourceAdapter,
    externalSourceResolver(_importer, request) {
      assert.equal(request.from, "@acme/kits/example");
      return { root: packageRoot, source: kitPath };
    },
  }).open(entryPath);
  const kit = await workspace.resolveSource(workspace.entry.unit, {
    from: "@acme/kits/example",
    alias: "kit",
  });
  assert.equal(decodeSourceText((await workspace.resolveSource(kit.unit, { from: "./child.svs", alias: "child" })).unit), "child");
  await assert.rejects(
    async () => await workspace.resolveSource(kit.unit, { from: "../outside.svs", alias: "outside" }),
    (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
  );
});

test("filesystem and in-memory Workspaces load identical asset bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-workspace-equivalence-"));
  const file = join(root, "main.svml");
  const source = `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`;
  const bytes = new Uint8Array([3, 1, 4, 1, 5]);
  await writeFile(file, source, "utf8");
  await writeFile(join(root, "reference.bin"), bytes);

  const filesystem = await assetCompiler({ root }).compileEntry(file);
  const memory = await assetCompiler({ workspace: memoryWorkspace(source, bytes) }).compileEntry("memory:main");

  const memoryBlob = memory.attachments[0]?.blob;
  const filesystemBlob = filesystem.attachments[0]?.blob;
  assert.ok(memoryBlob?.resource);
  assert.ok(filesystemBlob?.resource);
  assert.notEqual(memoryBlob.resource, filesystemBlob.resource,
    "separate admissions keep separate resource identities even for equal bytes");
  assert.deepEqual(
    { size: memoryBlob.size, mediaType: memoryBlob.mediaType },
    { size: filesystemBlob.size, mediaType: filesystemBlob.mediaType },
  );
  assert.deepEqual(await readAttachment(memory.attachments[0]),
    await readAttachment(filesystem.attachments[0]));
});
