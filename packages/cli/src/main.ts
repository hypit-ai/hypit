import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { orderedBuildId } from "@hypit/protocol";
import { parseSourceHeader } from "@hypit/source";

import { unreachedGenerations } from "./reachability.js";
import { typecheckProjectPackages } from "./package-typecheck.js";
import { checkRunFile, collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";
import type {
  CliRuntime,
  CliRuntimeController,
} from "./runtime-port.js";
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliIo, CliMachineView } from "./output.js";
import {
  assertCommandOptions,
  commandAllowsMissingPositional,
  isKnownCommand,
  parseArgs,
  usage,
} from "./arguments.js";
import { assertPreflight, createCatalogDescriptor, preflightPlan } from "./build-planning.js";
import { observeBuild } from "./observation.js";
import { isProjectResultCommand, runProjectResultCommand } from "./commands/results.js";
import { runEnvironmentCommand } from "./commands/environment.js";
import { isExecutionCommand, runExecutionCommand } from "./commands/execution.js";
import { inlineValuePreview } from "./runtime-view.js";
import { resolvePackageRoot } from "./project-context.js";
import { loadDiscoveredSourcePackages } from "./source-packages.js";
import {
  clearRuntimeProfile,
  findRuntimeProfile,
  selectRuntimeProfile,
} from "./runtime-selection.js";
import {
  buildStatusView,
  cliTypeName,
  projectPath,
} from "./view.js";

function createPublicBuildId(now = Date.now()): string {
  return orderedBuildId(now, randomBytes(5).toString("hex").toUpperCase());
}

async function loadRuntime(host: NodeRuntimeHost): Promise<CliRuntime> {
  return await host.createRuntime();
}

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  distribution: CliDistribution,
): Promise<void> {
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    const topic = argv[0] === "help" ? argv[1] : argv.includes("--help") ? argv[0] : undefined;
    writeCliHelp(io, topic);
    return;
  }
  let args = parseArgs(argv);
  let selectedRuntimeProjectRoot: string | undefined;
  const commandProjectRoot = (): string => args.workspaceRoot
    ?? selectedRuntimeProjectRoot
    ?? ((args.command === "check" || args.command === "plan" || args.command === "build")
      && args.file !== undefined
      ? dirname(resolve(args.file))
      : process.cwd());
  const packageRootForProject = async (projectRoot = commandProjectRoot()): Promise<string> =>
    args.packageRoot ?? await resolvePackageRoot(projectRoot);
  const writeOperational = (
    machine: CliMachineView,
    title: string,
    status: "success" | "warning" | "error" | "info" = "info",
    facts: readonly (readonly [string, string])[] = [],
    lines: readonly string[] = [],
  ): void => writeCliOutput(io, {
    json: args.json || args.jsonl,
    jsonl: args.jsonl,
    color: args.color,
    verbose: args.verbose,
  }, { kind: "operational", machine, title, status, facts, lines });
  const runtimeHosts = new Map<string, Promise<NodeRuntimeHost>>();
  const runtimeHost = async (path: string, requestedPackageRoot?: string): Promise<NodeRuntimeHost> => {
    const profile = resolve(path);
    const packageRoot = requestedPackageRoot ?? await packageRootForProject();
    const key = `${profile}\u0000${packageRoot}`;
    let opened = runtimeHosts.get(key);
    if (opened === undefined) {
      opened = distribution.openRuntimeHost(profile, {
        packageRoot,
        ...(distribution.packageRoot === undefined
          ? {}
          : { distributionPackageRoot: distribution.packageRoot }),
      });
      runtimeHosts.set(key, opened);
    }
    return await opened;
  };
  const projectResults = async (projectRoot = commandProjectRoot()) => {
    const packageRoot = await packageRootForProject(projectRoot);
    return await distribution.openProjectResults(projectRoot, {
      packageRoot,
      ...(distribution.packageRoot === undefined ? {} : { distributionPackageRoot: distribution.packageRoot }),
    });
  };
  if (args.command === "_worker") {
    if (args.file === undefined || args.readyFile === undefined || args.workerOwner === undefined) {
      throw new Error("internal Worker launch is incomplete");
    }
    await (await runtimeHost(
      args.file,
      args.packageRoot ?? await packageRootForProject(),
    )).runWorker(args.readyFile, args.workerOwner);
    return;
  }
  if (args.command === "runtime" && args.action === "use") {
    if (args.runtime !== undefined) {
      throw new Error("runtime use takes the Runtime Profile positionally, not through --runtime");
    }
    if (args.file === undefined) throw new Error("runtime use requires a Runtime Profile");
    assertCommandOptions(args);
    const profile = resolve(args.file);
    const selected = await selectRuntimeProfile(args.workspaceRoot ?? process.cwd(), profile);
    writeOperational({
      format: "hypit.cli-runtime-selection@2",
      selected: true,
      profile: selected.profile,
      project: selected.projectRoot,
    }, "Runtime selected", "success", [
      ["Profile", selected.profile],
      ["Project", selected.projectRoot],
    ]);
    return;
  }
  if (args.command === "runtime" && args.action === "unset") {
    if (args.file !== undefined || args.runtime !== undefined) {
      throw new Error("runtime unset does not take a Runtime Profile");
    }
    assertCommandOptions(args);
    const cleared = await clearRuntimeProfile(args.workspaceRoot ?? process.cwd());
    writeOperational({
      format: "hypit.cli-runtime-selection@2",
      selected: false,
      removed: cleared !== undefined,
      ...(cleared === undefined ? {} : { profile: cleared.profile, project: cleared.projectRoot }),
    }, cleared === undefined ? "No Runtime was selected" : "Runtime selection removed",
    cleared === undefined ? "info" : "success", cleared === undefined ? [] : [
      ["Profile", cleared.profile], ["Project", cleared.projectRoot],
    ]);
    return;
  }

  const positionalRuntime = (args.command === "runtime" || args.command === "programs"
    || args.command === "doctor") && args.file !== undefined;
  const runtimeWasExplicit = args.runtime !== undefined || positionalRuntime;
  let runtimeNeedsHint = runtimeWasExplicit;
  if (args.runtime === undefined && !positionalRuntime) {
    const sourceScoped = args.command === "check" || args.command === "plan" || args.command === "build";
    const start = args.workspaceRoot
      ?? (sourceScoped && args.file !== undefined ? dirname(resolve(args.file)) : process.cwd());
    const selected = await findRuntimeProfile(start);
    if (selected !== undefined) {
      args = { ...args, runtime: selected.profile };
      selectedRuntimeProjectRoot = selected.projectRoot;
      const cwdFromProject = relative(selected.projectRoot, resolve(process.cwd()));
      runtimeNeedsHint = cwdFromProject === ".." || cwdFromProject.startsWith(`..${sep}`)
        || isAbsolute(cwdFromProject);
    }
  }
  if (!isKnownCommand(args.command)
    || (!commandAllowsMissingPositional(args.command) && args.file === undefined)) {
    throw new Error(usage());
  }
  if (args.watch && args.command !== "activity" && args.command !== "status") {
    throw new Error("--watch applies only to status or activity");
  }
  if (args.jsonl && (args.command !== "activity" || !args.watch)) {
    throw new Error("--jsonl applies only to activity --watch");
  }
  if (args.command === "activity" && args.watch && args.json) {
    throw new Error("activity --watch is a stream; use --jsonl instead of --json");
  }
  if (args.command === "history" && args.file === undefined) {
    throw new Error("history requires one exact Output name");
  }
  if (args.command === "result" && args.action !== "finish"
    && args.action !== "discard" && args.action !== "edit") {
    throw new Error("result accepts finish, discard or edit");
  }
  if (args.command === "result" && args.action === "edit") {
    if (args.title !== undefined && args.clearTitle) throw new Error("--title and --clear-title are mutually exclusive");
    if (args.note !== undefined && args.clearNote) throw new Error("--note and --clear-note are mutually exclusive");
    if (args.highlightedOutputs.length > 0 && args.clearHighlights) {
      throw new Error("--highlight and --clear-highlights are mutually exclusive");
    }
    if (args.title === undefined && args.note === undefined && args.highlightedOutputs.length === 0
      && !args.clearTitle && !args.clearNote && !args.clearHighlights) {
      throw new Error("result edit requires a presentation change");
    }
  }
  assertCommandOptions(args);
  const runtimeController = async (profile: string, source?: string): Promise<CliRuntimeController> => {
    const workspaceRoot = args.workspaceRoot
      ?? selectedRuntimeProjectRoot
      ?? (source === undefined ? process.cwd() : dirname(resolve(source)));
    const packageRoot = await packageRootForProject(workspaceRoot);
    return await (await runtimeHost(profile, packageRoot)).controller({
      packageRoot,
    });
  };
  if (await runEnvironmentCommand({
    args,
    io,
    distribution,
    projectRoot: args.command === "paths" ? selectedRuntimeProjectRoot ?? process.cwd() : commandProjectRoot(),
    packageRootForProject,
    runtimeHost,
    runtimeController,
    write: writeOperational,
  })) return;
  if (isProjectResultCommand(args)) {
    const results = await projectResults();
    try {
      await runProjectResultCommand({
        args,
        projectRoot: commandProjectRoot(),
        repository: results.repository,
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
      io,
      runtimeHost,
      runtimeController,
      openProjectResults: projectResults,
      write: writeOperational,
    });
    return;
  }
  const runtimePaths = args.runtime === undefined
    ? undefined
    : await (await runtimeHost(args.runtime)).resolvePaths();
  const effectivePackageRoot = args.packageRoot ?? runtimePaths?.packageRoot;
  const effectiveWorkspaceRoot = args.workspaceRoot
    ?? selectedRuntimeProjectRoot
    ?? dirname(resolve(args.file!));
  const projectResultsRoot = effectiveWorkspaceRoot;
  const sourcePackageRoot = effectivePackageRoot
    ?? await resolvePackageRoot(effectiveWorkspaceRoot);
  const loadedPackageSet = distribution.discoverSourcePackages === undefined
    ? undefined
    : await loadDiscoveredSourcePackages(distribution, {
          source: args.file!,
          ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
          packageRoot: sourcePackageRoot,
          ...(distribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: distribution.packageRoot }),
        });
  const packageContributions = (loadedPackageSet ?? distribution.bootstrapPackages)
    .map((item) => item.contribution);
  const runFrontends = collectRunFrontends(packageContributions);
  const compiler = distribution.createCompiler({
    ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
    ...(args.assetRoots.length === 0 ? {} : { assetRoots: args.assetRoots }),
    packageContributions,
  });
  const workspace = await compiler.openFile(args.file!);
  const sourceHeader = parseSourceHeader(workspace.entry.name, workspace.entry.text);
  const runMode = runFrontends.some((frontend) => frontend.id === sourceHeader.using);
  const authorMode = compiler.supportsFrontend(sourceHeader.using);
  if (runMode === authorMode) {
    const message = runMode
      ? `Frontend ${sourceHeader.using} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${sourceHeader.using}`;
    throw new Error(message);
  }
  if ((args.command === "plan" || args.command === "build") && !runMode) {
    throw new Error(`${args.command} requires a self-described Run Source; check Author Sources independently`);
  }
  if (args.command === "check") {
    // A project's own packages decide their element field names in TypeScript, and nothing authored
    // carries them, so this is the only place before a Build that can read them.
    const packageDiagnostics = typecheckProjectPackages(sourcePackageRoot, distribution.packageRoot);
    if (packageDiagnostics.length > 0) {
      throw new Error(`this project's own author packages do not typecheck:\n${packageDiagnostics.join("\n")}`);
    }
    if (runMode) {
        const loaded = await checkRunFile({
          workspace,
          authorCompiler: compiler,
          frontends: runFrontends,
          packageContributions,
        });
        const machine = {
          format: "hypit.cli-check@2" as const,
          sourceKind: "run" as const,
          ok: true,
          run: projectPath(loaded.source, effectiveWorkspaceRoot),
          author: projectPath(loaded.authorSource, effectiveWorkspaceRoot),
          frontend: sourceHeader.using,
          targetCount: loaded.document.targets.length,
          targets: loaded.document.targets.slice(0, args.limit).map((item) => item.output),
          candidates: loaded.document.candidates.length,
          satisfactions: loaded.document.satisfactions.length,
          unresolvedHistoricalOutputs: loaded.unresolvedHistoricalOutputs.slice(0, args.limit).map((item) => ({
            candidate: item.id,
            build: item.build,
            output: item.output,
          })),
          ...(loaded.unresolvedHistoricalOutputs.length <= args.limit ? {} : {
            omittedHistoricalOutputs: loaded.unresolvedHistoricalOutputs.length - args.limit,
          }),
        } as const;
        writeCliOutput(io, args, {
          kind: "check-run",
          machine,
        });
        return;
    }
    {
      const result = await compiler.compileSource(workspace.entry, workspace);
      const authorFacing = result.exports.filter((item) =>
        !item.name.includes(".__") && !/\.binding-\d+$/u.test(item.name) && !item.name.endsWith(".bindings"));
      const outputs = authorFacing.filter((item) => item.ref.kind === "logical-output");
      const values = authorFacing.filter((item) => item.ref.kind !== "logical-output");
      const modules = result.program.closure.modules.map((item) => `${item.manifest.name}@${item.manifest.version}`);
      const machine = {
        format: "hypit.cli-check@2" as const,
        sourceKind: "author" as const,
        ok: true,
        source: projectPath(workspace.entry.name, effectiveWorkspaceRoot),
        frontend: sourceHeader.using,
        units: result.closure.units.length,
        assets: result.attachments.length,
        modules: modules.length,
        outputCount: outputs.length,
        outputs: outputs.slice(0, args.limit).map((item) => ({ name: item.name, type: cliTypeName(item.type) })),
        ...(outputs.length <= args.limit ? {} : { omittedOutputs: outputs.length - args.limit }),
        ...(args.verbose ? { details: {
          modules: modules.slice(0, args.limit),
          values: values.slice(0, args.limit).map((item) => ({ name: item.name, type: cliTypeName(item.type) })),
        } } : {}),
      } as const;
      writeCliOutput(io, args, {
        kind: "check-author",
        machine,
      });
      return;
    }
  }
  if (args.command === "build") {
    if (args.runtime === undefined) {
      throw new Error("build requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>");
    }
    const buildResults = await projectResults(projectResultsRoot);
    let loadedRun;
    try {
      loadedRun = await loadRunFile({
        workspace,
        authorCompiler: compiler,
        frontends: runFrontends,
        packageContributions,
        results: buildResults.repository,
      });
    } catch (error) {
      await buildResults.close();
      throw error;
    }
    const result = await (async () => {
      try {
        return loadedRun.compiler.planCompilation(loadedRun);
      } catch (error) {
        await buildResults.close();
        throw error;
      }
    })();
    let runtime: CliRuntime | undefined;
    try {
      const catalog = createCatalogDescriptor({
        source: loadedRun.authorSource,
        compilation: result.compilation.author,
        run: {
          path: loadedRun.path,
        },
      });
      const request = {
        // One CLI invocation is one execution instance. Source and Plan identity
        // remain in Core; they never reclaim a previous Build.
        id: createPublicBuildId(),
        definition: result.definition,
        ...(loadedPackageSet === undefined ? {} : {
          componentPackages: loadedPackageSet
            .filter((item) => (item.contribution.components?.length ?? 0) > 0)
            .map((item) => item.specifier),
        }),
        catalog,
        attachments: result.compilation.attachments,
        result: {
          repository: buildResults.location,
          ...(args.title === undefined ? {} : { title: args.title }),
          forwards: result.resultForwards.filter((forward) =>
            catalog.publishedOutputs.some((published) => published.ref.id === forward.output)),
        },
      } as const;
      const controller = await (await runtimeHost(args.runtime)).controller({
        packageRoot: sourcePackageRoot,
      });
      const preflight = await preflightPlan(await runtimeHost(args.runtime), result.state);
      // Build is an execution boundary, not a provisioning command. The cheap
      // preflight must already be clean; `runtime up` is the explicit place for
      // installing or starting declared programs.
      assertPreflight(preflight);
      try {
        await controller.worker.up({
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Runtime Worker could not start; no Build was queued: ${detail}`);
      }
      runtime = await loadRuntime(await runtimeHost(args.runtime));
      let built = await runtime.build(request);
      if (args.follow && runtime !== undefined) {
        built = await observeBuild(runtime, built, {
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
          controller,
          readResult: async () => await buildResults.repository.read(built.id),
          ...(args.json || args.jsonl ? {} : {
            onProgress: (progress) => {
              const operations = Object.entries(progress.operations)
                .map(([status, count]) => `${count} ${status}`)
                .join(", ");
              io.write(`  · ${progress.phase}`
                + `${operations.length === 0 ? "" : ` · ${operations}`}\n`);
              if (args.verbose) {
                for (const line of progress.activity.slice(0, args.limit)) io.write(`    ${line}\n`);
              }
            },
          }),
        });
      }
      const finished = "completion" in built;
      const activeView = "view" in built ? built.view : undefined;
      const completionReason = "completion" in built ? built.completion.reason : undefined;
      const buildOutcome = "completion" in built ? built.completion.outcome : activeView?.outcome;
      const issue = activeView?.issue;
      const finishedResult = finished
        ? await buildResults.repository.read(built.id)
        : undefined;
      const targetOutputs = new Set(built.state.targets.map((target) => target.output));
      const presentation = catalog;
      const targetPublishedOutputs = presentation.publishedOutputs.filter((published) =>
        targetOutputs.has(published.ref.id));
      const targetPresentations = targetPublishedOutputs.flatMap((published) => {
        const selection = built.state.plan.outputBindings.find((item) => item.output === published.ref.id);
        const record = selection === undefined
          ? undefined
          : built.state.records.find((item) => item.id === selection.record);
        if (record === undefined) return [];
        return [{
          published,
          record,
          ...(record?.value.kind === "inline"
            ? { inline: inlineValuePreview(record.value.value) }
            : {}),
        }];
      });
      const buildView = buildStatusView({
        id: built.id,
        ...(activeView === undefined ? {} : { runtime: activeView }),
        ...(finishedResult === undefined ? {} : { result: finishedResult }),
        verbose: args.verbose,
        operationLimit: args.limit,
      });
      const machine = {
        format: "hypit.cli-build@3" as const,
        build: args.title === undefined || buildView.title !== undefined
          ? buildView
          : { ...buildView, title: args.title },
      };
      const runtimeHint = runtimeNeedsHint ? ` --runtime ${args.runtime}` : "";
      const resultTargets = finishedResult?.targets.flatMap((name) => {
        const output = finishedResult.outputs[name];
        return output === undefined ? [] : [{ name, output }];
      }) ?? [];
      const finishedLines = resultTargets.length === 0 && targetPresentations.length === 0
        ? [
            ...(completionReason === undefined ? [] : [`Reason   ${completionReason}`]),
            `Inspect  hypit inspect ${built.id}`,
          ]
        : [
            ...(completionReason === undefined ? [] : [`Reason   ${completionReason}`]),
            `Inspect  hypit inspect ${built.id}`,
            ...resultTargets
              .filter((item) => item.output.value.kind === "inline")
              .slice(0, args.limit)
              .map((item) => `Result   ${item.name} = ${inlineValuePreview(
                item.output.value.kind === "inline" ? item.output.value.value : undefined,
              )}`),
            ...resultTargets
              .filter((item) => item.output.value.kind !== "inline")
              .slice(0, args.limit)
              .map((item) =>
                `Export   hypit get ${built.id} --output ${item.name} --to <path>`),
            ...(resultTargets.length > 0 ? [] : targetPresentations
              .filter((item) => item.inline !== undefined)
              .slice(0, args.limit)
              .map((item) => `Result   ${item.published.name} = ${item.inline}`)),
          ];
      writeOperational(machine, args.follow
        ? finished ? "Build finished" : issue !== undefined ? "Result needs attention" : "Build still active"
        : "Build submitted",
      buildOutcome === "failed" || issue !== undefined ? "error"
        : buildOutcome === "cancelled" || (args.follow && !finished) ? "warning" : "success", [
          ["Build", built.id],
          ["Work", machine.build.work.state],
          ...(machine.build.work.outcome === undefined ? [] : [["Decision", machine.build.work.outcome] as const]),
          ["Result", machine.build.result.state],
          ["Targets", String(finishedResult?.targets.length ?? targetPublishedOutputs.length)],
        ], finished ? finishedLines : issue !== undefined ? [
          `Result   ${issue.scope}: ${issue.message}`,
          `Finish   hypit result finish ${built.id}${runtimeHint}`,
        ] : [
          `Watch    hypit status ${built.id}${runtimeHint} --watch`,
          `Cancel   hypit cancel ${built.id}${runtimeHint}`,
        ]);
      if (buildOutcome === "failed" || issue !== undefined) io.setExitCode?.(1);
    } finally {
      await runtime?.close();
      await buildResults.close();
    }
    return;
  }
  let planResults: Awaited<ReturnType<typeof projectResults>> | undefined;
  try {
    planResults = await projectResults(projectResultsRoot);
    const loaded = await loadRunFile({
      workspace,
      authorCompiler: compiler,
      frontends: runFrontends,
      packageContributions,
      results: planResults.repository,
    });
    const result = loaded.compiler.planCompilation(loaded);
    const preflight = args.runtime === undefined
      ? undefined
      : await preflightPlan(await runtimeHost(args.runtime), result.state);
    const outputNames = Object.fromEntries(result.compilation.author.exports.flatMap((item) =>
      item.ref.kind === "logical-output" ? [[item.ref.id, item.name]] : []));
    const externalRequests = new Map<string, number>();
    for (const step of result.definition.plan.steps) {
      const count = Object.keys(step.needs).length;
      if (count === 0) continue;
      const operation = `${step.producer.module.name}@${step.producer.module.version}/${step.producer.name}`;
      externalRequests.set(operation, (externalRequests.get(operation) ?? 0) + count);
    }
    const allChoices = result.selections.flatMap((selection) => {
      const output = outputNames[selection.output];
      const candidate = loaded.run.satisfactionNames[selection.output];
      return output === undefined || candidate === undefined ? [] : [{ output, candidate }];
    });
    const allUnreached = unreachedGenerations(result.compilation.author.graph, result.state, outputNames)
      .map((item) => ({ output: item.name, operation: item.producer }));
    const requestViews = [...externalRequests.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([operation, count]) => ({ operation, count }));
    const targets = loaded.run.document.targets.map((item) => item.output);
    writeCliOutput(io, args, {
      kind: "plan",
      machine: {
        format: "hypit.cli-plan@2",
        ok: preflight?.ok ?? true,
        run: projectPath(loaded.path, effectiveWorkspaceRoot),
        targetCount: targets.length,
        targets: targets.slice(0, args.limit),
        steps: result.definition.plan.steps.length,
        externalRequestCount: requestViews.reduce((total, item) => total + item.count, 0),
        externalRequests: requestViews.slice(0, args.limit),
        ...(requestViews.length <= args.limit ? {} : { omittedExternalRequests: requestViews.length - args.limit }),
        choiceCount: allChoices.length,
        choices: allChoices.slice(0, args.limit),
        ...(allChoices.length <= args.limit ? {} : { omittedChoices: allChoices.length - args.limit }),
        ...(allUnreached.length === 0 ? {} : { unreached: allUnreached.slice(0, args.limit) }),
        ...(allUnreached.length <= args.limit ? {} : { omittedUnreached: allUnreached.length - args.limit }),
        ...(preflight === undefined ? {} : { preflight: {
          ok: preflight.ok,
          capabilityCount: preflight.capabilities.length,
          capabilities: preflight.capabilities.slice(0, args.limit),
          ...(preflight.capabilities.length <= args.limit
            ? {}
            : { omittedCapabilities: preflight.capabilities.length - args.limit }),
          diagnosticCount: preflight.diagnostics.length,
          diagnostics: preflight.diagnostics.slice(0, args.limit),
          ...(preflight.diagnostics.length <= args.limit
            ? {}
            : { omittedDiagnostics: preflight.diagnostics.length - args.limit }),
        } }),
      },
    });
    if (preflight !== undefined && !preflight.ok) io.setExitCode?.(1);
  } finally {
    await planResults?.close();
  }
}
