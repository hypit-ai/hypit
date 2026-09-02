import type { BuildResultManifest, BuildResultRepository } from "@hypit/build-result";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";

import type { ParsedArgs } from "../arguments.js";
import { buildObservationKey } from "../observation.js";
import type { CliIo } from "../output.js";
import type { CliRuntimeController } from "../runtime-port.js";
import { formatOperationProgress, queueLaneLines, summarizeQueueLanes } from "../runtime-view.js";
import { buildStatusView } from "../view.js";
import type { OperationalWriter } from "./types.js";

type OpenProjectResults = () => Promise<{
  readonly repository: BuildResultRepository;
  close(): void | Promise<void>;
}>;

export function isExecutionCommand(args: ParsedArgs): boolean {
  return args.command === "status" || args.command === "cancel" || args.command === "activity"
    || (args.command === "result" && (args.action === "finish" || args.action === "discard"));
}

/** Inspect or control accepted Build work. Observation never owns execution. */
export async function runExecutionCommand(input: {
  readonly args: ParsedArgs;
  readonly io: CliIo;
  readonly runtimeHost: (profile: string) => Promise<NodeRuntimeHost>;
  readonly runtimeController: (profile: string) => Promise<CliRuntimeController>;
  readonly openProjectResults: OpenProjectResults;
  readonly write: OperationalWriter;
}): Promise<void> {
  const { args, io, runtimeHost, runtimeController, openProjectResults, write } = input;
  if (args.command === "status" && args.runtime === undefined) {
    const openedResults = await openProjectResults();
    let result;
    try {
      result = await openedResults.repository.read(args.file!);
    } finally {
      await openedResults.close();
    }
    if (args.watch && result?.outcome === undefined) {
      throw new Error(`Build ${args.file} has no finished Result; select its Runtime to observe active execution`);
    }
    const finished = result?.outcome !== undefined;
    const build = result === undefined ? null : buildStatusView({ id: result.id, result });
    write({ format: "hypit.cli-status@3", build }, result === undefined
      ? "Build Result not found"
      : finished ? "Build Result is finished" : "Build Result is unfinished",
    result === undefined || !finished ? "warning" : "info", [
      ["Build", args.file!],
      ["Work", build?.work.state ?? "unknown"],
      ...(build?.work.outcome === undefined ? [] : [["Decision", build.work.outcome] as const]),
      ["Result", build?.result.state ?? "missing"],
      ...(build?.result.outputCount === undefined ? [] : [["Outputs", String(build.result.outputCount)] as const]),
    ], result === undefined ? [] : [
      "Result and Runtime are independent facts; select the Runtime to inspect active execution.",
    ]);
    if (result === undefined || !finished) io.setExitCode?.(1);
    return;
  }

  if (args.runtime === undefined) {
    throw new Error(`${args.command} requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>`);
  }
  const selectedHost = await runtimeHost(args.runtime);

  if (args.command === "result" && args.action === "discard") {
    const resultControl = await selectedHost.openResultControl();
    const discarded = await resultControl.discardSubmission(args.file!)
      .finally(async () => await resultControl.close());
    write({ format: "hypit.cli-result-discard@2", build: args.file!, discarded }, discarded
      ? "Incomplete Build discarded"
      : "Incomplete Build not found", discarded ? "success" : "warning", [
        ["Build", args.file!],
        ["State", discarded ? "discarded" : "missing"],
      ], discarded ? ["The incomplete submission was removed."] : []);
    if (!discarded) io.setExitCode?.(1);
    return;
  }

  const runtime = await selectedHost.openControl({ readOnly: args.command !== "cancel" });
  try {
    if (args.command === "activity") {
      const controller = await runtimeController(args.runtime);
      let previous: string | undefined;
      const writeActivity = async (): Promise<void> => {
        const [activity, worker] = await Promise.all([
          runtime.activity(),
          controller.worker.status(),
        ]);
        const builds = activity.builds.slice(0, args.limit).map((item) => {
          const status = buildStatusView({ id: item.id, runtime: item });
          return {
            id: item.id,
            work: status.work,
            ...(item.outcome === undefined ? {} : { outcome: item.outcome }),
            ...(status.attention === undefined ? {} : { attention: status.attention }),
          };
        });
        const lanes = args.verbose ? summarizeQueueLanes(activity.capacity).slice(0, args.limit) : undefined;
        const currentView = JSON.stringify({
          worker: worker.state,
          builds,
          activeRequests: activity.capacity.length,
          ...(lanes === undefined ? {} : { lanes }),
        });
        if (args.watch && currentView === previous) return;
        previous = currentView;
        const value = {
          format: "hypit.cli-activity@2" as const,
          at: Date.now(),
          worker: worker.state,
          builds,
          ...(activity.builds.length <= args.limit ? {} : { omittedBuilds: activity.builds.length - args.limit }),
          activeRequests: activity.capacity.length,
          ...(lanes === undefined ? {} : { lanes }),
        };
        const buildLines = activity.builds.slice(0, args.limit).map((item) =>
          `${item.id}: ${buildStatusView({ id: item.id, runtime: item }).work.state}`
            + `${item.cancellationRequested ? " · cancelling" : ""}`
            + `${item.issue === undefined ? "" : ` · ${item.issue.message}`}`);
        const activeOperations = activity.builds.flatMap((item) => item.operations)
          .filter((item) => item.status === "pending");
        const operationLines = args.verbose
          ? activity.builds.flatMap((build) => build.operations.filter((item) => item.status === "pending")
              .map((item) => `${build.id} · ${item.endpoint}: ${item.progress === undefined
                ? item.status
                : formatOperationProgress(item.progress)}`)).slice(0, args.limit)
          : [];
        write(value, "Runtime activity", activity.builds.length === 0 ? "success" : "info", [
          ["Active Builds", String(activity.builds.length)],
          ["Active Operations", String(activeOperations.length)],
          ["Worker", worker.state],
        ], [
          ...buildLines,
          ...(operationLines.length === 0 ? [] : ["Operations:", ...operationLines]),
          ...(args.verbose ? queueLaneLines(lanes ?? []) : []),
        ]);
      };
      if (!args.watch) await writeActivity();
      else while (true) {
        await writeActivity();
        await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
      }
      return;
    }

    if (args.command === "status") {
      let view = await runtime.inspect(args.file!);
      let result: BuildResultManifest | undefined;
      let resultReadError: string | undefined;
      let openedResults: Awaited<ReturnType<OpenProjectResults>> | undefined;
      try {
        openedResults = await openProjectResults();
        if (args.watch && view !== undefined && view.issue === undefined) {
          const startedAt = Date.now();
          let delayMs = 100;
          let previous: string | undefined;
          const controller = await runtimeController(args.runtime);
          while (view !== undefined && view.issue === undefined) {
            const encoded = buildObservationKey(view);
            if (encoded !== previous && !args.json) {
              previous = encoded;
              io.write(`  · ${view.id}: ${view.activity}`
                + `${view.operations.length === 0 ? "" : ` · ${view.operations.length} operation(s)`}\n`);
              delayMs = 100;
            } else {
              delayMs = Math.min(1_000, delayMs * 2);
            }
            const remaining = args.maxWaitMs === undefined
              ? undefined
              : args.maxWaitMs - (Date.now() - startedAt);
            if (remaining !== undefined && remaining <= 0) break;
            const worker = await controller.worker.status();
            if (worker.state !== "running") break;
            await new Promise((resolveWait) => setTimeout(resolveWait,
              remaining === undefined ? delayMs : Math.min(delayMs, remaining)));
            view = await runtime.inspect(args.file!);
          }
        }
        result = await openedResults.repository.read(args.file!);
      } catch (error) {
        resultReadError = error instanceof Error ? error.message : String(error);
      } finally {
        await openedResults?.close();
      }
      const found = view !== undefined || result !== undefined;
      const activity = view?.activity;
      const outcome = result?.outcome ?? view?.outcome;
      const issue = view?.issue;
      const build = !found ? null : buildStatusView({
        id: view?.id ?? result!.id,
        ...(view === undefined ? {} : { runtime: view }),
        ...(result === undefined ? {} : { result }),
        ...(resultReadError === undefined ? {} : { resultReadError }),
        verbose: args.verbose,
        operationLimit: args.limit,
      });
      write({ format: "hypit.cli-status@3", build }, !found
        ? "Build not found"
        : issue !== undefined
          ? "Build needs attention"
          : args.watch
            ? activity === undefined ? "Build finished" : "Build still active"
            : "Build status",
      !found
        ? "warning"
        : issue !== undefined || resultReadError !== undefined
          ? "error"
          : outcome === "failed"
            ? "error"
            : args.watch && activity !== undefined ? "warning" : "info", [
          ["Build", args.file!],
          ...(build?.title === undefined ? [] : [["Title", build.title] as const]),
          ["Work", build?.work.state ?? "unknown"],
          ...(build?.work.outcome === undefined ? [] : [["Decision", build.work.outcome] as const]),
          ["Result", build?.result.state ?? "missing"],
          ...(build?.result.outputCount === undefined ? [] : [["Outputs", String(build.result.outputCount)] as const]),
        ], (build?.operations ?? []).map((operation) => operation.failure !== undefined
          ? `${operation.endpoint}: ${operation.failure.code} — ${operation.failure.message}`
          : operation.progress === undefined
            ? `${operation.endpoint}: ${operation.state}`
            : `${operation.endpoint}: ${formatOperationProgress(operation.progress)}`)
          .concat(build?.attention === undefined ? [] : [
            `Attention  ${build.attention.message}`,
            ...(build.attention.action === undefined ? [] : [`Action     ${build.attention.action}`]),
          ]));
      if (!found || issue !== undefined || resultReadError !== undefined || outcome === "failed") io.setExitCode?.(1);
      return;
    }

    if (args.command === "result") {
      const before = await runtime.inspect(args.file!);
      if (before !== undefined && before.activity !== "saving-result") {
        throw new Error(`Build ${args.file} is still ${before.activity}; there is no Result write to finish`);
      }
      if (before !== undefined && before.issue === undefined) {
        const worker = await (await selectedHost.controller()).worker.status();
        if (worker.state === "running") {
          throw new Error(`Build ${args.file} Result is currently being written by the Runtime Worker`);
        }
      }
      const resultControl = await selectedHost.openResultControl();
      const finished = await resultControl.finishResult(args.file!)
        .finally(async () => await resultControl.close());
      if (finished === undefined) {
        const openedResults = await openProjectResults();
        const existing = await openedResults.repository.read(args.file!)
          .finally(async () => await openedResults.close());
        if (existing?.outcome === undefined) {
          write({ format: "hypit.cli-result-finish@2", build: args.file!, found: false },
            "Result cannot be finished", "warning", [["Build", args.file!]],
            ["No decided Result write exists for this Build."]);
          io.setExitCode?.(1);
          return;
        }
        write({ format: "hypit.cli-result-finish@2", build: args.file!, outcome: existing.outcome },
          "Result already finished", "info", [["Build", args.file!], ["Outcome", existing.outcome]]);
        return;
      }
      write({
        format: "hypit.cli-result-finish@2",
        build: args.file!,
        outcome: finished.outcome,
        ...(finished.issue === undefined ? {} : { attention: {
          message: finished.issue.message,
          action: `hypit result finish ${args.file}`,
        } }),
      }, finished.issue === undefined ? "Result finished" : "Result still needs attention",
      finished.issue === undefined ? "success" : "error", [
        ["Build", args.file!],
        ["Outcome", finished.outcome],
      ], finished.issue === undefined ? [] : [`Attention  ${finished.issue.message}`]);
      if (finished.issue !== undefined) io.setExitCode?.(1);
      return;
    }

    const active = await runtime.cancel(args.file!, args.reason);
    const openedResults = active === undefined ? await openProjectResults() : undefined;
    const finished = openedResults === undefined
      ? undefined
      : await openedResults.repository.read(args.file!).finally(async () => await openedResults.close());
    const build = active === undefined && finished === undefined ? null : buildStatusView({
      id: args.file!,
      ...(active === undefined ? {} : { runtime: active }),
      ...(finished === undefined ? {} : { result: finished }),
    });
    const machine = {
      format: "hypit.cli-cancel@3" as const,
      requested: active?.cancellationRequested === true,
      build,
    };
    const title = active === undefined && finished === undefined
      ? "Build not found"
      : active === undefined ? "Build already finished" : "Build cancellation requested";
    write(machine, title,
      active === undefined && finished === undefined ? "warning" : active === undefined ? "info" : "success", [
        ["Build", args.file!], ...(build === null ? [] : [["Work", build.work.state] as const]),
      ], active === undefined && finished?.outcome !== undefined
        ? [`No running work was changed; this Build is already ${finished.outcome}.`]
        : []);
    if (active === undefined && finished === undefined) io.setExitCode?.(1);
  } finally {
    await runtime.close();
  }
}
