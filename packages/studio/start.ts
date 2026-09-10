import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliIo } from "@hypit/cli";

const here = dirname(fileURLToPath(import.meta.url));

export function writeStudioHelp(io: Pick<CliIo, "write">): void {
  io.write(`hypit studio
Open a Run in the browser to inspect its composition, Sources and Results.

  hypit studio --run <build.svrun> [--runtime <hypit.runtime.json>]
    [--port <number>] [--workspace <directory>] [--package-root <directory>]

Relative command-line paths start at the current directory; --workspace selects
the project, without rebasing those paths. Otherwise the nearest package.json
above the current directory defines the project (or the current directory if none).
Without --runtime, Studio uses that project's .hypit/runtime selection.
The server prints its project, Run, Runtime selection and browser URL.
Press Ctrl+C to stop it.
`);
}

function invalidArguments(message: string): never {
  throw new Error(`${message}. See hypit studio --help.`);
}

function argumentsByName(argv: readonly string[]): ReadonlyMap<string, string> {
  const accepted = new Set(["run", "runtime", "port", "workspace", "package-root"]);
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined || value.startsWith("--")) {
      invalidArguments(`Malformed argument near ${flag ?? "end of command"}`);
    }
    const name = flag.slice(2);
    if (!accepted.has(name)) invalidArguments(`Unknown option --${name}`);
    result.set(name, value);
  }
  return result;
}

export async function runStudio(argv: readonly string[], io: Pick<CliIo, "write">): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeStudioHelp(io);
    return;
  }
  const values = argumentsByName(argv[0] === "--" ? argv.slice(1) : argv);
  const invokedFrom = process.env.INIT_CWD ?? process.cwd();
  const runArgument = values.get("run");
  if (runArgument === undefined || runArgument.trim().length === 0) invalidArguments("Missing --run");
  const { createServer } = await import("vite");
  const { findRuntimeProfile, resolveProjectRoot } = await import("@hypit/cli");
  const { resolveDistributionPackageImport } = await import("@hypit/package-loader-node");
  const { videoCliDistribution, videoStudioCompanionPackages } = await import("@hypit/video-cli");
  const { openStudioBuildLibrary } = await import("./src/build-library.js");
  const { loadStudioCompanionRegistry } = await import("./src/companion-assembly.js");
  const { loadStudioDomain } = await import("./src/domain.js");
  const { loadStudioRun } = await import("./src/run.js");
  const { studioPlugin } = await import("./src/server.js");
  const { inspectStudioRun } = await import("./src/studio-preflight.js");
  const runPath = resolve(invokedFrom, runArgument);
  const packageRootArgument = values.get("package-root");
  const workspaceArgument = values.get("workspace");
  const requestedWorkspaceRoot = workspaceArgument === undefined
    ? undefined
    : resolve(invokedFrom, workspaceArgument);
  const workspaceRoot = await resolveProjectRoot({
    ...(requestedWorkspaceRoot === undefined ? {} : { workspaceRoot: requestedWorkspaceRoot }),
    cwd: invokedFrom,
  });
  const packageRoot = packageRootArgument === undefined
    ? workspaceRoot
    : resolve(invokedFrom, packageRootArgument);
  const runtimeArgument = values.get("runtime");
  const selectedRuntime = runtimeArgument === undefined
    ? await findRuntimeProfile(workspaceRoot)
    : undefined;
  const runtimePath = runtimeArgument === undefined
    ? selectedRuntime?.profile
    : resolve(invokedFrom, runtimeArgument);
  console.info([
    `  Project            ${workspaceRoot}`,
    `  Run                ${runPath}`,
    `  Runtime Profile    ${runtimePath ?? "not selected"}`,
    `  Runtime selection  ${runtimeArgument !== undefined
      ? "command argument (this session only)" : selectedRuntime?.selectionFile ?? "none"}`,
    ...(packageRoot === workspaceRoot ? [] : [`  Package root       ${packageRoot}`]),
    "",
  ].join("\n"));
  const port = Number(values.get("port") ?? "5179");
  if (!Number.isSafeInteger(port) || port <= 0) invalidArguments("--port must be a positive integer");

  const distributionPackageRoot = videoCliDistribution.packageRoot ?? resolve(here, "../..");
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
  const registry = await loadStudioCompanionRegistry({
    distributionPackageRoot,
    distributionPackages: videoStudioCompanionPackages,
    sourcePackages: domain.packages,
  });
  const buildLibrary = await openStudioBuildLibrary(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);
  let run;
  try {
    run = await loadStudioRun({
      run: runPath,
      domain,
      registry,
      buildLibrary,
    });
  } catch (error) {
    await buildLibrary.close();
    throw error;
  }
  const source = run.authorSource;
  try {
    inspectStudioRun(registry, run.source, run);
  } catch (error) {
    await buildLibrary.close();
    throw error;
  }
  const distributionImports = {
    name: "hypit-distribution-imports",
    enforce: "pre" as const,
    resolveId(specifier: string): string | undefined {
      return resolveDistributionPackageImport(distributionPackageRoot, specifier);
    },
  };
  const server = await createServer({
    configFile: false,
    root: here,
    server: {
      port,
      // Vite resolves package assets through pnpm's real paths. The package root
      // must therefore be readable for self-hosted fonts and other declared
      // Studio dependencies, while the author workspace remains separately
      // available for Source and material previews.
      fs: { allow: [workspaceRoot, packageRoot, distributionPackageRoot, here] },
    },
    plugins: [distributionImports, studioPlugin({
      source,
      runPath,
      workspaceRoot,
      domain,
      registry,
      ...(buildLibrary === undefined ? {} : { buildLibrary }),
    })],
  });
  server.httpServer?.once("close", () => {
    void buildLibrary.close().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  });
  await server.listen();
  server.printUrls();
}
