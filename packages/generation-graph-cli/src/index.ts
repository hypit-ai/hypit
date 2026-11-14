import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  assertPlannedRequests,
  assertPreflight,
  createPublicBuildId,
  describePlanEndpoints,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
  submitLongBuild,
  type BuildSubmissionHost,
  type BuildSubmissionInspection,
  type BuildSubmissionRuntime,
} from "@hypit/build-submission";
import {
  commandHint,
  parseCliDecimalInteger,
  parseCliGlobalOptions,
  writeCliOutput,
  type CliApplicationContext,
  type CliCommandModule,
  type CliIo,
} from "@hypit/cli/public";
import {
  inspectGenerationGraphProject,
  lowerGenerationGraph,
} from "@hypit/generation-graph";
import {
  createGenerationGraphRuntimeRequest,
  createNodeGenerationGraphProjectHost,
  readGenerationGraphProjectFile,
  type GenerationGraphRuntimeRequest,
} from "@hypit/generation-graph/node";
import type { LoadedPackage, LogicalPackageAddress } from "@hypit/loader";
import type {
  NodePackageLoadOptions,
  NodePackageSelectionRequest,
} from "@hypit/loader/node";
import { moduleKey } from "@hypit/module";
import { moduleFacetKind } from "@hypit/module";
import type { ProductAddress, ProductHistory } from "@hypit/product";
import type { BuildResultHistory } from "@hypit/result";
import { NodeFilesystemWorkspace } from "@hypit/generation-authoring/workspace/node";

export type GenerationMediaProductMaterializationRequest = {
  readonly product: ProductAddress;
  readonly assetPath: string;
  readonly id?: string;
  readonly mediaFile?: string;
};

export type GenerationMediaProductMaterializationResult = {
  readonly assetPath: string;
  readonly mediaPath: string;
};

type GenerationRuntime = BuildSubmissionRuntime<GenerationGraphRuntimeRequest, { readonly id: string }>;
type GenerationInspection = BuildSubmissionInspection<GenerationRuntime>;

export type GenerationGraphCliServices = {
  readonly packageRoot?: string;
  resolveProjectRuntime?(projectRoot: string): Promise<{ readonly profile: string } | undefined>;
  openRuntimeHost(path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<BuildSubmissionHost<GenerationInspection>>;
  openProjectResults(projectRoot: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }): Promise<{
    readonly location: {
      readonly root: string;
      readonly historyPath: string;
      readonly productsPath: string;
    };
    readonly history: BuildResultHistory;
    readonly products: ProductHistory;
    close(): void | Promise<void>;
  }>;
  loadPackages(
    request: NodePackageSelectionRequest,
    packageRoot: string,
    options?: NodePackageLoadOptions,
  ): Promise<readonly LoadedPackage[]>;
  materializeMediaProduct?(
    request: GenerationMediaProductMaterializationRequest,
    products: ProductHistory,
  ): Promise<GenerationMediaProductMaterializationResult>;
};

type ParsedGraphAction = {
  readonly action: "check" | "plan" | "run";
  readonly graph: string;
  readonly targets: readonly string[];
  readonly project?: string;
  readonly runtime?: string;
  readonly packageRoot?: string;
  readonly maxWaitMs?: number;
  readonly presentation: ReturnType<typeof parseCliGlobalOptions>["presentation"];
};

type ParsedMaterialize = {
  readonly build: string;
  readonly output: string;
  readonly to: string;
  readonly project?: string;
  readonly packageRoot?: string;
  readonly id?: string;
  readonly mediaFile?: string;
  readonly presentation: ReturnType<typeof parseCliGlobalOptions>["presentation"];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseGraphAction(argv: readonly string[]): ParsedGraphAction | undefined {
  const global = parseCliGlobalOptions(argv);
  assert(global.issue === undefined, global.issue ?? "invalid global options");
  const values = global.remaining;
  if (values.length < 2 || values[1] === "help" || values.includes("--help")) return undefined;
  assert(values[0] === "generation" && ["check", "plan", "run"].includes(values[1]!),
    `Unknown generation command ${values[1] ?? "<missing>"}`);
  const action = values[1] as ParsedGraphAction["action"];
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
  assert(positionals.length === 1, `generation ${action} requires exactly one Generation Graph file`);
  assert(action === "check" || targets.length > 0,
    `generation ${action} requires at least one --target Node id`);
  assert(action !== "check" || targets.length === 0, "generation check does not accept --target");
  const maxWaitRaw = options.get("--max-wait-ms");
  const maxWaitMs = maxWaitRaw === undefined ? undefined : parseCliDecimalInteger(maxWaitRaw);
  assert(maxWaitRaw === undefined || maxWaitMs !== undefined,
    "--max-wait-ms must be an unsigned decimal integer");
  const project = options.get("--project");
  const runtime = options.get("--runtime");
  const packageRoot = options.get("--package-root");
  return {
    action,
    graph: positionals[0]!,
    targets,
    ...(project === undefined ? {} : { project }),
    ...(runtime === undefined ? {} : { runtime }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
    presentation: global.presentation,
  };
}

function parseMaterialize(argv: readonly string[]): ParsedMaterialize | undefined {
  const global = parseCliGlobalOptions(argv);
  assert(global.issue === undefined, global.issue ?? "invalid global options");
  const values = global.remaining;
  if (values.length < 2 || values[1] === "help" || values.includes("--help")) return undefined;
  assert(values[0] === "generation" && values[1] === "materialize",
    `Unknown generation command ${values[1] ?? "<missing>"}`);
  const positionals: string[] = [];
  const options = new Map<string, string>();
  const named = new Set(["--output", "--to", "--project", "--package-root", "--id", "--media-file"]);
  for (let index = 2; index < values.length; index += 1) {
    const item = values[index]!;
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    assert(named.has(item), `Unknown option ${item}`);
    assert(!options.has(item), `${item} cannot be repeated`);
    const value = values[++index];
    assert(value !== undefined && !value.startsWith("--"), `${item} requires a value`);
    options.set(item, value);
  }
  assert(positionals.length === 1, "generation materialize requires exactly one Build id");
  const output = options.get("--output");
  const to = options.get("--to");
  assert(output !== undefined, "generation materialize requires --output with one published node name");
  assert(to !== undefined, "generation materialize requires --to with one Media Asset destination");
  const project = options.get("--project");
  const packageRoot = options.get("--package-root");
  const id = options.get("--id");
  const mediaFile = options.get("--media-file");
  return {
    build: positionals[0]!,
    output,
    to,
    ...(project === undefined ? {} : { project }),
    ...(packageRoot === undefined ? {} : { packageRoot }),
    ...(id === undefined ? {} : { id }),
    ...(mediaFile === undefined ? {} : { mediaFile }),
    presentation: global.presentation,
  };
}

function within(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

/** Canonicalize a destination that does not exist yet through its nearest existing parent. */
async function resolveFuturePath(path: string): Promise<string> {
  let cursor = resolve(path);
  const missing: string[] = [];
  while (!await lstat(cursor).then(() => true, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  })) {
    const parent = dirname(cursor);
    assert(parent !== cursor, `Cannot resolve destination ${path}`);
    missing.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(await realpath(cursor), ...missing);
}

function packageRequest(project: Awaited<ReturnType<typeof readGenerationGraphProjectFile>>): NodePackageSelectionRequest {
  const logical = new Map<string, LogicalPackageAddress>(project.nodes.map((node) => {
    const name = moduleKey(node.using.module);
    return [name, { kind: moduleFacetKind, name }];
  }));
  return { selected: [], logical: [...logical.values()] };
}

export function writeGenerationGraphHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage:\n"
    + "  hypit generation check <project.graph.json> [options]\n"
    + "  hypit generation plan <project.graph.json> --target <node> [options]\n"
    + "  hypit generation run <project.graph.json> --target <node> [options]\n"
    + "  hypit generation materialize <build-id> --output <node> --to <asset.media.json> [options]\n\n"
    + "Check package-owned node semantics, inspect one finite Runtime plan, or submit it.\n"
    + "Materialize one exact media Product as an ordinary Media Asset without rewriting the recipe.\n\n"
    + "Options:\n"
    + "  --target <node>         Node to plan or run; repeat for multiple targets\n"
    + "  --project <directory>   Explicit Hypit project (default: nearest marked project)\n"
    + "  --runtime <profile>     Runtime Profile (default: project selection)\n"
    + "  --package-root <path>   Installed component root (default: project root)\n"
    + "  --max-wait-ms <ms>      Maximum Runtime execution startup wait\n"
    + "  --output <node>         Exact published Output to materialize\n"
    + "  --to <path>             New Media Asset document\n"
    + "  --id <id>               Optional Media Asset id\n"
    + "  --media-file <path>     Optional media path relative to the asset document\n"
    + "  --json                  Write one machine-readable result\n");
}

async function runGenerationMediaMaterializeCli(
  parsed: ParsedMaterialize,
  io: CliIo,
  context: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
  services: GenerationGraphCliServices,
): Promise<void> {
  assert(services.materializeMediaProduct !== undefined,
    "This Hypit application does not provide media Product materialization.");
  const projectRoot = await realpath(await context.resolveProjectRoot(
    parsed.project === undefined ? undefined : resolve(context.cwd, parsed.project),
  ));
  const assetPath = await resolveFuturePath(resolve(context.cwd, parsed.to));
  assert(within(projectRoot, assetPath), `Media Asset ${assetPath} is outside project ${projectRoot}`);
  const packageRoot = resolve(context.cwd, parsed.packageRoot ?? projectRoot);
  const opened = await services.openProjectResults(projectRoot, {
    packageRoot,
    ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
  });
  try {
    const product = { publication: parsed.build, name: parsed.output };
    const materialized = await services.materializeMediaProduct({
      product,
      assetPath,
      ...(parsed.id === undefined ? {} : { id: parsed.id }),
      ...(parsed.mediaFile === undefined ? {} : { mediaFile: parsed.mediaFile }),
    }, opened.products);
    writeCliOutput(io, parsed.presentation, {
      kind: "operational",
      machine: {
        format: "hypit.generation-media-materialization@1",
        ok: true,
        product,
        asset: materialized.assetPath,
        media: materialized.mediaPath,
      },
      title: "Media Product materialized",
      status: "success",
      facts: [
        ["Product", `${parsed.build}/${parsed.output}`],
        ["Media Asset", materialized.assetPath],
        ["Media file", materialized.mediaPath],
      ],
      lines: [],
    });
  } finally {
    await opened.close();
  }
}

async function openGenerationGraphAuthoring(
  parsed: ParsedGraphAction,
  context: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
  services: GenerationGraphCliServices,
) {
  const projectRoot = await realpath(await context.resolveProjectRoot(
    parsed.project === undefined ? undefined : resolve(context.cwd, parsed.project),
  ));
  const graphPath = await realpath(resolve(context.cwd, parsed.graph));
  assert(within(projectRoot, graphPath), `Generation Graph ${graphPath} is outside project ${projectRoot}`);
  const packageRoot = resolve(context.cwd, parsed.packageRoot ?? projectRoot);
  const project = await readGenerationGraphProjectFile(graphPath);
  const workspace = await new NodeFilesystemWorkspace({
    root: projectRoot,
    sourceAdapter: (unit) => ({ unit, frontend: "generation-graph" }),
  }).open(graphPath);
  const packages = await services.loadPackages(packageRequest(project), packageRoot, {
    ...(services.packageRoot === undefined ? {} : { fallbackRoots: [services.packageRoot] }),
  });
  const host = createNodeGenerationGraphProjectHost({
    packages,
    assets: {
      resolveAsset: (request) => workspace.resolveAsset(workspace.entry.unit, request),
      readAsset: async (request) => {
        if (workspace.readAsset === undefined) throw new Error("Generation Graph Workspace cannot read author assets.");
        return await workspace.readAsset(workspace.entry.unit, request);
      },
      attachments: async () => (await workspace.attachments()).map((item) => ({
        blob: item.blob,
        open: async () => await item.open(),
      })),
    },
  });
  return { projectRoot, graphPath, packageRoot, project, packages, host };
}

async function selectedRuntimeHost(
  parsed: ParsedGraphAction,
  context: Pick<CliApplicationContext, "cwd">,
  services: GenerationGraphCliServices,
  projectRoot: string,
  packageRoot: string,
) {
  const selectedRuntime = parsed.runtime === undefined
    ? await services.resolveProjectRuntime?.(projectRoot)
    : { profile: resolve(context.cwd, parsed.runtime) };
  assert(selectedRuntime !== undefined,
    `No Runtime Profile is selected for ${projectRoot}; run hypit runtime use <profile> there, or pass --runtime <profile>`);
  const profile = resolve(selectedRuntime.profile);
  const host = await services.openRuntimeHost(profile, {
    packageRoot,
    ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
  });
  return { profile, host };
}

export async function runGenerationGraphCli(
  argv: readonly string[],
  io: CliIo,
  context: Pick<CliApplicationContext, "cwd" | "resolveProjectRoot">,
  services: GenerationGraphCliServices,
): Promise<void> {
  const action = parseCliGlobalOptions(argv).remaining[1];
  if (action === "materialize") {
    const parsed = parseMaterialize(argv);
    if (parsed === undefined) { writeGenerationGraphHelp(io); return; }
    await runGenerationMediaMaterializeCli(parsed, io, context, services);
    return;
  }
  const parsed = parseGraphAction(argv);
  if (parsed === undefined) { writeGenerationGraphHelp(io); return; }
  const openedGraph = await openGenerationGraphAuthoring(parsed, context, services);
  const { projectRoot, graphPath, packageRoot, project, packages, host } = openedGraph;
  if (parsed.action === "check") {
    const reports = await inspectGenerationGraphProject(project, host.lowering);
    let loweringIssue: string | undefined;
    if (reports.every((report) => report.readiness === "ready")) {
      try {
        await lowerGenerationGraph(project, host.program, host.lowering);
      } catch (error) {
        loweringIssue = error instanceof Error ? error.message : String(error);
      }
    }
    const invalid = reports.filter((report) => report.readiness === "invalid");
    const incomplete = reports.filter((report) => report.readiness === "incomplete");
    const valid = invalid.length === 0 && loweringIssue === undefined;
    const ready = valid && incomplete.length === 0;
    writeCliOutput(io, parsed.presentation, {
      kind: "operational",
      machine: {
        format: "hypit.generation-check@1",
        valid,
        ready,
        graph: graphPath,
        revision: project.revision,
        nodes: reports,
        ...(loweringIssue === undefined ? {} : { loweringIssue }),
      },
      title: !valid ? "Generation Graph is invalid" : ready ? "Generation Graph is ready" : "Generation Graph is incomplete",
      status: !valid ? "error" : ready ? "success" : "warning",
      facts: [
        ["Graph", graphPath],
        ["Nodes", String(reports.length)],
        ["Ready", String(reports.filter((report) => report.readiness === "ready").length)],
        ["Incomplete", String(incomplete.length)],
        ["Invalid", String(invalid.length + (loweringIssue === undefined ? 0 : 1))],
      ],
      lines: [
        ...reports.flatMap((report) => report.readiness === "ready" ? []
          : report.readiness === "incomplete"
            ? [`${report.node}: missing ${report.missing.join(", ")}`]
            : [`${report.node}: ${"message" in report ? report.message : "invalid node"}`]),
        ...(loweringIssue === undefined ? [] : [`Graph: ${loweringIssue}`]),
      ],
    });
    if (!ready) io.setExitCode?.(1);
    return;
  }
  const prepared = await host.prepare(project, parsed.targets);
  const selected = await selectedRuntimeHost(parsed, context, services, projectRoot, packageRoot);
  if (parsed.action === "plan") {
    const policy = await selected.host.planningPolicy?.();
    const evaluation = await evaluatePlanNeeds(
      prepared.definition,
      packages.map((item) => item.contribution),
      policy?.producerExecutionLimits,
    );
    const inspection = await selected.host.openInspection(plannedEndpointQueries(evaluation.state, evaluation));
    try {
      const endpoints = await describePlanEndpoints(inspection);
      const preflight = await preflightPlan(inspection, evaluation.state);
      let issue: string | undefined;
      try {
        assertPlannedRequests(evaluation.state, evaluation, endpoints);
        assertPreflight(preflight);
      } catch (error) {
        issue = error instanceof Error ? error.message : String(error);
      }
      const ok = issue === undefined;
      writeCliOutput(io, parsed.presentation, {
        kind: "operational",
        machine: {
          format: "hypit.generation-plan@1",
          ok,
          graph: graphPath,
          revision: project.revision,
          targets: prepared.targets.map((target) => target.node),
          requests: [...evaluation.needs.entries()].map(([need, request]) => ({ need, ...request })),
          endpoints,
          preflight,
          ...(issue === undefined ? {} : { issue }),
        },
        title: ok ? "Generation plan is ready" : "Generation plan needs attention",
        status: ok ? "success" : "error",
        facts: [
          [prepared.targets.length === 1 ? "Target" : "Targets", prepared.targets.map((target) => target.node).join(", ")],
          ["Requests", String(evaluation.needs.size)],
          ["Runtime", selected.profile],
          ["Preflight", preflight.ok ? "ready" : "needs attention"],
        ],
        lines: issue === undefined ? [] : [issue],
      });
      if (!ok) io.setExitCode?.(1);
    } finally {
      await inspection.close();
    }
    return;
  }
  const opened = await services.openProjectResults(projectRoot, {
    packageRoot,
    ...(services.packageRoot === undefined ? {} : { distributionPackageRoot: services.packageRoot }),
  });
  let acceptedSession: { close(): Promise<void> } | undefined;
  try {
    const profile = selected.profile;
    const runtimeHost = selected.host;
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
    acceptedSession = submitted;
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
    await acceptedSession?.close();
    await opened.close();
  }
}

export function createGenerationGraphCliCommandModules(
  services: GenerationGraphCliServices,
): readonly CliCommandModule[] {
  return [{
    id: "@hypit/generation-graph-cli",
    commands: ["generation"],
    writeRootHelp(io) {
      io.write("\nLong-running generation\n  generation check | plan | run | materialize\n  hypit generation --help for exact options\n");
    },
    writeHelp(_argv, io) { writeGenerationGraphHelp(io); },
    async run(argv, io, context) { await runGenerationGraphCli(argv, io, context, services); },
  }];
}
