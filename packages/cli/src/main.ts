import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { LocalRuntime } from "@svml/local";
import {
  createBuildRecordCandidate,
  sealRealizationOverlay,
} from "@svml/realization";
import {
  createNodePackageLock,
  loadNodePackageSet,
  writeNodePackageLock,
} from "@svml/package-loader-node";

import { createOfficialNodeCompiler, officialNodePackages } from "./host.js";
import {
  collectArtifacts,
  findArchivedArtifact,
  inspectBuild,
  materializeArtifact,
  materializeRecord,
  selectArchivedRecord,
} from "./archive.js";
import { loadRunFile } from "./run-file.js";
import { createOfficialRuntimeFromConfig } from "./runtime-config.js";

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
  readonly record: string | undefined;
  readonly output: string | undefined;
  readonly artifact: string | undefined;
  readonly to: string | undefined;
  readonly pins: readonly { readonly output: string; readonly build: string }[];
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
  let record: string | undefined;
  let output: string | undefined;
  let artifact: string | undefined;
  let to: string | undefined;
  const pins: { output: string; build: string }[] = [];
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
      if (value === undefined || value.startsWith("--")) throw new Error("--runtime requires a Runtime Profile or trusted config module");
      runtime = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--out") {
      throw new Error("--out was removed: Build always archives accepted Records; use `get <build-id> --to <path>` for an optional copy");
    }
    if (item === "--record") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--record requires a Record id");
      record = value;
      index += 1;
      continue;
    }
    if (item === "--output") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--output requires a Logical Output id");
      output = value;
      index += 1;
      continue;
    }
    if (item === "--artifact") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--artifact requires a content digest");
      artifact = value;
      index += 1;
      continue;
    }
    if (item === "--to") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--to requires a file path");
      to = resolve(value);
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
    if (item === "--pin") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--pin requires output=build-id");
      const separator = value.indexOf("=");
      if (separator <= 0 || separator === value.length - 1) throw new Error("--pin requires output=build-id");
      pins.push({ output: value.slice(0, separator), build: value.slice(separator + 1) });
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
    record,
    output,
    artifact,
    to,
    pins,
  };
}

function usage(): string {
  return [
    "usage:",
    "  svml-v2 lock-packages <svml.packages.lock> --package installed-name [--package installed-name] [--root directory]",
    "  svml-v2 check <file.svml|file.svrun> [--runtime profile.json] [--package-lock file] [--root directory]",
    "  svml-v2 plan <file.svml> --target export [--target export] [--accept-substitute] [--package-lock file]",
    "  svml-v2 plan <file.svrun> [--runtime profile.json] [--package-lock file]",
    "  svml-v2 build <file.svml> --target export --runtime ./svml.runtime.ts [--pin output=prior-build --accept-substitute] [--follow]",
    "  svml-v2 build <file.svrun> --runtime profile.json [--follow]",
    "  svml-v2 status <build-id> --runtime profile.json|./svml.runtime.ts",
    "  svml-v2 inspect <build-id> --runtime profile.json|./svml.runtime.ts",
    "  svml-v2 get <build-id> --runtime profile.json|./svml.runtime.ts [--record record-id|--output logical-output-id|--artifact digest] [--to path]",
    "  svml-v2 cancel <build-id> --runtime profile.json|./svml.runtime.ts",
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
  if (extname(path) === ".json") return await createOfficialRuntimeFromConfig(path);
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

export async function runCli(argv: readonly string[], io: CliIo): Promise<void> {
  const args = parseArgs(argv);
  if (args.file === undefined
    || (args.command !== "lock-packages" && args.command !== "check" && args.command !== "plan" && args.command !== "build"
      && args.command !== "status" && args.command !== "inspect" && args.command !== "get" && args.command !== "cancel")) {
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
  if ((args.record !== undefined || args.output !== undefined || args.artifact !== undefined || args.to !== undefined)
    && args.command !== "get") {
    throw new Error("--record, --output, --artifact and --to are only valid for get");
  }
  if (args.pins.length > 0 && args.command !== "build") throw new Error("--pin is only valid for build");
  if (args.pins.length > 0 && !args.substitute) {
    throw new Error("--pin attaches substitute Candidates; add --accept-substitute");
  }
  if (args.command === "status" || args.command === "inspect" || args.command === "get" || args.command === "cancel") {
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
      } else if (args.command === "inspect") {
        const status = await runtime.status(args.file);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        io.write(`${JSON.stringify({
          build: status.build.build,
          revision: status.build.revision,
          archive: inspectBuild(status.build.state),
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
      } else if (args.command === "get") {
        const status = await runtime.status(args.file);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        if (args.artifact !== undefined && (args.record !== undefined || args.output !== undefined)) {
          throw new Error("get accepts one of --record, --output or --artifact");
        }
        if (args.artifact !== undefined) {
          const references = findArchivedArtifact(status.build.state, args.artifact);
          if (references.length === 0) throw new Error(`Build ${args.file} does not reference Artifact ${args.artifact}`);
          if (args.to === undefined) {
            io.write(`${JSON.stringify({ build: status.build.build, artifact: args.artifact, references }, null, 2)}\n`);
          } else {
            const [first] = references;
            if (first === undefined) throw new Error(`Build ${args.file} does not reference Artifact ${args.artifact}`);
            const materialized = await materializeArtifact(runtime, first, args.to, `Build ${args.file}`);
            io.write(`${JSON.stringify({
              build: status.build.build,
              artifact: args.artifact,
              references,
              materialized,
            }, null, 2)}\n`);
          }
          return;
        }
        const record = selectArchivedRecord(status.build.state, {
          ...(args.record === undefined ? {} : { record: args.record }),
          ...(args.output === undefined ? {} : { output: args.output }),
        });
        if (args.to === undefined) {
          io.write(`${JSON.stringify({
            build: status.build.build,
            revision: status.build.revision,
            record,
            artifacts: collectArtifacts(record.value.kind === "blob" ? record.value : record.value.value),
          }, null, 2)}\n`);
        } else {
          const materialized = await materializeRecord(runtime, record, args.to);
          io.write(`${JSON.stringify({
            build: status.build.build,
            record: record.id,
            materialized,
          }, null, 2)}\n`);
        }
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
  const runMode = extname(args.file) === ".svrun";
  if (runMode && (args.targets.length > 0 || args.substitute || args.pins.length > 0)) {
    throw new Error(".svrun owns Targets, Candidate selections and fidelity; do not combine it with --target, --pin or --accept-substitute");
  }
  const activated = args.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(args.packageLock, args.root ?? dirname(args.packageLock));
  const packages = officialNodePackages(activated?.packages);
  const compiler = createOfficialNodeCompiler({
    ...(args.root === undefined ? {} : { root: args.root }),
    packages,
  });
  if (args.command === "check") {
    let runtime: LocalRuntime | undefined;
    try {
      runtime = args.runtime === undefined ? undefined : await loadLocalRuntime(args.runtime);
      if (runMode) {
        const loaded = await loadRunFile({
          path: args.file,
          compiler,
          packages,
          ...(runtime === undefined ? {} : { runtime }),
        });
        const planned = compiler.planCompilation(loaded.compilation, {
          targets: loaded.run.targets,
          satisfactions: loaded.run.satisfactions,
          realizations: loaded.run.graphs,
          ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
        });
        io.write(`${JSON.stringify({
          ok: true,
          run: loaded.path,
          source: loaded.source,
          sourceClosure: loaded.compilation.closure.id,
          graph: planned.request.graph,
          targetSet: loaded.document.selectedTargets,
          targets: loaded.run.targets,
          candidates: loaded.run.candidates,
          satisfactions: loaded.run.satisfactions,
          steps: planned.plan.steps.length,
        }, null, 2)}\n`);
        return;
      }
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
    } finally {
      await runtime?.close();
    }
  }
  if (args.command === "build") {
    if (args.runtime === undefined) throw new Error("build requires --runtime with a Runtime Profile or trusted local config module");
    const runtime = await loadLocalRuntime(args.runtime);
    try {
      const planOptions = {
        targets: args.targets,
        accepts: args.substitute ? "substitute" as const : "exact" as const,
        ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
      };
      let pinSummary: readonly { readonly output: string; readonly build: string; readonly candidate: string }[] = [];
      const loadedRun = runMode
        ? await loadRunFile({ path: args.file, compiler, packages, runtime })
        : undefined;
      const result = loadedRun !== undefined
        ? compiler.planCompilation(loadedRun.compilation, {
            targets: loadedRun.run.targets,
            satisfactions: loadedRun.run.satisfactions,
            realizations: loadedRun.run.graphs,
            ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
          })
        : args.pins.length === 0
          ? await compiler.planFile(args.file, planOptions)
          : await (async () => {
            const compilation = await compiler.compileFile(args.file!);
            const seen = new Set<string>();
            const candidates = [];
            const satisfactions = [];
            const summary = [];
            for (const pin of args.pins) {
              if (seen.has(pin.output)) throw new Error(`--pin repeats output ${pin.output}`);
              seen.add(pin.output);
              const exported = compilation.exports.find((item) => item.name === pin.output);
              if (exported === undefined) throw new Error(`--pin refers to unknown public output ${pin.output}`);
              if (exported.ref.kind !== "logical-output") {
                throw new Error(`--pin ${pin.output} is an authored Record, not a realizable output`);
              }
              const historical = await runtime.status(pin.build);
              if (historical.build === undefined) throw new Error(`--pin source Build ${pin.build} does not exist`);
              const candidate = createBuildRecordCandidate({
                build: historical.build.state,
                sourceOutput: exported.ref.id,
              });
              candidates.push(candidate);
              satisfactions.push({ output: exported.ref.id, candidate: candidate.id, fidelity: "substitute" as const });
              summary.push({ output: pin.output, build: pin.build, candidate: candidate.id });
            }
            const overlay = sealRealizationOverlay({
              sourceGraph: compilation.elaboration.graph.id,
              candidates,
              operations: [],
            });
            pinSummary = summary;
            return compiler.planCompilation(compilation, {
              ...planOptions,
              satisfactions,
              realizations: [overlay],
            });
          })();
      const built = await runtime.build({
        id: args.buildId ?? result.state.id,
        state: result.state,
        attachments: result.compilation.attachments,
      }, {
        follow: args.follow,
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
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
        ...(pinSummary.length === 0 ? {} : { pins: pinSummary }),
      }, null, 2)}\n`);
    } finally {
      await runtime.close();
    }
    return;
  }
  let runtime: LocalRuntime | undefined;
  try {
    runtime = args.runtime === undefined ? undefined : await loadLocalRuntime(args.runtime);
    const result = runMode
      ? await (async () => {
          const loaded = await loadRunFile({
            path: args.file!,
            compiler,
            packages,
            ...(runtime === undefined ? {} : { runtime }),
          });
          return compiler.planCompilation(loaded.compilation, {
            targets: loaded.run.targets,
            satisfactions: loaded.run.satisfactions,
            realizations: loaded.run.graphs,
            ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
          });
        })()
      : await compiler.planFile(args.file, {
          targets: args.targets,
          accepts: args.substitute ? "substitute" : "exact",
          ...(activated === undefined ? {} : { implementationClosure: activated.lock.digest }),
        });
    io.write(`${JSON.stringify(result.plan, null, 2)}\n`);
  } finally {
    await runtime?.close();
  }
}
