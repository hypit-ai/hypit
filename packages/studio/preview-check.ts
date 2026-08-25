#!/usr/bin/env node
import { dirname, resolve } from "node:path";

import { videoCliDistribution } from "@hypit/video-cli";

import { openStudioArchive } from "./src/archive.js";
import { loadStudioCompanionRegistry } from "./src/companion-profile.js";
import { loadStudioDomain } from "./src/domain.js";
import { loadStudioRun } from "./src/run.js";
import { readStudioSession } from "./src/session.js";
import { inspectStudioRun } from "./src/studio-preflight.js";

const runArgument = process.argv[2];
if (runArgument === undefined) {
  process.stderr.write("usage: hypit-preview-check <build.svrun> [<hypit.runtime.json>]\n");
  process.exitCode = 2;
} else {
  const invokedFrom = process.env.INIT_CWD ?? process.cwd();
  const runPath = resolve(invokedFrom, runArgument);
  const runtimeArgument = process.argv[3];
  const runtimePath = runtimeArgument === undefined ? undefined : resolve(invokedFrom, runtimeArgument);
  const workspaceRoot = dirname(runPath);
  const packageRoot = workspaceRoot;
  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");

  const registry = await loadStudioCompanionRegistry({ workspaceRoot, packageRoot, distributionPackageRoot });
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
  const archive = await openStudioArchive(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);
  const awaitingPrefix = "the Studio projection closure requires unresolved capabilities:";

  let session: Awaited<ReturnType<typeof readStudioSession>> | undefined;
  let refusal: string | undefined;
  let awaiting: string[] | undefined;
  try {
    const run = await loadStudioRun({
      run: runPath,
      domain,
      registry,
      ...(archive === undefined ? {} : { archive }),
    });
    inspectStudioRun(registry, run.source, run);
    session = await readStudioSession({
      domain,
      registry,
      run,
      workspaceRoot,
      ...(archive === undefined ? {} : { archive }),
      revision: 0,
    });
  } catch (error) {
    const issues = (error as { readonly issues?: unknown }).issues;
    if (Array.isArray(issues)
      && issues.every((issue): issue is string => typeof issue === "string" && issue.startsWith(awaitingPrefix))) {
      awaiting = issues.flatMap((issue) => issue.slice(awaitingPrefix.length).split(",").map((item) => item.trim()));
    } else {
      refusal = error instanceof Error ? error.message : String(error);
    }
  } finally {
    await archive?.close();
  }

  if (refusal !== undefined) {
    process.stdout.write(`${JSON.stringify({ refused: refusal }, null, 2)}\n`);
    process.exitCode = 1;
  } else if (awaiting !== undefined) {
    const noun = awaiting.length === 1 ? "capability" : "capabilities";
    process.stdout.write(`preview-check: the graph is sound, waiting on ${awaiting.length} ${noun}.\n`);
    for (const capability of awaiting) process.stdout.write(`  - ${capability}\n`);
  } else if (session !== undefined) {
    const problems: Array<Record<string, unknown>> = [];
    for (const track of session.snapshot.tracks) {
      const { status, errors, output } = track.provenance;
      if (errors.length > 0) problems.push({ track: track.label, errors });
      else if (status === "unresolved") problems.push({ track: track.label, unresolved: output });
    }
    if (problems.length === 0) {
      process.stdout.write(`preview-check: every Track resolved (${session.snapshot.tracks.length}).\n`);
    } else {
      for (const item of problems) process.stdout.write(`${JSON.stringify(item, null, 2)}\n`);
      process.exitCode = 1;
    }
  }
}
