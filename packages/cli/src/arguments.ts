import { resolve } from "node:path";

import type {
  AuthCommand,
  CliCommand,
  ExecutionCommand,
  ProjectOption,
  ProjectResultCommand,
  RuntimeOption,
} from "./command.js";
import type { CliOutputOptions } from "./output.js";
import { parseCliGlobalOptions } from "./global-options.js";
import { parseCliDecimalInteger } from "./decimal-integer.js";
import { CliUsageError } from "./usage-error.js";
import type { InvocationRequestOverride } from "@hypit/invocation";

type RawOptions = {
  readonly presentation: CliOutputOptions;
  readonly projectRoot?: string;
  readonly assetRoots: readonly string[];
  readonly targets: readonly string[];
  readonly overrides: readonly InvocationRequestOverride[];
  readonly endpoints: readonly string[];
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
  readonly reason?: string;
  readonly slot?: string;
  readonly credentialFile?: string;
  readonly source?: string;
  readonly seenOptions: readonly string[];
};

const commonOptions = ["--json", "--color", "--no-color", "--verbose", "--debug"] as const;

export function parseCommand(argv: readonly string[], cwd = process.cwd()): CliCommand {
  try { return parseArguments(argv, cwd); }
  catch (error) {
    if (error instanceof CliUsageError) throw error;
    throw new CliUsageError(error instanceof Error ? error.message : String(error),
      argv[0] === undefined ? "hypit help" : `hypit help ${argv[0]}`, { cause: error });
  }
}

function parseArguments(argv: readonly string[], cwd: string): CliCommand {
  const [command, ...tail] = argv;
  switch (command) {
    case "check": {
      const [source, rest] = requiredPositional(tail, "check requires one Source");
      const options = commandOptions(command, rest, cwd,
        "--package-root", "--project", "--asset-root", "--limit");
      return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        limit: options.limit,
        ...optionalProject(options),
        ...optionalPackageRoot(options),
      };
    }
    case "plan":
    case "pricing": {
      const [source, rest] = requiredPositional(tail, `${command} requires one Source`);
      const options = commandOptions(command, rest, cwd,
        "--runtime", "--package-root", "--project", "--asset-root", "--target", "--override", "--limit");
      if (command === "pricing") return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        targets: options.targets,
        overrides: options.overrides,
        ...(options.seenOptions.includes("--limit") ? { limit: options.limit } : {}),
        ...optionalProject(options),
        ...optionalRuntime(options),
        ...optionalPackageRoot(options),
      };
      return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        targets: options.targets,
        overrides: options.overrides,
        limit: options.limit,
        ...optionalProject(options),
        ...optionalRuntime(options),
        ...optionalPackageRoot(options),
      };
    }
    case "build": {
      const [source, rest] = requiredPositional(tail, "build requires one Author Source or Invocation preset");
      const options = commandOptions(command, rest, cwd,
        "--runtime", "--package-root", "--project", "--asset-root", "--target", "--override", "--follow", "--max-wait-ms", "--title", "--limit");
      return {
        command,
        source,
        presentation: options.presentation,
        assetRoots: options.assetRoots,
        targets: options.targets,
        overrides: options.overrides,
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
      const options = commandOptions(command, tail, cwd, "--project", "--limit", "--before");
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
      const options = commandOptions(command, rest, cwd, "--project", "--source", "--limit", "--before");
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
      const options = commandOptions(command, rest, cwd, "--project", "--output", "--limit");
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
      const options = commandOptions(command, rest, cwd, "--project", "--output", "--to");
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
    case "logs": {
      const [build, rest] = requiredPositional(tail, "logs requires one Build id");
      const options = commandOptions(command, rest, cwd, "--runtime", "--project", "--lines");
      return { command, build, lines: options.lines, presentation: options.presentation,
        ...optionalProject(options), ...optionalRuntime(options) };
    }
    case "status": {
      const [build, rest] = requiredPositional(tail, "status requires one Build id");
      const options = commandOptions(command, rest, cwd, "--runtime", "--project", "--watch", "--max-wait-ms", "--limit");
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
      const options = commandOptions(command, tail, cwd, "--runtime", "--project", "--watch", "--jsonl", "--limit");
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
      const options = commandOptions(command, rest, cwd, "--runtime", "--project", "--reason");
      return {
        command,
        build,
        presentation: options.presentation,
        ...optionalRuntime(options),
        ...(options.reason === undefined ? {} : { reason: options.reason }),
      };
    }
    case "result": return parseResultCommand(tail, cwd);
    case "auth": return parseAuthCommand(tail, cwd);
    case "doctor": {
      const [profile, rest] = optionalPositional(tail);
      const options = commandOptions(command, rest, cwd, "--project", "--runtime", "--limit", "--endpoint");
      if (profile !== undefined && options.runtimeProfile !== undefined) {
        throw new Error("doctor accepts the Runtime Profile either positionally or with --runtime, not both");
      }
      return {
        command,
        ...(options.endpoints.length === 0 ? {} : { endpoints: options.endpoints }),
        presentation: options.presentation,
        limit: options.limit,
        ...optionalProject(options),
        ...runtimeOption(profile ?? options.runtimeProfile),
      };
    }
    default: throw new CliUsageError(command === undefined ? "A command is required"
      : `Unknown command ${JSON.stringify(command)}`, "hypit help");
  }
}

function parseResultCommand(tail: readonly string[], cwd: string): ProjectResultCommand | ExecutionCommand {
  const [action, ...values] = tail;
  if (action !== "finish" && action !== "discard" && action !== "edit") {
    throw new Error("result accepts finish, discard or edit");
  }
  const [build, rest] = requiredPositional(values, `result ${action} requires one Build id`);
  if (action === "finish" || action === "discard") {
    const options = commandOptions(`result ${action}`, rest, cwd, "--runtime", "--project");
    return { command: "result", action, build, presentation: options.presentation, ...optionalRuntime(options) };
  }
  const options = commandOptions("result edit", rest, cwd,
    "--project", "--title", "--note", "--highlight", "--clear-title", "--clear-note", "--clear-highlights", "--limit");
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

function parseAuthCommand(tail: readonly string[], cwd: string): AuthCommand {
  const [action, ...values] = tail;
  if (action !== "status" && action !== "login" && action !== "logout") {
    throw new Error("auth takes status, login or logout");
  }
  const [endpoint, rest] = requiredPositional(values, `auth ${action} requires one Endpoint instance`);
  const options = commandOptions(`auth ${action}`, rest, cwd,
    "--runtime", "--project", "--slot", ...(action === "login" ? ["--from"] as const : []),
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

function commandOptions(label: string, values: readonly string[], cwd: string, ...allowed: readonly string[]): RawOptions {
  const options = parseOptions(values, cwd);
  const accepted = new Set<string>([...commonOptions, ...allowed]);
  const invalid = options.seenOptions.find((item) => !accepted.has(item));
  if (invalid !== undefined) throw new Error(`${invalid} does not apply to ${label}`);
  return options;
}

function parseOptions(values: readonly string[], cwd: string): RawOptions {
  const global = parseCliGlobalOptions(values);
  if (global.issue !== undefined) throw new Error(global.issue);
  let projectRoot: string | undefined;
  const assetRoots: string[] = [];
  const targets: string[] = [];
  const overrides: InvocationRequestOverride[] = [];
  let packageRoot: string | undefined;
  let runtimeProfile: string | undefined;
  let follow = false;
  let maxWaitMs: number | undefined;
  const endpoints: string[] = [];
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
  let watch = false;
  let reason: string | undefined;
  let slot: string | undefined;
  let credentialFile: string | undefined;
  let source: string | undefined;
  const seenOptions = new Set<string>(global.seenOptions);
  for (let index = 0; index < global.remaining.length; index += 1) {
    const item = global.remaining[index]!;
    if (!item.startsWith("--")) throw new Error(`unexpected positional argument ${item}`);
    const repeatable = item === "--endpoint" || [
      "--json", "--jsonl", "--watch", "--verbose", "--debug",
      "--no-color", "--follow", "--asset-root", "--highlight", "--target", "--override",
    ].includes(item);
    if (!repeatable && seenOptions.has(item)) throw new Error(`${item} cannot be repeated`);
    seenOptions.add(item);
    if (item === "--watch") { watch = true; continue; }
    if (item === "--endpoint") { endpoints.push(optionValue(global.remaining, index, "--endpoint requires an Endpoint name")); index += 1; continue; }
    if (item === "--project") {
      projectRoot = resolve(cwd, optionValue(global.remaining, index, "--project requires a directory")); index += 1; continue;
    }
    if (item === "--asset-root") {
      assetRoots.push(resolve(cwd, optionValue(global.remaining, index, "--asset-root requires a directory"))); index += 1; continue;
    }
    if (item === "--target") {
      targets.push(optionValue(global.remaining, index, "--target requires a public Output name")); index += 1; continue;
    }
    if (item === "--override") {
      overrides.push(parseInvocationOverride(optionValue(global.remaining, index,
        "--override requires <output>=primary or <output>=record:<record>")));
      index += 1; continue;
    }
    if (item === "--package-root") {
      packageRoot = resolve(cwd, optionValue(global.remaining, index, "--package-root requires a directory")); index += 1; continue;
    }
    if (item === "--runtime") {
      runtimeProfile = resolve(cwd, optionValue(global.remaining, index, "--runtime requires a Runtime Profile")); index += 1; continue;
    }
    if (item === "--out") {
      throw new Error("--out does not apply to Build submission; use `get <build-id> --output <name> --to <path>` to export one Result Output");
    }
    if (item === "--output") {
      outputName = optionValue(global.remaining, index, "--output requires a public Output name"); index += 1; continue;
    }
    if (item === "--title") {
      title = optionValue(global.remaining, index, "--title requires text"); index += 1; continue;
    }
    if (item === "--note") {
      note = optionValue(global.remaining, index, "--note requires text"); index += 1; continue;
    }
    if (item === "--highlight") {
      highlightedOutputs.push(optionValue(global.remaining, index, "--highlight requires an Output name")); index += 1; continue;
    }
    if (item === "--clear-title") { clearTitle = true; continue; }
    if (item === "--clear-note") { clearNote = true; continue; }
    if (item === "--clear-highlights") { clearHighlights = true; continue; }
    if (item === "--limit") {
      limit = positiveInteger(optionValue(global.remaining, index, "--limit requires a positive integer"), "--limit");
      index += 1; continue;
    }
    if (item === "--lines") {
      lines = positiveInteger(optionValue(global.remaining, index, "--lines requires a positive integer"), "--lines");
      index += 1; continue;
    }
    if (item === "--before") {
      before = optionValue(global.remaining, index, "--before requires a Build id"); index += 1; continue;
    }
    if (item === "--to") {
      destination = resolve(cwd, optionValue(global.remaining, index, "--to requires a file path")); index += 1; continue;
    }
    if (item === "--follow") { follow = true; continue; }
    if (item === "--max-wait-ms") {
      const value = parseCliDecimalInteger(optionValue(global.remaining, index, "--max-wait-ms requires milliseconds"));
      if (value === undefined) throw new Error("--max-wait-ms must be a non-negative safe integer");
      maxWaitMs = value; index += 1; continue;
    }
    if (item === "--reason") {
      reason = optionValue(global.remaining, index, "--reason requires text"); index += 1; continue;
    }
    if (item === "--slot") {
      slot = optionValue(global.remaining, index, "--slot requires a credential slot"); index += 1; continue;
    }
    if (item === "--from") {
      credentialFile = resolve(cwd, optionValue(global.remaining, index, "--from requires a credential file")); index += 1; continue;
    }
    if (item === "--source") {
      source = resolve(cwd, optionValue(global.remaining, index, "--source requires a source path")); index += 1; continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return {
    presentation: global.presentation,
    assetRoots,
    targets,
    overrides,
    follow,
    endpoints,
    highlightedOutputs,
    clearTitle,
    clearNote,
    clearHighlights,
    limit,
    lines,
    watch,
    seenOptions: [...seenOptions],
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    ...(runtimeProfile === undefined ? {} : { runtimeProfile }),
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    ...(outputName === undefined ? {} : { outputName }),
    ...(title === undefined ? {} : { title }),
    ...(note === undefined ? {} : { note }),
    ...(before === undefined ? {} : { before }),
    ...(destination === undefined ? {} : { destination }),
    ...(reason === undefined ? {} : { reason }),
    ...(slot === undefined ? {} : { slot }),
    ...(credentialFile === undefined ? {} : { credentialFile }),
    ...(source === undefined ? {} : { source }),
  };
}

function parseInvocationOverride(value: string): InvocationRequestOverride {
  const separator = value.indexOf("=");
  const output = separator < 0 ? "" : value.slice(0, separator).trim();
  const choice = separator < 0 ? "" : value.slice(separator + 1).trim();
  if (output.length === 0 || choice.length === 0) {
    throw new Error("--override requires <output>=primary or <output>=record:<record>");
  }
  if (choice === "primary") return { output, choice: { kind: "primary" } };
  if (choice.startsWith("record:") && choice.slice("record:".length).trim().length > 0) {
    return { output, choice: { kind: "record", record: choice.slice("record:".length).trim() } };
  }
  throw new Error("--override requires <output>=primary or <output>=record:<record>");
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
  const parsed = parseCliDecimalInteger(value);
  if (parsed === undefined || parsed < 1) throw new Error(`${option} requires a positive integer`);
  return parsed;
}

function optionalProject(options: RawOptions): ProjectOption {
  return options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot };
}

function optionalRuntime(options: RawOptions): RuntimeOption {
  return { ...runtimeOption(options.runtimeProfile), ...optionalProject(options) };
}

function runtimeOption(profile: string | undefined): RuntimeOption {
  return { runtimeProfile: profile };
}

function optionalPackageRoot(options: RawOptions): { readonly packageRoot?: string } {
  return options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot };
}

export function usage(): string {
  return [
    "usage: hypit <command> [options]",
    "",
    "Run `hypit help` for commands or `hypit help <command>` for exact syntax.",
  ].join("\n");
}
