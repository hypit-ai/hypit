import { resolve } from "node:path";

import { parseCliDecimalInteger, writeCliOutput } from "@hypit/cli/public";
import type { CliApplicationContext, CliCommandModule, CliIo, CliOutputOptions } from "@hypit/cli/public";

import {
  bringManagedProgramsUp,
  prepareManagedPrograms,
  reportManagedPrograms,
  takeManagedProgramsDown,
} from "./programs.js";
import type { ManagedProgramProgress, ManagedProgramReport } from "./programs.js";

type ProgramAction = "prepare" | "up" | "status" | "down";

type ProgramCommand = {
  readonly action: ProgramAction;
  readonly environment: string;
  readonly endpoints: readonly string[];
  readonly maxWaitMs?: number;
  readonly limit: number;
  readonly presentation: CliOutputOptions;
};

export type LocalExecutionEnvironmentCliOptions = {
  readonly packageRoot: string;
  readonly distributionPackageRoot?: string;
};

function positiveInteger(value: string, name: string): number {
  const parsed = parseCliDecimalInteger(value);
  if (parsed === undefined || parsed < 1) throw new Error(`${name} requires a positive integer`);
  return parsed;
}

function parse(argv: readonly string[], cwd: string): ProgramCommand {
  if (argv[0] !== "programs") throw new Error(`Unknown Execution Environment command ${JSON.stringify(argv[0])}`);
  const action = argv[1];
  if (action !== "prepare" && action !== "up" && action !== "status" && action !== "down") {
    throw new Error("programs takes prepare, up, status or down");
  }
  const positional: string[] = [];
  const endpoints: string[] = [];
  let environment: string | undefined;
  let maxWaitMs: number | undefined;
  let limit = 20;
  let json = false;
  let verbose = false;
  let color: CliOutputOptions["color"] = "auto";
  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]!;
    const next = (name: string): string => {
      const selected = argv[index + 1];
      if (selected === undefined || selected.startsWith("--")) throw new Error(`${name} requires a value`);
      index += 1;
      return selected;
    };
    if (value === "--environment") { environment = resolve(cwd, next(value)); continue; }
    if (value === "--endpoint") { endpoints.push(next(value)); continue; }
    if (value === "--max-wait-ms") { maxWaitMs = positiveInteger(next(value), value); continue; }
    if (value === "--limit") { limit = positiveInteger(next(value), value); continue; }
    if (value === "--json") { json = true; continue; }
    if (value === "--verbose") { verbose = true; continue; }
    if (value === "--no-color") { color = "never"; continue; }
    if (value === "--color") {
      const selected = next(value);
      if (selected !== "auto" && selected !== "always" && selected !== "never") throw new Error("--color takes auto, always or never");
      color = selected;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown programs option ${value}`);
    positional.push(value);
  }
  if (environment !== undefined && positional.length > 0) {
    throw new Error("programs accepts the Environment Profile either positionally or with --environment, not both");
  }
  if (positional.length > 1) throw new Error("programs received too many positional arguments");
  const profile = environment ?? (positional[0] === undefined ? undefined : resolve(cwd, positional[0]));
  if (profile === undefined) throw new Error("programs requires an Environment Profile; pass it positionally or with --environment <profile>");
  if (action !== "up" && maxWaitMs !== undefined) throw new Error("--max-wait-ms applies to programs up");
  return {
    action,
    environment: profile,
    endpoints,
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    limit,
    presentation: { json, verbose, color },
  };
}

function record(item: ManagedProgramReport) {
  return {
    ...item,
    state: item.state.state,
    ...(item.state.state === "ready" ? {} : { stateDetail: item.state.detail }),
  };
}

function description(item: ManagedProgramReport): string {
  const details = [...new Set([
    ...(item.state.state === "ready" ? [] : [item.state.detail]),
    ...(item.detail === undefined ? [] : [item.detail]),
  ])];
  return `${item.id}: ${item.state.state}${details.length === 0 ? "" : ` — ${details.join("; ")}`}`
    + (item.endpoint === item.id ? "" : ` · endpoint ${item.endpoint}`)
    + (item.pid === undefined ? "" : ` · PID ${item.pid}`)
    + (item.logPath === undefined ? "" : ` · log ${item.logPath}`);
}

async function run(
  argv: readonly string[],
  io: CliIo,
  context: CliApplicationContext,
  application: LocalExecutionEnvironmentCliOptions,
): Promise<void> {
  const args = parse(argv, context.cwd);
  const progress = args.presentation.json ? io.writeProgress : io.writeProgress ?? io.write;
  const onProgress = progress === undefined ? undefined : (event: ManagedProgramProgress): void => {
    if (!args.presentation.verbose && event.detail === undefined && event.phase !== "installing" && event.phase !== "starting") return;
    const verb = { checking: "Checking", installing: "Installing", starting: "Starting", waiting: "Waiting for", ready: "Ready" }[event.phase];
    progress(`  · ${verb} ${event.id}${event.detail === undefined ? "" : ` — ${event.detail}`}${event.logPath === undefined ? "" : ` · log ${event.logPath}`}\n`);
  };
  const scope = args.endpoints.length === 0 ? {} : { endpoints: args.endpoints };
  const options = {
    packageRoot: application.packageRoot,
    ...(application.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: application.distributionPackageRoot }),
    ...scope,
  };
  const result = args.action === "up"
    ? await bringManagedProgramsUp(args.environment, {
        ...options,
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(onProgress === undefined ? {} : { onProgress }),
      })
    : args.action === "prepare"
      ? await prepareManagedPrograms(args.environment, { ...options, ...(onProgress === undefined ? {} : { onProgress }) })
      : args.action === "down"
        ? await takeManagedProgramsDown(args.environment, options)
        : await reportManagedPrograms(args.environment, options);
  const needsAttention = (item: ManagedProgramReport) => args.action === "down"
    ? item.action !== "nothing-to-stop" && (item.state.state !== "down" || item.action !== "stopped")
    : item.state.state !== "ready";
  const ok = args.action === "status" || !result.programs.some(needsAttention);
  const urgent = result.programs.filter(needsAttention);
  const ordinary = result.programs.filter((item) => !needsAttention(item));
  const shown = [...urgent, ...ordinary.slice(0, Math.max(0, args.limit - urgent.length))];
  const readyCount = result.programs.filter((item) => item.state.state === "ready").length;
  writeCliOutput(io, args.presentation, {
    kind: "operational",
    machine: {
      format: "hypit.cli-environment-programs@1",
      environment: args.environment,
      action: args.action,
      ok,
      programCount: result.programs.length,
      readyCount,
      programs: shown.map(record),
      ...(shown.length === result.programs.length ? {} : { omittedPrograms: result.programs.length - shown.length }),
    },
    title: args.action === "status" ? "Environment program status"
      : ok ? "Environment programs updated" : "Environment programs need attention",
    status: args.action === "status" ? "info" : ok ? "success" : "warning",
    facts: [["Environment", args.environment], ["Programs", String(result.programs.length)], ["Ready", String(readyCount)]],
    lines: shown.map(description),
  });
  if (!ok) io.setExitCode?.(1);
}

export function createLocalExecutionEnvironmentCliCommandModules(
  options: LocalExecutionEnvironmentCliOptions,
): readonly CliCommandModule[] {
  return [{
    id: "@hypit/execution-environment-local#cli",
    commands: ["programs"],
    writeRootHelp: (io) => { io.write("\nExecution Environment\n  programs prepare|up|status|down <environment-profile>\n"); },
    writeHelp: (argv, io) => {
      const topic = argv[0] === "help" ? argv[1] : argv[0];
      if (topic === "programs") io.write("hypit programs\nOperate programs declared by an Execution Environment.\n\n"
        + "  hypit programs prepare|up|status|down <environment-profile>\n"
        + "  hypit programs prepare|up|status|down --environment <profile>\n");
    },
    run: async (argv, io, context) => await run(argv, io, context, options),
  }];
}
