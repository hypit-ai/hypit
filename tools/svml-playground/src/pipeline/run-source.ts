/**
 * Apply a Run Source.
 *
 * Which material a Source is read with is an authoring decision, and a `.svrun`
 * is where it is written. The preview does not interpret that file: the Run
 * packages parse it, resolve its Candidates and overlay them on the compiled
 * graph, exactly as a build does. The only thing supplied here is how to read a
 * path, because that is the part a Host owns.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { NodeRunCompiler } from "@narratage/compiler-node";
import type { PlannedBuild } from "@narratage/compiler-node";
import type { Digest, StoredValue } from "@narratage/protocol";
import {
  compileRunSource, RunFragmentRegistry, RunFrontendRegistry, resolveRunDocument,
} from "@narratage/run";
import { runMarkupFrontend } from "@narratage/run-markup";

import { officialVideoDomain } from "../official-video.js";
import type { Archive } from "./archive.js";
import type { ServedFile } from "./compile.js";

/** Material a Run Source named that the preview could not read, and why. */
export type Refusal = { readonly output: string; readonly reason: string };

/** The parts of a resolved Run Source the preview overlays and extends. */
export type RunCompilation = {
  readonly graph: {
    readonly candidates: readonly unknown[];
    readonly operations: readonly unknown[];
    readonly satisfactions: readonly { readonly output: string; readonly candidate: string }[];
    readonly targets: readonly { readonly output: string }[];
  };
};

/** What the Run Source said, and how to build one target against it. */
export type RunPlan = {
  readonly run: RunCompilation;
  readonly refused: readonly Refusal[];
  /** Targets the author asked for, when the Run Source names any. */
  readonly targets: readonly string[];
  /** Plan a single target. A Track that will not build costs only itself. */
  readonly plan: (run: RunCompilation, targets: readonly string[]) => PlannedBuild;
};

function digestOfBytes(bytes: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function planner(
  compiled: unknown,
  source: string,
  authorSource: string,
): Promise<RunPlan["plan"]> {
  const domain = await officialVideoDomain();
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const compiler = new NodeRunCompiler({
    frontends, closure: domain.closure, validators: domain.validators,
  } as never);
  return (run, targets) => compiler.planCompilation({
    source,
    authorSource,
    author: { ...(compiled as object), attachments: [] },
    program: (compiled as { program: never }).program,
    run: { ...run, graph: { ...run.graph, targets: targets.map((output) => ({ output })) } },
    attachments: [],
  } as never);
}

/** A Source read on its own: no material bound and nothing satisfied. */
export async function emptyRun(entryPath: string, compiled: unknown): Promise<RunPlan> {
  return {
    run: { graph: { candidates: [], operations: [], satisfactions: [], targets: [] } },
    refused: [],
    targets: [],
    plan: await planner(compiled, entryPath, entryPath),
  };
}

/**
 * Resolve a Run Source against an already compiled Author Source. Files it
 * names are staged into `served` so the preview can hand the exact bytes to a
 * picture.
 */
export async function applyRunSource(input: {
  readonly runPath: string;
  readonly compiled: unknown;
  readonly served: Map<string, ServedFile>;
  /** Where already-produced material can be read, when the preview was given one. */
  readonly archive?: Archive;
}): Promise<RunPlan> {
  const refused: Refusal[] = [];
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);

  const text = readFileSync(input.runPath, "utf8");
  const { document, closure } = await compileRunSource(
    { id: input.runPath, name: input.runPath, text } as never,
    frontends,
  );

  // A Run Source usually names several things, and one of them being out of
  // reach says nothing about the rest. Drop only what cannot be read, so the
  // footage and timings the author did supply are still used.
  const reachable = { ...document } as {
    candidates: readonly { kind: string; id: string; build?: string }[];
    satisfactions: readonly { candidate: string }[];
  };
  const unreadable = new Set<string>();
  for (const declaration of reachable.candidates) {
    if (declaration.kind !== "build-record") continue;
    const held = await input.archive?.readBuild(declaration.build!);
    if (held !== undefined) continue;
    unreadable.add(declaration.id);
    refused.push({
      output: declaration.id,
      reason: input.archive === undefined
        ? `build ${declaration.build} holds this material; pass --runtime to read it.`
        : `build ${declaration.build} is not in this machine's archive.`,
    });
  }
  const named = unreadable.size === 0 ? document : {
    ...document,
    candidates: reachable.candidates.filter((item) => !unreadable.has(item.id)),
    satisfactions: reachable.satisfactions.filter((item) => !unreadable.has(item.candidate)),
  };

  const beside = (from: string): string => resolve(dirname(input.runPath), from);
  const run = await resolveRunDocument(named as never, {
    compilation: input.compiled as never,
    sourceClosure: closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue(from: string): StoredValue {
      return { kind: "inline", value: JSON.parse(readFileSync(beside(from), "utf8")) };
    },
    readFile(from: string, mediaType: string): StoredValue {
      const bytes = readFileSync(beside(from));
      const digest = digestOfBytes(bytes);
      input.served.set(digest, { mediaType, bytes });
      return { kind: "blob", digest, size: bytes.byteLength, mediaType };
    },
    // Only Builds already found reachable get this far.
    readBuild(id: string) {
      return input.archive?.readBuild(id);
    },
    resolveBuildOutput(id: string, output: string) {
      return input.archive?.resolveOutput(id, output) ?? output;
    },
  } as never);

  const resolved = run as unknown as RunCompilation;
  return {
    run: resolved,
    refused,
    // What the author asked to build. Honouring it is what lets a Source be
    // taken only as far as one produced thing.
    targets: resolved.graph.targets.map((target) => target.output),
    plan: await planner(
      input.compiled, input.runPath,
      (document as { author: { source: string } }).author.source,
    ),
  };
}
