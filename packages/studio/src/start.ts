import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliApplicationContext, CliIo } from "@hypit/hypit/cli";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function writeStudioHelp(io: Pick<CliIo, "write">): void {
  io.write(`hypit studio
Open a Run in the browser to inspect its composition, Sources and Results.

  hypit studio --run <build.svrun> [--runtime <hypit.runtime.json>]
    [--port <number>] [--project <directory>] [--package-root <directory>]
    [--locale-pack <./language.json | installed-package/language.json>]...

  hypit studio --check-locale <./language.json | installed-package/language.json>
    [--package-root <directory>]

Language packs are explicit JSON data. Relative files use the current directory;
package exports resolve from --package-root (the project by default).
--check-locale lists missing translations and unknown IDs without opening a Run.

Relative command-line paths start at the current directory; --project selects
the project, without rebasing those paths. Otherwise the nearest package.json
whose hypit.project is true defines the project.
Without --runtime, Studio uses that project's .hypit/runtime selection.
The server prints its project, Run, Runtime selection and browser URL.
Press Ctrl+C to stop it.
`);
}

function invalidArguments(message: string): never {
  throw new Error(`${message}. See hypit studio --help.`);
}

function argumentsByName(argv: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const accepted = new Set(["run", "runtime", "port", "project", "package-root", "locale-pack", "check-locale"]);
  const result = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined || value.startsWith("--")) {
      invalidArguments(`Malformed argument near ${flag ?? "end of command"}`);
    }
    const name = flag.slice(2);
    if (!accepted.has(name)) invalidArguments(`Unknown option --${name}`);
    result.set(name, [...result.get(name) ?? [], value]);
  }
  return result;
}

export async function runStudio(
  argv: readonly string[],
  io: Pick<CliIo, "write">,
  application: CliApplicationContext,
): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeStudioHelp(io);
    return;
  }
  const values = argumentsByName(argv[0] === "--" ? argv.slice(1) : argv);
  const invokedFrom = process.env.INIT_CWD ?? application.cwd;
  const runArgument = values.get("run")?.at(-1);

  const packageRootArgument = values.get("package-root")?.at(-1);
  const projectArgument = values.get("project")?.at(-1);
  const requestedProjectRoot = projectArgument === undefined
    ? undefined
    : resolve(invokedFrom, projectArgument);
  const workspaceRoot = await application.resolveProjectRoot(requestedProjectRoot);
  const packageRoot = packageRootArgument === undefined
    ? workspaceRoot
    : resolve(invokedFrom, packageRootArgument);
  const { describeLanguagePack, loadLanguagePack, studioLanguages, studioLocalizationPlugin } = await import("./localization-node.js");
  const checkLocale = values.get("check-locale")?.at(-1);
  if (checkLocale !== undefined) {
    io.write(describeLanguagePack(await loadLanguagePack(checkLocale, invokedFrom, packageRoot)) + "\n");
    return;
  }
  if (runArgument === undefined || runArgument.trim().length === 0) invalidArguments("Missing --run");
  const runPath = resolve(invokedFrom, runArgument);
  const { createServer } = await import("vite");
  const { resolveDistributionPackageImport } = await import("@hypit/hypit/loader/node");
  const { openStudioBuildLibrary } = await import("./build-library.js");
  const { loadStudioCompanionRegistry } = await import("./companion-assembly.js");
  const { loadStudioDomain } = await import("./domain.js");
  const { loadStudioRun } = await import("./run.js");
  const { studioPlugin } = await import("./server.js");
  const { studioFeedbackPlugin } = await import("./feedback-server.js");
  const { inspectStudioRun } = await import("./studio-preflight.js");
  const languages = await studioLanguages(values.get("locale-pack") ?? [], invokedFrom, packageRoot);
  const runtimeArgument = values.get("runtime")?.at(-1);
  const selectedRuntime = runtimeArgument === undefined
    ? await application.distribution.resolveProjectRuntime?.(workspaceRoot)
    : undefined;
  const runtimePath = runtimeArgument === undefined
    ? selectedRuntime?.profile
    : resolve(invokedFrom, runtimeArgument);
  console.info([
    `  Project            ${workspaceRoot}`,
    `  Run                ${runPath}`,
    `  Runtime Profile    ${runtimePath ?? "not selected"}`,
    `  Runtime selection  ${runtimeArgument !== undefined
      ? "command argument (this session only)" : selectedRuntime === undefined ? "none" : "project selection"}`,
    ...(packageRoot === workspaceRoot ? [] : [`  Package root       ${packageRoot}`]),
    "",
  ].join("\n"));
  const port = Number(values.get("port")?.at(-1) ?? "5179");
  if (!Number.isSafeInteger(port) || port <= 0) invalidArguments("--port must be a positive integer");

  const distributionPackageRoot = application.distribution.packageRoot ?? resolve(here, "../..");
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot, distribution: application.distribution });
  const registry = await loadStudioCompanionRegistry({
    distributionPackageRoot,
    sourcePackages: domain.packages,
  });
  const buildLibrary = await openStudioBuildLibrary(
    application.distribution,
    runtimePath,
    packageRoot,
    workspaceRoot,
    distributionPackageRoot,
  );
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
      // Studio dependencies. The author workspace is the default package root,
      // so it stays listed; Studio's own plugin marks raw workspace files that
      // Vite serves through `/@fs` as inert documents (see inertWorkspaceFile).
      fs: { allow: [workspaceRoot, packageRoot, distributionPackageRoot, here] },
    },
    plugins: [distributionImports, studioLocalizationPlugin(languages), studioFeedbackPlugin(workspaceRoot, runPath), studioPlugin({
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
  for (const url of server.resolvedUrls?.local ?? []) io.write(`  Comments           ${url}#comments\n`);
}
