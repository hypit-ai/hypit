import { resolve } from "node:path";

import type { CliColorMode } from "./output.js";

export type CliCommandName =
  | "check" | "plan" | "build"
  | "builds" | "history" | "inspect" | "get" | "status" | "activity" | "cancel" | "result"
  | "runtime" | "programs" | "packages" | "auth" | "doctor" | "paths"
  | "_worker";

export type ParsedArgs = {
  readonly command: string | undefined;
  readonly action: string | undefined;
  readonly file: string | undefined;
  readonly workspaceRoot: string | undefined;
  readonly assetRoots: readonly string[];
  readonly packageRoot: string | undefined;
  readonly runtime: string | undefined;
  readonly follow: boolean;
  readonly maxWaitMs: number | undefined;
  readonly output: string | undefined;
  readonly title: string | undefined;
  readonly note: string | undefined;
  readonly highlightedOutputs: readonly string[];
  readonly clearTitle: boolean;
  readonly clearNote: boolean;
  readonly clearHighlights: boolean;
  readonly limit: number;
  readonly lines: number;
  readonly before: string | undefined;
  readonly to: string | undefined;
  readonly json: boolean;
  readonly color: CliColorMode;
  readonly verbose: boolean;
  readonly watch: boolean;
  readonly jsonl: boolean;
  readonly readyFile: string | undefined;
  readonly workerOwner: string | undefined;
  readonly reason: string | undefined;
  readonly slot: string | undefined;
  readonly from: string | undefined;
  readonly source: string | undefined;
  readonly seenOptions: readonly string[];
};

const scopedCommands = new Set(["programs", "runtime", "auth", "result", "packages"]);
const positionalOptionalCommands = new Set(["builds", "history", "activity", "paths", "programs", "runtime", "doctor"]);
const knownCommands = new Set<CliCommandName>([
  "check", "plan", "build", "builds", "history", "inspect", "get", "status", "activity", "cancel",
  "result", "runtime", "programs", "packages", "auth", "doctor", "paths", "_worker",
]);

export function isKnownCommand(value: string | undefined): value is CliCommandName {
  return value !== undefined && knownCommands.has(value as CliCommandName);
}

export function commandAllowsMissingPositional(value: string | undefined): boolean {
  return value !== undefined && positionalOptionalCommands.has(value);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...tail] = argv;
  const scoped = command !== undefined && scopedCommands.has(command);
  const action = scoped ? tail[0] : undefined;
  const positional = scoped ? tail.slice(1) : tail;
  const noFile = command === "builds" || command === "activity" || command === "paths";
  const hasFile = !noFile && positional[0] !== undefined && !positional[0]!.startsWith("--");
  const file = hasFile ? positional[0] : undefined;
  const rest = noFile || !hasFile ? positional : positional.slice(1);
  let workspaceRoot: string | undefined;
  const assetRoots: string[] = [];
  let packageRoot: string | undefined;
  let runtime: string | undefined;
  let follow = false;
  let maxWaitMs: number | undefined;
  let output: string | undefined;
  let title: string | undefined;
  let note: string | undefined;
  const highlightedOutputs: string[] = [];
  let clearTitle = false;
  let clearNote = false;
  let clearHighlights = false;
  let limit = 20;
  let lines = 50;
  let before: string | undefined;
  let to: string | undefined;
  let json = false;
  let color: CliColorMode = "auto";
  let verbose = false;
  let watch = false;
  let jsonl = false;
  let readyFile: string | undefined;
  let workerOwner: string | undefined;
  let reason: string | undefined;
  let slot: string | undefined;
  let from: string | undefined;
  let source: string | undefined;
  const seenOptions = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]!;
    if (item.startsWith("--")) {
      const repeatable = [
        "--json", "--jsonl", "--watch", "--verbose", "--debug",
        "--no-color", "--follow", "--asset-root", "--highlight",
      ].includes(item);
      if (!repeatable && seenOptions.has(item)) throw new Error(`${item} cannot be repeated`);
      seenOptions.add(item);
    }
    if (item === "--json") { json = true; continue; }
    if (item === "--jsonl") { jsonl = true; continue; }
    if (item === "--watch") { watch = true; continue; }
    if (item === "--verbose") { verbose = true; continue; }
    if (item === "--debug") continue;
    if (item === "--no-color") { color = "never"; continue; }
    if (item === "--color") {
      const value = rest[index + 1];
      if (value !== "auto" && value !== "always" && value !== "never") {
        throw new Error("--color requires auto, always or never");
      }
      color = value;
      index += 1;
      continue;
    }
    if (item === "--workspace") {
      const value = optionValue(rest, index, "--workspace requires a directory");
      workspaceRoot = resolve(value); index += 1; continue;
    }
    if (item === "--asset-root") {
      const value = optionValue(rest, index, "--asset-root requires a directory");
      assetRoots.push(resolve(value)); index += 1; continue;
    }
    if (item === "--package-root") {
      const value = optionValue(rest, index, "--package-root requires a directory");
      packageRoot = resolve(value); index += 1; continue;
    }
    if (item === "--runtime") {
      const value = optionValue(rest, index, "--runtime requires a Runtime Profile");
      runtime = resolve(value); index += 1; continue;
    }
    if (item === "--out") {
      throw new Error("--out does not apply to Build submission; use `get <build-id> --output <name> --to <path>` to export one Result Output");
    }
    if (item === "--output") {
      output = optionValue(rest, index, "--output requires a public Output name"); index += 1; continue;
    }
    if (item === "--title") {
      title = optionValue(rest, index, "--title requires text"); index += 1; continue;
    }
    if (item === "--note") {
      note = optionValue(rest, index, "--note requires text"); index += 1; continue;
    }
    if (item === "--highlight") {
      highlightedOutputs.push(optionValue(rest, index, "--highlight requires an Output name")); index += 1; continue;
    }
    if (item === "--clear-title") { clearTitle = true; continue; }
    if (item === "--clear-note") { clearNote = true; continue; }
    if (item === "--clear-highlights") { clearHighlights = true; continue; }
    if (item === "--limit") {
      limit = positiveInteger(optionValue(rest, index, "--limit requires a positive integer"), "--limit");
      index += 1; continue;
    }
    if (item === "--lines") {
      lines = positiveInteger(optionValue(rest, index, "--lines requires a positive integer"), "--lines");
      index += 1; continue;
    }
    if (item === "--before") {
      before = optionValue(rest, index, "--before requires a Build id"); index += 1; continue;
    }
    if (item === "--to") {
      to = resolve(optionValue(rest, index, "--to requires a file path")); index += 1; continue;
    }
    if (item === "--follow") { follow = true; continue; }
    if (item === "--max-wait-ms") {
      const value = Number(optionValue(rest, index, "--max-wait-ms requires milliseconds"));
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("--max-wait-ms must be a non-negative safe integer");
      }
      maxWaitMs = value; index += 1; continue;
    }
    if (item === "--ready-file") {
      readyFile = resolve(optionValue(rest, index, "--ready-file requires a path")); index += 1; continue;
    }
    if (item === "--worker-owner") {
      workerOwner = optionValue(rest, index, "--worker-owner requires an identity"); index += 1; continue;
    }
    if (item === "--reason") {
      reason = optionValue(rest, index, "--reason requires text"); index += 1; continue;
    }
    if (item === "--slot") {
      slot = optionValue(rest, index, "--slot requires a credential slot"); index += 1; continue;
    }
    if (item === "--from") {
      from = resolve(optionValue(rest, index, "--from requires a credential file")); index += 1; continue;
    }
    if (item === "--source") {
      source = resolve(optionValue(rest, index, "--source requires a source path")); index += 1; continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return {
    command, action, file, workspaceRoot, assetRoots, packageRoot, runtime, follow, maxWaitMs,
    output, title, note, highlightedOutputs, clearTitle, clearNote, clearHighlights, limit, lines,
    before, to, json, color, verbose, watch, jsonl, readyFile, workerOwner, reason, slot, from, source,
    seenOptions: [...seenOptions],
  };
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

export function assertCommandOptions(args: ParsedArgs): void {
  const common = ["--json", "--color", "--no-color", "--verbose", "--debug"];
  const allowed = new Set(common);
  const add = (...items: readonly string[]): void => { for (const item of items) allowed.add(item); };
  switch (args.command) {
    case "programs": add("--max-wait-ms", "--runtime", "--limit"); break;
    case "runtime":
      add("--runtime");
      if (args.action === "use" || args.action === "unset") add("--workspace");
      if (args.action === "up" || args.action === "down") add("--max-wait-ms");
      if (args.action === "logs") add("--lines");
      if (args.action === "status") add("--limit");
      break;
    case "packages": break;
    case "auth":
      add("--runtime", "--slot");
      if (args.action === "login") add("--from");
      if (args.action === "status") add("--limit");
      break;
    case "activity": add("--runtime", "--watch", "--jsonl", "--limit"); break;
    case "paths": add("--runtime"); break;
    case "get": add("--workspace", "--output", "--to"); break;
    case "cancel": add("--runtime", "--reason"); break;
    case "result":
      if (args.action === "finish" || args.action === "discard") add("--runtime");
      if (args.action === "edit") {
        add("--workspace", "--title", "--note", "--highlight", "--clear-title", "--clear-note", "--clear-highlights", "--limit");
      }
      break;
    case "doctor": add("--workspace", "--limit"); break;
    case "status":
      add("--runtime", "--watch", "--limit");
      if (args.watch) add("--max-wait-ms");
      break;
    case "builds":
    case "history":
      add("--workspace", "--limit", "--before");
      if (args.command === "history") add("--source");
      break;
    case "inspect": add("--workspace", "--output", "--limit"); break;
    case "check":
    case "plan": add("--runtime", "--package-root", "--workspace", "--asset-root", "--limit"); break;
    case "build":
      add("--runtime", "--package-root", "--workspace", "--asset-root", "--follow", "--max-wait-ms", "--title", "--limit");
      break;
  }
  const invalid = args.seenOptions.find((item) => !allowed.has(item));
  if (invalid !== undefined) {
    const command = args.action === undefined ? args.command : `${args.command} ${args.action}`;
    throw new Error(`${invalid} does not apply to ${command}`);
  }
  if (args.seenOptions.includes("--color") && args.seenOptions.includes("--no-color")) {
    throw new Error("--color and --no-color are mutually exclusive");
  }
  if (args.command === "get" && args.output === undefined) {
    throw new Error("get requires --output with one public Output name");
  }
  if (args.command === "get" && args.to === undefined) {
    throw new Error("get requires --to with the export destination");
  }
}

export function usage(): string {
  return [
    "usage: hypit <command> [options]",
    "",
    "Run `hypit help` for commands or `hypit help <command>` for exact syntax.",
  ].join("\n");
}
