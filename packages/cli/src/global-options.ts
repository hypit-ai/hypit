import type { CliColorMode, CliOutputOptions } from "./output.js";

export type CliGlobalOptions = {
  readonly presentation: CliOutputOptions;
  readonly debug: boolean;
};

export type ParsedCliGlobalOptions = CliGlobalOptions & {
  /** Arguments whose meaning belongs to the selected command. */
  readonly remaining: readonly string[];
  readonly seenOptions: readonly string[];
  /** Syntax is reported by the command parser; the Node shell may still use the partial view for errors. */
  readonly issue?: string;
};

const globalOptionNames = new Set(["--json", "--jsonl", "--color", "--no-color", "--verbose", "--debug"]);

/**
 * Separate process-wide presentation options from command-owned arguments once.
 * This function does not throw so the terminal adapter can render malformed invocations
 * using the valid presentation facts it observed before handing syntax to the command.
 */
export function parseCliGlobalOptions(values: readonly string[]): ParsedCliGlobalOptions {
  const remaining: string[] = [];
  const seen = new Set<string>();
  let json = false;
  let jsonl = false;
  let color: CliColorMode = "auto";
  let verbose = false;
  let debug = false;
  let colorCount = 0;
  let issue: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--") {
      remaining.push(...values.slice(index));
      break;
    }
    if (!globalOptionNames.has(value)) {
      remaining.push(value);
      continue;
    }
    seen.add(value);
    if (value === "--json") { json = true; continue; }
    if (value === "--jsonl") { jsonl = true; continue; }
    if (value === "--verbose") { verbose = true; continue; }
    if (value === "--debug") { debug = true; continue; }
    if (value === "--no-color") { color = "never"; continue; }
    colorCount += 1;
    if (colorCount > 1) issue ??= "--color cannot be repeated";
    const selected = values[index + 1];
    if (selected !== "auto" && selected !== "always" && selected !== "never") {
      issue ??= "--color requires auto, always or never";
      continue;
    }
    color = selected;
    index += 1;
  }
  if (seen.has("--color") && seen.has("--no-color")) {
    issue ??= "--color and --no-color are mutually exclusive";
  }
  return {
    presentation: { json: json || jsonl, ...(jsonl ? { jsonl: true } : {}), color, verbose },
    debug,
    remaining,
    seenOptions: [...seen],
    ...(issue === undefined ? {} : { issue }),
  };
}
