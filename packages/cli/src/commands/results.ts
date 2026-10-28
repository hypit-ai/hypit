import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import type { BuildResultRepository } from "@hypit/result";

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
    || args.command === "get" || (args.command === "result" && args.action === "edit");
}

/** History can name a deleted Source. Resolve existing directory links, keeping the absent suffix. */
async function historySourcePath(path: string): Promise<string> {
  let existing = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try { return resolve(await realpath(existing), ...suffix); }
    catch (error) {
      const parent = dirname(existing);
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === existing) throw error;
      suffix.unshift(basename(existing));
      existing = parent;
    }
  }
}

/** Execute commands that need only project-owned Result history, never a Runtime. */
export async function runProjectResultCommand(input: {
  readonly args: ProjectResultCommand;
  readonly projectRoot: string;
  readonly repository: BuildResultRepository;
  readonly write: OperationalWriter;
}): Promise<void> {
  const { args, projectRoot, repository, write } = input;
  if (args.command === "builds") {
    const page = await repository.browse({
      limit: args.limit,
      ...(args.before === undefined ? {} : { before: args.before }),
    });
    const builds = page.results.map((manifest) => ({
      id: manifest.id,
      createdAt: buildCreatedAtIso(manifest.id),
      ...(manifest.title === undefined ? {} : { title: manifest.title }),
      outcome: manifest.outcome,
      ...(manifest.invocationSourceId === undefined
        ? {}
        : { invocationSource: projectPath(manifest.invocationSourceId, projectRoot) }),
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
      const label = item.title === undefined ? item.id : `${item.title} · ${item.id}`;
      const invocation = item.invocationSource === undefined ? "" : ` · ${item.invocationSource}`;
      return `${label}: ${item.outcome} · ${new Date(item.createdAt).toLocaleString()}${invocation} · ${item.targetCount} target${item.targetCount === 1 ? "" : "s"}`;
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
      ...(manifest.title === undefined ? {} : { title: manifest.title }),
      createdAt: buildCreatedAtIso(manifest.id),
      outcome: manifest.outcome,
      output: await outputView(repository, manifest, args.outputName),
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
      const label = item.title === undefined ? item.build : `${item.title} · ${item.build}`;
      return `${label}: ${item.outcome} · ${new Date(item.createdAt).toLocaleString()}`
        + (args.presentation.verbose ? ` · ${item.output.representation} · ${item.output.type}` : "");
    }).concat(page.next === undefined ? [] : [
      `Older    Repeat this command with --before ${page.next}, keeping the other options.`,
    ]));
    return;
  }

  if (args.command === "inspect") {
    const manifest = await repository.read(args.build);
    if (manifest === undefined) throw new Error(`Build Result ${args.build} does not exist`);
    const build = await buildResultView(repository, manifest, {
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
        ...(build.title === undefined ? [] : [["Title", build.title] as const]),
        ["Outcome", build.outcome],
        ...(args.outputName === undefined ? [
          ["Targets", String(build.targetCount)] as const,
          ["Available Outputs", String(build.outputCount)] as const,
        ] : []),
      ], [
        ...(build.failure === undefined ? [] : [`Reason    ${build.failure}`]),
        ...(build.executionLog === undefined ? [] : [`Execution log    ${commandHint(["logs", build.id], { projectRoot })}`]),
        ...(build.operations ?? []).map((operation) =>
          `${operation.endpoint}: ${operation.status}${operation.receipt === undefined ? "" : ` · task ${operation.receipt.id}`}`
          + (operation.failure === undefined ? "" : ` · ${operation.failure.code}: ${operation.failure.message}`)),
        ...(build.omittedOperations === undefined ? [] : [`${build.omittedOperations} more execution receipts · use --limit <count>`]),
        ...(build.note === undefined ? [] : [`Note      ${build.note}`]),
        ...build.outputs.map((item) => `${item.highlighted ? "★" : item.target ? "Target" : "Output"}    ${item.name}`
          + (!args.presentation.verbose ? "" : ` · ${item.type} · ${item.representation}`
            + `${item.mediaType === undefined ? "" : ` · ${item.mediaType}`}`
            + `${item.size === undefined ? "" : ` · ${item.size} bytes`}`)),
        ...(args.outputName === undefined && (build.otherOutputCount ?? 0) > 0 ? [
          `${build.otherOutputCount} other Outputs · use --verbose or --output <name>`,
        ] : []),
        ...(build.omittedOutputs !== undefined ? [
          `${build.omittedOutputs} more Outputs · use --limit <count> or --output <name>`,
        ] : []),
      ]);
    return;
  }

  if (args.command === "result") {
    const manifest = await repository.updatePresentation(args.build, {
      ...(args.clearTitle ? { title: null } : args.title === undefined ? {} : { title: args.title }),
      ...(args.clearNote ? { note: null } : args.note === undefined ? {} : { note: args.note }),
      ...(args.clearHighlights
        ? { highlightedOutputs: [] }
        : args.highlightedOutputs.length === 0 ? {} : { highlightedOutputs: args.highlightedOutputs }),
    });
    const presentation = {
      format: "hypit.cli-result-edit@1" as const,
      build: manifest.id,
      title: manifest.title ?? null,
      note: manifest.note ?? null,
      highlightedOutputCount: manifest.highlightedOutputs?.length ?? 0,
      highlightedOutputs: manifest.highlightedOutputs?.slice(0, args.limit) ?? [],
      ...((manifest.highlightedOutputs?.length ?? 0) <= args.limit
        ? {}
        : { omittedHighlightedOutputs: manifest.highlightedOutputs!.length - args.limit }),
    };
    write(presentation, "Build Result updated", "success", [
      ["Build", manifest.id],
      ["Title", manifest.title ?? "—"],
      ["Highlighted", String(manifest.highlightedOutputs?.length ?? 0)],
    ], manifest.note === undefined ? [] : [`Note    ${manifest.note}`]);
    return;
  }

  const exported = await exportBuildResultOutput(repository, args.build, args.outputName, args.destination);
  const machine = {
    format: "hypit.cli-get@1" as const,
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
