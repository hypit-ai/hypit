/** CLI contribution owned by the local Generation Runtime implementation. */
import { unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { commandHint, parseCliDecimalInteger, writeCliOutput } from "@hypit/cli/public";
import type { CliApplicationContext, CliCommandModule, CliIo, CliMachineView, CliOutputOptions } from "@hypit/cli/public";
import { hypitHostStateRoot, hypitProjectStateRoot } from "@hypit/host-paths";
import type { CanonicalValue } from "@hypit/protocol";
import {
  clearRuntimeProfile,
  findRuntimeProfile,
  selectRuntimeProfile,
} from "./index.js";
import type {
  LocalRuntimeHost,
} from "./index.js";
import type { ManagedProgramProgress, ManagedProgramReport } from "@hypit/execution-environment-local/programs";

type LocalCommand = {
  readonly root: "runtime" | "paths" | "_worker";
  readonly action?: string;
  readonly profile?: string;
  readonly project?: string;
  readonly packageRoot?: string;
  readonly endpoints: readonly string[];
  readonly maxWaitMs?: number;
  readonly limit: number;
  readonly lines: number;
  readonly readyFile?: string;
  readonly workerOwner?: string;
  readonly executionRoot?: string;
  readonly presentation: CliOutputOptions;
};

/** Product choice consumed only by the Local Runtime command contribution. */
export type LocalRuntimeCliServices = {
  /** Physical Distribution root shown by path diagnostics and passed to the Worker Host. */
  readonly packageRoot?: string;
  readonly initialRuntimeProfile?: CanonicalValue;
  readonly initialEnvironmentProfile?: CanonicalValue;
  openLocalRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<LocalRuntimeHost>;
};

function positiveInteger(value: string, name: string): number {
  const parsed = parseCliDecimalInteger(value);
  if (parsed === undefined || parsed < 1) throw new Error(`${name} requires a positive integer`);
  return parsed;
}

function parse(argv: readonly string[], cwd: string): LocalCommand {
  const root = argv[0];
  if (root !== "runtime" && root !== "paths" && root !== "_worker") {
    throw new Error(`Unknown local Generation Runtime command ${JSON.stringify(root)}`);
  }
  const positional: string[] = [];
  const endpoints: string[] = [];
  let project: string | undefined;
  let packageRoot: string | undefined;
  let runtime: string | undefined;
  let maxWaitMs: number | undefined;
  let limit = 20;
  let lines = 200;
  let readyFile: string | undefined;
  let workerOwner: string | undefined;
  let executionRoot: string | undefined;
  let json = false;
  let verbose = false;
  let color: CliOutputOptions["color"] = "auto";
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index]!;
    const next = (name: string): string => {
      const selected = argv[index + 1];
      if (selected === undefined || selected.startsWith("--")) throw new Error(`${name} requires a value`);
      index += 1;
      return selected;
    };
    if (value === "--json") { json = true; continue; }
    if (value === "--verbose") { verbose = true; continue; }
    if (value === "--debug") continue;
    if (value === "--no-color") { color = "never"; continue; }
    if (value === "--color") {
      const selected = next("--color");
      if (selected !== "auto" && selected !== "always" && selected !== "never") throw new Error("--color takes auto, always or never");
      color = selected;
      continue;
    }
    if (value === "--project") { project = resolve(cwd, next("--project")); continue; }
    if (value === "--package-root") { packageRoot = resolve(cwd, next("--package-root")); continue; }
    if (value === "--runtime") { runtime = resolve(cwd, next("--runtime")); continue; }
    if (value === "--endpoint") { endpoints.push(next("--endpoint")); continue; }
    if (value === "--max-wait-ms") { maxWaitMs = positiveInteger(next("--max-wait-ms"), "--max-wait-ms"); continue; }
    if (value === "--limit") { limit = positiveInteger(next("--limit"), "--limit"); continue; }
    if (value === "--lines") { lines = positiveInteger(next("--lines"), "--lines"); continue; }
    if (value === "--ready-file") { readyFile = resolve(cwd, next("--ready-file")); continue; }
    if (value === "--worker-owner") { workerOwner = next("--worker-owner"); continue; }
    if (value === "--execution-root") { executionRoot = resolve(cwd, next("--execution-root")); continue; }
    if (value.startsWith("--")) throw new Error(`Unknown ${root} option ${value}`);
    positional.push(value);
  }
  if (runtime !== undefined && positional.length > (root === "runtime" ? 1 : 0)) {
    throw new Error(`${root} accepts the Runtime Profile either positionally or with --runtime, not both`);
  }
  const action = root === "runtime" ? positional.shift() : undefined;
  const profileValue = positional.shift();
  if (positional.length > 0) throw new Error(`${root} received too many positional arguments`);
  const profile = runtime ?? (profileValue === undefined ? undefined : resolve(cwd, profileValue));
  return {
    root,
    ...(action === undefined ? {} : { action }),
    ...(profile === undefined ? {} : { profile }),
    ...(project === undefined ? {} : { project }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    endpoints,
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    limit,
    lines,
    ...(readyFile === undefined ? {} : { readyFile }),
    ...(workerOwner === undefined ? {} : { workerOwner }),
    ...(executionRoot === undefined ? {} : { executionRoot }),
    presentation: { json, color, verbose },
  };
}

function programRecord(item: ManagedProgramReport) {
  return {
    ...item,
    state: item.state.state,
    ...(item.state.state === "ready" ? {} : { stateDetail: item.state.detail }),
  };
}

function programDescription(item: ManagedProgramReport): string {
  const details = [...new Set([
    ...(item.state.state === "ready" ? [] : [item.state.detail]),
    ...(item.detail === undefined ? [] : [item.detail]),
  ])];
  return `${item.id}: ${item.state.state}${details.length === 0 ? "" : ` — ${details.join("; ")}`}`
    + (item.endpoint === item.id ? "" : ` · endpoint ${item.endpoint}`)
    + (item.pid === undefined ? "" : ` · PID ${item.pid}`)
    + (item.logPath === undefined ? "" : ` · log ${item.logPath}`)
    + (item.installationLogPath === undefined || item.installationLogPath === item.logPath ? "" : ` · installation log ${item.installationLogPath}`)
    + (item.errorLogPath === undefined ? "" : ` · stderr ${item.errorLogPath}`);
}

function write(io: CliIo, args: LocalCommand, machine: CliMachineView, title: string,
  status: "success" | "warning" | "error" | "info" = "info",
  facts: readonly (readonly [string, string])[] = [], lines: readonly string[] = []): void {
  writeCliOutput(io, args.presentation, { kind: "operational", machine, title, status, facts, lines });
}

async function runLocal(
  argv: readonly string[],
  io: CliIo,
  context: CliApplicationContext,
  services: LocalRuntimeCliServices,
): Promise<void> {
  const args = parse(argv, context.cwd);
  if (args.root === "_worker") {
    const workerPackageRoot = args.packageRoot ?? services.packageRoot;
    if (args.profile === undefined || args.readyFile === undefined || args.workerOwner === undefined || workerPackageRoot === undefined) {
      throw new Error("internal Worker launch is incomplete");
    }
    const workerHost = await services.openLocalRuntimeHost(args.profile, {
      packageRoot: workerPackageRoot,
      ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
    });
    await workerHost.runWorker(args.readyFile, args.workerOwner,
      args.executionRoot === undefined ? undefined : { dataRoot: args.executionRoot });
    return;
  }
  const projectRoot = await context.resolveProjectRoot(args.project);
  const packageRoot = args.packageRoot ?? projectRoot;
  const selected = args.profile === undefined ? await findRuntimeProfile(projectRoot) : undefined;
  const profile = args.profile ?? selected?.profile;
  const host = async (path: string): Promise<LocalRuntimeHost> => await services.openLocalRuntimeHost(path, {
    packageRoot,
    ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
  });
  const progress = args.presentation.json ? io.writeProgress : io.writeProgress ?? io.write;
  const onProgress = progress === undefined ? undefined : (event: ManagedProgramProgress): void => {
    if (!args.presentation.verbose && event.detail === undefined && event.phase !== "installing" && event.phase !== "starting") return;
    const verb = { checking: "Checking", installing: "Installing", starting: "Starting", waiting: "Waiting for", ready: "Ready" }[event.phase];
    progress(`  · ${verb} ${event.id}${event.detail === undefined ? "" : ` — ${event.detail}`}${event.logPath === undefined ? "" : ` · log ${event.logPath}`}\n`);
  };

  if (args.root === "runtime" && args.action === "init") {
    if (services.initialRuntimeProfile === undefined || services.initialEnvironmentProfile === undefined) {
      throw new Error("This Hypit Distribution does not provide initial Generation Runtime and Environment Profiles");
    }
    const target = args.profile ?? resolve(projectRoot, "hypit.generation-runtime.json");
    const initialRecord = services.initialRuntimeProfile !== null
      && typeof services.initialRuntimeProfile === "object"
      && !Array.isArray(services.initialRuntimeProfile)
      ? services.initialRuntimeProfile as Readonly<Record<string, CanonicalValue>>
      : undefined;
    const environmentReference = typeof initialRecord?.environment === "string"
      ? initialRecord.environment
      : undefined;
    if (environmentReference === undefined) {
      throw new Error("Initial Generation Runtime Profile has no Environment Profile reference");
    }
    const environmentTarget = resolve(dirname(target), environmentReference);
    let environmentWritten = false;
    try {
      await writeFile(environmentTarget, `${JSON.stringify(services.initialEnvironmentProfile, undefined, 2)}\n`, { encoding: "utf8", flag: "wx" });
      environmentWritten = true;
      await writeFile(target, `${JSON.stringify(services.initialRuntimeProfile, undefined, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (environmentWritten) await unlink(environmentTarget).catch(() => {});
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new Error(`Generation Runtime or Environment Profile already exists: ${target}, ${environmentTarget}; select an existing Runtime or choose another path`);
      }
      throw error;
    }
    const saved = await selectRuntimeProfile(projectRoot, target);
    write(io, args, { format: "hypit.cli-runtime-init@1", profile: saved.profile, project: saved.projectRoot, selected: true },
      "Runtime Profile created", "success", [["Generation Runtime", saved.profile], ["Environment", environmentTarget], ["Project", saved.projectRoot]],
      ["Review the Environment Profile’s credential stores and Endpoint settings before login or runtime up.",
        "No package was installed, no service was contacted and no Worker was started."]);
    return;
  }
  if (args.root === "runtime" && args.action === "use") {
    if (args.profile === undefined) throw new Error("runtime use requires a Runtime Profile");
    const saved = await selectRuntimeProfile(projectRoot, args.profile);
    write(io, args, { format: "hypit.cli-runtime-selection@1", selected: true, profile: saved.profile, project: saved.projectRoot },
      "Runtime selected", "success", [["Profile", saved.profile], ["Project", saved.projectRoot]]);
    return;
  }
  if (args.root === "runtime" && args.action === "unset") {
    const cleared = await clearRuntimeProfile(projectRoot);
    write(io, args, { format: "hypit.cli-runtime-selection@1", selected: false, removed: cleared !== undefined,
      ...(cleared === undefined ? {} : { profile: cleared.profile, project: cleared.projectRoot }) },
    cleared === undefined ? "No Runtime was selected" : "Runtime selection removed",
    cleared === undefined ? "info" : "success", cleared === undefined ? [] : [["Profile", cleared.profile], ["Project", cleared.projectRoot]]);
    return;
  }

  if (args.root === "paths") {
    const runtimePaths = profile === undefined ? undefined : await (await host(profile)).resolvePaths();
    const profileSource: "none" | "project" | "argument" = profile === undefined ? "none" : args.profile === undefined ? "project" : "argument";
    const machine = {
      format: "hypit.cli-paths@1", project: projectRoot, profileSource,
      selectionFile: resolve(projectRoot, ".hypit/generation/runtime-profile"), projectState: hypitProjectStateRoot(projectRoot),
      ...(profile === undefined ? {} : { profile }),
      ...(runtimePaths === undefined ? {} : {
        runtimeData: runtimePaths.runtimeDataRoot,
        environmentProfile: runtimePaths.environmentProfile,
        environmentData: runtimePaths.environmentDataRoot,
      }),
      hostState: hypitHostStateRoot(),
      ...(services.packageRoot === undefined ? {} : { distribution: services.packageRoot }),
    } as const;
    write(io, args, machine, "Hypit paths", "info", [
      ["Project", projectRoot], ["Project state", machine.projectState], ["Runtime Profile", profile ?? "not selected"],
      ["Runtime selection", args.profile === undefined ? selected?.selectionFile ?? "none" : "command argument (this command only)"],
      ["Runtime data", runtimePaths?.runtimeDataRoot ?? "not selected"], ["Host state", machine.hostState],
      ["Environment Profile", runtimePaths?.environmentProfile ?? "not selected"],
      ["Environment data", runtimePaths?.environmentDataRoot ?? "not selected"],
      ["Distribution", services.packageRoot ?? "embedded"],
    ]);
    return;
  }

  if (profile === undefined) throw new Error("runtime requires a Generation Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
  const opened = await host(profile);
  const controller = await opened.controller({ packageRoot });

  if (args.action !== "up" && args.action !== "down" && args.action !== "status" && args.action !== "logs") {
    throw new Error("runtime takes init, use, unset, up, down, status or logs");
  }
  if (args.action === "up") {
    const validated = await opened.createRuntime(args.endpoints.length === 0 ? {} : { endpoints: args.endpoints });
    await validated.close();
    const external = await controller.programs.up({
      ...(args.endpoints.length === 0 ? {} : { endpoints: args.endpoints }),
      ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      ...(onProgress === undefined ? {} : { onProgress }),
    });
    const worker = await controller.worker.up(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs });
    const ok = worker.state === "running" && external.programs.every((item) => item.state.state === "ready");
    write(io, args, { format: "hypit.cli-runtime-up@1", ready: ok, worker: worker.state,
      programs: { total: external.programs.length, ready: external.programs.filter((item) => item.state.state === "ready").length,
        items: external.programs.filter((item) => args.presentation.verbose || item.state.state !== "ready").map(programRecord) } },
    ok ? "Local Runtime ready" : "Local Runtime needs attention", ok ? "success" : "warning",
    !args.presentation.verbose && ok ? [] : [["Worker", worker.state],
      ["Managed programs", `${external.programs.filter((item) => item.state.state === "ready").length}/${external.programs.length} ready`]],
    external.programs.filter((item) => args.presentation.verbose || item.state.state !== "ready").map(programDescription));
    if (!ok) io.setExitCode?.(1);
    return;
  }
  if (args.action === "logs") {
    const logs = await controller.worker.logs();
    const all = logs.text.length === 0 ? [] : logs.text.replace(/\n$/u, "").split("\n");
    const shown = all.slice(-args.lines);
    write(io, args, { format: "hypit.cli-runtime-logs@1", lines: shown, totalLines: all.length,
      omittedLines: Math.max(0, all.length - shown.length), ...(args.presentation.verbose ? { path: logs.path } : {}) },
    "Runtime logs", "info", [["Lines", `${shown.length}/${all.length}`], ...(args.presentation.verbose ? [["Path", logs.path] as const] : [])],
    shown.length === 0 ? ["No log output."] : shown);
    return;
  }
  if (args.action === "down") {
    const worker = await controller.worker.down(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs });
    const stopped = worker.state === "stopped";
    const environmentProfile = (await opened.resolvePaths()).environmentProfile;
    write(io, args, { format: "hypit.cli-runtime-down@1", worker: worker.state },
      stopped ? "Runtime Worker is down" : "Runtime Worker is still running", stopped ? "success" : "warning",
      [["Worker", worker.state]], [`Managed Programs are unchanged. To stop processes started by Hypit: ${commandHint(
        ["programs", "down", ...(environmentProfile === undefined ? [] : ["--environment", environmentProfile])], { projectRoot },
      )}`]);
    if (!stopped) io.setExitCode?.(1);
    return;
  }

  const control = await opened.openControl({ readOnly: true });
  try {
    const [worker, external, activity] = await Promise.all([controller.worker.status(), controller.programs.report(), control.activity()]);
    const unavailable = external.programs.filter((item) => item.state.state !== "ready");
    const ready = worker.state === "running" && unavailable.length === 0;
    const attention = activity.builds.some((item) => item.issue !== undefined) || (activity.builds.length > 0 && !ready);
    const counts = {
      submitting: activity.builds.filter((item) => item.activity === "submitting").length,
      working: activity.builds.filter((item) => item.activity === "ready" || item.activity === "running" || item.activity === "waiting").length,
      finalizing: activity.builds.filter((item) => item.activity === "finalizing").length,
    };
    write(io, args, { format: "hypit.cli-runtime-status@1", ready, attention, worker: { state: worker.state }, builds: counts,
      programs: { total: external.programs.length, ready: external.programs.length - unavailable.length, unavailable: unavailable.map(programRecord) },
      capacity: { active: activity.capacity.length } },
    attention ? "Local Runtime needs attention" : ready ? "Local Runtime ready"
      : worker.state === "running" ? "Runtime Worker running; Programs not ready" : "Runtime Worker stopped",
    attention ? "warning" : ready ? "success" : "info", [
      ["Worker", worker.state], ["Active Builds", String(activity.builds.length)],
      ["Programs", `${external.programs.length - unavailable.length}/${external.programs.length} ready`],
      ...(args.presentation.verbose ? [["Submitting", String(counts.submitting)] as const, ["Working", String(counts.working)] as const,
        ["Finalizing", String(counts.finalizing)] as const, ["Capacity in use", String(activity.capacity.length)] as const] : []),
    ], unavailable.map(programDescription));
  } finally { await control.close(); }
}

function writeRootHelp(io: CliIo): void {
  io.write("\nLocal Generation Runtime\n"
    + "  runtime init|use|unset|up|status|logs|down\n"
    + "  paths\n");
}

function writeHelp(argv: readonly string[], io: CliIo): void {
  const topic = argv[0] === "help" ? argv[1] : argv[0];
  if (topic === "runtime") io.write("hypit runtime\nSelect a Local Runtime Profile and operate its Build Worker.\n\n"
    + "  hypit runtime init [<profile>] [--project <project>]\n"
    + "  hypit runtime use <profile> [--project <project>]\n"
    + "  hypit runtime unset [--project <project>]\n"
    + "  hypit runtime up|status|logs|down [<profile>] [--project <project>]\n");
  else if (topic === "paths") io.write("hypit paths\nShow project, Local Runtime and host state locations.\n\n"
    + "  hypit paths [--project <project>] [--runtime <profile>]\n");
}

/** Bind Local Runtime commands to their exact Host port at application assembly. */
export function createLocalRuntimeCliCommandModules(
  services: LocalRuntimeCliServices,
): readonly CliCommandModule[] {
  return [{
    id: "@hypit/generation-runtime-local#cli",
    commands: ["runtime", "paths", "_worker"],
    writeRootHelp,
    writeHelp,
    run: async (argv, io, context) => await runLocal(argv, io, context, services),
  }];
}
