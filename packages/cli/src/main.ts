import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { orderedBuildId } from "@hypit/protocol";
import { parseSourceHeader } from "@hypit/source";

import { unreachedGenerations } from "./reachability.js";
import { checkRunFile, collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";
import type {
  CliRuntime,
  CliRuntimeController,
} from "./runtime-port.js";
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliIo, CliMachineView } from "./output.js";
import { parseCommand } from "./arguments.js";
import type { CliCommand, RuntimeOption } from "./command.js";
import { assertPlannedRequests, assertPreflight, createCatalogDescriptor, describePlanNeeds, describePlanPricing, describePlanProviders, evaluatePlanNeeds, preflightPlan } from "./build-planning.js";
import { buildProgressLines, observeBuild } from "./observation.js";
import { isProjectResultCommand, runProjectResultCommand } from "./commands/results.js";
import { isEnvironmentCommand, runEnvironmentCommand } from "./commands/environment.js";
import { isExecutionCommand, runExecutionCommand } from "./commands/execution.js";
import { inlineValuePreview } from "./runtime-view.js";
import { resolvePackageRoot, resolveProjectRoot } from "./project-context.js";
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

function commandWorkspaceRoot(command: CliCommand): string | undefined {
  return "workspaceRoot" in command ? command.workspaceRoot : undefined;
}

function commandPackageRoot(command: CliCommand): string | undefined {
  return "packageRoot" in command ? command.packageRoot : undefined;
}

function acceptsRuntimeContext(command: CliCommand): command is CliCommand & RuntimeOption {
  return "runtimeProfile" in command;
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
  const args = parseCommand(argv);
  let resolvedProject: Promise<string> | undefined;
  const commandProjectRoot = async (): Promise<string> => {
    const workspaceRoot = commandWorkspaceRoot(args);
    resolvedProject ??= resolveProjectRoot({
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
      cwd: process.cwd(),
    });
    return await resolvedProject;
  };
  const packageRootForProject = async (projectRoot?: string): Promise<string> =>
    commandPackageRoot(args) ?? await resolvePackageRoot(projectRoot ?? await commandProjectRoot());
  const writeOperational = (
    machine: CliMachineView,
    title: string,
    status: "success" | "warning" | "error" | "info" = "info",
    facts: readonly (readonly [string, string])[] = [],
    lines: readonly string[] = [],
  ): void => writeCliOutput(io, {
    ...args.presentation,
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
  const projectResults = async (requestedProjectRoot?: string) => {
    const projectRoot = requestedProjectRoot ?? await commandProjectRoot();
    const packageRoot = await packageRootForProject(projectRoot);
    return await distribution.openProjectResults(projectRoot, {
      packageRoot,
      ...(distribution.packageRoot === undefined ? {} : { distributionPackageRoot: distribution.packageRoot }),
    });
  };
  if (args.command === "_worker") {
    await (await runtimeHost(
      args.profile,
      args.packageRoot ?? await packageRootForProject(),
    )).runWorker(args.readyFile, args.workerOwner);
    return;
  }
  if (args.command === "runtime" && args.action === "init") {
    if (distribution.initialRuntimeProfile === undefined) {
      throw new Error("This Hypit Distribution does not provide an initial Runtime Profile");
    }
    const projectRoot = await commandProjectRoot();
    const profile = resolve(args.profile ?? resolve(projectRoot, "hypit.runtime.json"));
    try {
      await writeFile(profile, `${JSON.stringify(distribution.initialRuntimeProfile, undefined, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new Error(`Runtime Profile already exists: ${profile}; select it with hypit runtime use or choose another path`);
      }
      throw error;
    }
    const selected = await selectRuntimeProfile(projectRoot, profile);
    writeOperational({
      format: "hypit.cli-runtime-init@1",
      profile: selected.profile,
      project: selected.projectRoot,
      selected: true,
    }, "Runtime Profile created", "success", [
      ["Profile", selected.profile],
      ["Project", selected.projectRoot],
    ], ["No package was installed, no service was contacted and no Worker was started."]);
    return;
  }
  if (args.command === "runtime" && args.action === "use") {
    const profile = resolve(args.profile);
    const selected = await selectRuntimeProfile(await commandProjectRoot(), profile);
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
    const cleared = await clearRuntimeProfile(await commandProjectRoot());
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

  let runtimeProfile = acceptsRuntimeContext(args) ? args.runtimeProfile : undefined;
  const runtimeWasExplicit = runtimeProfile !== undefined;
  let runtimeNeedsHint = runtimeWasExplicit;
  if (acceptsRuntimeContext(args) && runtimeProfile === undefined) {
    const selected = await findRuntimeProfile(await commandProjectRoot());
    if (selected !== undefined) {
      runtimeProfile = selected.profile;
      runtimeNeedsHint = false;
    }
  }
  const runtimeController = async (profile: string): Promise<CliRuntimeController> => {
    const packageRoot = await packageRootForProject();
    return await (await runtimeHost(profile, packageRoot)).controller({
      packageRoot,
    });
  };
  if (isEnvironmentCommand(args)) {
    await runEnvironmentCommand({
      args,
      runtimeProfile,
      io,
      distribution,
      projectRoot: await commandProjectRoot(),
      packageRootForProject,
      runtimeHost,
      runtimeController,
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
      runtimeProfile,
      io,
      runtimeHost,
      runtimeController,
      openProjectResults: projectResults,
      write: writeOperational,
    });
    return;
  }
  const effectiveWorkspaceRoot = await commandProjectRoot();
  const projectResultsRoot = effectiveWorkspaceRoot;
  const sourcePackageRoot = args.packageRoot ?? await resolvePackageRoot(effectiveWorkspaceRoot);
  const loadedPackageSet = distribution.discoverSourcePackages === undefined
    ? undefined
    : await loadDiscoveredSourcePackages(distribution, {
          source: args.source,
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
    packageRoot: sourcePackageRoot,
    ...(distribution.packageRoot === undefined
      ? {}
      : { distributionPackageRoot: distribution.packageRoot }),
    packageContributions,
  });
  const workspace = await compiler.openFile(args.source);
  const sourceHeader = parseSourceHeader(workspace.entry.name, workspace.entry.text);
  const runMode = runFrontends.some((frontend) => frontend.id === sourceHeader.using);
  const authorMode = compiler.supportsFrontend(sourceHeader.using);
  if (runMode === authorMode) {
    const message = runMode
      ? `Frontend ${sourceHeader.using} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${sourceHeader.using}`;
    throw new Error(message);
  }
  if ((args.command === "plan" || args.command === "pricing" || args.command === "build") && !runMode) {
    throw new Error(`${args.command} requires a self-described Run Source; check Author Sources independently`);
  }
  if (args.command === "check") {
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
        writeCliOutput(io, args.presentation, {
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
        ...(args.presentation.verbose ? { details: {
          modules: modules.slice(0, args.limit),
          values: values.slice(0, args.limit).map((item) => ({ name: item.name, type: cliTypeName(item.type) })),
        } } : {}),
      } as const;
      writeCliOutput(io, args.presentation, {
        kind: "check-author",
        machine,
      });
      return;
    }
  }
  if (args.command === "build") {
    if (runtimeProfile === undefined) {
      throw new Error("build requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
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
    const runSelections = result.selections.filter((selection) =>
      loadedRun.run.satisfactionNames[selection.output] !== undefined);
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
      const host = await runtimeHost(runtimeProfile);
      const controller = await host.controller({
        packageRoot: sourcePackageRoot,
      });
      const evaluated = await evaluatePlanNeeds(result.definition, packageContributions);
      const providers = await describePlanProviders(host, evaluated.state, evaluated);
      assertPlannedRequests(evaluated.state, evaluated, providers);
      const preflight = await preflightPlan(host, evaluated.state);
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
      runtime = await loadRuntime(await runtimeHost(runtimeProfile));
      let built = await runtime.build(request);
      const requestCount = result.definition.plan.steps.reduce(
        (total, step) => total + Object.keys(step.needs).length,
        0,
      );
      const suppliedOutputCount = runSelections.length;
      const workSummary = [
        `${requestCount} ${requestCount === 1 ? "request" : "requests"}`,
        ...(suppliedOutputCount === 0 ? [] : [
          `${suppliedOutputCount} ${suppliedOutputCount === 1 ? "Output" : "Outputs"} supplied by Run`,
        ]),
      ].join(" · ");
      if (args.follow && "view" in built && !args.presentation.json) {
        const acceptedView = buildStatusView({ id: built.id, runtime: built.view });
        const targets = built.view.targets.slice(0, args.limit);
        writeOperational({
          format: "hypit.cli-build@3",
          build: args.title === undefined ? acceptedView : { ...acceptedView, title: args.title },
        }, "Build submitted", "success", [
          ["Build", built.id],
          ...(args.title === undefined ? [] : [["Title", args.title] as const]),
          [built.view.targets.length === 1 ? "Target" : "Targets", targets.join(", ")
            + (built.view.targets.length > targets.length ? ` (+${built.view.targets.length - targets.length})` : "")],
          ["Work", workSummary],
        ], ["Following accepted work. Ctrl-C stops watching; the Build continues."]);
      }
      if (args.follow && runtime !== undefined) {
        built = await observeBuild(runtime, built, {
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
          controller,
          readResult: async () => await buildResults.repository.read(built.id),
          ...(args.presentation.json ? {} : {
            onProgress: (progress) => {
              for (const line of buildProgressLines(progress, {
                verbose: args.presentation.verbose,
                limit: args.limit,
              })) io.write(`${line}\n`);
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
        verbose: args.presentation.verbose,
        operationLimit: args.limit,
      });
      const machine = {
        format: "hypit.cli-build@3" as const,
        build: args.title === undefined || buildView.title !== undefined
          ? buildView
          : { ...buildView, title: args.title },
      };
      const runtimeHint = runtimeNeedsHint ? ` --runtime ${runtimeProfile}` : "";
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
      const humanTitle = issue !== undefined
        ? "Result needs attention"
        : finished
          ? buildOutcome === "complete"
            ? "Build complete"
            : buildOutcome === "failed"
              ? "Build failed"
              : buildOutcome === "cancelled" ? "Build cancelled" : "Build finished"
          : args.follow ? "Build still active" : "Build submitted";
      writeOperational(machine, humanTitle,
      buildOutcome === "failed" || issue !== undefined ? "error"
        : buildOutcome === "cancelled" || (args.follow && !finished) ? "warning" : "success", [
          ["Build", built.id],
          ...(args.title === undefined ? [] : [["Title", args.title] as const]),
          ...(!args.follow && !finished ? [
            [targetPublishedOutputs.length === 1 ? "Target" : "Targets",
              targetPublishedOutputs.map((item) => item.name).join(", ")] as const,
            ["Work", workSummary] as const,
          ] : []),
          ...(issue === undefined ? [] : [
            ["Execution", buildOutcome ?? machine.build.work.state] as const,
            ["Result", "needs attention"] as const,
          ]),
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
    const planHost = runtimeProfile === undefined ? undefined : await runtimeHost(runtimeProfile);
    const evaluated = await evaluatePlanNeeds(result.definition, packageContributions);
    if (args.command === "pricing") {
      if (planHost === undefined) {
        throw new Error("pricing requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
      }
      const pricing = await describePlanPricing(planHost, evaluated.state, evaluated);
      const needs = describePlanNeeds(evaluated.state, evaluated, pricing);
      const shown = args.limit;
      writeCliOutput(io, args.presentation, {
        kind: "pricing",
        machine: {
          format: "hypit.cli-pricing@1",
          run: projectPath(loaded.path, effectiveWorkspaceRoot),
          requestCount: pricing.length,
          pricing: pricing.slice(0, shown),
          ...(pricing.length <= shown ? {} : { omittedPricing: pricing.length - shown }),
          needs: needs.slice(0, shown),
          ...(needs.length <= shown ? {} : { omittedNeeds: needs.length - shown }),
        },
      });
      return;
    }
    const preflight = planHost === undefined ? undefined : await preflightPlan(planHost, evaluated.state);
    const providers = planHost === undefined ? undefined : await describePlanProviders(planHost, evaluated.state, evaluated);
    const needs = describePlanNeeds(evaluated.state, evaluated, providers ?? []);
    const outputNames = Object.fromEntries(result.compilation.author.exports.flatMap((item) =>
      item.ref.kind === "logical-output" ? [[item.ref.id, item.name]] : []));
    const allChoices = result.selections.flatMap((selection) => {
      const output = outputNames[selection.output];
      const candidate = loaded.run.satisfactionNames[selection.output];
      return output === undefined || candidate === undefined ? [] : [{ output, candidate }];
    });
    const allUnreached = unreachedGenerations(result.compilation.author.graph, result.state, outputNames)
      .map((item) => ({ output: item.name, operation: item.producer }));
    const targets = loaded.run.document.targets.map((item) => item.output);
    const unsupportedRequestCount = providers?.filter((item) => item.status === "unsupported").length ?? 0;
    const unresolvedRequestCount = providers?.filter((item) => item.status === "unresolved" || item.status === "ambiguous").length ?? 0;
    const localRequestCount = providers?.filter((item) => item.status === "resolved" && item.pricing?.kind === "local").length ?? 0;
    const providerRequestCount = providers?.filter((item) => item.status === "resolved" && item.pricing?.kind !== "local").length;
    const requestIssueCount = needs.filter((item) => item.issue !== undefined).length;
    writeCliOutput(io, args.presentation, {
      kind: "plan",
      machine: {
        format: "hypit.cli-plan@3",
        ok: (preflight?.ok ?? true) && unresolvedRequestCount === 0
          && unsupportedRequestCount === 0 && requestIssueCount === 0,
        run: projectPath(loaded.path, effectiveWorkspaceRoot),
        targetCount: targets.length,
        targets: targets.slice(0, args.limit),
        steps: result.definition.plan.steps.length,
        requestCount: needs.length,
        requestIssueCount,
        ...(providerRequestCount === undefined ? {} : { providerRequestCount }),
        ...(providers === undefined ? {} : { localRequestCount, unresolvedRequestCount, unsupportedRequestCount }),
        choiceCount: allChoices.length,
        choices: allChoices.slice(0, args.limit),
        ...(allChoices.length <= args.limit ? {} : { omittedChoices: allChoices.length - args.limit }),
        ...(allUnreached.length === 0 ? {} : { unreached: allUnreached.slice(0, args.limit) }),
        ...(allUnreached.length <= args.limit ? {} : { omittedUnreached: allUnreached.length - args.limit }),
        ...(providers === undefined ? {} : {
          providers: providers.slice(0, Math.max(args.limit, 50)),
          ...(providers.length <= Math.max(args.limit, 50)
            ? {}
            : { omittedProviders: providers.length - Math.max(args.limit, 50) }),
        }),
        needs: needs.slice(0, Math.max(args.limit, 50)),
        ...(needs.length <= Math.max(args.limit, 50) ? {} : { omittedNeeds: needs.length - Math.max(args.limit, 50) }),
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
    if ((preflight !== undefined && !preflight.ok) || unresolvedRequestCount > 0
      || unsupportedRequestCount > 0 || requestIssueCount > 0) io.setExitCode?.(1);
  } finally {
    await planResults?.close();
  }
}
