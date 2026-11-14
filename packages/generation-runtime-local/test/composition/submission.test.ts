import { fileExecutionLogs } from "../../src/log.js";
import { readExecutionLog } from "@hypit/generation-runtime";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { FileResourceStore } from "@hypit/resource-store/node";
import { FileBuildFinalizationStore } from "../../src/result-storage/index.js";
import { EnvironmentCredentialStore } from "./environment-credential-store.js";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalRuntime } from "@hypit/generation-runtime-local";
import { resolveProjectRoot } from "@hypit/project/node";
import { NodeFilesystemWorkspace } from "@hypit/generation-authoring/workspace/node";
import { defineBuild, link } from "@hypit/generation-build";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { buildExecutionActivity } from "@hypit/generation-runtime-local";
import type { BuildCompletion } from "@hypit/generation-runtime-local";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";

import {
  createGreetingBuild,
  createGreetingBuildFixture,
  createParallelGreetingBuild,
  manifest as greetingManifest,
  producers,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  projectRuntimeFixture,
  publicationStoreLocation,
  runFixture,
} from "./local-scenario.js";

test("a project directory alias accepts its Source and stores a project-relative Result path", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "hypit-local-project-alias-")));
  try {
    const directory = join(parent, "project");
    const alias = join(parent, "shortcut");
    await mkdir(directory);
    await writeFile(join(directory, "main.svml"), "source");
    await writeFile(join(parent, "outside.svs"), "outside");
    await symlink(directory, alias, "junction");
    await symlink(parent, join(directory, "escape"), "junction");
    const root = await resolveProjectRoot({ projectRoot: alias });
    const session = await new NodeFilesystemWorkspace({
      root,
      sourceAdapter: (unit) => ({ unit, frontend: "test.frontend" }),
    }).open(join(alias, "main.svml"));
    await assert.rejects(async () => await session.resolveSource(session.entry.unit, { from: "./escape/outside.svs", alias: "outside" }),
      { code: "SOURCE_OUTSIDE_ROOT" });
    const runtime = await createLocalRuntime(projectRuntimeFixture(directory));
    try {
      const request = durableBuildRequest(root, "bld_20260916T150000000Z_0000000001", createGreetingBuildFixture());
      await runtime.build({ ...request, authoring: {
        ...request.authoring,
        sourcePath: session.sourceLocation?.(session.entry.unit) ?? session.entry.unit.id,
      } });
      const result = await new FileBuildFinalizationStore(join(directory, "results"), join(directory, "products"))
        .readStored(request.id);
      assert.equal(result?.sourcePath, "main.svml");
    } finally { await runtime.close(); }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

