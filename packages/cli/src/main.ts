import { dirname, extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

import type {
  ExternalServiceProgress,
  ExternalServiceReport,
  LocalBuildSubmission,
  LocalRuntime,
  LocalRuntimeControl,
} from "@narratage/local";
import type { NodeCompiledSourceClosure } from "@narratage/compiler-node";
import type { BuildCatalogDescriptor, CapacityReservation, OperationProgress } from "@narratage/runtime";
import { isDigest } from "@narratage/protocol";
import type { BuildState, CapabilityRef, TypeRef } from "@narratage/protocol";
import { parseSourceHeader } from "@narratage/source";
import {
  createNodePackageLock,
  loadNodePackageSet,
  loadNodePackageSelection,
  readNodePackageLock,
  writeNodePackageLock,
} from "@narratage/package-loader-node";
import type { LoadedNodePackageSet, NodePackageLock } from "@narratage/package-loader-node";

import {
  acceptedArchivedOutputs,
  collectArtifacts,
  findArchivedArtifact,
  inspectBuild,
  materializeArtifact,
  materializeRecord,
  selectArchivedRecord,
  summarizeBuildCatalog,
} from "./archive.js";
import { checkRunFile, collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliColorMode, CliIo } from "./output.js";
import { withPackageLockEdit } from "./package-lock-edit.js";
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
  readonly assetRoots: readonly string[];
  /** Host directory whose node_modules contains the packages named by a package lock. */
  readonly packageRoot: string | undefined;
  readonly runtime: string | undefined;
  readonly buildId: string | undefined;
  readonly follow: boolean;
  readonly maxWaitMs: number | undefined;
  readonly packageLock: string | undefined;
  readonly packages: readonly string[];
  readonly addPackages: readonly string[];
  readonly removePackages: readonly string[];
  readonly refresh: boolean;
  readonly verifyPackageLock: boolean;
  readonly record: string | undefined;
  readonly output: string | undefined;
  readonly name: string | undefined;
  readonly artifact: string | undefined;
  readonly to: string | undefined;
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
  /** Exact historical source path filter. It is Host presentation, never Build identity. */
  readonly source: string | undefined;
  /** Exact option spellings seen after positional dispatch. */
  readonly seenOptions: readonly string[];
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...tail] = argv;
  const scoped = command === "services" || command === "runtime" || command === "cancel" || command === "auth"
    || command === "packages";
  const action = scoped ? tail[0] : undefined;
  const positional = scoped ? tail.slice(1) : tail;
  const noFile = command === "builds" || command === "queue";
  const hasFile = !noFile && positional[0] !== undefined && !positional[0]!.startsWith("--");
  const file = hasFile ? positional[0] : undefined;
  const rest = noFile || !hasFile ? positional : positional.slice(1);
  let workspaceRoot: string | undefined;
  const assetRoots: string[] = [];
  let packageRoot: string | undefined;
  let runtime: string | undefined;
  let buildId: string | undefined;
  let follow = false;
  let maxWaitMs: number | undefined;
  let packageLock: string | undefined;
  const packages: string[] = [];
  const addPackages: string[] = [];
  const removePackages: string[] = [];
  let refresh = false;
  let verifyPackageLock = false;
  let record: string | undefined;
  let output: string | undefined;
  let name: string | undefined;
  let artifact: string | undefined;
  let to: string | undefined;
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
  let source: string | undefined;
  const seenOptions = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]!;
    if (item.startsWith("--")) {
      const repeatable = [
        "--package", "--add", "--remove", "--json", "--jsonl", "--watch", "--verbose", "--debug",
        "--no-color", "--refresh", "--follow", "--apply", "--no-services", "--asset-root",
      ].includes(item);
      if (!repeatable && seenOptions.has(item)) throw new Error(`${item} cannot be repeated`);
      seenOptions.add(item);
    }
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
    if (item === "--root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--root requires a directory");
      workspaceRoot = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--asset-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--asset-root requires a directory");
      assetRoots.push(resolve(value));
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
    if (item === "--add") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--add requires an installed package name");
      addPackages.push(value);
      index += 1;
      continue;
    }
    if (item === "--remove") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--remove requires a selected package name");
      removePackages.push(value);
      index += 1;
      continue;
    }
    if (item === "--refresh") {
      refresh = true;
      continue;
    }
    if (item === "--verify") {
      verifyPackageLock = true;
      continue;
    }
    if (item === "--runtime") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--runtime requires a declarative JSON Runtime Profile");
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
    if (item === "--source") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--source requires a source path");
      source = resolve(value);
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
    assetRoots,
    packageRoot,
    runtime,
    buildId,
    follow,
    maxWaitMs,
    packageLock,
    packages,
    addPackages,
    removePackages,
    refresh,
    verifyPackageLock,
    record,
    output,
    name,
    artifact,
    to,
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
    source,
    seenOptions: [...seenOptions],
  };
}

function assertCommandOptions(args: ParsedArgs): void {
  const common = ["--json", "--color", "--no-color", "--verbose", "--debug"];
  const allowed = new Set(common);
  const add = (...items: readonly string[]): void => { for (const item of items) allowed.add(item); };
  switch (args.command) {
    case "lock-packages":
      add("--package", "--add", "--remove", "--refresh", "--verify", "--package-root");
      break;
    case "packages":
      add("--runtime", "--root", "--package-root");
      break;
    case "services":
      // This command has older, more specific diagnostics for deployment-selection
      // flags and waiting on status/down; let its handler render those repairs.
      add("--max-wait-ms", "--runtime", "--package-lock", "--package-root", "--package", "--apply");
      break;
    case "runtime":
      if (args.action === "up" || args.action === "down") add("--max-wait-ms");
      break;
    case "gc":
      add("--apply");
      break;
    case "auth":
      add("--runtime", "--slot");
      if (args.action === "login") add("--from");
      break;
    case "queue":
      add("--runtime", "--watch", "--jsonl");
      break;
    case "get":
      add("--runtime", "--name", "--record", "--output", "--artifact", "--to");
      break;
    case "cancel":
      add("--runtime", "--reason");
      break;
    case "status":
    case "builds":
    case "history":
    case "inspect":
    case "operations":
    case "operation":
      add("--runtime");
      if (args.command === "history") add("--source");
      break;
    case "check":
    case "plan":
      add("--runtime", "--package-lock", "--package-root", "--root", "--asset-root");
      break;
    case "build":
      add("--runtime", "--package-lock", "--package-root", "--root", "--asset-root", "--build-id", "--follow",
        "--max-wait-ms", "--no-services");
      break;
  }
  const invalid = args.seenOptions.find((item) => !allowed.has(item));
  if (invalid !== undefined) {
    const command = args.action === undefined ? args.command : `${args.command} ${args.action}`;
    if (args.command === "doctor" && invalid === "--root") {
      throw new Error("doctor already uses the Runtime Profile directory and its declared root; remove --root");
    }
    throw new Error(`${invalid} does not apply to ${command}`);
  }
  if (args.seenOptions.includes("--color") && args.seenOptions.includes("--no-color")) {
    throw new Error("--color and --no-color are mutually exclusive");
  }
}

function usage(): string {
  return [
    "usage:",
    "  narratage lock-packages <lock> --package name [...] [--package-root directory]  # exact create/replace",
    "  narratage lock-packages <lock> (--add name [...] | --remove name [...]) [--package-root directory]",
    "  narratage lock-packages <lock> (--refresh | --verify) [--package-root directory]",
    "  narratage packages sync <run-source> --runtime <runtime-profile.json> [--root workspace]",
    "  narratage doctor <runtime-profile.json>",
    "  narratage services up|down|status <runtime-profile.json> [--max-wait-ms milliseconds]",
    "  narratage runtime up|status|logs|down <runtime-profile.json>",
    "  narratage queue --runtime profile.json [--watch]",
    "  narratage gc <runtime-profile.json> [--apply]",
    "  narratage check <self-described-source> [--runtime profile.json] [--package-lock file] [--root workspace] [--asset-root directory]",
    "  narratage plan <run-source> [--runtime profile.json] [--package-lock file] [--root workspace] [--asset-root directory]",
    "  narratage build <run-source> --runtime profile.json [--root workspace] [--asset-root directory] [--follow] [--no-services]",
    "  narratage status <build-id> --runtime profile.json",
    "  narratage builds --runtime profile.json",
    "  narratage history [source-output-name] --runtime profile.json [--source author.svml]",
    "  narratage inspect <build-id> --runtime profile.json",
    "  narratage get <build-id> --runtime profile.json [--name source-name|--record record-id|--output logical-output-id|--artifact digest] [--to path]",
    "  narratage operations <build-id> --runtime profile.json",
    "  narratage operation <operation-id> --runtime profile.json",
    "  narratage cancel build <build-id> --runtime profile.json [--reason text]",
    "  narratage cancel operation <operation-id> --runtime profile.json [--reason text]",
    "  narratage auth status|login|logout <endpoint-instance> --runtime profile.json [--slot name] [--from secret-file]",
    "",
    "output:",
    "  --json  --verbose  --color auto|always|never  --no-color  --debug",
  ].join("\n");
}

function requireJsonRuntimeProfile(path: string): void {
  if (extname(path) !== ".json") {
    throw new Error(
      `Narratage CLI Runtime Profiles are declarative JSON files; ${path} is not .json. `
      + "Programmatic Runtime assembly belongs in an application that embeds @narratage/local.",
    );
  }
}

function createCatalogDescriptor(options: {
  readonly core: BuildCatalogDescriptor["core"];
  readonly source: string;
  readonly compilation: NodeCompiledSourceClosure;
  readonly run?: { readonly path: string };
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
  capabilities: readonly CapabilityRef[],
  onProgress?: (event: ExternalServiceProgress) => void,
): Promise<readonly ExternalServiceReport[] | undefined> {
  if (extname(path) !== ".json") return undefined;
  const result = await distribution.externalServices.up(resolve(path), {
    capabilities,
    ...(onProgress === undefined ? {} : { onProgress }),
  });
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

function demandedCapabilities(state: BuildState): readonly CapabilityRef[] {
  const found = new Map<string, CapabilityRef>();
  for (const step of state.plan.steps) {
    const module = state.program.closure.modules.find((item) =>
      item.ref.name === step.producer.module.name && item.ref.version === step.producer.module.version);
    const producer = module?.manifest.producers.find((item) => item.name === step.producer.name);
    if (producer === undefined) {
      throw new Error(`BuildPlan refers to undeclared Producer ${step.producer.module.name}@${step.producer.module.version}#${step.producer.name}`);
    }
    for (const need of producer.needs) {
      const key = `${need.capability.module.name}@${need.capability.module.version}#${need.capability.name}`;
      found.set(key, need.capability);
    }
  }
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

function capabilityName(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

async function preflightPlan(
  runtimeProfile: string,
  distribution: CliDistribution,
  state: BuildState,
  implementationPackages?: LoadedNodePackageSet,
) {
  if (extname(runtimeProfile) !== ".json") return undefined;
  const capabilities = demandedCapabilities(state);
  const result = await distribution.doctorRuntimeConfig(runtimeProfile, {
    capabilities,
    ...(implementationPackages === undefined ? {} : { implementationPackages }),
  });
  return {
    ok: !result.diagnostics.some((item) => item.severity === "error"),
    root: result.root,
    capabilities: capabilities.map(capabilityName),
    diagnostics: result.diagnostics,
  } as const;
}

function assertPreflight(
  preflight: Awaited<ReturnType<typeof preflightPlan>>,
  ignoredCodes: ReadonlySet<string> = new Set(),
): void {
  if (preflight === undefined || preflight.ok) return;
  const errors = preflight.diagnostics.filter((item) =>
    item.severity === "error" && !ignoredCodes.has(item.code));
  if (errors.length === 0) return;
  throw new Error([
    `Runtime preflight failed for ${errors.length} demanded deployment requirement${errors.length === 1 ? "" : "s"}:`,
    ...errors.map((item) => `  ${item.code}${item.subject === undefined ? "" : ` (${item.subject})`}: ${item.message}`),
    "No Build was submitted and no external capability request was made.",
  ].join("\n"));
}

async function loadLocalRuntime(
  path: string,
  distribution: CliDistribution,
  implementationPackages?: LoadedNodePackageSet,
): Promise<LocalRuntime> {
  requireJsonRuntimeProfile(path);
  return await distribution.createRuntimeFromConfig(path, {
    ...(implementationPackages === undefined ? {} : { implementationPackages }),
  });
}

async function loadRuntimeControl(
  path: string,
  distribution: CliDistribution,
  readOnly = true,
): Promise<LocalRuntimeControl> {
  requireJsonRuntimeProfile(path);
  return await distribution.createRuntimeControlFromConfig(path, { readOnly });
}

function displayType(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}/${type.name}`;
}

function submissionStatus(
  dispatch: NonNullable<Awaited<ReturnType<LocalRuntime["status"]>>["dispatch"]>,
): LocalBuildSubmission["status"] {
  return dispatch.phase === "terminal"
    ? dispatch.terminal!
    : dispatch.phase === "leased" ? "running" : dispatch.phase;
}

function formatOperationProgress(progress: OperationProgress): string {
  if (progress.completed === undefined) return progress.phase;
  const amount = progress.total === undefined
    ? String(progress.completed)
    : `${progress.completed}/${progress.total}`;
  return `${progress.phase} · ${amount}${progress.unit === undefined ? "" : ` ${progress.unit}`}`;
}

type QueueRouteSummary = {
  readonly authority: string;
  readonly route: string;
  readonly queued: number;
  readonly active: number;
  readonly inFlight: number;
};

/** Derive the Provider → capability view from generic tickets; no model registry participates. */
function summarizeQueueRoutes(capacity: readonly CapacityReservation[]): readonly QueueRouteSummary[] {
  const groups = new Map<string, { authority: string; route: string; queued: number; active: number; inFlight: number }>();
  for (const ticket of capacity) {
    if (ticket.queue === undefined) continue;
    const key = `${ticket.queue.authority}\u0000${ticket.queue.route}`;
    const group = groups.get(key) ?? {
      authority: ticket.queue.authority,
      route: ticket.queue.route,
      queued: 0,
      active: 0,
      inFlight: 0,
    };
    if (ticket.active === undefined && !ticket.inFlight) group.queued += 1;
    if (ticket.active !== undefined) group.active += 1;
    if (ticket.inFlight) group.inFlight += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    left.authority.localeCompare(right.authority) || left.route.localeCompare(right.route));
}

function queueRouteLines(groups: readonly QueueRouteSummary[]): readonly string[] {
  const lines: string[] = [];
  let authority: string | undefined;
  for (const group of groups) {
    if (group.authority !== authority) {
      authority = group.authority;
      lines.push(authority);
    }
    lines.push(`  ${group.route}: queued ${group.queued} · active ${group.active} · remote ${group.inFlight}`);
  }
  return lines;
}

function externalServiceLine(service: ExternalServiceReport): string {
  const stateDetail = "detail" in service.state ? ` — ${service.state.detail}` : "";
  const action = service.action === undefined ? "" : ` · ${service.action}`;
  const detail = service.detail === undefined ? "" : ` · ${service.detail}`;
  const instances = service.instances.length === 0 ? "" : ` · ${service.instances.join(", ")}`;
  return `${service.id}: ${service.state.state}${stateDetail}${action}${detail}${instances}`;
}

function inlineValuePreview(value: unknown, limit = 240): string {
  const encoded = JSON.stringify(value);
  if (encoded.length <= limit) return encoded;
  return `${encoded.slice(0, Math.max(0, limit - 3))}...`;
}

async function observeBuild(
  runtime: LocalRuntime,
  initial: LocalBuildSubmission,
  options: {
    readonly maxWaitMs?: number;
    readonly workerProfile?: string;
    readonly onProgress?: (value: {
      readonly build: string;
      readonly phase: string;
      readonly operations: Readonly<Record<string, number>>;
      readonly activity: readonly string[];
    }) => void;
  },
): Promise<LocalBuildSubmission> {
  let current = initial;
  let fingerprint: string | undefined;
  let pollDelayMs = 100;
  let observedActivity = false;
  const startedAt = Date.now();
  while (current.status !== "complete" && current.status !== "failed" && current.status !== "cancelled") {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs === undefined
      ? undefined
      : options.maxWaitMs - elapsedMs;
    if (remainingMs !== undefined && remainingMs <= 0) break;
    const waitMs = remainingMs === undefined
      ? pollDelayMs
      : Math.min(pollDelayMs, remainingMs);
    await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
    const status = await runtime.activity(current.id);
    observedActivity = true;
    if (status.dispatch === undefined) {
      throw new Error(`Build ${current.id} disappeared while it was being observed`);
    }
    current = {
      id: current.id,
      state: current.state,
      status: submissionStatus(status.dispatch),
      dispatch: status.dispatch,
    };
    if (!["complete", "failed", "cancelled"].includes(current.status)
      && options.workerProfile !== undefined) {
      const worker = await runtimeProcessStatus(options.workerProfile);
      if (worker.state !== "running") {
        throw new Error(
          `Runtime Worker is ${worker.state}; Build ${current.id} remains durable. `
          + `Run narratage runtime up ${options.workerProfile}, then observe the same Build again`,
        );
      }
    }
    const operations = Object.fromEntries([...new Set(status.operations.map((item) => item.status))]
      .sort().map((state) => [state, status.operations.filter((item) => item.status === state).length]));
    const activity = status.operations
      .filter((item) => item.status === "created" || item.status === "pending")
      .map((item) => `${item.endpoint}: ${item.progress === undefined
        ? item.status
        : formatOperationProgress(item.progress)}`);
    const nextFingerprint = JSON.stringify({
      phase: status.dispatch.phase,
      terminal: status.dispatch.terminal,
      operations,
      activity: status.operations.map((item) => ({
        id: item.id,
        revision: item.revision,
        status: item.status,
        progress: item.progress,
        cancellation: item.cancellation?.status,
      })),
    });
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint;
      pollDelayMs = 100;
      options.onProgress?.({
        build: current.id,
        phase: status.dispatch.phase,
        operations,
        activity,
      });
    } else {
      pollDelayMs = Math.min(1_000, pollDelayMs * 2);
    }
  }
  if (observedActivity) {
    const status = await runtime.status(current.id);
    if (status.build === undefined || status.dispatch === undefined) {
      throw new Error(`Build ${current.id} disappeared while it was being observed`);
    }
    current = {
      id: current.id,
      state: status.build.state,
      status: submissionStatus(status.dispatch),
      dispatch: status.dispatch,
    };
  }
  return current;
}

type RuntimeArchiveView = Pick<LocalRuntimeControl, "status" | "close">;

/**
 * A Run Source needs the archive only when it names a historical Build Candidate.
 * Delay Store assembly until that edge is actually resolved, while still letting
 * the Runtime Profile single-source the author package lock for every plan.
 */
function lazyRuntimeArchive(
  path: string,
  distribution: CliDistribution,
): RuntimeArchiveView {
  let loading: Promise<LocalRuntimeControl> | undefined;
  const open = (): Promise<LocalRuntimeControl> => {
    loading ??= loadRuntimeControl(path, distribution);
    return loading;
  };
  return {
    async status(build) {
      return await (await open()).status(build);
    },
    async close() {
      if (loading !== undefined) await (await loading).close();
    },
  };
}

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  distribution: CliDistribution,
): Promise<void> {
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    const topic = argv[0] === "help" ? argv[1] : argv.includes("--help") ? argv[0] : undefined;
    writeCliHelp(io, topic);
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
  const reportServiceProgress = args.json || args.jsonl
    ? undefined
    : (event: ExternalServiceProgress): void => {
      const verb = {
        checking: "Checking",
        preparing: "Preparing",
        starting: "Starting",
        waiting: "Waiting for",
        ready: "Ready",
      }[event.phase];
      io.write(`  · ${verb} ${event.id}\n`);
    };
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
  const known = args.command === "lock-packages" || args.command === "packages" || args.command === "check" || args.command === "plan"
    || args.command === "build" || args.command === "status" || args.command === "builds"
    || args.command === "history"
    || args.command === "inspect" || args.command === "get" || args.command === "cancel"
    || args.command === "doctor" || args.command === "gc" || args.command === "services"
    || args.command === "runtime" || args.command === "queue" || args.command === "operations"
    || args.command === "operation";
  const operational = known || args.command === "auth";
  const fileOptional = args.command === "builds" || args.command === "history" || args.command === "queue";
  if (!operational || (!fileOptional && args.file === undefined)) {
    throw new Error(usage());
  }
  if (args.watch && args.command !== "queue") throw new Error("--watch applies only to queue");
  if (args.jsonl && (args.command !== "queue" || !args.watch)) {
    throw new Error("--jsonl applies only to queue --watch");
  }
  if (args.watch && args.json) throw new Error("queue --watch is a stream; use --jsonl instead of --json");
  if (args.noServices && args.command !== "build") {
    throw new Error("--no-services is only valid for build; no other command starts an external program");
  }
  if (args.command === "history" && args.file === undefined && args.source === undefined) {
    throw new Error("history requires an output name or --source path");
  }
  assertCommandOptions(args);
  if (args.runtime !== undefined) requireJsonRuntimeProfile(args.runtime);
  if (args.command === "lock-packages") {
    const exact = args.packages.length > 0;
    const mutation = args.addPackages.length > 0 || args.removePackages.length > 0;
    const modes = [exact, mutation, args.refresh, args.verifyPackageLock].filter(Boolean).length;
    if (modes !== 1) {
      throw new Error(
        "lock-packages requires exactly one operation: an exact --package selection, --add/--remove, --refresh, or --verify",
      );
    }
    if (args.packageLock !== undefined) throw new Error("lock-packages does not accept --package-lock");
    if (args.workspaceRoot !== undefined) {
      throw new Error("lock-packages does not compile a Workspace; use --package-root to locate installed packages");
    }
    const output = resolve(args.file!);
    const packageRoot = args.packageRoot ?? distribution.packageRoot ?? dirname(output);

    if (args.verifyPackageLock) {
      const loaded = await loadNodePackageSet(output, packageRoot);
      writeOperational({
        ok: true,
        mode: "verify",
        packageLock: output,
        digest: loaded.lock.digest,
        selected: loaded.lock.selected,
        packages: loaded.lock.packages,
      }, "Package lock verified", "success", [
        ["Path", output], ["Selected", String(loaded.lock.selected.length)],
        ["Activated", String(loaded.lock.packages.length)], ["Digest", loaded.lock.digest],
      ]);
      return;
    }

    await withPackageLockEdit(output, async () => {
      let mode: "replace" | "mutate" | "refresh";
      let selected: readonly string[];
      let added: readonly string[] = [];
      let removed: readonly string[] = [];
      let previous: NodePackageLock | undefined;
      let retainedSelection: readonly string[] | undefined;
      if (exact) {
        mode = "replace";
        selected = [...new Set(args.packages)].sort();
      } else {
        const current = await readNodePackageLock(output);
        if (args.refresh) {
          mode = "refresh";
          selected = current.selected;
        } else {
          mode = "mutate";
          const additions = new Set(args.addPackages);
          const removals = new Set(args.removePackages);
          const conflict = [...additions].find((name) => removals.has(name));
          if (conflict !== undefined) {
            throw new Error(`${conflict} cannot be added and removed in the same package-lock transaction`);
          }
          const currentSet = new Set(current.selected);
          const missing = [...removals].find((name) => !currentSet.has(name));
          if (missing !== undefined) {
            throw new Error(`${missing} is not selected by ${output}; no package authority was removed`);
          }
          added = [...additions].filter((name) => !currentSet.has(name)).sort();
          removed = [...removals].sort();
          if (added.length === 0 && removed.length === 0) {
            writeOperational({
              ok: true,
              changed: false,
              mode,
              packageLock: output,
              digest: current.digest,
              selected: current.selected,
              added,
              removed,
              packages: current.packages,
            }, "Package lock unchanged", "info", [
              ["Path", output], ["Selected", String(current.selected.length)], ["Digest", current.digest],
            ]);
            return;
          }
          previous = current;
          retainedSelection = current.selected.filter((name) => !removals.has(name));
          for (const name of removals) currentSet.delete(name);
          for (const name of additions) currentSet.add(name);
          selected = [...currentSet].sort();
        }
      }
      const lock = await createNodePackageLock(selected, packageRoot,
        previous === undefined || retainedSelection === undefined
          ? {}
          : { retain: { from: previous, selected: retainedSelection } });
      const artifactKey = (item: { readonly name: string; readonly version: string }): string =>
        `${item.name}@${item.version}`;
      const packageKey = (item: NodePackageLock["packages"][number]): string =>
        `${item.package.name}@${item.package.version}`;
      const physicalBefore = new Set(previous?.artifacts.map(artifactKey) ?? []);
      const physicalAfter = new Set(lock.artifacts.map(artifactKey));
      const activatedBefore = new Set(previous?.packages.map(packageKey) ?? []);
      const activatedAfter = new Set(lock.packages.map(packageKey));
      const closureChanges = previous === undefined ? undefined : {
        physical: {
          added: [...physicalAfter].filter((key) => !physicalBefore.has(key)).sort(),
          removed: [...physicalBefore].filter((key) => !physicalAfter.has(key)).sort(),
        },
        activated: {
          added: [...activatedAfter].filter((key) => !activatedBefore.has(key)).sort(),
          removed: [...activatedBefore].filter((key) => !activatedAfter.has(key)).sort(),
        },
      };
      await writeNodePackageLock(output, lock);
      writeOperational({
        ok: true,
        changed: true,
        mode,
        packageLock: output,
        digest: lock.digest,
        selected: lock.selected,
        added,
        removed,
        ...(closureChanges === undefined ? {} : { closureChanges }),
        packages: lock.packages,
      },
        "Package lock written", "success", [
          ["Path", output], ["Mode", mode], ["Selected", String(lock.selected.length)],
          ["Activated", String(lock.packages.length)],
          ...(closureChanges === undefined ? [] : [
            ["Physical + / -", `${closureChanges.physical.added.length} / ${closureChanges.physical.removed.length}`] as const,
            ["Activated + / -", `${closureChanges.activated.added.length} / ${closureChanges.activated.removed.length}`] as const,
          ]),
          ["Digest", lock.digest],
        ]);
    });
    return;
  }
  if (args.command === "packages") {
    if (args.action !== "sync") {
      throw new Error("packages takes one action: packages sync <run-source> --runtime <runtime-profile.json>");
    }
    if (args.runtime === undefined) {
      throw new Error("packages sync requires --runtime <runtime-profile.json>");
    }
    const source = resolve(args.file!);
    const profile = resolve(args.runtime);
    if (extname(profile) !== ".json") throw new Error("packages sync requires a declarative JSON Runtime Profile");
    const selection = await distribution.resolveCompilationPackages?.(profile);
    if (selection?.packageLock === undefined || selection.runtimePackageLock === undefined) {
      throw new Error("packages sync requires the Runtime Profile to declare both packageLock and runtimePackageLock");
    }
    if (selection.runtimePackages === undefined) {
      throw new Error("this Distribution cannot discover Runtime packages from the selected Profile");
    }
    const runtimePackages = selection.runtimePackages;
    const syncWorkspaceRoot = args.workspaceRoot ?? selection.root;
    const sourceSelection = await distribution.discoverSourcePackages?.(source, {
      ...(syncWorkspaceRoot === undefined ? {} : { workspaceRoot: syncWorkspaceRoot }),
    });
    if (sourceSelection === undefined) {
      throw new Error("this Distribution cannot discover packages from the selected Run Source");
    }
    const packageRoot = args.packageRoot ?? selection.packageRoot ?? distribution.packageRoot ?? dirname(profile);
    const locks = [resolve(selection.packageLock), resolve(selection.runtimePackageLock)].sort();
    if (locks[0] === locks[1]) throw new Error("packageLock and runtimePackageLock must be different files");
    const summarizeDifference = (before: NodePackageLock | undefined, after: NodePackageLock) => {
      const oldArtifacts = new Map(before?.artifacts.map((item) => [`${item.name}@${item.version}`, item.digest]) ?? []);
      const newArtifacts = new Map(after.artifacts.map((item) => [`${item.name}@${item.version}`, item.digest]));
      return {
        added: [...newArtifacts.keys()].filter((key) => !oldArtifacts.has(key)).sort(),
        removed: [...oldArtifacts.keys()].filter((key) => !newArtifacts.has(key)).sort(),
        changed: [...newArtifacts.entries()]
          .filter(([key, digest]) => oldArtifacts.has(key) && oldArtifacts.get(key) !== digest)
          .map(([key]) => key).sort(),
      };
    };
    const readExistingLock = async (path: string): Promise<NodePackageLock | undefined> => {
      try {
        return await readNodePackageLock(path);
      } catch (error) {
        if (error !== null && typeof error === "object" && "code" in error
          && (error as { readonly code?: unknown }).code === "ENOENT") return undefined;
        throw error;
      }
    };
    await withPackageLockEdit(locks[0]!, async () => await withPackageLockEdit(locks[1]!, async () => {
      const authorBefore = await readExistingLock(selection.packageLock!);
      const runtimeBefore = await readExistingLock(selection.runtimePackageLock!);
      const authorSelected = [...new Set([
        ...(authorBefore?.selected ?? []),
        ...sourceSelection.selected,
      ])].sort();
      const runtimeSelected = [...new Set([
        ...(runtimeBefore?.selected ?? []),
        ...runtimePackages,
      ])].sort();
      const [authorAfter, runtimeAfter] = await Promise.all([
        createNodePackageLock(authorSelected, packageRoot),
        createNodePackageLock(runtimeSelected, packageRoot),
      ]);
      if (authorBefore?.digest !== authorAfter.digest) await writeNodePackageLock(selection.packageLock!, authorAfter);
      if (runtimeBefore?.digest !== runtimeAfter.digest) await writeNodePackageLock(selection.runtimePackageLock!, runtimeAfter);
      const author = summarizeDifference(authorBefore, authorAfter);
      const runtime = summarizeDifference(runtimeBefore, runtimeAfter);
      const changed = [...author.added, ...author.removed, ...author.changed,
        ...runtime.added, ...runtime.removed, ...runtime.changed].length > 0
        || authorBefore?.digest !== authorAfter.digest || runtimeBefore?.digest !== runtimeAfter.digest;
      writeOperational({
        ok: true,
        changed,
        source,
        profile,
        packageRoot,
        selected: {
          author: authorSelected,
          runtime: runtimeSelected,
        },
        author: { path: selection.packageLock, digest: authorAfter.digest, difference: author },
        runtime: { path: selection.runtimePackageLock, digest: runtimeAfter.digest, difference: runtime },
      }, changed ? "Project package locks synchronized" : "Project package locks already current",
      changed ? "success" : "info", [
        ["Run", source], ["Profile", profile],
        ["Author packages", String(sourceSelection.selected.length)],
        ["Runtime packages", String(runtimePackages.length)],
        ["Updated entries", String(author.added.length + author.removed.length + author.changed.length
          + runtime.added.length + runtime.removed.length + runtime.changed.length)],
      ], args.verbose ? [
        `Package root     ${packageRoot}`,
        ...sourceSelection.selected.map((item) => `Author selected  ${item}`),
        ...runtimePackages.map((item) => `Runtime selected ${item}`),
        ...author.changed.map((item) => `Author changed   ${item}`),
        ...author.added.map((item) => `Author added     ${item}`),
        ...author.removed.map((item) => `Author removed   ${item}`),
        ...runtime.changed.map((item) => `Runtime changed  ${item}`),
        ...runtime.added.map((item) => `Runtime added    ${item}`),
        ...runtime.removed.map((item) => `Runtime removed  ${item}`),
      ] : []);
    }));
    return;
  }
  if (args.command === "doctor") {
    if (args.runtime !== undefined || args.packageLock !== undefined || args.packageRoot !== undefined
      || args.packages.length > 0 || args.apply) {
      throw new Error("doctor reads all deployment selection from the Runtime Profile itself");
    }
    const profile = resolve(args.file!);
    requireJsonRuntimeProfile(profile);
    const result = await distribution.doctorRuntimeConfig(profile);
    const machine = {
      format: "narratage.cli-doctor@1" as const,
      ok: !result.diagnostics.some((item) => item.severity === "error"),
      root: result.root,
      diagnostics: result.diagnostics,
    };
    writeCliOutput(io, args, { kind: "doctor", machine, profile });
    if (!machine.ok) io.setExitCode?.(1);
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
    requireJsonRuntimeProfile(profile);
      const result = args.action === "up"
      ? await distribution.externalServices.up(profile, {
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportServiceProgress === undefined ? {} : { onProgress: reportServiceProgress }),
      })
      : args.action === "down"
        ? await distribution.externalServices.down(profile)
        : await distribution.externalServices.report(profile);
    const ready = result.services.every((item) => item.state.state === "ready");
    const desiredState = args.action === "down" ? !result.services.some((item) => item.state.state === "ready") : ready;
    const machine = {
      format: "narratage.cli-services-status@1" as const,
      // A successful status query is not a failed lifecycle action. `ready` carries readiness.
      ok: args.action === "status" ? true : desiredState,
      ready,
      root: result.root,
      services: result.services,
    };
    const shownServices = args.verbose || args.action !== "status"
      ? result.services
      : result.services.filter((item) => item.state.state !== "ready");
    writeOperational(machine, `External services ${args.action}`,
      args.action === "status" ? ready ? "success" : "info" : machine.ok ? "success" : "warning", [
      ["Root", result.root],
      ["Services", String(result.services.length)],
      ["Ready", String(result.services.filter((item) => item.state.state === "ready").length)],
    ], shownServices.map(externalServiceLine));
    if (args.action !== "status" && !machine.ok) io.setExitCode?.(1);
    return;
  }
  if (args.command === "runtime") {
    if (args.action !== "up" && args.action !== "down" && args.action !== "status" && args.action !== "logs") {
      throw new Error("runtime takes up, down, status or logs");
    }
    const profile = resolve(args.file!);
    requireJsonRuntimeProfile(profile);
    if (args.action === "up") {
      // Validate the exact Runtime Revision against unfinished work before replacing a stale Worker
      // or starting external programs. A refusal must leave the old execution environment intact.
      const validated = await loadLocalRuntime(profile, distribution);
      await validated.close();
      const external = await distribution.externalServices.up(profile, {
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportServiceProgress === undefined ? {} : { onProgress: reportServiceProgress }),
      });
      const processState = await ensureRuntimeProcess(
        profile,
        distribution.runtimeWorkerLaunch(),
        args.maxWaitMs ?? 10_000,
      );
      const ok = processState.state === "running"
        && external.services.every((item) => item.state.state === "ready");
      writeOperational({ ok, worker: processState, services: external.services }, "Runtime is up",
        ok ? "success" : "warning", [
        ["Worker", String(processState.pid)],
        ["External services", String(external.services.length)],
      ]);
      if (!ok) io.setExitCode?.(1);
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
    // These are independent views over one Profile. Load them concurrently without inventing a
    // second registry; each selected package remains the authority for its own report.
    const runtimeLoading = loadRuntimeControl(profile, distribution);
    let runtime: LocalRuntimeControl | undefined;
    try {
      const loaded = await Promise.all([
        runtimeProcessStatus(profile),
        distribution.externalServices.report(profile),
        runtimeLoading,
      ]);
      const [worker, external, selectedRuntime] = loaded;
      runtime = selectedRuntime;
      const queue = await runtime.queue();
      const counts = Object.fromEntries(["queued", "leased", "waiting", "blocked", "settling", "terminal"]
        .map((phase) => [phase, queue.dispatches.filter((item) => item.phase === phase).length]));
      const routes = summarizeQueueRoutes(queue.capacity);
      const ready = worker.state === "running"
        && external.services.every((item) => item.state.state === "ready");
      const active = ["queued", "leased", "waiting", "blocked", "settling"]
        .reduce((total, phase) => total + (counts[phase] ?? 0), 0);
      const attention = active > 0 && !ready;
      const unavailable = external.services.filter((item) => item.state.state !== "ready");
      const machine = {
        format: "narratage.cli-runtime-status@1" as const,
        ok: true,
        ready,
        attention,
        worker,
        queue: { counts, routes, capacity: queue.capacity },
        services: external.services,
      };
      writeOperational(machine, "Runtime status", attention ? "warning" : ready ? "success" : "info", [
        ["Worker", worker.state],
        ["Queued", String(counts.queued ?? 0)],
        ["Running", String(counts.leased ?? 0)],
        ["Waiting", String(counts.waiting ?? 0)],
        ["Services", `${external.services.length - unavailable.length}/${external.services.length} ready`],
        ["Capacity reservations", String(queue.capacity.length)],
      ], [
        ...unavailable.map(externalServiceLine),
        ...queueRouteLines(routes),
      ]);
    } finally {
      if (runtime !== undefined) await runtime.close();
      else await runtimeLoading.then(async (loaded) => await loaded.close(), () => undefined);
    }
    return;
  }
  if (args.command === "gc") {
    if (args.runtime !== undefined || args.packageLock !== undefined || args.packageRoot !== undefined
      || args.packages.length > 0) {
      throw new Error("gc reads all deployment selection from the Runtime Profile itself");
    }
    const runtime = await loadRuntimeControl(resolve(args.file!), distribution, !args.apply);
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
    if (extname(args.runtime) !== ".json") {
      throw new Error("auth requires a declarative JSON Runtime Profile so credentials can be opened without executing the whole deployment");
    }
    const runtime = await distribution.createRuntimeCredentialsFromConfig(args.runtime, args.file!);
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
        if (!item.writable) {
          const source = item.ref.store === "env"
            ? `set ${item.ref.key} in the environment`
            : `configure ${item.ref.key} through CredentialStore ${item.ref.store}`;
          throw new Error(
            `CredentialStore ${item.ref.store} is read-only for ${item.label}; ${source}, `
            + "or select a writable CredentialStore such as keychain in the Runtime Profile",
          );
        }
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
  if (args.refresh) throw new Error("--refresh is only valid for lock-packages");
  if (args.noServices && args.command !== "build") {
    throw new Error("--no-services is only valid for build; no other command starts an external program");
  }
  if ((args.record !== undefined || args.output !== undefined || args.name !== undefined
    || args.artifact !== undefined || args.to !== undefined)
    && args.command !== "get") {
    throw new Error("--name, --record, --output, --artifact and --to are only valid for get");
  }
  if (args.source !== undefined && args.command !== "history") {
    throw new Error("--source is only valid for history");
  }
  if (args.command === "status" || args.command === "builds" || args.command === "inspect"
    || args.command === "history" || args.command === "get" || args.command === "cancel" || args.command === "queue"
    || args.command === "operations" || args.command === "operation") {
    if (args.runtime === undefined) throw new Error(`${args.command} requires --runtime`);
    const runtime = await loadRuntimeControl(args.runtime, distribution, args.command !== "cancel");
    try {
      if (args.command === "queue") {
        let previous: string | undefined;
        const writeQueue = async (): Promise<void> => {
          const [queue, worker] = await Promise.all([
            runtime.queue(),
            runtimeProcessStatus(args.runtime!),
          ]);
          const fingerprint = JSON.stringify({
            dispatches: queue.dispatches,
            capacity: queue.capacity,
            worker,
            operations: queue.operations.map((item) => ({
              id: item.id,
              revision: item.revision,
              status: item.status,
              progress: item.progress,
              cancellation: item.cancellation?.status,
            })),
          });
          if (args.watch && fingerprint === previous) return;
          previous = fingerprint;
          const value = {
            format: "narratage.cli-queue@1",
            at: Date.now(),
            worker,
            dispatches: queue.dispatches,
            routes: summarizeQueueRoutes(queue.capacity),
            capacity: queue.capacity,
            operations: queue.operations.map((item) => ({
              id: item.id,
              build: item.build,
              endpoint: item.endpoint,
              authority: item.authority,
              route: item.route,
              attempt: item.attempt,
              revision: item.revision,
              status: item.status,
              ...(item.progress === undefined ? {} : { progress: item.progress }),
              ...(item.cancellation === undefined ? {} : { cancellation: item.cancellation }),
            })),
          };
          const active = queue.dispatches.filter((item) => item.phase !== "terminal");
          const activeOperations = queue.operations.filter((item) =>
            item.status === "created" || item.status === "pending");
          const buildLines = active.slice(0, args.verbose ? undefined : 12).map((item) =>
            `${item.build}: ${item.phase}${item.admission === "open" ? "" : ` · ${item.admission}`}`);
          const routeLines = queueRouteLines(summarizeQueueRoutes(queue.capacity));
          const genericCapacityLines = queue.capacity.filter((item) => item.queue === undefined)
            .slice(0, args.verbose ? undefined : 12)
            .map((item) => `${item.resources.map((resource) => resource.id).join(" + ")}: ${item.active === undefined
              ? "queued"
              : "active"} · ${item.build}`);
          const operationLines = activeOperations.slice(0, args.verbose ? undefined : 12).map((item) =>
            `${item.build} · ${item.authority} → ${item.route}: ${item.progress === undefined
              ? item.status
              : formatOperationProgress(item.progress)}`);
          writeOperational(value, "Runtime queue", active.length === 0 ? "success" : "info", [
            ["Active Builds", String(active.length)],
            ["Active Operations", String(activeOperations.length)],
            ["Worker", worker.pid === undefined ? worker.state : `${worker.state} · ${worker.pid}`],
            ["Queued Builds", String(queue.dispatches.length)],
            ["Operation tickets", String(queue.capacity.length)],
          ], [
            ...buildLines,
            ...(operationLines.length === 0 ? [] : ["Operations:", ...operationLines]),
            ...(routeLines.length === 0 ? [] : ["Provider queues:", ...routeLines]),
            ...(genericCapacityLines.length === 0 ? [] : ["Other resources:", ...genericCapacityLines]),
          ]);
        };
        if (!args.watch) await writeQueue();
        else while (true) {
          await writeQueue();
          await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
        }
      } else if (args.command === "operations") {
        const status = await runtime.status(args.file!);
        const machine = { build: args.file, operations: status.operations };
        writeOperational(machine, "Build operations", "info", [
          ["Build", args.file!], ["Operations", String(status.operations.length)],
        ], status.operations.map((item) => `${item.id}: ${item.status} · ${item.authority} → ${item.route}`
          + `${item.progress === undefined ? "" : ` · ${formatOperationProgress(item.progress)}`}`
          + `${item.failure === undefined ? "" : ` · ${item.failure.code}: ${item.failure.message}`}`
          + `${item.cancellation === undefined ? "" : ` · cancellation ${item.cancellation.status}`}`));
      } else if (args.command === "operation") {
        if (!isDigest(args.file!)) throw new Error("operation id must be a content digest");
        const operation = await runtime.operation(args.file!);
        writeOperational({ operation }, operation === undefined ? "Operation not found" : "Operation detail",
          operation === undefined ? "warning" : "info", operation === undefined ? [] : [
            ["Operation", operation.id], ["Status", operation.status], ["Endpoint", operation.endpoint],
            ["Authority", operation.authority], ["Route", operation.route],
            ["Attempt", String(operation.attempt)],
            ...(operation.progress === undefined ? [] : [["Progress", formatOperationProgress(operation.progress)] as const]),
          ], operation?.failure === undefined ? [] : [
            `${operation.failure.code}: ${operation.failure.message}`,
          ]);
        if (operation === undefined) io.setExitCode?.(1);
      } else if (args.command === "builds") {
        const entries = await runtime.builds();
        const inspected = args.json || args.verbose ? entries : entries.slice(0, 20);
        const builds = await Promise.all(inspected.map(async (entry) => {
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
        writeOperational({ builds }, "Build archive", "info", [["Builds", String(entries.length)]],
          builds.map((item) => `${item.build}: ${item.status ?? "unknown"}`));
      } else if (args.command === "history") {
        const catalogs = await runtime.builds();
        const entries = (await Promise.all(catalogs.map(async (catalog) => {
          if (args.source !== undefined && catalog.source.path !== args.source) return [];
          if (args.file !== undefined && !catalog.aliases.some((alias) => alias.name === args.file)) return [];
          const status = await runtime.status(catalog.build);
          if (status.build === undefined) return [];
          return acceptedArchivedOutputs(status.build.state, catalog)
            .filter((output) => args.file === undefined || output.name === args.file)
            .map((output) => ({
              build: catalog.build,
              core: catalog.core,
              createdAt: catalog.createdAt,
              updatedAt: catalog.updatedAt,
              status: status.dispatch === undefined
                ? status.build!.state.status
                : submissionStatus(status.dispatch),
              source: catalog.source,
              ...(catalog.run === undefined ? {} : { run: catalog.run }),
              output,
            }));
        }))).flat()
          .sort((left, right) => right.createdAt - left.createdAt
            || left.output.name.localeCompare(right.output.name)
            || left.build.localeCompare(right.build));
        const query = {
          ...(args.file === undefined ? {} : { output: args.file }),
          ...(args.source === undefined ? {} : { source: args.source }),
        };
        const shown = entries.slice(0, args.verbose ? undefined : 20);
        writeOperational({ query, entries }, entries.length === 0 ? "No accepted output history" : "Output history",
          entries.length === 0 ? "warning" : "info", [
            ...(args.file === undefined ? [] : [["Output", args.file] as const]),
            ...(args.source === undefined ? [] : [["Source", args.source] as const]),
            ["Records", String(entries.length)],
          ], shown.map((item) => {
            const created = new Date(item.createdAt).toISOString();
            const digest = item.output.record.digest;
            const shortDigest = `${digest.slice(0, 18)}…`;
            return `${item.build}: ${item.output.name} · ${created} · ${shortDigest}`;
          }));
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
            revision: operation.revision,
            ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
            ...(operation.progress === undefined ? {} : { progress: operation.progress }),
            ...(operation.failure === undefined ? {} : { failure: operation.failure }),
            ...(operation.cancellation === undefined ? {} : { cancellation: operation.cancellation }),
          })),
          dispatch: status.dispatch,
        };
        const phase = status.dispatch?.phase ?? "missing";
        const notableOperations = status.operations.filter((operation) =>
          operation.status === "failed" || operation.status === "cancelled");
        writeOperational(machine, status.build === undefined ? "Build not found" : "Build status",
          status.build === undefined ? "warning" : status.dispatch?.terminal === "failed" ? "error" : "info", [
            ["Build", args.file!],
            ["Core", status.build?.state.status ?? "missing"],
            ["Dispatch", phase],
            ["Operations", String(status.operations.length)],
          ], notableOperations.map((operation) => operation.failure === undefined
            ? `${operation.endpoint}: ${operation.status}`
            : `${operation.endpoint}: ${operation.failure.code} — ${operation.failure.message}`));
        if (status.build === undefined || status.dispatch?.terminal === "failed") io.setExitCode?.(1);
      } else if (args.command === "inspect") {
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        const archive = inspectBuild(status.build.state, status.catalog);
        const machine = {
          build: status.build.build,
          revision: status.build.revision,
          archive,
          operations: status.operations.map((operation) => ({
            id: operation.id,
            command: operation.command,
            endpoint: operation.endpoint,
            attempt: operation.attempt,
            status: operation.status,
            revision: operation.revision,
            ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
            ...(operation.progress === undefined ? {} : { progress: operation.progress }),
            ...(operation.failure === undefined ? {} : { failure: operation.failure }),
          })),
        };
        const aliases = archive.presentation?.aliases ?? [];
        const aliasByOutput = new Map(aliases.flatMap((alias) =>
          alias.ref.kind === "logical-output" ? [[alias.ref.id, alias] as const] : []));
        const recordById = new Map(archive.records.map((record) => [record.id, record]));
        const targetOutputs = new Set(archive.targets.map((target) => target.output));
        const targetLines = archive.targets.map((target) => {
          const alias = aliasByOutput.get(target.output);
          const record = target.record === undefined ? undefined : recordById.get(target.record);
          const name = alias?.name ?? target.output;
          if (record === undefined) return `Target    ${name} · not accepted`;
          return `Target    ${name} · ${displayType(record.type)} · ${record.digest.slice(0, 18)}…`;
        });
        const otherAccepted = archive.demandedOutputs.filter((item) =>
          item.accepted && !targetOutputs.has(item.output));
        const otherLines = args.verbose
          ? otherAccepted.map((item) => {
              const alias = aliasByOutput.get(item.output);
              const record = recordById.get(item.record);
              const name = alias?.name ?? item.output;
              return record === undefined
                ? `Output    ${name}`
                : `Output    ${name} · ${displayType(record.type)} · ${record.digest.slice(0, 18)}…`;
            })
          : otherAccepted.length === 0
            ? []
            : [`Other accepted outputs  ${otherAccepted.length} · use --verbose to list them`];
        writeOperational(machine, "Build archive detail", "info", [
          ["Build", status.build.build], ["Status", archive.status],
          ["Targets", String(archive.targets.length)], ["Accepted records", String(archive.records.length)],
          ["Operations", String(status.operations.length)],
          ...(args.verbose ? [["Revision", String(status.build.revision)] as const] : []),
        ], [...targetLines, ...otherLines]);
      } else if (args.command === "get") {
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        if (args.artifact !== undefined && (args.name !== undefined || args.record !== undefined || args.output !== undefined)) {
          throw new Error("get accepts one of --name, --record, --output or --artifact");
        }
        if (args.artifact !== undefined) {
          const references = findArchivedArtifact(status.build.state, args.artifact);
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
            ...(record.value.kind === "inline"
              ? [["Value", inlineValuePreview(record.value.value)] as const]
              : []),
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
          const title = result === undefined
            ? "Build not found"
            : result.terminal === "cancelled"
              ? "Build cancelled"
              : result.phase === "terminal"
                ? "Build already finished"
                : "Build cancellation requested";
          writeOperational(machine, title,
            result === undefined ? "warning" : result.phase === "terminal" && result.terminal !== "cancelled" ? "info" : "success", [
              ["Build", args.file!], ["Admission", result?.admission ?? "missing"], ["Phase", result?.phase ?? "missing"],
            ], result?.phase === "terminal" && result.terminal !== "cancelled"
              ? [`No running work was changed; this Build is already ${result.terminal}.`]
              : []);
          if (result === undefined) io.setExitCode?.(1);
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
          if (result === undefined) io.setExitCode?.(1);
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
  const runtimePackageSelection = args.runtime === undefined
    ? undefined
    : await distribution.resolveCompilationPackages?.(args.runtime);
  if (args.packageLock !== undefined && runtimePackageSelection?.packageLock !== undefined
    && resolve(args.packageLock) !== resolve(runtimePackageSelection.packageLock)) {
    throw new Error(
      `--package-lock ${args.packageLock} differs from the deterministic package lock selected by ${args.runtime}`,
    );
  }
  const effectivePackageLock = args.packageLock ?? runtimePackageSelection?.packageLock;
  const effectivePackageRoot = args.packageRoot ?? runtimePackageSelection?.packageRoot;
  const effectiveWorkspaceRoot = args.workspaceRoot
    ?? runtimePackageSelection?.root
    ?? (effectivePackageLock === undefined ? undefined : dirname(resolve(effectivePackageLock)));
  if (effectivePackageRoot !== undefined && effectivePackageLock === undefined) {
    throw new Error("--package-root locates the installed packages named by --package-lock; provide both options");
  }
  const exactSourceSelection = effectivePackageLock === undefined
    ? undefined
    : await distribution.discoverSourcePackages?.(args.file!, {
        ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
      });
  const loadedPackageSet = effectivePackageLock === undefined
    ? undefined
    : exactSourceSelection === undefined
      ? await loadNodePackageSet(
          effectivePackageLock,
          effectivePackageRoot ?? distribution.packageRoot ?? dirname(effectivePackageLock),
        )
      : await loadNodePackageSelection(
          effectivePackageLock,
          exactSourceSelection,
          effectivePackageRoot ?? distribution.packageRoot ?? dirname(effectivePackageLock),
        );
  const packageContributions = loadedPackageSet?.contributions ?? distribution.builtInPackageContributions;
  const runFrontends = collectRunFrontends(distribution.runFrontends, packageContributions);
  const compiler = distribution.createCompiler({
    ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
    ...(args.assetRoots.length === 0 ? {} : { assetRoots: args.assetRoots }),
    packageContributions,
  });
  const workspace = await compiler.openFile(args.file!);
  const sourceHeader = parseSourceHeader(workspace.entry.name, workspace.entry.text);
  const runMode = runFrontends.some((frontend) => frontend.id === sourceHeader.using);
  const authorMode = compiler.supportsFrontend(sourceHeader.using);
  if (runMode === authorMode) {
    const message = runMode
      ? `Frontend ${sourceHeader.using} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${sourceHeader.using}`;
    throw new Error(effectivePackageLock === undefined && !runMode
      ? `${message}; select the project's package inventory with --runtime <profile> or --package-lock <lock>`
      : message);
  }
  if ((args.command === "plan" || args.command === "build") && !runMode) {
    throw new Error(`${args.command} requires a self-described Run Source; check Author Sources independently`);
  }
  if (args.command === "check") {
    if (runMode) {
        const loaded = await checkRunFile({
          workspace,
          authorCompiler: compiler,
          frontends: runFrontends,
          packageContributions,
        });
        const machine = {
          format: "narratage.cli-check@1" as const,
          sourceKind: "run" as const,
          ok: true,
          run: loaded.source,
          source: loaded.authorSource,
          authorSourceClosure: loaded.author.closure.id,
          runSourceClosure: loaded.closure.id,
          authorModuleClosure: loaded.author.program.closure.digest,
          executionModuleClosure: loaded.program.closure.digest,
          authorGraph: loaded.author.elaboration.graph.id,
          targets: loaded.document.targets,
          candidates: Object.fromEntries(loaded.document.candidates.map((item) => [item.id, item.kind])),
          satisfactions: loaded.document.satisfactions,
          unresolvedBuildRecords: loaded.unresolvedBuildRecords,
        } as const;
        writeCliOutput(io, args, {
          kind: "check-run",
          machine,
          frontend: sourceHeader.using,
        });
        return;
    }
    {
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
    }
  }
  if (args.command === "build") {
    if (args.runtime === undefined) throw new Error("build requires --runtime with a declarative JSON Runtime Profile");
    const archive = lazyRuntimeArchive(args.runtime, distribution);
    let loadedRun;
    try {
      loadedRun = await loadRunFile({
        workspace,
        authorCompiler: compiler,
        frontends: runFrontends,
        packageContributions,
        runtime: archive,
      });
    } finally {
      await archive.close();
    }
    const result = loadedRun.compiler.planCompilation(loadedRun, loadedPackageSet?.lock.digest);
    const preflight = await preflightPlan(args.runtime, distribution, result.state, loadedPackageSet);
    // A managed program being down is repairable after Runtime validation;
    // every other deployment error fails before we construct execution or
    // start anything. With --no-services, readiness errors remain fatal.
    assertPreflight(preflight, args.noServices
      ? new Set()
      : new Set(["EXTERNAL_SERVICE_DOWN", "EXTERNAL_SERVICE_MISMATCH"]));
    const runtime = await loadLocalRuntime(args.runtime, distribution, loadedPackageSet);
    try {
      const catalog = createCatalogDescriptor({
        core: result.state.id,
        source: loadedRun.authorSource,
        compilation: result.compilation.author,
        run: {
          path: loadedRun.path,
        },
      });
      const request = {
        id: args.buildId ?? result.state.id,
        state: result.state,
        catalog,
        attachments: result.compilation.attachments,
      } as const;
      const services = args.noServices
        ? undefined
        : await startDeclaredServices(
            args.runtime,
            distribution,
            demandedCapabilities(result.state),
            reportServiceProgress,
          );
      const worker = await ensureRuntimeProcess(
        args.runtime,
        distribution.runtimeWorkerLaunch(),
        args.maxWaitMs ?? 10_000,
      );
      let built = await runtime.build(request);
      if (args.follow) {
        built = await observeBuild(runtime, built, {
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
          workerProfile: args.runtime,
          ...(args.json || args.jsonl ? {} : {
            onProgress: (progress) => {
              const operations = Object.entries(progress.operations)
                .map(([status, count]) => `${count} ${status}`)
                .join(", ");
              io.write(`  · ${progress.build}: ${progress.phase}`
                + `${operations.length === 0 ? "" : ` · ${operations}`}\n`);
              for (const line of progress.activity) io.write(`    ${line}\n`);
            },
          }),
        });
      }
      const targetOutputs = new Set(built.state.request.targets.map((target) => target.output));
      const targetAliases = catalog.aliases.filter((alias) =>
        alias.ref.kind === "logical-output" && targetOutputs.has(alias.ref.id));
      const targetPresentations = targetAliases.map((alias) => {
        const selection = built.state.plan.selections.find((item) => item.output === alias.ref.id);
        const record = selection === undefined
          ? undefined
          : built.state.records.find((item) => item.id === selection.record);
        return {
          alias,
          record,
          ...(record?.value.kind === "inline"
            ? { inline: inlineValuePreview(record.value.value) }
            : {}),
        };
      });
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
            ...(record === undefined ? {} : { digest: record.digest, value: record.value }),
          };
        }),
        dispatch: {
          phase: built.dispatch.phase,
          admission: built.dispatch.admission,
          ...(built.dispatch.reason === undefined ? {} : { reason: built.dispatch.reason }),
        },
      };
      const terminalLines = targetPresentations.length === 0
        ? [`Inspect  narratage inspect ${built.id} --runtime ${args.runtime}`]
        : [
            `Inspect  narratage inspect ${built.id} --runtime ${args.runtime}`,
            ...targetPresentations
              .filter((item) => item.inline !== undefined)
              .slice(0, args.verbose ? undefined : 8)
              .map((item) => `Result   ${item.alias.name} = ${item.inline}`),
            ...targetPresentations
              .filter((item) => item.inline === undefined)
              .slice(0, args.verbose ? undefined : 4)
              .map((item) =>
                `Export   narratage get ${built.id} --runtime ${args.runtime} --name ${item.alias.name} --to <path>`),
          ];
      const terminal = built.dispatch.phase === "terminal";
      writeOperational(machine, args.follow
        ? terminal ? "Build finished" : "Build still running"
        : "Build submitted",
      built.status === "failed" ? "error"
        : built.status === "cancelled" || (args.follow && !terminal) ? "warning" : "success", [
          ["Build", built.id],
          ["Status", built.status],
          ["Worker", String(worker.pid)],
          ["Goals", String(machine.goals.length)],
        ], terminal ? terminalLines : [
          `Status   narratage status ${built.id} --runtime ${args.runtime}`,
          `Watch    narratage queue --runtime ${args.runtime} --watch`,
          `Cancel   narratage cancel build ${built.id} --runtime ${args.runtime}`,
        ]);
      if (built.status === "failed") io.setExitCode?.(1);
    } finally {
      await runtime.close();
    }
    return;
  }
  let runtime: RuntimeArchiveView | undefined;
  try {
    runtime = args.runtime === undefined
      ? undefined
      : lazyRuntimeArchive(args.runtime, distribution);
    const loaded = await loadRunFile({
      workspace,
      authorCompiler: compiler,
      frontends: runFrontends,
      packageContributions,
      ...(runtime === undefined ? {} : { runtime }),
    });
    const result = loaded.compiler.planCompilation(loaded, loadedPackageSet?.lock.digest);
    const preflight = args.runtime === undefined
      ? undefined
      : await preflightPlan(args.runtime, distribution, result.state, loadedPackageSet);
    writeCliOutput(io, args, {
      kind: "plan",
      machine: {
        format: "narratage.cli-plan@1",
        ok: true,
        plan: result.plan,
        ...(preflight === undefined ? {} : { preflight }),
      },
      run: loaded.path,
      outputNames: Object.fromEntries(result.compilation.author.exports.flatMap((item) =>
        item.ref.kind === "logical-output" ? [[item.ref.id, item.name]] : [])),
      candidateNames: Object.fromEntries(Object.entries(loaded.run.candidates)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, id]) => [id, name])),
    });
  } finally {
    await runtime?.close();
  }
}
