import { realpath } from "node:fs/promises";

import type { BuildResultHistory, ResultOutputExporter } from "@hypit/result";
import type { TypeRef } from "@hypit/protocol";

import type { CliCommand, ProjectResultCommand } from "../command.js";
import { exportBuildResultOutput } from "../result-export.js";
import { browseBuildOutputHistory } from "../result-query.js";
import {
  buildCreatedAtIso,
  buildResultView,
  cliTypeName,
  outputView,
  projectPath,
} from "../view.js";
import type { OperationalWriter } from "./types.js";
import { commandHint } from "../command-hint.js";

export function isProjectResultCommand(args: CliCommand): args is ProjectResultCommand {
  return args.command === "builds" || args.command === "history" || args.command === "inspect"
    || (args.command === "result" && args.action === "export");
}

/** Resolve only an existing Source; history never reconstructs a deleted address. */
async function historySourcePath(path: string): Promise<string> {
  return await realpath(path);
}

/** Execute commands that need only project-owned Result history, never a Runtime. */
export async function runProjectResultCommand(input: {
  readonly args: ProjectResultCommand;
  readonly projectRoot: string;
  readonly repository: BuildResultHistory;
  readonly resolveOutputExporter?: (type: TypeRef) => Promise<ResultOutputExporter | undefined>;
  readonly write: OperationalWriter;
}): Promise<void> {
  const { args, projectRoot, repository, resolveOutputExporter, write } = input;
  if (args.command === "builds") {
    const page = await repository.browse({
      limit: args.limit,
      ...(args.before === undefined ? {} : { before: args.before }),
    });
    const builds = page.results.map((manifest) => ({
      id: manifest.id,
      createdAt: buildCreatedAtIso(manifest.id),
      source: projectPath(manifest.sourcePath, projectRoot),
      outcome: manifest.outcome,
      targetCount: manifest.targets.length,
      ...(args.presentation.verbose ? {
        targets: manifest.targets.slice(0, args.limit),
        ...(manifest.targets.length <= args.limit ? {} : { omittedTargets: manifest.targets.length - args.limit }),
      } : {}),
      outputCount: Object.keys(manifest.outputs).length,
    }));
    write({
      format: "hypit.cli-builds@1",
      builds,
      ...(page.next === undefined ? {} : { next: page.next }),
    }, "Build results", "info", [["Builds", String(builds.length)]],
    builds.map((item) => {
      const label = item.id;
      return `${label}: ${item.outcome} · ${item.source} · ${new Date(item.createdAt).toLocaleString()} · ${item.targetCount} target${item.targetCount === 1 ? "" : "s"}`;
    }).concat(page.next === undefined ? [] : [
      `Older    Repeat this command with --before ${page.next}, keeping the other options.`,
    ]));
    return;
  }

  if (args.command === "history") {
    const source = args.source === undefined ? undefined : await historySourcePath(args.source);
    const page = await browseBuildOutputHistory(repository, {
      projectRoot,
      output: args.outputName,
      ...(source === undefined ? {} : { source }),
      ...(args.before === undefined ? {} : { before: args.before }),
      limit: args.limit,
    });
    const entries = await Promise.all(page.results.map(async (manifest) => ({
      build: manifest.id,
      source: projectPath(manifest.sourcePath, projectRoot),
      createdAt: buildCreatedAtIso(manifest.id),
      outcome: manifest.outcome,
      output: outputView(manifest, args.outputName),
    })));
    write({
      format: "hypit.cli-history@1",
      output: args.outputName,
      ...(source === undefined ? {} : { source: projectPath(source, projectRoot) }),
      entries,
      ...(page.next === undefined ? {} : { next: page.next }),
    }, entries.length === 0 ? "No matching Output" : "Output history",
    entries.length === 0 ? "warning" : "info", [
      ["Output", args.outputName],
      ...(source === undefined ? [] : [["Source", projectPath(source, projectRoot)] as const]),
      ["Builds", String(entries.length)],
    ], entries.map((item) => {
      const label = item.build;
      return `${label}: ${item.outcome} · ${item.source} · ${new Date(item.createdAt).toLocaleString()}`
        + (args.presentation.verbose ? ` · ${item.output.representation} · ${item.output.type}` : "");
    }).concat(page.next === undefined ? [] : [
      `Older    Repeat this command with --before ${page.next}, keeping the other options.`,
    ]));
    return;
  }

  if (args.command === "inspect") {
    const manifest = await repository.read(args.build);
    if (manifest === undefined) throw new Error(`Build Result ${args.build} does not exist`);
    const build = await buildResultView(manifest, {
      projectRoot,
      ...(args.outputName === undefined ? {} : { output: args.outputName }),
      limit: args.limit,
      verbose: args.presentation.verbose,
    });
    write({ format: "hypit.cli-inspect@1", build }, "Build Result",
      manifest.outcome === "failed" ? "error"
        : manifest.outcome === "cancelled" ? "warning"
          : manifest.outcome === "complete" ? "success" : "info", [
        ["Build", build.id],
        ["Created", new Date(build.createdAt).toLocaleString()],
        ["Outcome", build.outcome],
        ["Source", build.source],
        ...(args.outputName === undefined ? [
          ["Targets", String(build.targetCount)] as const,
          ["Available Outputs", String(build.outputCount)] as const,
        ] : []),
      ], [
        ...(build.failure === undefined ? [] : [`Reason    ${build.failure}`]),
        ...(build.executionLog === undefined ? [] : [`Execution log    ${commandHint(["logs", build.id], { projectRoot })}`]),
        ...(build.operations ?? []).map((operation) =>
          `${operation.endpoint}: ${operation.outcome ?? "accepted"}${operation.receipt === undefined ? "" : ` · task ${operation.receipt.id}`}`
          + (operation.failure === undefined ? "" : ` · ${operation.failure.code}: ${operation.failure.message}`)),
        ...(build.omittedOperations === undefined ? [] : [`${build.omittedOperations} more execution receipts · use --limit <count>`]),
        ...build.outputs.map((item) => `Output    ${item.name}`
          + (!args.presentation.verbose ? "" : ` · ${item.type} · ${item.representation}`
            + `${item.mediaType === undefined ? "" : ` · ${item.mediaType}`}`
            + `${item.size === undefined ? "" : ` · ${item.size} bytes`}`)),
        ...(build.omittedOutputs !== undefined ? [
          `${build.omittedOutputs} more Outputs · use --limit <count> or --output <name>`,
        ] : []),
      ]);
    return;
  }

  const exported = await exportBuildResultOutput(
    repository,
    args.build,
    args.outputName,
    args.destination,
    resolveOutputExporter,
  );
  const machine = {
    format: "hypit.cli-result-export@1" as const,
    build: exported.build,
    output: exported.output,
    type: cliTypeName(exported.type),
    representation: exported.representation,
    path: exported.path,
  };
  const path = projectPath(await realpath(exported.path), projectRoot);
  write(machine, `Exported ${exported.output} → ${path}`, "success",
    args.presentation.verbose ? [
      ["Build", exported.build],
      ["Type", machine.type],
      ["Representation", exported.representation],
      ["Path", exported.path],
    ] : []);
}
