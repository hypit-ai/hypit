import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { LocalRuntime } from "@svml/local";
import type { NodeCompiledSourceClosure } from "@svml/compiler-node";
import type { BuildCatalogDescriptor } from "@svml/runtime";
import { parseSourceHeader } from "@svml/source";
import {
  createNodePackageLock,
  loadNodePackageSet,
  writeNodePackageLock,
} from "@svml/package-loader-node";

import {
  collectArtifacts,
  findArchivedArtifact,
  inspectBuild,
  materializeArtifact,
  materializeRecord,
  selectArchivedRecord,
  summarizeBuildCatalog,
} from "./archive.js";
import { collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";

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
  readonly name: string | undefined;
  readonly artifact: string | undefined;
  readonly to: string | undefined;
  readonly pins: readonly { readonly output: string; readonly build: string }[];
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...tail] = argv;
  const file = command === "builds" ? undefined : tail[0];
  const rest = command === "builds" ? tail : tail.slice(1);
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
  let name: string | undefined;
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
    if (item === "--name") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--name requires a source output name");
      name = value;
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
    name,
    artifact,
    to,
    pins,
  };
}

function usage(): string {
  return [
    "usage:",
    "  svml-v2 lock-packages <svml.packages.lock> --package installed-name [--package installed-name] [--root directory]",
    "  svml-v2 check <self-described-source> [--runtime profile.json] [--package-lock file] [--root directory]",
    "  svml-v2 plan <run-source> [--runtime profile.json] [--package-lock file]",
    "  svml-v2 build <run-source> --runtime profile.json|./svml.runtime.ts [--follow]",
    "  svml-v2 status <build-id> --runtime profile.json|./svml.runtime.ts",
    "  svml-v2 builds --runtime profile.json|./svml.runtime.ts",
    "  svml-v2 inspect <build-id> --runtime profile.json|./svml.runtime.ts",
    "  svml-v2 get <build-id> --runtime profile.json|./svml.runtime.ts [--name source-name|--record record-id|--output logical-output-id|--artifact digest] [--to path]",
    "  svml-v2 cancel <build-id> --runtime profile.json|./svml.runtime.ts",
  ].join("\n");
}

function isLocalRuntime(value: unknown): value is LocalRuntime {
  return typeof value === "object"
    && value !== null
    && "build" in value
    && typeof value.build === "function"
    && "builds" in value
    && typeof value.builds === "function"
    && "readArtifact" in value
    && typeof value.readArtifact === "function"
    && "close" in value
    && typeof value.close === "function";
}

function createCatalogDescriptor(options: {
  readonly core: BuildCatalogDescriptor["core"];
  readonly source: string;
  readonly compilation: NodeCompiledSourceClosure;
  readonly run?: { readonly path: string; readonly targetSet?: string };
}): BuildCatalogDescriptor {
  const aliases = options.compilation.exports.map((item) => {
    if (item.ref.kind === "operation-result") {
      throw new Error(`public output ${item.name} was not lowered to a stable Record or Logical Output`);
    }
    return { name: item.name, type: item.type, ref: item.ref };
  });
  return {
    format: "svml.build-catalog-descriptor@1",
    core: options.core,
    source: {
      path: resolve(options.source),
      closure: options.compilation.closure.id,
    },
    ...(options.run === undefined ? {} : { run: {
      path: resolve(options.run.path),
      ...(options.run.targetSet === undefined ? {} : { targetSet: options.run.targetSet }),
    } }),
    aliases,
  };
}

async function loadLocalRuntime(path: string, distribution: CliDistribution): Promise<LocalRuntime> {
  if (extname(path) === ".json") return await distribution.createRuntimeFromConfig(path);
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

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  distribution: CliDistribution,
): Promise<void> {
  const args = parseArgs(argv);
  const known = args.command === "lock-packages" || args.command === "check" || args.command === "plan"
    || args.command === "build" || args.command === "status" || args.command === "builds"
    || args.command === "inspect" || args.command === "get" || args.command === "cancel";
  if (!known || (args.command !== "builds" && args.file === undefined)) {
    throw new Error(usage());
  }
  if (args.command === "lock-packages") {
    if (args.packages.length === 0) throw new Error("lock-packages requires at least one --package");
    if (args.packageLock !== undefined) throw new Error("lock-packages does not accept --package-lock");
    const output = resolve(args.file!);
    const root = args.root ?? dirname(output);
    const lock = await createNodePackageLock(args.packages, root);
    await writeNodePackageLock(output, lock);
    io.write(`${JSON.stringify({ ok: true, packageLock: output, digest: lock.digest, packages: lock.packages }, null, 2)}\n`);
    return;
  }
  if ((args.record !== undefined || args.output !== undefined || args.name !== undefined
    || args.artifact !== undefined || args.to !== undefined)
    && args.command !== "get") {
    throw new Error("--name, --record, --output, --artifact and --to are only valid for get");
  }
  if (args.targets.length > 0 || args.substitute || args.pins.length > 0) {
    throw new Error("Targets, Candidate selections and fidelity belong in a self-described Run Source; CLI --target, --pin and --accept-substitute are not supported");
  }
  if (args.command === "status" || args.command === "builds" || args.command === "inspect"
    || args.command === "get" || args.command === "cancel") {
    if (args.runtime === undefined) throw new Error(`${args.command} requires --runtime`);
    const runtime = await loadLocalRuntime(args.runtime, distribution);
    try {
      if (args.command === "builds") {
        const entries = await runtime.builds();
        const builds = await Promise.all(entries.map(async (entry) => {
          const status = await runtime.status(entry.build);
          return {
            build: entry.build,
            core: entry.core,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            status: status.build?.state.status,
            ...summarizeBuildCatalog(entry, status.build?.state),
          };
        }));
        io.write(`${JSON.stringify({ builds }, null, 2)}\n`);
      } else if (args.command === "status") {
        const status = await runtime.status(args.file!);
        io.write(`${JSON.stringify({
          build: status.build === undefined ? undefined : {
            id: status.build.build,
            revision: status.build.revision,
            core: status.build.state.id,
            status: status.build.state.status,
            diagnostics: status.build.state.diagnostics,
          },
          catalog: status.catalog === undefined
            ? undefined
            : summarizeBuildCatalog(status.catalog, status.build?.state),
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
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        io.write(`${JSON.stringify({
          build: status.build.build,
          revision: status.build.revision,
          archive: inspectBuild(status.build.state, status.catalog),
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
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        if (args.artifact !== undefined && (args.name !== undefined || args.record !== undefined || args.output !== undefined)) {
          throw new Error("get accepts one of --name, --record, --output or --artifact");
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
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.record === undefined ? {} : { record: args.record }),
          ...(args.output === undefined ? {} : { output: args.output }),
          ...(status.catalog === undefined ? {} : { catalog: status.catalog }),
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
        const result = await runtime.cancel(args.file!);
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
  const loadedPackageSet = args.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(args.packageLock, args.root ?? dirname(args.packageLock));
  const packageContributions = loadedPackageSet?.contributions ?? distribution.builtInPackageContributions;
  const runFrontends = collectRunFrontends(distribution.runFrontends, packageContributions);
  const compiler = distribution.createCompiler({
    ...(args.root === undefined ? {} : { root: args.root }),
    packageContributions,
  });
  const workspace = await compiler.openFile(args.file!);
  const sourceHeader = parseSourceHeader(workspace.entry.name, workspace.entry.text);
  const runMode = runFrontends.some((frontend) => frontend.id === sourceHeader.using);
  const authorMode = compiler.supportsFrontend(sourceHeader.using);
  if (runMode === authorMode) {
    throw new Error(runMode
      ? `Frontend ${sourceHeader.using} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${sourceHeader.using}`);
  }
  if ((args.command === "plan" || args.command === "build") && !runMode) {
    throw new Error(`${args.command} requires a self-described Run Source; check Author Sources independently`);
  }
  if (args.command === "check") {
    let runtime: LocalRuntime | undefined;
    try {
      runtime = args.runtime === undefined ? undefined : await loadLocalRuntime(args.runtime, distribution);
      if (runMode) {
        const loaded = await loadRunFile({
          workspace,
          authorCompiler: compiler,
          frontends: runFrontends,
          packageContributions,
          ...(runtime === undefined ? {} : { runtime }),
        });
        const planned = loaded.compiler.planCompilation(
          loaded,
          loadedPackageSet?.lock.digest,
        );
        const selected = loaded.run.graph.targetSets.find((item) => item.id === loaded.run.graph.selectedTargets)!;
        io.write(`${JSON.stringify({
          ok: true,
          run: loaded.path,
          source: loaded.authorSource,
          authorSourceClosure: loaded.author.closure.id,
          runSourceClosure: loaded.run.closure.id,
          authorModuleClosure: loaded.author.program.closure.digest,
          executionModuleClosure: loaded.program.closure.digest,
          authorGraph: loaded.author.elaboration.graph.id,
          runGraph: loaded.run.graph.id,
          graph: planned.request.graph,
          targetSet: loaded.run.graph.selectedTargets,
          targets: selected.targets,
          candidates: loaded.run.candidates,
          satisfactions: loaded.run.graph.satisfactions,
          steps: planned.plan.steps.length,
        }, null, 2)}\n`);
        return;
      }
      const result = await compiler.compileSource(workspace.entry, workspace);
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
    const runtime = await loadLocalRuntime(args.runtime, distribution);
    try {
      const loadedRun = await loadRunFile({
        workspace,
        authorCompiler: compiler,
        frontends: runFrontends,
        packageContributions,
        runtime,
      });
      const result = loadedRun.compiler.planCompilation(loadedRun, loadedPackageSet?.lock.digest);
      const built = await runtime.build({
        id: args.buildId ?? result.state.id,
        state: result.state,
        catalog: createCatalogDescriptor({
          core: result.state.id,
          source: loadedRun.authorSource,
          compilation: result.compilation.author,
          run: {
            path: loadedRun.path,
            targetSet: loadedRun.run.graph.selectedTargets,
          },
        }),
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
      }, null, 2)}\n`);
    } finally {
      await runtime.close();
    }
    return;
  }
  let runtime: LocalRuntime | undefined;
  try {
    runtime = args.runtime === undefined ? undefined : await loadLocalRuntime(args.runtime, distribution);
    const loaded = await loadRunFile({
      workspace,
      authorCompiler: compiler,
      frontends: runFrontends,
      packageContributions,
      ...(runtime === undefined ? {} : { runtime }),
    });
    const result = loaded.compiler.planCompilation(loaded, loadedPackageSet?.lock.digest);
    io.write(`${JSON.stringify(result.plan, null, 2)}\n`);
  } finally {
    await runtime?.close();
  }
}
