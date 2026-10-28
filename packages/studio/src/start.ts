import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliApplicationContext, CliIo } from "@hypit/hypit/cli";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function writeStudioHelp(io: Pick<CliIo, "write">): void {
  io.write(`hypit studio
Open an Author Source and explicit Invocation in the browser.

  hypit studio --source <main.svml> --target <output> [--target <output>]...
    [--override <output>=primary|record:<record>]...
    [--runtime <hypit.runtime.json>]
    [--port <number>] [--project <directory>] [--package-root <directory>]
    [--locale-pack <./language.json | installed-package/language.json>]...

  hypit studio --invocation <build.svrun> [--runtime <hypit.runtime.json>]
    [--port <number>] [--project <directory>] [--package-root <directory>]
    [--locale-pack <./language.json | installed-package/language.json>]...

  hypit studio --check-locale <./language.json | installed-package/language.json>
    [--package-root <directory>]

Language packs are explicit JSON data. Relative files use the current directory;
package exports resolve from --package-root (the project by default).
--check-locale lists missing translations and unknown IDs without opening a project.

Relative command-line paths start at the current directory; --project selects
the project, without rebasing those paths. Otherwise the nearest package.json
whose hypit.project is true defines the project.
Without --runtime, Studio uses that project's .hypit/runtime selection.
The server prints its project, Author Source, Invocation selection, Runtime selection and browser URL.
Press Ctrl+C to stop it.
`);
}

function invalidArguments(message: string): never {
  throw new Error(`${message}. See hypit studio --help.`);
}

function argumentsByName(argv: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const accepted = new Set([
    "source", "invocation", "target", "override", "runtime", "port", "project", "package-root",
    "locale-pack", "check-locale",
  ]);
  const repeatable = new Set(["target", "override", "locale-pack"]);
  const result = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined || value.startsWith("--")) {
      invalidArguments(`Malformed argument near ${flag ?? "end of command"}`);
    }
    const name = flag.slice(2);
    if (!accepted.has(name)) invalidArguments(`Unknown option --${name}`);
    if (!repeatable.has(name) && result.has(name)) invalidArguments(`--${name} cannot be repeated`);
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
  const sourceArgument = values.get("source")?.at(-1);
  const invocationArgument = values.get("invocation")?.at(-1);

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
    if (values.has("source") || values.has("invocation") || values.has("target") || values.has("override")) {
      invalidArguments("--check-locale does not open a Source or Invocation");
    }
    io.write(describeLanguagePack(await loadLanguagePack(checkLocale, invokedFrom, packageRoot)) + "\n");
    return;
  }
  if ((sourceArgument === undefined) === (invocationArgument === undefined)) {
    invalidArguments("Choose exactly one of --source or --invocation");
  }
  const selectedPath = resolve(invokedFrom, sourceArgument ?? invocationArgument!);
  const parseOverride = (value: string) => {
    const separator = value.indexOf("=");
    const output = separator < 0 ? "" : value.slice(0, separator).trim();
    const choice = separator < 0 ? "" : value.slice(separator + 1).trim();
    if (output.length === 0 || choice.length === 0) {
      invalidArguments("--override requires <output>=primary or <output>=record:<record>");
    }
    if (choice === "primary") return { output, choice: { kind: "primary" as const } };
    if (choice.startsWith("record:") && choice.slice("record:".length).trim().length > 0) {
      return { output, choice: { kind: "record" as const, record: choice.slice("record:".length).trim() } };
    }
    return invalidArguments("--override requires <output>=primary or <output>=record:<record>");
  };
  if (invocationArgument !== undefined && (values.has("target") || values.has("override"))) {
    invalidArguments("--target and --override apply to --source, not to a saved --invocation preset");
  }
  const targets = values.get("target") ?? [];
  if (sourceArgument !== undefined && targets.length === 0) invalidArguments("--source requires at least one --target");
  const selection = sourceArgument === undefined
    ? { kind: "preset" as const, source: selectedPath }
    : {
        kind: "author" as const,
        source: selectedPath,
        request: { targets, overrides: (values.get("override") ?? []).map(parseOverride) },
      };
  const { createServer } = await import("vite");
  const { resolveDistributionPackageImport } = await import("@hypit/hypit/loader/node");
  const { openStudioBuildLibrary } = await import("./build-library.js");
  const { loadStudioCompanionRegistry } = await import("./companion-assembly.js");
  const { loadStudioDomain } = await import("./domain.js");
  const { loadStudioPlan } = await import("./invocation.js");
  const { studioPlugin } = await import("./server.js");
  const { studioFeedbackPlugin } = await import("./feedback-server.js");
  const { inspectStudioInvocation } = await import("./studio-preflight.js");
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
    `  Author input       ${selectedPath}`,
    `  Invocation         ${selection.kind === "preset" ? "saved preset" : "command arguments"}`,
    `  Runtime Profile    ${runtimePath ?? "not selected"}`,
    `  Runtime selection  ${runtimeArgument !== undefined
      ? "command argument (this session only)" : selectedRuntime === undefined ? "none" : "project selection"}`,
    ...(packageRoot === workspaceRoot ? [] : [`  Package root       ${packageRoot}`]),
    "",
  ].join("\n"));
  const port = Number(values.get("port")?.at(-1) ?? "5179");
  if (!Number.isSafeInteger(port) || port <= 0) invalidArguments("--port must be a positive integer");

  const distributionPackageRoot = application.distribution.packageRoot ?? resolve(here, "../..");
  const domain = await loadStudioDomain({ source: selectedPath, workspaceRoot, packageRoot, distribution: application.distribution });
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
  let plan;
  try {
    plan = await loadStudioPlan({
      selection,
      domain,
      registry,
    });
  } catch (error) {
    await buildLibrary.close();
    throw error;
  }
  const source = plan.authorSource;
  try {
    inspectStudioInvocation(registry, plan.source, plan);
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
    plugins: [distributionImports, studioLocalizationPlugin(languages), studioFeedbackPlugin(workspaceRoot, selectedPath), studioPlugin({
      source,
      selection,
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
