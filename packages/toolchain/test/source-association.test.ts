import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { svmlAuthorFrontendId } from "@hypit/svml";

import { createToolchainWorkspace } from "../src/compiler.js";

test("Toolchain Host associates untouched entry and imported bytes with canonical SVML", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-toolchain-source-"));
  try {
    const entryPath = join(root, "main.svml");
    const childPath = join(root, "kit.svml");
    const entryText = "// no bootstrap header\nsource kit from \"./kit.svml\"\n";
    const childText = "// package-owned declarations stay untouched\n";
    await writeFile(entryPath, entryText, "utf8");
    await writeFile(childPath, childText, "utf8");

    const session = await createToolchainWorkspace({ workspaceRoot: root }).open(entryPath);
    assert.equal(session.entry.frontend, svmlAuthorFrontendId);
    assert.equal(new TextDecoder().decode(session.entry.unit.bytes), entryText);

    const child = await session.resolveSource(session.entry.unit, { from: "./kit.svml", alias: "kit" });
    assert.equal(child.frontend, svmlAuthorFrontendId);
    assert.equal(new TextDecoder().decode(child.unit.bytes), childText);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
