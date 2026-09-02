import { resolve } from "node:path";

import type {
  AuthCommand,
  CliCommand,
  EnvironmentCommand,
  ExecutionCommand,
  ProgramsCommand,
  ProjectOption,
  ProjectResultCommand,
  RuntimeOperationCommand,
  RuntimeOption,
  RuntimeSelectionCommand,
} from "./command.js";
import type { CliColorMode, CliOutputOptions } from "./output.js";

type RawOptions = {
  readonly presentation: CliOutputOptions;
  readonly workspaceRoot?: string;
  readonly assetRoots: readonly string[];
  readonly packageRoot?: string;
  readonly runtimeProfile?: string;
  readonly follow: boolean;
  readonly maxWaitMs?: number;
  readonly outputName?: string;
  readonly title?: string;
  readonly note?: string;
  readonly highlightedOutputs: readonly string[];
  readonly clearTitle: boolean;
  readonly clearNote: boolean;
  readonly clearHighlights: boolean;
  readonly limit: number;
  readonly lines: number;
  readonly before?: string;
  readonly destination?: string;
  readonly watch: boolean;
  readonly readyFile?: string;
  readonly workerOwner?: string;
  readonly reason?: string;
  readonly slot?: string;
  readonly credentialFile?: string;
  readonly source?: string;
  readonly seenOptions: readonly string[];
};

const commonOptions = ["--json", "--color", "--no-color", "--verbose", "--debug"] as const;

export function parseCommand(argv: readonly string[]): CliCommand {
  const [command, ...tail] = argv;
  switch (command) {
    case "check":
    case "plan": {
      const [source, rest] = requiredPositional(tail, `${command} requires one Source`);
      const options = commandOptions(command, rest,
        "--runtime", "--package-root", "--workspace", "--asset-root", "--limit");
      return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        limit: options.limit,
        ...optionalProject(options),
        ...optionalRuntime(options),
        ...optionalPackageRoot(options),
      };
    }
    case "build": {
      const [source, rest] = requiredPositional(tail, "build requires one Run Source");
      const options = commandOptions(command, rest,
        "--runtime", "--package-root", "--workspace", "--asset-root", "--follow", "--max-wait-ms", "--title", "--limit");
      return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        limit: options.limit,
        follow: options.follow,
        ...optionalProject(options),
        ...optionalRuntime(options),
        ...optionalPackageRoot(options),
        ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }),
        ...(options.title === undefined ? {} : { title: options.title }),
      };
    }
    case "builds": {
      const options = commandOptions(command, tail, "--workspace", "--limit", "--before");
      return {
        command,
        presentation: options.presentation,
        limit: options.limit,
        ...optionalProject(options),
        ...(options.before === undefined ? {} : { before: options.before }),
      };
    }
    case "history": {
      const [outputName, rest] = requiredPositional(tail, "history requires one exact Output name");
      const options = commandOptions(command, rest, "--workspace", "--source", "--limit", "--before");
      return {
        command,
        outputName,
        presentation: options.presentation,
        limit: options.limit,
        ...optionalProject(options),
        ...(options.source === undefined ? {} : { source: options.source }),
        ...(options.before === undefined ? {} : { before: options.before }),
      };
    }
    case "inspect": {
      const [build, rest] = requiredPositional(tail, "inspect requires one Build id");
      const options = commandOptions(command, rest, "--workspace", "--output", "--limit");
      return {
        command,
        build,
        presentation: options.presentation,
        limit: options.limit,
        ...optionalProject(options),
        ...(options.outputName === undefined ? {} : { outputName: options.outputName }),
      };
    }
    case "get": {
      const [build, rest] = requiredPositional(tail, "get requires one Build id");
      const options = commandOptions(command, rest, "--workspace", "--output", "--to");
      if (options.outputName === undefined) throw new Error("get requires --output with one public Output name");
      if (options.destination === undefined) throw new Error("get requires --to with the export destination");
      return {
        command,
        build,
        outputName: options.outputName,
        destination: options.destination,
        presentation: options.presentation,
        ...optionalProject(options),
      };
    }
    case "status": {
      const [build, rest] = requiredPositional(tail, "status requires one Build id");
      const options = commandOptions(command, rest, "--runtime", "--watch", "--max-wait-ms", "--limit");
      if (!options.watch && options.maxWaitMs !== undefined) {
        throw new Error("--max-wait-ms applies to status --watch");
      }
      return {
        command,
        build,
        presentation: options.presentation,
        watch: options.watch,
        limit: options.limit,
        ...optionalRuntime(options),
        ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }),
      };
    }
    case "activity": {
      const options = commandOptions(command, tail, "--runtime", "--watch", "--jsonl", "--limit");
      if (options.presentation.jsonl === true && !options.watch) {
        throw new Error("--jsonl applies only to activity --watch");
      }
      if (options.watch && options.seenOptions.includes("--json")) {
        throw new Error("activity --watch is a stream; use --jsonl instead of --json");
      }
      return {
        command,
        presentation: options.presentation,
        watch: options.watch,
        limit: options.limit,
        ...optionalRuntime(options),
      };
    }
    case "cancel": {
      const [build, rest] = requiredPositional(tail, "cancel requires one Build id");
      const options = commandOptions(command, rest, "--runtime", "--reason");
      return {
        command,
        build,
        presentation: options.presentation,
        ...optionalRuntime(options),
        ...(options.reason === undefined ? {} : { reason: options.reason }),
      };
    }
    case "result": return parseResultCommand(tail);
    case "runtime": return parseRuntimeCommand(tail);
    case "programs": return parseProgramsCommand(tail);
    case "packages": return parsePackagesCommand(tail);
    case "auth": return parseAuthCommand(tail);
    case "doctor": {
      const [profile, rest] = optionalPositional(tail);
      const options = commandOptions(command, rest, "--workspace", "--limit");
      return {
        command,
        presentation: options.presentation,
        limit: options.limit,
        ...optionalProject(options),
        ...runtimeOption(profile),
      };
    }
    case "paths": {
      const options = commandOptions(command, tail, "--runtime");
      return { command, presentation: options.presentation, ...optionalRuntime(options) };
    }
    case "_worker": {
      const [profile, rest] = requiredPositional(tail, "internal Worker launch is incomplete");
      const options = commandOptions(command, rest, "--ready-file", "--worker-owner", "--package-root");
      if (options.readyFile === undefined || options.workerOwner === undefined) {
        throw new Error("internal Worker launch is incomplete");
      }
      return {
        command,
        profile,
        readyFile: options.readyFile,
        workerOwner: options.workerOwner,
        presentation: options.presentation,
        ...optionalPackageRoot(options),
      };
    }
    default: throw new Error(usage());
  }
}

function parseResultCommand(tail: readonly string[]): ProjectResultCommand | ExecutionCommand {
  const [action, ...values] = tail;
  if (action !== "finish" && action !== "discard" && action !== "edit") {
    throw new Error("result accepts finish, discard or edit");
  }
  const [build, rest] = requiredPositional(values, `result ${action} requires one Build id`);
  if (action === "finish" || action === "discard") {
    const options = commandOptions(`result ${action}`, rest, "--runtime");
    return { command: "result", action, build, presentation: options.presentation, ...optionalRuntime(options) };
  }
  const options = commandOptions("result edit", rest,
    "--workspace", "--title", "--note", "--highlight", "--clear-title", "--clear-note", "--clear-highlights", "--limit");
  if (options.title !== undefined && options.clearTitle) throw new Error("--title and --clear-title are mutually exclusive");
  if (options.note !== undefined && options.clearNote) throw new Error("--note and --clear-note are mutually exclusive");
  if (options.highlightedOutputs.length > 0 && options.clearHighlights) {
    throw new Error("--highlight and --clear-highlights are mutually exclusive");
  }
  if (options.title === undefined && options.note === undefined && options.highlightedOutputs.length === 0
    && !options.clearTitle && !options.clearNote && !options.clearHighlights) {
    throw new Error("result edit requires a presentation change");
  }
  return {
    command: "result",
    action,
    build,
    presentation: options.presentation,
    highlightedOutputs: options.highlightedOutputs,
    clearTitle: options.clearTitle,
    clearNote: options.clearNote,
    clearHighlights: options.clearHighlights,
    limit: options.limit,
    ...optionalProject(options),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.note === undefined ? {} : { note: options.note }),
  };
}

function parseRuntimeCommand(tail: readonly string[]): RuntimeSelectionCommand | RuntimeOperationCommand {
  const [action, ...values] = tail;
  if (action !== "use" && action !== "unset" && action !== "up" && action !== "down"
    && action !== "status" && action !== "logs") {
    throw new Error("runtime takes use, unset, up, down, status or logs");
  }
  if (action === "use") {
    const [profile, rest] = requiredPositional(values, "runtime use requires a Runtime Profile");
    const options = commandOptions("runtime use", rest, "--workspace");
    return { command: "runtime", action, profile, presentation: options.presentation, ...optionalProject(options) };
  }
  if (action === "unset") {
    const options = commandOptions("runtime unset", values, "--workspace");
    return { command: "runtime", action, presentation: options.presentation, ...optionalProject(options) };
  }
  const [profile, rest] = optionalPositional(values);
  const allowed = action === "up" || action === "down"
    ? ["--runtime", "--max-wait-ms"] as const
    : action === "status"
      ? ["--runtime", "--limit"] as const
      : ["--runtime", "--lines"] as const;
  const options = commandOptions(`runtime ${action}`, rest, ...allowed);
  rejectDuplicateProfile("runtime", profile, options.runtimeProfile);
  const runtime = runtimeOption(profile ?? options.runtimeProfile);
  const common = {
    command: "runtime" as const,
    action,
    presentation: options.presentation,
    ...runtime,
  };
  if (action === "up" || action === "down") {
    return { ...common, action, ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }) };
  }
  if (action === "status") return { ...common, action, limit: options.limit };
  return { ...common, action, lines: options.lines };
}

function parseProgramsCommand(tail: readonly string[]): ProgramsCommand {
  const [action, ...values] = tail;
  if (action !== "up" && action !== "down" && action !== "status") {
    throw new Error("programs takes up, down or status");
  }
  const [profile, rest] = optionalPositional(values);
  const options = commandOptions(`programs ${action}`, rest,
    "--runtime", "--limit", "--max-wait-ms");
  if (action !== "up" && options.maxWaitMs !== undefined) {
    throw new Error("--max-wait-ms applies to programs up");
  }
  rejectDuplicateProfile("programs", profile, options.runtimeProfile);
  const runtime = runtimeOption(profile ?? options.runtimeProfile);
  const common = {
    command: "programs" as const,
    action,
    presentation: options.presentation,
    limit: options.limit,
    ...runtime,
  };
  return action === "up"
    ? { ...common, action, ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }) }
    : { ...common, action };
}

function parsePackagesCommand(tail: readonly string[]): EnvironmentCommand {
  const [action, ...values] = tail;
  if (action !== "install" && action !== "status") throw new Error("packages takes install or status");
  const [specifier, rest] = requiredPositional(values, `packages ${action} requires package@exact-version`);
  const options = commandOptions(`packages ${action}`, rest);
  return { command: "packages", action, package: specifier, presentation: options.presentation };
}

function parseAuthCommand(tail: readonly string[]): AuthCommand {
  const [action, ...values] = tail;
  if (action !== "status" && action !== "login" && action !== "logout") {
    throw new Error("auth takes status, login or logout");
  }
  const [endpoint, rest] = requiredPositional(values, `auth ${action} requires one Endpoint instance`);
  const options = commandOptions(`auth ${action}`, rest,
    "--runtime", "--slot", ...(action === "login" ? ["--from"] as const : []),
    ...(action === "status" ? ["--limit"] as const : []));
  const common = {
    command: "auth" as const,
    action,
    endpoint,
    presentation: options.presentation,
    ...optionalRuntime(options),
    ...(options.slot === undefined ? {} : { slot: options.slot }),
  };
  if (action === "status") return { ...common, action, limit: options.limit };
  if (action === "login") {
    return {
      ...common,
      action,
      ...(options.credentialFile === undefined ? {} : { credentialFile: options.credentialFile }),
    };
  }
  return { ...common, action };
}

function commandOptions(label: string, values: readonly string[], ...allowed: readonly string[]): RawOptions {
  const options = parseOptions(values);
  const accepted = new Set<string>([...commonOptions, ...allowed]);
  const invalid = options.seenOptions.find((item) => !accepted.has(item));
  if (invalid !== undefined) throw new Error(`${invalid} does not apply to ${label}`);
  return options;
}

function parseOptions(values: readonly string[]): RawOptions {
  let workspaceRoot: string | undefined;
  const assetRoots: string[] = [];
  let packageRoot: string | undefined;
  let runtimeProfile: string | undefined;
  let follow = false;
  let maxWaitMs: number | undefined;
  let outputName: string | undefined;
  let title: string | undefined;
  let note: string | undefined;
  const highlightedOutputs: string[] = [];
  let clearTitle = false;
  let clearNote = false;
  let clearHighlights = false;
  let limit = 20;
  let lines = 50;
  let before: string | undefined;
  let destination: string | undefined;
  let json = false;
  let jsonl = false;
  let color: CliColorMode = "auto";
  let verbose = false;
  let watch = false;
  let readyFile: string | undefined;
  let workerOwner: string | undefined;
  let reason: string | undefined;
  let slot: string | undefined;
  let credentialFile: string | undefined;
  let source: string | undefined;
  const seenOptions = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]!;
    if (!item.startsWith("--")) throw new Error(`unexpected positional argument ${item}`);
    const repeatable = [
      "--json", "--jsonl", "--watch", "--verbose", "--debug",
      "--no-color", "--follow", "--asset-root", "--highlight",
    ].includes(item);
    if (!repeatable && seenOptions.has(item)) throw new Error(`${item} cannot be repeated`);
    seenOptions.add(item);
    if (item === "--json") { json = true; continue; }
    if (item === "--jsonl") { jsonl = true; continue; }
    if (item === "--watch") { watch = true; continue; }
    if (item === "--verbose") { verbose = true; continue; }
    if (item === "--debug") continue;
    if (item === "--no-color") { color = "never"; continue; }
    if (item === "--color") {
      const value = optionValue(values, index, "--color requires auto, always or never");
      if (value !== "auto" && value !== "always" && value !== "never") {
        throw new Error("--color requires auto, always or never");
      }
      color = value;
      index += 1;
      continue;
    }
    if (item === "--workspace") {
      workspaceRoot = resolve(optionValue(values, index, "--workspace requires a directory")); index += 1; continue;
    }
    if (item === "--asset-root") {
      assetRoots.push(resolve(optionValue(values, index, "--asset-root requires a directory"))); index += 1; continue;
    }
    if (item === "--package-root") {
      packageRoot = resolve(optionValue(values, index, "--package-root requires a directory")); index += 1; continue;
    }
    if (item === "--runtime") {
      runtimeProfile = resolve(optionValue(values, index, "--runtime requires a Runtime Profile")); index += 1; continue;
    }
    if (item === "--out") {
      throw new Error("--out does not apply to Build submission; use `get <build-id> --output <name> --to <path>` to export one Result Output");
    }
    if (item === "--output") {
      outputName = optionValue(values, index, "--output requires a public Output name"); index += 1; continue;
    }
    if (item === "--title") {
      title = optionValue(values, index, "--title requires text"); index += 1; continue;
    }
    if (item === "--note") {
      note = optionValue(values, index, "--note requires text"); index += 1; continue;
    }
    if (item === "--highlight") {
      highlightedOutputs.push(optionValue(values, index, "--highlight requires an Output name")); index += 1; continue;
    }
    if (item === "--clear-title") { clearTitle = true; continue; }
    if (item === "--clear-note") { clearNote = true; continue; }
    if (item === "--clear-highlights") { clearHighlights = true; continue; }
    if (item === "--limit") {
      limit = positiveInteger(optionValue(values, index, "--limit requires a positive integer"), "--limit");
      index += 1; continue;
    }
    if (item === "--lines") {
      lines = positiveInteger(optionValue(values, index, "--lines requires a positive integer"), "--lines");
      index += 1; continue;
    }
    if (item === "--before") {
      before = optionValue(values, index, "--before requires a Build id"); index += 1; continue;
    }
    if (item === "--to") {
      destination = resolve(optionValue(values, index, "--to requires a file path")); index += 1; continue;
    }
    if (item === "--follow") { follow = true; continue; }
    if (item === "--max-wait-ms") {
      const value = Number(optionValue(values, index, "--max-wait-ms requires milliseconds"));
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("--max-wait-ms must be a non-negative safe integer");
      maxWaitMs = value; index += 1; continue;
    }
    if (item === "--ready-file") {
      readyFile = resolve(optionValue(values, index, "--ready-file requires a path")); index += 1; continue;
    }
    if (item === "--worker-owner") {
      workerOwner = optionValue(values, index, "--worker-owner requires an identity"); index += 1; continue;
    }
    if (item === "--reason") {
      reason = optionValue(values, index, "--reason requires text"); index += 1; continue;
    }
    if (item === "--slot") {
      slot = optionValue(values, index, "--slot requires a credential slot"); index += 1; continue;
    }
    if (item === "--from") {
      credentialFile = resolve(optionValue(values, index, "--from requires a credential file")); index += 1; continue;
    }
    if (item === "--source") {
      source = resolve(optionValue(values, index, "--source requires a source path")); index += 1; continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  if (seenOptions.has("--color") && seenOptions.has("--no-color")) {
    throw new Error("--color and --no-color are mutually exclusive");
  }
  return {
    presentation: { json: json || jsonl, ...(jsonl ? { jsonl: true } : {}), color, verbose },
    assetRoots,
    follow,
    highlightedOutputs,
    clearTitle,
    clearNote,
    clearHighlights,
    limit,
    lines,
    watch,
    seenOptions: [...seenOptions],
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    ...(runtimeProfile === undefined ? {} : { runtimeProfile }),
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    ...(outputName === undefined ? {} : { outputName }),
    ...(title === undefined ? {} : { title }),
    ...(note === undefined ? {} : { note }),
    ...(before === undefined ? {} : { before }),
    ...(destination === undefined ? {} : { destination }),
    ...(readyFile === undefined ? {} : { readyFile }),
    ...(workerOwner === undefined ? {} : { workerOwner }),
    ...(reason === undefined ? {} : { reason }),
    ...(slot === undefined ? {} : { slot }),
    ...(credentialFile === undefined ? {} : { credentialFile }),
    ...(source === undefined ? {} : { source }),
  };
}

function requiredPositional(values: readonly string[], message: string): readonly [string, readonly string[]] {
  const value = values[0];
  if (value === undefined || value.startsWith("--")) throw new Error(message);
  return [value, values.slice(1)];
}

function optionalPositional(values: readonly string[]): readonly [string | undefined, readonly string[]] {
  const value = values[0];
  return value === undefined || value.startsWith("--") ? [undefined, values] : [value, values.slice(1)];
}

function optionValue(values: readonly string[], index: number, message: string): string {
  const value = values[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(message);
  return value;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${option} requires a positive integer`);
  return parsed;
}

function optionalProject(options: RawOptions): ProjectOption {
  return options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot };
}

function optionalRuntime(options: RawOptions): RuntimeOption {
  return runtimeOption(options.runtimeProfile);
}

function runtimeOption(profile: string | undefined): RuntimeOption {
  return { runtimeProfile: profile };
}

function optionalPackageRoot(options: RawOptions): { readonly packageRoot?: string } {
  return options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot };
}

function rejectDuplicateProfile(command: "runtime" | "programs", profile: string | undefined, option: string | undefined): void {
  if (profile !== undefined && option !== undefined) {
    const detail = command === "runtime"
      ? "accepts the Runtime Profile either positionally or with --runtime, not both"
      : "reads all deployment selection from the Runtime Profile itself; provide that Profile only once";
    throw new Error(`${command} ${detail}`);
  }
}

export function usage(): string {
  return [
    "usage: hypit <command> [options]",
    "",
    "Run `hypit help` for commands or `hypit help <command>` for exact syntax.",
  ].join("\n");
}
