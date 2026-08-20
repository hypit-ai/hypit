#!/usr/bin/env node
/**
 * Preview-check a reconstruction before it is delivered.
 *
 * `pnpm hypit check` proves a Source is legal; it proves nothing about whether
 * the tracks it declares can actually be built. A track that fails here fails
 * the same way when the author opens Studio, so find out now.
 *
 * Usage:  node --import tsx .agents/skills/hypit/scripts/preview-check.mjs <build.svrun> [<hypit.runtime.json>]
 * Exit:   0 when the graph is sound — either Studio opened and every Track
 *           resolved, or the only thing missing is Providers that have not run.
 *         1 when the graph itself is wrong, naming what refused and why.
 *
 * The argument is the Run Source, not the Author SVML. Studio's unit of work is
 * the Run — it reads the Author SVML back out of it — so a check that took the
 * `.svml` would be checking something Studio never opens.
 *
 * Studio names what it cannot resolve and stops, so preflight throwing is itself
 * the report rather than something to inspect around. Two kinds of issue come
 * back, and they mean opposite things. An unresolved *capability* means the
 * graph traced all the way to a Film and a semantic spine, and what remains is
 * work a Provider has to do — the ordinary state of a Source that declares its
 * generation rather than performing it. Every other issue means the graph is
 * wrong and no amount of generation will fix it. Only the second kind fails.
 * `StudioPreflightError` carries `issues` as an array so the two can be told
 * apart rather than matched out of one joined message.
 *
 * Run it from the repository root. `tsx` is the repository's own dependency, so
 * a working directory outside the repository fails to resolve it before this
 * script runs at all — the error names `tsx`, not the source being checked.
 */
import { dirname, resolve } from "node:path";

// The script lives under `.agents/`; resolve Studio from the repo root.
// Stay in URL space the whole way: a specifier built from a filesystem path is read as a URL, so
// on Windows the drive letter becomes a scheme and the import fails before it resolves anything.
const studio = (name) => new URL(`../../../../packages/studio/src/${name}`, import.meta.url).href;
const { openStudioArchive } = await import(studio("archive.js"));
const { loadStudioDomain } = await import(studio("domain.js"));
const { loadStudioRun } = await import(studio("run.js"));
const { readStudioSession } = await import(studio("session.js"));
const { inspectStudioRun } = await import(studio("studio-preflight.js"));

const runArgument = process.argv[2];
if (runArgument === undefined) {
  console.error("usage: preview-check.mjs <build.svrun> [<hypit.runtime.json>]");
  process.exit(2);
}
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const runPath = resolve(invokedFrom, runArgument);
const runtimeArgument = process.argv[3];
const runtimePath = runtimeArgument === undefined ? undefined : resolve(invokedFrom, runtimeArgument);
const packageRoot = resolve(invokedFrom);
const workspaceRoot = dirname(runPath);

const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
const archive = await openStudioArchive(runtimePath, packageRoot);
const AWAITING = "the Studio projection closure requires unresolved capabilities:";

let session;
let refusal;
let awaiting;
try {
  const run = await loadStudioRun({
    run: runPath,
    domain,
    ...(archive === undefined ? {} : { archive }),
  });
  // Preflight first, so an unopenable Run is reported as the refusal it is
  // rather than as whatever the build happens to fail on afterwards.
  inspectStudioRun(run.source, run);
  session = await readStudioSession({
    domain,
    run,
    ...(archive === undefined ? {} : { archive }),
    revision: 0,
  });
} catch (error) {
  const issues = Array.isArray(error?.issues) ? error.issues : undefined;
  if (issues !== undefined && issues.every((issue) => issue.startsWith(AWAITING))) {
    awaiting = issues.flatMap((issue) => issue.slice(AWAITING.length).split(",").map((c) => c.trim()));
  } else {
    refusal = error instanceof Error ? error.message : String(error);
  }
} finally {
  // Close before reporting: `process.exit` in a `try` skips the `finally`, and
  // a runtime archive left open outlives the check.
  await archive?.close();
}

if (refusal !== undefined) {
  console.log(JSON.stringify({ refused: refusal }, null, 2));
  process.exit(1);
}

if (awaiting !== undefined) {
  // The graph traced all the way to a Film and a semantic spine; what is left is
  // work a Provider has to do. That is a pass for this gate, and the delivery
  // measurements happen on the real Build either way.
  const noun = awaiting.length === 1 ? "capability" : "capabilities";
  console.log(`preview-check: the graph is sound, waiting on ${awaiting.length} ${noun}.`);
  for (const capability of awaiting) console.log(`  - ${capability}`);
  process.exit(0);
}

const problems = [];
for (const track of session.snapshot.tracks) {
  const { status, errors, output } = track.provenance;
  if (errors.length > 0) problems.push({ track: track.label, errors });
  else if (status === "unresolved") problems.push({ track: track.label, unresolved: output });
}

if (problems.length === 0) {
  console.log(`preview-check: every Track resolved (${session.snapshot.tracks.length}).`);
  process.exit(0);
}
for (const item of problems) console.log(JSON.stringify(item, null, 2));
process.exit(1);
