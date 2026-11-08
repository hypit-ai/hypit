import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  createPublicBuildId,
  submitLongBuild,
  type BuildCliServices,
  type LongBuildSession,
} from "@hypit/build-cli";
import {
  commandHint,
  parseCliDecimalInteger,
  parseCliGlobalOptions,
  writeCliOutput,
  type CliApplicationContext,
  type CliCommandModule,
  type CliIo,
} from "@hypit/cli";
import {
  createGenerationGraphRuntimeRequest,
  createNodeGenerationGraphProjectHost,
  readGenerationGraphProjectFile,
} from "@hypit/generation-graph/node";
import type { LoadedPackage, LogicalPackageAddress } from "@hypit/loader";
import type {
  NodePackageLoadOptions,
  NodePackageSelectionRequest,
} from "@hypit/loader/node";
import { moduleKey, modulePackageAbi } from "@hypit/protocol";

export type GenerationGraphCliServices = Pick<BuildCliServices,
  "packageRoot" | "resolveProjectRuntime" | "openRuntimeHost" | "openProjectResults"> & {
  loadPackages(
    request: NodePackageSelectionRequest,
    packageRoot: string,
    options?: NodePackageLoadOptions,
  ): Promise<readonly LoadedPackage[]>;
};

type ParsedRun = {
  readonly graph: string;
  readonly targets: readonly string[];
  readonly project?: string;
  readonly runtime?: string;
  readonly packageRoot?: string;
  readonly maxWaitMs?: number;
  readonly presentation: ReturnType<typeof parseCliGlobalOptions>["presentation"];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseRun(argv: readonly string[]): ParsedRun | undefined {
  const global = parseCliGlobalOptions(argv);
  assert(global.issue === undefined, global.issue ?? "invalid global options");
  const values = global.remaining;
  if (values.length < 2 || values[1] === "help" || values.includes("--help")) return undefined;
  assert(values[0] === "generation" && values[1] === "run",
    `Unknown generation command ${values[1] ?? "<missing>"}`);
  const positionals: string[] = [];
  const targets: string[] = [];
  const options = new Map<string, string>();
  const named = new Set(["--project", "--runtime", "--package-root", "--max-wait-ms"]);
  for (let index = 2; index < values.length; index += 1) {
    const item = values[index]!;
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    if (item === "--target") {
      const value = values[++index];
      assert(value !== undefined && !value.startsWith("--"), "--target requires a Node id");
      targets.push(value);
      continue;
    }
    assert(named.has(item), `Unknown option ${item}`);
    assert(!options.has(item), `${item} cannot be repeated`);
    const value = values[++index];
    assert(value !== undefined && !value.startsWith("--"), `${item} requires a value`);
    options.set(item, value);
  }
  assert(positionals.length === 1, "generation run requires exactly one Generation Graph file");
  assert(targets.length > 0, "generation run requires at least one --target Node id");
  const maxWaitRaw = options.get("--max-wait-ms");
  const maxWaitMs = maxWaitRaw === undefined ? undefined : parseCliDecimalInteger(maxWaitRaw);
  assert(maxWaitRaw === undefined || maxWaitMs !== undefined,
    "--max-wait-ms must be an unsigned decimal integer");
  const project = options.get("--project");
  const runtime = options.get("--runtime");
  const packageRoot = options.get("--package-root");
  return {
    graph: positionals[0]!,
    targets,
    ...(project === undefined ? {} : { project }),
    ...(runtime === undefined ? {} : { runtime }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    presentation: global.presentation,
  };
}

function within(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function packageRequest(project: Awaited<ReturnType<typeof readGenerationGraphProjectFile>>): NodePackageSelectionRequest {
  const logical = new Map<string, LogicalPackageAddress>(project.nodes.map((node) => {
    const name = moduleKey(node.using.module);
    return [name, { abi: modulePackageAbi, name }];
  }));
  return { selected: [], logical: [...logical.values()] };
}

export function writeGenerationGraphHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit generation run <project.graph.json> --target <node> [options]\n\n"
    + "Run one or more Generation Graph nodes through the selected long-running Runtime.\n"
    + "Each invocation creates a new Build and never rewrites the saved recipe.\n\n"
    + "Options:\n"
    + "  --target <node>         Node to resolve; repeat for multiple targets\n"
    + "  --project <directory>   Explicit Hypit project (default: nearest marked project)\n"
    + "  --runtime <profile>     Runtime Profile (default: project selection)\n"
    + "  --package-root <path>   Installed component root (default: project root)\n"
    + "  --max-wait-ms <ms>      Maximum Runtime Worker startup wait\n"
    + "  --json                  Write one machine-readable result\n");
}

export async function runGenerationGraphCli(
  argv: readonly string[],
  io: CliIo,
  context: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
  services: GenerationGraphCliServices,
): Promise<void> {
  const parsed = parseRun(argv);
  if (parsed === undefined) { writeGenerationGraphHelp(io); return; }
  const projectRoot = await realpath(await context.resolveProjectRoot(
    parsed.project === undefined ? undefined : resolve(context.cwd, parsed.project),
  ));
  const graphPath = await realpath(resolve(context.cwd, parsed.graph));
  assert(within(projectRoot, graphPath), `Generation Graph ${graphPath} is outside project ${projectRoot}`);
  const packageRoot = resolve(context.cwd, parsed.packageRoot ?? projectRoot);
  const opened = await services.openProjectResults(projectRoot, {
    packageRoot,
    ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
  });
  let session: LongBuildSession | undefined;
  try {
    const project = await readGenerationGraphProjectFile(graphPath);
    const packages = await services.loadPackages(packageRequest(project), packageRoot, {
      ...(services.packageRoot === undefined ? {} : { fallbackRoots: [services.packageRoot] }),
    });
    const host = createNodeGenerationGraphProjectHost({
      packages,
    });
    const prepared = await host.prepare(project, parsed.targets);

    const selectedRuntime = parsed.runtime === undefined
      ? await services.resolveProjectRuntime?.(projectRoot)
      : { profile: resolve(context.cwd, parsed.runtime) };
    assert(selectedRuntime !== undefined,
      `No Runtime Profile is selected for ${projectRoot}; run hypit runtime use <profile> there, or pass --runtime <profile>`);
    const profile = resolve(selectedRuntime.profile);
    const runtimeHost = await services.openRuntimeHost(profile, {
      packageRoot,
      ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
    });
    const build = createPublicBuildId();
    const submitted = await submitLongBuild({
      host: runtimeHost,
      request: createGenerationGraphRuntimeRequest({
        projectPath: graphPath,
        prepared,
        publicationStores: opened.location,
        build,
      }),
      packageContributions: packages.map((item) => item.contribution),
      ...(parsed.maxWaitMs === undefined ? {} : { maxWaitMs: parsed.maxWaitMs }),
    });
    session = submitted;
    const outputs = prepared.generated.map((item) => ({
      node: item.node,
      product: { publication: submitted.submission.id, name: item.node },
    }));
    writeCliOutput(io, parsed.presentation, {
      kind: "operational",
      machine: {
        format: "hypit.generation-run@1",
        ok: true,
        mode: "build",
        graph: graphPath,
        revision: project.revision,
        build: submitted.submission.id,
        targets: prepared.targets.map((item) => item.node),
        outputs,
      },
      title: "Generation run submitted",
      status: "success",
      facts: [
        ["Build", submitted.submission.id],
        [prepared.targets.length === 1 ? "Target" : "Targets", prepared.targets.map((item) => item.node).join(", ")],
      ],
      lines: [
        `Watch    ${commandHint(["status", submitted.submission.id, "--watch"], { projectRoot, runtimeProfile: profile })}`,
        `Inspect  ${commandHint(["inspect", submitted.submission.id], { projectRoot })}`,
      ],
    });
  } finally {
    await session?.close();
    await opened.close();
  }
}

export function createGenerationGraphCliCommandModules(
  services: GenerationGraphCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/generation-graph-cli",
    commands: ["generation"],
    writeRootHelp(io) {
      io.write("\nLong-running generation\n  generation run\n  hypit generation --help for exact options\n");
    },
    writeHelp(_argv, io) { writeGenerationGraphHelp(io); },
    async run(argv, io, context) { await runGenerationGraphCli(argv, io, context, services); },
  }];
}
