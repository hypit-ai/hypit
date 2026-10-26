import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { isBlobRef, moduleKey, orderedBuildId } from "@hypit/protocol";
import { buildResultOutput } from "@hypit/result";

import { checkRunFile, collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";
import type { CliApplicationContext } from "./application.js";
import type { CliRuntime, CliRuntimeHost, CliRuntimeInspection } from "./runtime-port.js";
import { createPlanOutput, createPricingOutput, writeCliHelp, writeCliOutput } from "./output.js";
import type { CliIo } from "./output.js";
import type { OperationalMachineView } from "./machine-view.js";
import { parseCommand } from "./arguments.js";
import type { CliCommand, RuntimeOption } from "./command.js";
import { commandHint } from "./command-hint.js";
import { assertPlannedRequests, assertPreflight, createCatalogDescriptor, describePlanEndpoints, describePlanNeeds, describePlanPricing, evaluatePlanNeeds, plannedEndpointQueries, preflightPlan } from "./build-planning.js";
import { buildProgressLines, observeBuild } from "./observation.js";
import { isProjectResultCommand, runProjectResultCommand } from "./commands/results.js";
import { isEnvironmentCommand, runEnvironmentCommand } from "./commands/environment.js";
import { isExecutionCommand, runExecutionCommand } from "./commands/execution.js";
import { inlineValuePreview } from "./runtime-view.js";
import { resolveProjectRoot } from "@hypit/project";
import { loadDiscoveredSourcePackages } from "./source-packages.js";
import {
  buildStatusView,
  cliTypeName,
  projectPath,
} from "./view.js";

function createPublicBuildId(now = Date.now()): string {
  return orderedBuildId(now, randomBytes(5).toString("hex").toUpperCase());
}

function commandProjectRootOption(command: CliCommand): string | undefined {
  return "projectRoot" in command ? command.projectRoot : undefined;
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
  ): void => writeCliOutput(io, {
    ...args.presentation,
  }, { kind: "operational", machine, title, status, facts, lines });
  const runtimeHosts = new Map<string, Promise<CliRuntimeHost>>();
  const runtimeHost = async (path: string, requestedPackageRoot?: string): Promise<CliRuntimeHost> => {
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
  let runtimeProfile = acceptsRuntimeContext(args) ? args.runtimeProfile : undefined;
  let runtimeFromProject = false;
  if (acceptsRuntimeContext(args) && runtimeProfile === undefined && args.command !== "logs") {
    const selected = await distribution.resolveProjectRuntime?.(await commandProjectRoot());
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
      io,
      projectRoot: await commandProjectRoot(),
      diagnoseProjectResults: async () => {
        const projectRoot = await commandProjectRoot();
        return await distribution.diagnoseProjectResults(projectRoot, {
          packageRoot: await packageRootForProject(projectRoot),
          ...(distribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: distribution.packageRoot }),
        });
      },
      runtimeHost,
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
      projectRoot: await commandProjectRoot(),
      runtimeProfile,
      io,
      runtimeHost,
      openProjectResults: projectResults,
      resolveProjectRuntime: async () => (await distribution.resolveProjectRuntime?.(await commandProjectRoot()))?.profile,
      write: writeOperational,
    });
    return;
  }
  const effectiveWorkspaceRoot = await commandProjectRoot();
  const projectResultsRoot = effectiveWorkspaceRoot;
  const sourcePackageRoot = args.packageRoot ?? effectiveWorkspaceRoot;
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
  const workspace = await compiler.openEntry(args.source);
  const selectedFrontend = workspace.entry.frontend;
  const runMode = runFrontends.some((frontend) => frontend.id === selectedFrontend);
  const authorMode = compiler.supportsFrontend(selectedFrontend);
  if (runMode === authorMode) {
    const message = runMode
      ? `Frontend ${selectedFrontend} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${selectedFrontend}`;
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
          format: "hypit.cli-check@1" as const,
          sourceKind: "run" as const,
          ok: true,
          run: projectPath(loaded.source, effectiveWorkspaceRoot),
          author: projectPath(loaded.authorSource, effectiveWorkspaceRoot),
          frontend: selectedFrontend,
          targetCount: loaded.document.targets.length,
          targets: loaded.document.targets,
          candidates: loaded.document.candidates.length,
          satisfactions: loaded.document.satisfactions.length,
          historicalOutputCount: loaded.unresolvedHistoricalOutputs.length,
          ...(args.presentation.verbose ? { unresolvedHistoricalOutputs: loaded.unresolvedHistoricalOutputs.slice(0, args.limit).map((item) => ({
            candidate: item.id,
            build: item.build,
            output: item.output,
          })),
          ...(loaded.unresolvedHistoricalOutputs.length <= args.limit ? {} : {
            omittedHistoricalOutputs: loaded.unresolvedHistoricalOutputs.length - args.limit,
          }) } : {}),
        } as const;
        writeCliOutput(io, args.presentation, {
          kind: "check-run",
          machine,
        });
        return;
    }
    {
      const result = await compiler.compileResolvedSource(workspace.entry, workspace);
      const authorFacing = result.exports.filter((item) =>
        !item.name.includes(".__") && !/\.binding-\d+$/u.test(item.name) && !item.name.endsWith(".bindings"));
      const outputs = authorFacing.filter((item) => item.ref.kind === "logical-output");
      const values = authorFacing.filter((item) => item.ref.kind !== "logical-output");
      const modules = result.program.closure.modules.map(moduleKey);
      const machine = {
        format: "hypit.cli-check@1" as const,
        sourceKind: "author" as const,
        ok: true,
        source: projectPath(workspace.entry.unit.name, effectiveWorkspaceRoot),
        frontend: selectedFrontend,
        units: result.closure.units.length,
        assets: result.attachments.length,
        modules: modules.length,
        outputCount: outputs.length,
        ...(args.presentation.verbose ? {
          outputs: outputs.slice(0, args.limit).map((item) => ({ name: item.name, type: cliTypeName(item.type) })),
          ...(outputs.length <= args.limit ? {} : { omittedOutputs: outputs.length - args.limit }),
          details: {
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
    const commandScope = { projectRoot: projectResultsRoot, runtimeProfile: resolve(runtimeProfile) };
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
        return loadedRun.compiler.prepareCompilation(loadedRun);
      } catch (error) {
        await buildResults.close();
        throw error;
      }
    })();
    const runSelections = result.selections.filter((selection) =>
      loadedRun.run.satisfactionNames[selection.output] !== undefined);
    let runtime: CliRuntime | undefined;
    let inspection: CliRuntimeInspection | undefined;
    try {
      const catalog = createCatalogDescriptor({
        source: loadedRun.authorSource,
        publication: result.publication,
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
          executionPackages: loadedPackageSet
            .filter((item) => (item.contribution.facets?.some((facet) =>
              facet.abi === "hypit.producer-package@1" || facet.abi === "hypit.refinement-package@1") ?? false))
            .map((item) => item.specifier),
        }),
        catalog,
        attachments: result.compilation.attachments,
        result: {
          repository: buildResults.location,
          ...(args.title === undefined ? {} : { title: args.title }),
          resourceReferences: loadedRun.resultResourceReferences,
        },
      } as const;
      const host = await runtimeHost(runtimeProfile, sourcePackageRoot);
      const evaluated = await evaluatePlanNeeds(result.definition, packageContributions);
      inspection = await host.openInspection(plannedEndpointQueries(evaluated.state, evaluated));
      const buildInspection = inspection;
      const endpoints = await describePlanEndpoints(buildInspection, evaluated.state, evaluated);
      assertPlannedRequests(evaluated.state, evaluated, endpoints);
      const preflight = await preflightPlan(buildInspection, evaluated.state, endpoints);
      // Build is an execution boundary, not a provisioning command. The cheap
      // preflight must already be clean; `runtime up` is the explicit place for
      // installing or starting declared programs.
      assertPreflight(preflight);
      try {
        await buildInspection.ensureExecution({
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Runtime Worker could not start; no Build was queued: ${detail}`);
      }
      runtime = await buildInspection.createRuntime();
      let built = await runtime.build(request);
      const requestCount = result.definition.plan.steps.reduce(
        (total, step) => total + (step.result.kind === "need" ? 1 : 0),
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
        const acceptedView = buildStatusView({ id: built.id, runtime: built.view, commandScope });
        const targets = built.view.targets.slice(0, args.limit);
        writeOperational({
          format: "hypit.cli-build@1",
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
          executionStatus: async () => await buildInspection.executionStatus(),
          commandScope,
          readResult: async () => await buildResults.repository.read(built.id),
          onProgress: (progress) => {
            const report = io.writeProgress ?? (args.presentation.json ? undefined : io.write);
            for (const line of buildProgressLines(progress, {
              verbose: args.presentation.verbose,
              limit: args.limit,
            })) report?.(`${line}\n`);
          },
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
      const presentation = catalog.publication;
      const targetNames = new Set(finishedResult?.targets ?? []);
      const targetPublishedOutputs = presentation.outputs.filter((published) => finishedResult === undefined
        ? published.target
        : targetNames.has(published.name));
      const targetPresentations = targetPublishedOutputs.flatMap((published) => {
        const currentRecord = published.source.kind === "current-record" ? published.source.record : undefined;
        const record = currentRecord === undefined
          ? undefined
          : built.state.records.find((item) => item.id === currentRecord);
        if (record === undefined) return [];
        return [{
          published,
          record,
          ...(!isBlobRef(record.value)
            ? { inline: inlineValuePreview(record.value) }
            : {}),
        }];
      });
      const buildView = buildStatusView({
        id: built.id,
        commandScope,
        ...(activeView === undefined ? {} : { runtime: activeView }),
        ...(finishedResult === undefined ? {} : { result: finishedResult }),
        verbose: args.presentation.verbose,
      });
      const machine = {
        format: "hypit.cli-build@1" as const,
        build: args.title === undefined || buildView.title !== undefined
          ? buildView
          : { ...buildView, title: args.title },
      };
      const resultScope = { projectRoot: projectResultsRoot };
      const resultTargets = finishedResult?.targets.flatMap((name) => {
        const output = buildResultOutput(finishedResult, name);
        return output === undefined ? [] : [{ name, output }];
      }) ?? [];
      const finishedLines = resultTargets.length === 0 && targetPresentations.length === 0
        ? [
            ...(completionReason === undefined ? [] : [`Reason   ${completionReason}`]),
            `Inspect  ${commandHint(["inspect", built.id], resultScope)}`,
          ]
        : [
            ...(completionReason === undefined ? [] : [`Reason   ${completionReason}`]),
            `Inspect  ${commandHint(["inspect", built.id], resultScope)}`,
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
                `Export   ${commandHint(["get", built.id, "--output", item.name], resultScope)} --to <path>`),
            ...(resultTargets.length > 0 ? [] : targetPresentations
              .filter((item) => item.inline !== undefined)
              .slice(0, args.limit)
              .map((item) => `Result   ${item.published.name} = ${item.inline}`)),
          ];
      const humanTitle = issue !== undefined
        ? "Build needs attention"
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
            [issue.scope === "cleanup" ? "Cleanup" : "Result", "needs attention"] as const,
          ]),
        ], finished ? finishedLines : issue !== undefined ? [
          `Attention  ${issue.scope}: ${issue.message}`,
          `Finish   ${commandHint(["result", "finish", built.id], commandScope)}`,
        ] : [
          `Watch    ${commandHint(["status", built.id, "--watch"], commandScope)}`,
          `Cancel   ${commandHint(["cancel", built.id], commandScope)}`,
        ]);
      if (buildOutcome === "failed" || issue !== undefined) io.setExitCode?.(1);
    } finally {
      await runtime?.close();
      await inspection?.close();
      await buildResults.close();
    }
    return;
  }
  let planResults: Awaited<ReturnType<typeof projectResults>> | undefined;
  let planInspection: CliRuntimeInspection | undefined;
  try {
    planResults = await projectResults(projectResultsRoot);
    const loaded = await loadRunFile({
      workspace,
      authorCompiler: compiler,
      frontends: runFrontends,
      packageContributions,
      results: planResults.repository,
    });
    const result = loaded.compiler.prepareCompilation(loaded);
    const planHost = runtimeProfile === undefined ? undefined : await runtimeHost(runtimeProfile);
    const evaluated = await evaluatePlanNeeds(result.definition, packageContributions);
    planInspection = planHost === undefined
      ? undefined
      : await planHost.openInspection(plannedEndpointQueries(evaluated.state, evaluated));
    if (args.command === "pricing") {
      if (planInspection === undefined) {
        throw new Error("pricing requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
      }
      const pricing = await describePlanPricing(planInspection, evaluated.state, evaluated);
      const needs = describePlanNeeds(evaluated.state, evaluated, pricing);
      writeCliOutput(io, args.presentation, {
        kind: "pricing",
        ...(args.limit === undefined ? {} : { limit: args.limit }),
        machine: createPricingOutput(
          projectPath(loaded.path, effectiveWorkspaceRoot), pricing, needs, args.presentation.verbose,
          evaluated.producerFailures,
        ),
      });
      if (evaluated.producerFailures.length > 0) io.setExitCode?.(1);
      return;
    }
    const endpoints = planInspection === undefined ? undefined : await describePlanEndpoints(planInspection, evaluated.state, evaluated);
    const preflight = planInspection === undefined ? undefined : await preflightPlan(planInspection, evaluated.state, endpoints ?? []);
    const needs = describePlanNeeds(evaluated.state, evaluated, endpoints ?? []);
    const outputNames = Object.fromEntries(result.compilation.author.exports.flatMap((item) =>
      item.ref.kind === "logical-output" ? [[item.ref.id, item.name]] : []));
    const allChoices = result.selections.flatMap((selection) => {
      const output = outputNames[selection.output];
      const candidate = loaded.run.satisfactionNames[selection.output];
      return output === undefined || candidate === undefined ? [] : [{ output, candidate }];
    });
    const targets = loaded.run.document.targets;
    const unsupportedRequestCount = endpoints?.filter((item) => item.support === "unsupported").length ?? 0;
    const unresolvedRequestCount = endpoints?.filter((item) => item.status === "unresolved" || item.status === "ambiguous").length ?? 0;
    const localRequestCount = endpoints?.filter((item) => item.status === "resolved" && item.pricing?.kind === "local").length ?? 0;
    const providerRequestCount = endpoints?.filter((item) => item.status === "resolved" && item.pricing?.kind !== "local").length;
    const requestIssueCount = needs.filter((item) => item.issue !== undefined).length;
    const producerFailures = evaluated.producerFailures;
    const producerFailureCount = producerFailures.length;
    writeCliOutput(io, args.presentation, {
      kind: "plan",
      machine: createPlanOutput({
        format: "hypit.cli-plan@1",
        ok: (preflight?.ok ?? true) && unresolvedRequestCount === 0
          && unsupportedRequestCount === 0 && requestIssueCount === 0
          && producerFailureCount === 0,
        run: projectPath(loaded.path, effectiveWorkspaceRoot),
        targetCount: targets.length,
        targets,
        steps: result.definition.plan.steps.length,
        requestCount: needs.length,
        requestIssueCount,
        producerFailureCount,
        producerFailures,
        ...(providerRequestCount === undefined ? {} : { providerRequestCount }),
        ...(endpoints === undefined ? {} : { localRequestCount, unresolvedRequestCount, unsupportedRequestCount }),
        choiceCount: allChoices.length,
        choices: allChoices,
        ...(endpoints === undefined ? {} : { endpoints }),
        needs,
        ...(preflight === undefined ? {} : { preflight: {
          ok: preflight.ok,
          capabilityCount: preflight.capabilities.length,
          capabilities: preflight.capabilities,
          diagnosticCount: preflight.diagnostics.length,
          diagnostics: preflight.diagnostics,
        } }),
      }, { verbose: args.presentation.verbose, limit: args.limit }),
    });
    if ((preflight !== undefined && !preflight.ok) || unresolvedRequestCount > 0
      || unsupportedRequestCount > 0 || requestIssueCount > 0
      || producerFailureCount > 0) io.setExitCode?.(1);
  } finally {
    await planInspection?.close();
    await planResults?.close();
  }
}
