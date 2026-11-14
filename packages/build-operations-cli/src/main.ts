import { resolve } from "node:path";

import type { CliApplicationContext, CliIo } from "@hypit/cli/public";
import { resolveProjectRoot } from "@hypit/project/node";

import { parseCommand } from "./arguments.js";
import type { CliCommand, RuntimeOption } from "./command.js";
import { isEnvironmentCommand, runEnvironmentCommand } from "./commands/environment.js";
import { isExecutionCommand, runExecutionCommand } from "./commands/execution.js";
import { isProjectResultCommand, runProjectResultCommand } from "./commands/results.js";
import type { OperationalMachineView } from "./machine-view.js";
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliEnvironmentHost, CliRuntimeHost } from "./runtime-port.js";
import type { BuildOperationsCliServices } from "./services.js";

function commandProjectRootOption(command: CliCommand): string | undefined {
  return "projectRoot" in command ? command.projectRoot : undefined;
}

function commandPackageRoot(command: CliCommand): string | undefined {
  return "packageRoot" in command ? command.packageRoot : undefined;
}

function acceptsRuntimeContext(command: CliCommand): command is CliCommand & RuntimeOption {
  return "runtimeProfile" in command;
}

function isAuthorCommand(command: CliCommand): boolean {
  return command.command === "check" || command.command === "plan"
    || command.command === "pricing" || command.command === "build";
}

export async function runBuildOperationsCli(
  argv: readonly string[],
  io: CliIo,
  services: BuildOperationsCliServices,
  context?: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
): Promise<void> {
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    const topic = argv[0] === "help" ? argv[1] : argv[0] === "--help" ? undefined
      : argv.includes("--help") ? argv[0] : undefined;
    writeCliHelp(io, topic);
    return;
  }
  const cwd = context?.cwd ?? process.cwd();
  const args = parseCommand(argv, cwd);
  if (isAuthorCommand(args)) throw new Error(`${args.command} is not owned by the operations command module`);
  let resolvedProject: Promise<string> | undefined;
  const commandProjectRoot = async (): Promise<string> => {
    const projectRoot = commandProjectRootOption(args);
    resolvedProject ??= context === undefined
      ? resolveProjectRoot({ ...(projectRoot === undefined ? {} : { projectRoot }), cwd })
      : context.resolveProjectRoot(projectRoot);
    return await resolvedProject;
  };
  const packageRootForProject = async (projectRoot?: string): Promise<string> =>
    commandPackageRoot(args) ?? projectRoot ?? await commandProjectRoot();
  const writeOperational = (
    machine: OperationalMachineView,
    title: string,
    status: "success" | "warning" | "error" | "info" = "info",
    facts: readonly (readonly [string, string])[] = [],
    lines: readonly string[] = [],
  ): void => writeCliOutput(io, { ...args.presentation }, {
    kind: "operational", machine, title, status, facts, lines,
  });
  const runtimeHosts = new Map<string, Promise<CliRuntimeHost>>();
  const environmentHosts = new Map<string, Promise<CliEnvironmentHost>>();
  const runtimeHost = async (path: string, requestedPackageRoot?: string): Promise<CliRuntimeHost> => {
    const profile = resolve(path);
    const packageRoot = requestedPackageRoot ?? await packageRootForProject();
    const key = `${profile}\u0000${packageRoot}`;
    let opened = runtimeHosts.get(key);
    if (opened === undefined) {
      opened = services.openRuntimeHost(profile, {
        packageRoot,
        ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
      });
      runtimeHosts.set(key, opened);
    }
    return await opened;
  };
  const environmentHost = async (path: string, requestedPackageRoot?: string): Promise<CliEnvironmentHost> => {
    const profile = resolve(path);
    const packageRoot = requestedPackageRoot ?? await packageRootForProject();
    const key = `${profile}\u0000${packageRoot}`;
    let opened = environmentHosts.get(key);
    if (opened === undefined) {
      opened = services.openEnvironmentHost(profile, {
        packageRoot,
        ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
      });
      environmentHosts.set(key, opened);
    }
    return await opened;
  };
  const projectResults = async (requestedProjectRoot?: string) => {
    const projectRoot = requestedProjectRoot ?? await commandProjectRoot();
    const packageRoot = await packageRootForProject(projectRoot);
    return await services.openProjectResults(projectRoot, {
      packageRoot,
      ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
    });
  };
  let runtimeProfile = acceptsRuntimeContext(args) ? args.runtimeProfile : undefined;
  const environmentProfile = "environmentProfile" in args ? args.environmentProfile : undefined;
  let runtimeFromProject = false;
  if (acceptsRuntimeContext(args) && runtimeProfile === undefined && environmentProfile === undefined && args.command !== "logs") {
    const selected = await services.resolveProjectRuntime?.(await commandProjectRoot());
    if (selected !== undefined) {
      runtimeProfile = selected.profile;
      runtimeFromProject = true;
    }
  }
  if (isEnvironmentCommand(args)) {
    await runEnvironmentCommand({
      args,
      runtimeProfile,
      runtimeFromProject,
      environmentProfile,
      io,
      projectRoot: await commandProjectRoot(),
      diagnoseProjectResults: async () => {
        const projectRoot = await commandProjectRoot();
        return await services.diagnoseProjectResults(projectRoot, {
          packageRoot: await packageRootForProject(projectRoot),
          ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
        });
      },
      runtimeHost,
      environmentHost,
      write: writeOperational,
    });
    return;
  }
  if (isProjectResultCommand(args)) {
    const results = await projectResults();
    try {
      await runProjectResultCommand({
        args,
        projectRoot: await commandProjectRoot(),
        history: results.history,
        products: results.products,
        ...(services.resolveProductExporter === undefined ? {} : {
          resolveProductExporter: async (type: Parameters<NonNullable<typeof services.resolveProductExporter>>[0]) =>
            await services.resolveProductExporter!(type, {
              packageRoot: await packageRootForProject(await commandProjectRoot()),
              ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
            }),
        }),
        write: writeOperational,
      });
    } finally {
      await results.close();
    }
    return;
  }
  if (isExecutionCommand(args)) {
    await runExecutionCommand({
      args,
      projectRoot: await commandProjectRoot(),
      runtimeProfile,
      io,
      runtimeHost,
      openProjectResults: projectResults,
      resolveProjectRuntime: async () => (await services.resolveProjectRuntime?.(await commandProjectRoot()))?.profile,
      write: writeOperational,
    });
    return;
  }
  throw new Error(`${args.command} is not owned by the operations command module`);
}
