import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { LocalRuntime } from "@svml/local";
import { isDigest } from "@svml/protocol";
import {
  createNodePackageLock,
  loadNodePackageSet,
  writeNodePackageLock,
} from "@svml/package-loader-node";

import { createOfficialNodeCompiler } from "./host.js";

type CliIo = {
  readonly write: (text: string) => void;
};

type ParsedArgs = {
  readonly command: string | undefined;
  readonly file: string | undefined;
  readonly root: string | undefined;
  readonly targets: readonly string[];
  readonly substitute: boolean;
  readonly runtime: string | undefined;
  readonly buildId: string | undefined;
  readonly follow: boolean;
  readonly maxWaitMs: number | undefined;
  readonly packageLock: string | undefined;
  readonly packages: readonly string[];
  readonly out: string | undefined;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, file, ...rest] = argv;
  const targets: string[] = [];
  let root: string | undefined;
  let runtime: string | undefined;
  let buildId: string | undefined;
  let follow = false;
  let maxWaitMs: number | undefined;
  let packageLock: string | undefined;
  const packages: string[] = [];
  let substitute = false;
  let out: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--target") {
      const target = rest[index + 1];
      if (target === undefined || target.startsWith("--")) throw new Error("--target requires an export name");
      targets.push(target);
      index += 1;
      continue;
    }
    if (item === "--root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--root requires a directory");
      root = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--package-lock") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--package-lock requires a lock file");
      packageLock = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--package") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--package requires an installed package name");
      packages.push(value);
      index += 1;
      continue;
    }
    if (item === "--accept-substitute") {
      substitute = true;
      continue;
    }
    if (item === "--runtime") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--runtime requires a trusted config module");
      runtime = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--out") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--out requires a file path");
      out = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--build-id") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--build-id requires a stable identity");
      buildId = value;
      index += 1;
      continue;
    }
    if (item === "--follow") {
      follow = true;
      continue;
    }
    if (item === "--max-wait-ms") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--max-wait-ms requires milliseconds");
      maxWaitMs = Number(value);
      if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0) {
        throw new Error("--max-wait-ms must be a non-negative safe integer");
      }
      index += 1;
      continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return {
    command,
    file,
    root,
    targets,
    substitute,
    runtime,
    buildId,
    follow,
    maxWaitMs,
    packageLock,
    packages,
    out,
  };
}

function usage(): string {
  return [
    "usage:",
    "  svml-v2 lock-packages <svml.packages.lock> --package installed-name [--package installed-name] [--root directory]",
    "  svml-v2 check <file.svml> [--package-lock file] [--root directory]",
    "  svml-v2 plan <file.svml> --target export [--target export] [--accept-substitute] [--package-lock file]",
    "  svml-v2 build <file.svml> --target export --runtime ./svml.runtime.ts [--package-lock file] [--follow] [--out video.mp4]",
    "  svml-v2 status <build-id> --runtime ./svml.runtime.ts",
    "  svml-v2 cancel <build-id> --runtime ./svml.runtime.ts",
  ].join("\n");
}

function isLocalRuntime(value: unknown): value is LocalRuntime {
  return typeof value === "object"
    && value !== null
    && "build" in value
    && typeof value.build === "function"
    && "readArtifact" in value
    && typeof value.readArtifact === "function"
    && "close" in value
    && typeof value.close === "function";
}

async function loadLocalRuntime(path: string): Promise<LocalRuntime> {
  // A Runtime config is trusted executable deployment code, never an Author Frontend or .svml import.
  const imported = await import(pathToFileURL(path).href) as {
    readonly default?: unknown;
    readonly runtime?: unknown;
  };
  let candidate = imported.default ?? imported.runtime;
  if (typeof candidate === "function") candidate = await candidate();
  else candidate = await candidate;
  if (!isLocalRuntime(candidate)) {
    throw new Error(`Runtime config ${path} must export a LocalRuntime or a function that creates one`);
  }
  return candidate;
}

export async function materializeSingleGoal(
  runtime: Pick<LocalRuntime, "readArtifact">,
  built: Awaited<ReturnType<LocalRuntime["build"]>>,
  output: string,
): Promise<{ readonly path: string; readonly digest: string; readonly size: number }> {
  if (built.status !== "complete") throw new Error("--out requires a completed Build");
  if (built.state.plan.goals.length !== 1) throw new Error("--out requires exactly one target");
  const goal = built.state.plan.goals[0]!;
  const record = built.state.records.find((item) => item.id === goal.record);
  const value = record?.value.kind === "inline" ? record.value.value : undefined;
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("--out target is not a materializable media Artifact");
  }
  const artifact = value as Readonly<Record<string, unknown>>;
  const digest = artifact.digest;
  const size = artifact.size;
  if (typeof digest !== "string" || !isDigest(digest) || typeof size !== "number" || !Number.isSafeInteger(size)) {
    throw new Error("--out target has no valid Artifact identity");
  }
  const bytes = await runtime.readArtifact(digest);
  if (bytes === undefined) throw new Error(`Artifact ${digest} is absent from the selected ArtifactStore`);
  if (bytes.byteLength !== size) throw new Error(`Artifact ${digest} size differs from its target Record`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  return { path: output, digest, size };
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<void> {
  const args = parseArgs(argv);
  if (args.file === undefined
    || (args.command !== "lock-packages" && args.command !== "check" && args.command !== "plan" && args.command !== "build"
      && args.command !== "status" && args.command !== "cancel")) {
    throw new Error(usage());
  }
  if (args.command === "lock-packages") {
    if (args.packages.length === 0) throw new Error("lock-packages requires at least one --package");
    if (args.packageLock !== undefined) throw new Error("lock-packages does not accept --package-lock");
    const output = resolve(args.file);
    const root = args.root ?? dirname(output);
    const lock = await createNodePackageLock(args.packages, root);
    await writeNodePackageLock(output, lock);
    io.write(`${JSON.stringify({ ok: true, packageLock: output, digest: lock.digest, packages: lock.packages }, null, 2)}\n`);
    return;
  }
  if (args.out !== undefined && args.command !== "build") throw new Error("--out is only valid for build");
  if (args.command === "status" || args.command === "cancel") {
    if (args.runtime === undefined) throw new Error(`${args.command} requires --runtime`);
    const runtime = await loadLocalRuntime(args.runtime);
    try {
      if (args.command === "status") {
        const status = await runtime.status(args.file);
        io.write(`${JSON.stringify({
          build: status.build === undefined ? undefined : {
            id: status.build.build,
            revision: status.build.revision,
            core: status.build.state.id,
            status: status.build.state.status,
            diagnostics: status.build.state.diagnostics,
          },
          operations: status.operations.map((operation) => ({
            id: operation.id,
            command: operation.command,
            endpoint: operation.endpoint,
            attempt: operation.attempt,
            status: operation.status,
            ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
            ...(operation.failure === undefined ? {} : { failure: operation.failure }),
          })),
        }, null, 2)}\n`);
      } else {
        const result = await runtime.cancel(args.file);
        io.write(`${JSON.stringify({
          build: args.file,
          cancelled: result !== undefined,
          status: result?.status,
          diagnostics: result?.state.diagnostics ?? [],
        }, null, 2)}\n`);
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.packages.length > 0) throw new Error("--package is only valid for lock-packages");
  const activated = args.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(args.packageLock, args.root ?? dirname(args.packageLock));
  const compiler = createOfficialNodeCompiler({
    ...(args.root === undefined ? {} : { root: args.root }),
    ...(activated === undefined ? {} : { packages: activated.packages }),
  });
  if (args.command === "check") {
    const result = await compiler.compileFile(args.file);
    io.write(`${JSON.stringify({
      ok: true,
      sourceClosure: result.closure.id,
      moduleClosure: result.program.closure.digest,
      graph: result.elaboration.graph.id,
      units: result.closure.units.length,
      sourceAssets: result.attachments.map((item) => item.artifact),
      modules: result.program.closure.modules.map((item) => `${item.ref.name}@${item.ref.version}`),
      exports: result.exports.map((item) => ({ name: item.name, type: item.type, kind: item.ref.kind })),
    }, null, 2)}\n`);
    return;
  }
  const result = await compiler.planFile(args.file, {
    targets: args.targets,
    accepts: args.substitute ? "substitute" : "exact",
    ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
  });
  if (args.command === "build") {
    if (args.runtime === undefined) throw new Error("build requires --runtime with a trusted local config module");
    const runtime = await loadLocalRuntime(args.runtime);
    try {
      const built = await runtime.build({
        id: args.buildId ?? result.state.id,
        state: result.state,
        attachments: result.compilation.attachments,
      }, {
        follow: args.follow,
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      let materialized: { readonly path: string; readonly digest: string; readonly size: number } | undefined;
      if (args.out !== undefined) {
        materialized = await materializeSingleGoal(runtime, built, args.out);
      }
      io.write(`${JSON.stringify({
        build: built.id,
        core: built.state.id,
        status: built.status,
        goals: built.state.plan.goals.map((goal) => {
          const record = built.state.records.find((item) => item.id === goal.record);
          return {
            record: goal.record,
            type: goal.type,
            accepts: goal.accepts,
            ...(record === undefined ? {} : { digest: record.digest, value: record.value }),
          };
        }),
        blocked: built.blocked,
        journal: built.journal,
        ...(materialized === undefined ? {} : { output: materialized }),
      }, null, 2)}\n`);
    } finally {
      await runtime.close();
    }
    return;
  }
  io.write(`${JSON.stringify(result.plan, null, 2)}\n`);
}
