import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

import type { ExternalServiceReport, LocalRuntime } from "@narratage/local";
import type { NodeCompiledSourceClosure } from "@narratage/compiler-node";
import type { BuildCatalogDescriptor } from "@narratage/runtime";
import { isDigest } from "@narratage/protocol";
import { parseSourceHeader } from "@narratage/source";
import {
  createNodePackageLock,
  loadNodePackageSet,
  writeNodePackageLock,
} from "@narratage/package-loader-node";

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
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliColorMode, CliIo } from "./output.js";
import {
  ensureRuntimeProcess,
  markRuntimeProcessReady,
  runtimeProcessLogs,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "./runtime-process.js";

type ParsedArgs = {
  readonly command: string | undefined;
  /** Second command word for scoped commands such as runtime and cancel. */
  readonly action: string | undefined;
  readonly file: string | undefined;
  /** Canonical containment boundary for Author and Run Sources plus source assets. */
  readonly workspaceRoot: string | undefined;
  /** Host directory whose node_modules contains the packages named by a package lock. */
  readonly packageRoot: string | undefined;
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
  readonly apply: boolean;
  /** Leave the declared external programs alone; build against what is running. */
  readonly noServices: boolean;
  readonly json: boolean;
  readonly color: CliColorMode;
  readonly verbose: boolean;
  readonly watch: boolean;
  readonly jsonl: boolean;
  readonly readyFile: string | undefined;
  readonly reason: string | undefined;
  readonly slot: string | undefined;
  readonly from: string | undefined;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...tail] = argv;
  const scoped = command === "services" || command === "runtime" || command === "cancel" || command === "auth";
  const action = scoped ? tail[0] : undefined;
  const positional = scoped ? tail.slice(1) : tail;
  const noFile = command === "builds" || command === "queue";
  const file = noFile ? undefined : positional[0];
  const rest = noFile ? positional : positional.slice(1);
  const targets: string[] = [];
  let workspaceRoot: string | undefined;
  let packageRoot: string | undefined;
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
  let apply = false;
  let noServices = false;
  let json = false;
  let color: CliColorMode = "auto";
  let verbose = false;
  let watch = false;
  let jsonl = false;
  let readyFile: string | undefined;
  let reason: string | undefined;
  let slot: string | undefined;
  let from: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--jsonl") {
      jsonl = true;
      continue;
    }
    if (item === "--watch") {
      watch = true;
      continue;
    }
    if (item === "--verbose") {
      verbose = true;
      continue;
    }
    if (item === "--debug") {
      continue;
    }
    if (item === "--no-color") {
      color = "never";
      continue;
    }
    if (item === "--color") {
      const value = rest[index + 1];
      if (value !== "auto" && value !== "always" && value !== "never") {
        throw new Error("--color requires auto, always or never");
      }
      color = value;
      index += 1;
      continue;
    }
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
      workspaceRoot = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--package-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--package-root requires a directory");
      packageRoot = resolve(value);
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
    if (item === "--apply") {
      apply = true;
      continue;
    }
    if (item === "--no-services") {
      noServices = true;
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
    if (item === "--ready-file") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--ready-file requires a path");
      readyFile = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--reason") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--reason requires text");
      reason = value;
      index += 1;
      continue;
    }
    if (item === "--slot") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--slot requires a credential slot");
      slot = value;
      index += 1;
      continue;
    }
    if (item === "--from") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--from requires a credential file");
      from = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return {
    command,
    action,
    file,
    workspaceRoot,
    packageRoot,
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
    apply,
    noServices,
    json,
    color,
    verbose,
    watch,
    jsonl,
    readyFile,
    reason,
    slot,
    from,
  };
}

function usage(): string {
  return [
    "usage:",
    "  narratage lock-packages <svml.packages.lock> --package installed-name [--package installed-name] [--package-root directory]",
    "  narratage doctor <runtime-profile.json>",
    "  narratage services up|down|status <runtime-profile.json> [--max-wait-ms milliseconds]",
    "  narratage runtime up|status|logs|down <runtime-profile.json>",
    "  narratage queue --runtime profile.json [--watch]",
    "  narratage gc <runtime-profile.json> [--apply]",
    "  narratage check <self-described-source> [--runtime profile.json] [--package-lock file] [--package-root directory] [--root workspace]",
    "  narratage plan <run-source> [--runtime profile.json] [--package-lock file] [--package-root directory] [--root workspace]",
    "  narratage build <run-source> --runtime profile.json|./svml.runtime.ts [--package-lock file] [--package-root directory] [--root workspace] [--follow] [--no-services]",
    "  narratage status <build-id> --runtime profile.json|./svml.runtime.ts",
    "  narratage builds --runtime profile.json|./svml.runtime.ts",
    "  narratage inspect <build-id> --runtime profile.json|./svml.runtime.ts",
    "  narratage get <build-id> --runtime profile.json|./svml.runtime.ts [--name source-name|--record record-id|--output logical-output-id|--artifact digest] [--to path]",
    "  narratage operations <build-id> --runtime profile.json|./svml.runtime.ts",
    "  narratage operation <operation-id> --runtime profile.json|./svml.runtime.ts",
    "  narratage cancel build <build-id> --runtime profile.json|./svml.runtime.ts [--reason text]",
    "  narratage cancel operation <operation-id> --runtime profile.json|./svml.runtime.ts [--reason text]",
    "  narratage auth status|login|logout <endpoint-instance> --runtime profile.json [--slot name] [--from secret-file]",
    "",
    "output:",
    "  --json  --verbose  --color auto|always|never  --no-color  --debug",
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
    && "credentials" in value
    && typeof value.credentials === "function"
    && "putCredential" in value
    && typeof value.putCredential === "function"
    && "deleteCredential" in value
    && typeof value.deleteCredential === "function"
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

/**
 * Starts the external programs the Runtime Profile's Endpoints declare, before
 * the Build reaches an Operation that would need one. A WhisperX that is not
 * running otherwise surfaces as a refused connection partway through, after the
 * paid generation ahead of it has already been spent.
 *
 * Only a JSON Profile declares Endpoints this can read. A trusted `.ts` module
 * builds its Runtime itself and owns whatever its Endpoints talk to, so there is
 * nothing here to start on its behalf.
 *
 * Services are started and left running: a developer submits several Builds
 * against one warm program, and stopping it between them would pay the model
 * load every time. `narratage services down` ends them.
 */
async function startDeclaredServices(
  path: string,
  distribution: CliDistribution,
): Promise<readonly ExternalServiceReport[] | undefined> {
  if (extname(path) !== ".json") return undefined;
  const result = await distribution.externalServices.up(resolve(path), {});
  const unavailable = result.services.filter((item) => item.state.state !== "ready");
  if (unavailable.length > 0) {
    throw new Error([
      `${unavailable.length} external service${unavailable.length === 1 ? " is" : "s are"} not ready:`,
      // The report carries two reasons that do not overlap: what the probe saw,
      // and why the attempt to fix it fell short. Both name a different repair.
      ...unavailable.map((item) => `  ${item.id}: ${item.state.state}`
        + `${"detail" in item.state ? ` — ${item.state.detail}` : ""}`
        + `${item.detail === undefined ? "" : `; ${item.detail}`}`
        + `${item.logPath === undefined ? "" : ` (log: ${item.logPath})`}`),
      "Fix the service, or pass --no-services to build against what is already running.",
    ].join("\n"));
  }
  return result.services;
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
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    writeCliHelp(io);
    return;
  }
  const args = parseArgs(argv);
  const writeOperational = (
    machine: unknown,
    title: string,
    status: "success" | "warning" | "error" | "info" = "info",
    facts: readonly (readonly [string, string])[] = [],
    lines: readonly string[] = [],
  ): void => writeCliOutput(io, {
    json: args.json || args.jsonl,
    jsonl: args.jsonl,
    color: args.color,
    verbose: args.verbose,
  }, { kind: "operational", machine, title, status, facts, lines });
  if (args.command === "_worker") {
    if (args.file === undefined || args.readyFile === undefined) throw new Error("internal Worker launch is incomplete");
    const runtime = await loadLocalRuntime(resolve(args.file), distribution);
    const abort = new AbortController();
    const stop = (): void => abort.abort();
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    try {
      await markRuntimeProcessReady(args.readyFile);
      await runtime.work({
        owner: `worker-${process.pid}`,
        leaseMs: 30_000,
        idlePollMs: 250,
        signal: abort.signal,
      });
    } finally {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
      await runtime.close();
    }
    return;
  }
  const known = args.command === "lock-packages" || args.command === "check" || args.command === "plan"
    || args.command === "build" || args.command === "status" || args.command === "builds"
    || args.command === "inspect" || args.command === "get" || args.command === "cancel"
    || args.command === "doctor" || args.command === "gc" || args.command === "services"
    || args.command === "runtime" || args.command === "queue" || args.command === "operations"
    || args.command === "operation";
  const operational = known || args.command === "auth";
  const fileOptional = args.command === "builds" || args.command === "queue";
  if (!operational || (!fileOptional && args.file === undefined)) {
    throw new Error(usage());
  }
  if (args.watch && args.command !== "queue") throw new Error("--watch applies only to queue");
  if (args.jsonl && (args.command !== "queue" || !args.watch)) {
    throw new Error("--jsonl applies only to queue --watch");
  }
  if (args.watch && args.json) throw new Error("queue --watch is a stream; use --jsonl instead of --json");
  if (args.command === "lock-packages") {
    if (args.packages.length === 0) throw new Error("lock-packages requires at least one --package");
    if (args.packageLock !== undefined) throw new Error("lock-packages does not accept --package-lock");
    if (args.workspaceRoot !== undefined) {
      throw new Error("lock-packages does not compile a Workspace; use --package-root to locate installed packages");
    }
    const output = resolve(args.file!);
    const packageRoot = args.packageRoot ?? distribution.packageRoot ?? dirname(output);
    const lock = await createNodePackageLock(args.packages, packageRoot);
    await writeNodePackageLock(output, lock);
    writeOperational({ ok: true, packageLock: output, digest: lock.digest, packages: lock.packages },
      "Package lock written", "success", [
        ["Path", output], ["Packages", String(lock.packages.length)], ["Digest", lock.digest],
      ]);
    return;
  }
  if (args.command === "doctor") {
    if (args.runtime !== undefined || args.packageLock !== undefined || args.packageRoot !== undefined
      || args.packages.length > 0 || args.apply) {
      throw new Error("doctor reads all deployment selection from the Runtime Profile itself");
    }
    const profile = resolve(args.file!);
    const result = await distribution.doctorRuntimeConfig(profile);
    const machine = {
      format: "narratage.cli-doctor@1" as const,
      ok: !result.diagnostics.some((item) => item.severity === "error"),
      root: result.root,
      diagnostics: result.diagnostics,
    };
    writeCliOutput(io, args, { kind: "doctor", machine, profile });
    return;
  }
  if (args.command === "services") {
    if (args.runtime !== undefined || args.packageLock !== undefined || args.packageRoot !== undefined
      || args.packages.length > 0 || args.apply) {
      throw new Error("services reads all deployment selection from the Runtime Profile itself");
    }
    if (args.action !== "up" && args.action !== "down" && args.action !== "status") {
      throw new Error("services takes up, down or status");
    }
    if (args.action !== "up" && args.maxWaitMs !== undefined) {
      throw new Error("--max-wait-ms applies to services up");
    }
    const profile = resolve(args.file!);
    const result = args.action === "up"
      ? await distribution.externalServices.up(profile, {
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      })
      : args.action === "down"
        ? await distribution.externalServices.down(profile)
        : await distribution.externalServices.report(profile);
    const machine = {
      ok: result.services.every((item) => (args.action === "down" ? item.state.state !== "ready" : item.state.state === "ready")),
      root: result.root,
      services: result.services,
    };
    writeOperational(machine, `External services ${args.action}`, machine.ok ? "success" : "warning", [
      ["Root", result.root],
      ["Services", String(result.services.length)],
      ["Ready", String(result.services.filter((item) => item.state.state === "ready").length)],
    ]);
    return;
  }
  if (args.command === "runtime") {
    if (args.action !== "up" && args.action !== "down" && args.action !== "status" && args.action !== "logs") {
      throw new Error("runtime takes up, down, status or logs");
    }
    const profile = resolve(args.file!);
    if (args.action === "up") {
      const external = await distribution.externalServices.up(profile, {
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      const processState = await ensureRuntimeProcess(
        profile,
        distribution.runtimeWorkerLaunch(),
        args.maxWaitMs ?? 10_000,
      );
      writeOperational({ ok: true, worker: processState, services: external.services }, "Runtime is up", "success", [
        ["Worker", String(processState.pid)],
        ["External services", String(external.services.length)],
      ]);
      return;
    }
    if (args.action === "logs") {
      const logs = await runtimeProcessLogs(profile);
      const lines = logs.text.length === 0 ? [] : logs.text.replace(/\n$/u, "").split("\n");
      const shown = args.verbose ? lines : lines.slice(-100);
      writeOperational({
        format: "narratage.cli-runtime-logs@1",
        path: logs.path,
        text: logs.text,
      }, "Runtime logs", "info", [
        ["Path", logs.path],
        ["Lines", String(lines.length)],
      ], shown.length === 0 ? ["No log output."] : shown);
      return;
    }
    if (args.action === "down") {
      const worker = await stopRuntimeProcess(profile, args.maxWaitMs ?? 10_000);
      const external = await distribution.externalServices.down(profile);
      writeOperational({ ok: true, worker, services: external.services }, "Runtime is down", "success", [
        ["Worker", worker.state],
        ["External services", String(external.services.length)],
      ]);
      return;
    }
    const worker = await runtimeProcessStatus(profile);
    const external = await distribution.externalServices.report(profile);
    const runtime = await loadLocalRuntime(profile, distribution);
    try {
      const queue = await runtime.queue();
      const counts = Object.fromEntries(["queued", "leased", "waiting", "blocked", "settling", "terminal"]
        .map((phase) => [phase, queue.dispatches.filter((item) => item.phase === phase).length]));
      const machine = {
        ok: worker.state === "running" && external.services.every((item) => item.state.state === "ready"),
        worker,
        queue: { counts, capacity: queue.capacity },
        services: external.services,
      };
      writeOperational(machine, "Runtime status", machine.ok ? "success" : "warning", [
        ["Worker", worker.state],
        ["Queued", String(counts.queued ?? 0)],
        ["Running", String(counts.leased ?? 0)],
        ["Waiting", String(counts.waiting ?? 0)],
        ["Capacity", String(queue.capacity.length)],
      ]);
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.command === "gc") {
    if (args.runtime !== undefined || args.packageLock !== undefined || args.packageRoot !== undefined
      || args.packages.length > 0) {
      throw new Error("gc reads all deployment selection from the Runtime Profile itself");
    }
    const runtime = await loadLocalRuntime(resolve(args.file!), distribution);
    try {
      if (!("garbageCollectArtifacts" in runtime) || typeof runtime.garbageCollectArtifacts !== "function") {
        throw new Error("selected Runtime does not expose Artifact maintenance");
      }
      const report = await runtime.garbageCollectArtifacts({ apply: args.apply });
      const machine = {
        applied: args.apply,
        reachable: report.reachable,
        unreachable: report.unreachable,
        deleted: report.deleted,
      };
      writeOperational(machine, args.apply ? "Artifact garbage collection applied" : "Artifact garbage collection preview",
        report.unreachable.length === 0 ? "success" : "warning", [
          ["Reachable", String(report.reachable.length)],
          ["Unreachable", String(report.unreachable.length)],
          ["Deleted", String(report.deleted.length)],
        ]);
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.command === "auth") {
    if (args.action !== "status" && args.action !== "login" && args.action !== "logout") {
      throw new Error("auth takes status, login or logout");
    }
    if (args.runtime === undefined) throw new Error("auth requires --runtime");
    if (args.from !== undefined && args.action !== "login") throw new Error("--from applies only to auth login");
    const runtime = await loadLocalRuntime(args.runtime, distribution);
    try {
      let credentials = await runtime.credentials(args.file!);
      if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
      if (credentials.length === 0) throw new Error(`Endpoint ${args.file} has no matching credential`);
      if (args.slot === undefined && credentials.length > 1 && args.action !== "status") {
        throw new Error(`Endpoint ${args.file} has several credentials; select one with --slot`);
      }
      if (args.action === "status") {
        writeOperational({ endpoint: args.file, credentials }, "Credential status", "info", [
          ["Endpoint", args.file!],
          ["Configured", `${credentials.filter((item) => item.configured).length}/${credentials.length}`],
        ], credentials.map((item) => `${item.slot}: ${item.configured ? "configured" : "missing"} · ${item.writable ? "writable" : "read-only"}`));
      } else if (args.action === "login") {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        const raw = args.from === undefined
          ? await io.readSecret?.(`${item.label}: `)
          : await readFile(args.from, "utf8");
        if (raw === undefined) throw new Error("interactive credential input is unavailable; use --from <file>");
        const secret = raw.trim();
        if (secret.length === 0) throw new Error("credential input is empty");
        if (item.kind === "json") {
          try { JSON.parse(secret); } catch { throw new Error(`${item.label} is not valid JSON`); }
        }
        const stored = await runtime.putCredential(item.endpoint, item.slot, secret);
        writeOperational({ endpoint: args.file, stored }, "Credential stored", "success", [
          ["Endpoint", args.file!], ["Slot", stored.slot], ["Store", stored.ref.store],
        ]);
      } else {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        const removed = await runtime.deleteCredential(item.endpoint, item.slot);
        writeOperational({ endpoint: args.file, ...removed }, removed.deleted ? "Credential removed" : "Credential was absent",
          removed.deleted ? "success" : "warning", [
            ["Endpoint", args.file!], ["Slot", removed.credential.slot], ["Store", removed.credential.ref.store],
          ]);
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.apply) throw new Error("--apply is only valid for gc");
  if (args.noServices && args.command !== "build") {
    throw new Error("--no-services is only valid for build; no other command starts an external program");
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
    || args.command === "get" || args.command === "cancel" || args.command === "queue"
    || args.command === "operations" || args.command === "operation") {
    if (args.runtime === undefined) throw new Error(`${args.command} requires --runtime`);
    const runtime = await loadLocalRuntime(args.runtime, distribution);
    try {
      if (args.command === "queue") {
        const writeQueue = async (): Promise<boolean> => {
          const queue = await runtime.queue();
          const value = {
            format: "narratage.cli-queue@1",
            at: Date.now(),
            dispatches: queue.dispatches,
            capacity: queue.capacity,
          };
          const active = queue.dispatches.filter((item) => item.phase !== "terminal");
          writeOperational(value, "Runtime queue", active.length === 0 ? "success" : "info", [
            ["Active Builds", String(active.length)],
            ["Total Builds", String(queue.dispatches.length)],
            ["Reserved capacity", String(queue.capacity.length)],
          ], active.slice(0, args.verbose ? undefined : 12).map((item) =>
            `${item.build}: ${item.phase}${item.admission === "open" ? "" : ` · ${item.admission}`}`));
          return queue.dispatches.every((item) => item.phase === "terminal");
        };
        if (!args.watch) await writeQueue();
        else while (!(await writeQueue())) await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
      } else if (args.command === "operations") {
        const status = await runtime.status(args.file!);
        const machine = { build: args.file, operations: status.operations };
        writeOperational(machine, "Build operations", "info", [
          ["Build", args.file!], ["Operations", String(status.operations.length)],
        ], status.operations.map((item) => `${item.id}: ${item.status} · ${item.endpoint}`));
      } else if (args.command === "operation") {
        if (!isDigest(args.file!)) throw new Error("operation id must be a content digest");
        const operation = await runtime.operation(args.file!);
        writeOperational({ operation }, operation === undefined ? "Operation not found" : "Operation detail",
          operation === undefined ? "warning" : "info", operation === undefined ? [] : [
            ["Operation", operation.id], ["Status", operation.status], ["Endpoint", operation.endpoint],
            ["Attempt", String(operation.attempt)],
          ]);
      } else if (args.command === "builds") {
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
        writeOperational({ builds }, "Build archive", "info", [["Builds", String(builds.length)]],
          builds.slice(0, args.verbose ? undefined : 20).map((item) => `${item.build}: ${item.status ?? "unknown"}`));
      } else if (args.command === "status") {
        const status = await runtime.status(args.file!);
        const machine = {
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
            ...(operation.cancellation === undefined ? {} : { cancellation: operation.cancellation }),
          })),
          dispatch: status.dispatch,
        };
        const phase = status.dispatch?.phase ?? "missing";
        writeOperational(machine, status.build === undefined ? "Build not found" : "Build status",
          status.build === undefined ? "warning" : status.dispatch?.terminal === "failed" ? "error" : "info", [
            ["Build", args.file!],
            ["Core", status.build?.state.status ?? "missing"],
            ["Dispatch", phase],
            ["Operations", String(status.operations.length)],
          ]);
      } else if (args.command === "inspect") {
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        const machine = {
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
        };
        writeOperational(machine, "Build archive detail", "info", [
          ["Build", status.build.build], ["Revision", String(status.build.revision)],
          ["Operations", String(status.operations.length)],
        ]);
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
            writeOperational({ build: status.build.build, artifact: args.artifact, references }, "Artifact references", "info", [
              ["Build", status.build.build], ["Artifact", args.artifact], ["References", String(references.length)],
            ]);
          } else {
            const [first] = references;
            if (first === undefined) throw new Error(`Build ${args.file} does not reference Artifact ${args.artifact}`);
            const materialized = await materializeArtifact(runtime, first, args.to, `Build ${args.file}`);
            const machine = {
              build: status.build.build,
              artifact: args.artifact,
              references,
              materialized,
            };
            writeOperational(machine, "Artifact materialized", "success", [
              ["Build", status.build.build], ["Artifact", args.artifact], ["Path", materialized.path],
            ]);
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
          const machine = {
            build: status.build.build,
            revision: status.build.revision,
            record,
            artifacts: collectArtifacts(record.value.kind === "blob" ? record.value : record.value.value),
          };
          writeOperational(machine, "Archived Record", "info", [
            ["Build", status.build.build], ["Record", record.id],
            ["Artifacts", String(machine.artifacts.length)],
          ]);
        } else {
          const materialized = await materializeRecord(runtime, record, args.to);
          const machine = {
            build: status.build.build,
            record: record.id,
            materialized,
          };
          writeOperational(machine, "Record materialized", "success", [
            ["Build", status.build.build], ["Record", record.id], ["Path", materialized.path],
          ]);
        }
      } else {
        if (args.action === "build") {
          const result = await runtime.cancel(args.file!, args.reason);
          const machine = {
            scope: "build",
            build: args.file,
            requested: result !== undefined,
            phase: result?.phase,
            admission: result?.admission,
            terminal: result?.terminal,
          };
          writeOperational(machine, result === undefined ? "Build not found" : "Build cancellation requested",
            result === undefined ? "warning" : "success", [
              ["Build", args.file!], ["Admission", result?.admission ?? "missing"], ["Phase", result?.phase ?? "missing"],
            ]);
        } else if (args.action === "operation") {
          if (args.file === undefined || !isDigest(args.file)) {
            throw new Error("cancel operation requires an Operation digest");
          }
          const result = await runtime.cancelOperation(args.file!, args.reason);
          const machine = {
            scope: "operation",
            operation: args.file,
            requested: result !== undefined,
            build: result?.build,
            execution: result?.status,
            control: result?.cancellation?.status,
          };
          writeOperational(machine, result === undefined ? "Operation not found" : "Operation cancellation requested",
            result === undefined ? "warning" : "success", [
              ["Operation", args.file!], ["Build", result?.build ?? "missing"],
              ["Execution", result?.status ?? "missing"], ["Control", result?.cancellation?.status ?? "missing"],
            ]);
        } else {
          throw new Error("cancel must name its scope: cancel build <build-id> or cancel operation <operation-id>");
        }
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.packages.length > 0) throw new Error("--package is only valid for lock-packages");
  if (args.packageRoot !== undefined && args.packageLock === undefined) {
    throw new Error("--package-root locates the installed packages named by --package-lock; provide both options");
  }
  const loadedPackageSet = args.packageLock === undefined
    ? undefined
    : await loadNodePackageSet(
        args.packageLock,
        args.packageRoot ?? distribution.packageRoot ?? dirname(args.packageLock),
      );
  const packageContributions = loadedPackageSet?.contributions ?? distribution.builtInPackageContributions;
  const runFrontends = collectRunFrontends(distribution.runFrontends, packageContributions);
  const compiler = distribution.createCompiler({
    ...(args.workspaceRoot === undefined ? {} : { workspaceRoot: args.workspaceRoot }),
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
        const machine = {
          format: "narratage.cli-check@1" as const,
          sourceKind: "run" as const,
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
        } as const;
        writeCliOutput(io, args, {
          kind: "check-run",
          machine,
          frontend: sourceHeader.using,
        });
        return;
      }
      const result = await compiler.compileSource(workspace.entry, workspace);
      const machine = {
        format: "narratage.cli-check@1" as const,
        sourceKind: "author" as const,
        ok: true,
        sourceClosure: result.closure.id,
        moduleClosure: result.program.closure.digest,
        graph: result.elaboration.graph.id,
        units: result.closure.units.length,
        sourceAssets: result.attachments.map((item) => item.artifact),
        modules: result.program.closure.modules.map((item) => `${item.ref.name}@${item.ref.version}`),
        exports: result.exports.map((item) => ({ name: item.name, type: item.type, kind: item.ref.kind })),
      } as const;
      writeCliOutput(io, args, {
        kind: "check-author",
        machine,
        source: workspace.entry.name,
        frontend: sourceHeader.using,
      });
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
      const request = {
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
      } as const;
      const services = args.noServices ? undefined : await startDeclaredServices(args.runtime, distribution);
      let built = await runtime.build(request);
      const worker = await ensureRuntimeProcess(
        args.runtime,
        distribution.runtimeWorkerLaunch(),
        args.maxWaitMs ?? 10_000,
      );
      if (args.follow) {
        built = await runtime.build(request, {
          follow: true,
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        });
      }
      const machine = {
        build: built.id,
        core: built.state.id,
        status: built.status,
        worker,
        ...(services === undefined ? {} : {
          services: services.map((item) => ({ id: item.id, action: item.action })),
        }),
        goals: built.state.plan.goals.map((goal) => {
          const record = built.state.records.find((item) => item.id === goal.record);
          return {
            record: goal.record,
            type: goal.type,
            accepts: goal.accepts,
            ...(record === undefined ? {} : { digest: record.digest, value: record.value }),
          };
        }),
        dispatch: {
          phase: built.dispatch.phase,
          admission: built.dispatch.admission,
          ...(built.dispatch.reason === undefined ? {} : { reason: built.dispatch.reason }),
        },
      };
      writeOperational(machine, args.follow ? "Build observation finished" : "Build submitted",
        built.status === "failed" ? "error" : built.status === "cancelled" ? "warning" : "success", [
          ["Build", built.id],
          ["Status", built.status],
          ["Worker", String(worker.pid)],
          ["Goals", String(machine.goals.length)],
        ]);
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
    writeCliOutput(io, args, {
      kind: "plan",
      machine: result.plan,
      run: loaded.path,
      targetSet: loaded.run.graph.selectedTargets,
    });
  } finally {
    await runtime?.close();
  }
}
