import type { LoadedPackage } from "@hypit/loader";
import { resolve } from "node:path";

import { resolveProjectRoot as resolveMarkedProjectRoot } from "@hypit/project";

import type { CliDistribution } from "./distribution.js";
import { writeCliHelp } from "./output.js";
import type { CliIo } from "./output.js";
import { CliUsageError } from "./usage-error.js";

/**
 * One explicitly trusted command surface selected by an application Distribution.
 *
 * Command modules are application assembly, not Source-package activation. Project
 * packages never acquire CLI authority merely by being installed or imported.
 */
export type CliCommandModule = {
  readonly format: "hypit.cli-command@1";
  readonly id: string;
  /** Root commands owned by this module. A root has exactly one owner. */
  readonly commands: readonly string[];
  /** Append this module's commands to the application-level help. */
  writeRootHelp?(io: CliIo): void;
  /** Render help for one of this module's roots. */
  writeHelp(argv: readonly string[], io: CliIo): void | Promise<void>;
  /** Execute one of this module's roots. */
  run(argv: readonly string[], io: CliIo, context: CliApplicationContext): void | Promise<void>;
};

/** One immutable invocation context assembled by the executable application. */
export type CliApplicationContext = {
  readonly cwd: string;
  readonly distribution: CliDistribution;
  resolveProjectRoot(projectRoot?: string): Promise<string>;
};

/**
 * Complete user-facing command application.
 *
 * CliDistribution supplies compilation/execution services. Command modules supply
 * the chosen product surface. These axes stay separate so an application can
 * reuse the long-compilation CLI without moving frames or media into the Host.
 */
export type CliApplication = {
  readonly distribution: CliDistribution;
  readonly cwd?: string;
  readonly resolveProjectRoot?: (projectRoot?: string) => Promise<string>;
  readonly bootstrapPackages?: readonly LoadedPackage[];
  readonly commandModules?: readonly CliCommandModule[];
};

export function indexCliCommandModules(
  modules: readonly CliCommandModule[],
): ReadonlyMap<string, CliCommandModule> {
  const reserved = new Set<string>(["help"]);
  const result = new Map<string, CliCommandModule>();
  for (const module of modules) {
    if (module.format !== "hypit.cli-command@1") {
      throw new Error(`CLI command module ${module.id || "<unknown>"} must use hypit.cli-command@1`);
    }
    if (module.id.trim().length === 0) throw new Error("CLI command module id cannot be empty");
    if (module.commands.length === 0) throw new Error(`CLI command module ${module.id} owns no commands`);
    for (const command of module.commands) {
      if (command.length === 0 || command.startsWith("-")) {
        throw new Error(`CLI command module ${module.id} declares invalid root ${JSON.stringify(command)}`);
      }
      if (reserved.has(command)) {
        throw new Error(`CLI command module ${module.id} cannot replace generic command ${JSON.stringify(command)}`);
      }
      const existing = result.get(command);
      if (existing !== undefined) {
        throw new Error(`CLI command ${JSON.stringify(command)} is owned by both ${existing.id} and ${module.id}`);
      }
      result.set(command, module);
    }
  }
  return result;
}

function helpArguments(argv: readonly string[]): readonly string[] {
  const passthrough = argv.indexOf("--");
  return passthrough < 0 ? argv : argv.slice(0, passthrough);
}

/** Run one statically assembled CLI application. No package scan or command auto-discovery occurs. */
export async function runCliApplication(
  argv: readonly string[],
  io: CliIo,
  application: CliApplication,
): Promise<void> {
  const cwd = resolve(application.cwd ?? process.cwd());
  const context: CliApplicationContext = Object.freeze({
    cwd,
    distribution: application.distribution,
    resolveProjectRoot: application.resolveProjectRoot
      ?? (async (projectRoot?: string) => await resolveMarkedProjectRoot({
        ...(projectRoot === undefined ? {} : { projectRoot }),
        cwd,
      })),
  });
  const modules = indexCliCommandModules(application.commandModules ?? []);
  const visible = helpArguments(argv);
  const asksForHelp = argv.length === 0 || argv[0] === "help" || visible.includes("--help");
  if (asksForHelp) {
    const topic = argv[0] === "help"
      ? argv[1]
      : argv[0] === "--help" || argv.length === 0 ? undefined : visible.includes("--help") ? argv[0] : undefined;
    if (topic === undefined) {
      writeCliHelp(io);
      for (const module of application.commandModules ?? []) module.writeRootHelp?.(io);
      return;
    }
    const module = modules.get(topic);
    if (module !== undefined) {
      await module.writeHelp(argv, io);
      return;
    }
    writeCliHelp(io, topic);
    return;
  }

  const module = modules.get(argv[0] ?? "");
  if (module !== undefined) {
    await module.run(argv, io, context);
    return;
  }
  throw new CliUsageError(`Unknown command ${JSON.stringify(argv[0])}`, "hypit help");
}
