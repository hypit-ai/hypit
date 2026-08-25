#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { videoCliDistribution } from "@hypit/video-cli";

import { openStudioArchive } from "./src/archive.js";
import { loadStudioAdapterRegistry } from "./src/adapter-profile.js";
import { loadStudioDomain } from "./src/domain.js";
import { loadStudioRun } from "./src/run.js";
import { readStudioSession } from "./src/session.js";
import { inspectStudioRun } from "./src/studio-preflight.js";

/**
 * Where a Source's imports resolve from: the nearest directory at or above it holding a
 * `package.json`. This is the walk `hypit check` makes, and it is why a project is given a
 * `package.json` of its own — a project's `packages/local-*` are installed against the project, so a
 * root taken from anywhere else resolves none of them.
 *
 * The Run's own directory is not that root whenever the Run sits in a subdirectory, which is how one
 * command resolved a project's packages and this one did not.
 */
function nearestPackageRoot(start: string): string | undefined {
  let directory = resolve(start);
  while (true) {
    if (existsSync(join(directory, "package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

const flags = new Map<string, string>();
const operands: string[] = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]!;
  if (!token.startsWith("--")) { operands.push(token); continue; }
  const [name, inline] = token.slice(2).split(/=(.*)/su);
  const value = inline ?? process.argv[++index];
  if (value === undefined) { process.stderr.write(`--${name} needs a value\n`); process.exit(2); }
  flags.set(name!, value);
}

const runArgument = operands[0];
if (runArgument === undefined) {
  process.stderr.write("usage: hypit-preview-check <build.svrun> [<hypit.runtime.json>]"
    + " [--workspace <dir>] [--package-root <dir>]\n");
  process.exitCode = 2;
} else {
  const invokedFrom = process.cwd();
  const runPath = resolve(invokedFrom, runArgument);
  const runtimeArgument = operands[1];
  const runtimePath = runtimeArgument === undefined ? undefined : resolve(invokedFrom, runtimeArgument);
  const workspaceFlag = flags.get("workspace");
  const packageRootFlag = flags.get("package-root");
  const workspaceRoot = workspaceFlag === undefined ? dirname(runPath) : resolve(invokedFrom, workspaceFlag);
  const packageRoot = packageRootFlag === undefined
    ? nearestPackageRoot(dirname(runPath)) ?? workspaceRoot
    : resolve(invokedFrom, packageRootFlag);
  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");

  const registry = await loadStudioAdapterRegistry({ workspaceRoot, packageRoot, distributionPackageRoot });
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
