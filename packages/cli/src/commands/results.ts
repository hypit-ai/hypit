import { resolve } from "node:path";

import type { BuildResultRepository } from "@hypit/build-result";

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

export function isProjectResultCommand(args: CliCommand): args is ProjectResultCommand {
  return args.command === "builds" || args.command === "history" || args.command === "inspect"
    || args.command === "get" || (args.command === "result" && args.action === "edit");
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
      ...(manifest.run === undefined ? {} : { run: projectPath(manifest.run.path, projectRoot) }),
      targetCount: manifest.targets.length,
      ...(args.presentation.verbose ? {
        targets: manifest.targets.slice(0, args.limit),
        ...(manifest.targets.length <= args.limit ? {} : { omittedTargets: manifest.targets.length - args.limit }),
      } : {}),
      outputCount: Object.keys(manifest.outputs).length,
    }));
    write({
      format: "hypit.cli-builds@3",
      builds,
      ...(page.next === undefined ? {} : { next: page.next }),
    }, "Build results", "info", [["Builds", String(builds.length)]],
    builds.map((item) => {
      const label = item.title === undefined ? item.id : `${item.title} · ${item.id}`;
      const run = item.run === undefined ? "" : ` · ${item.run}`;
      return `${label}: ${item.outcome} · ${new Date(item.createdAt).toLocaleString()}${run} · ${item.targetCount} target${item.targetCount === 1 ? "" : "s"}`;
    }).concat(page.next === undefined ? [] : [`Older    hypit builds --before ${page.next}`]));
    return;
  }

  if (args.command === "history") {
    const source = args.source === undefined ? undefined : resolve(args.source);
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
      format: "hypit.cli-history@4",
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
        + (args.presentation.verbose ? ` · ${item.output.kind} · ${item.output.type}` : "");
    }).concat(page.next === undefined ? [] : [`Older    hypit history ${args.outputName} --before ${page.next}`]));
    return;
  }

  if (args.command === "inspect") {
    const manifest = await repository.read(args.build);
    if (manifest === undefined) throw new Error(`Build Result ${args.build} does not exist`);
    const build = await buildResultView(repository, manifest, {
      projectRoot,
      ...(args.outputName === undefined ? {} : { output: args.outputName }),
      limit: args.limit,
    });
    const focusedOutputs = args.outputName === undefined
      ? build.outputs.filter((item) => item.target || item.highlighted)
      : build.outputs;
    const visibleOutputs = args.presentation.verbose ? build.outputs : focusedOutputs;
    const outputCount = build.outputs.length + (build.omittedOutputs ?? 0);
    const hiddenOutputCount = args.outputName === undefined ? outputCount - focusedOutputs.length : 0;
    write({ format: "hypit.cli-inspect@4", build }, "Build Result",
      manifest.outcome === "failed" ? "error"
        : manifest.outcome === "cancelled" ? "warning"
          : manifest.outcome === "complete" ? "success" : "info", [
        ["Build", build.id],
        ["Created", new Date(build.createdAt).toLocaleString()],
        ...(build.title === undefined ? [] : [["Title", build.title] as const]),
        ["Outcome", build.outcome],
        ...(args.outputName === undefined ? [
          ["Targets", String(build.targetCount)] as const,
          ["Outputs", String(outputCount)] as const,
        ] : []),
      ], [
        ...(build.failure === undefined ? [] : [`Reason    ${build.failure}`]),
        ...(build.note === undefined ? [] : [`Note      ${build.note}`]),
        ...visibleOutputs.map((item) => `${item.highlighted ? "★" : item.target ? "Target" : "Output"}    ${item.name}`
          + (!args.presentation.verbose ? "" : ` · ${item.type} · ${item.kind}`
            + `${item.mediaType === undefined ? "" : ` · ${item.mediaType}`}`
            + `${item.size === undefined ? "" : ` · ${item.size} bytes`}`)),
        ...(!args.presentation.verbose && hiddenOutputCount > 0 ? [
          `${hiddenOutputCount} other Output${hiddenOutputCount === 1 ? "" : "s"} · use --verbose or --output <name>`,
        ] : []),
        ...(args.presentation.verbose && build.omittedOutputs !== undefined ? [
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
      format: "hypit.cli-result-edit@3" as const,
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
    format: "hypit.cli-get@4" as const,
    build: exported.build,
    output: exported.output,
    type: cliTypeName(exported.type),
    kind: exported.kind,
    path: exported.path,
  };
  const path = projectPath(exported.path, projectRoot);
  write(machine, `Exported ${exported.output} → ${path}`, "success",
    args.presentation.verbose ? [
      ["Build", exported.build],
      ["Type", machine.type],
      ["Kind", exported.kind],
      ["Path", exported.path],
    ] : []);
}
