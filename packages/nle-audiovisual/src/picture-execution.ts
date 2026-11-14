import {
  bindAudiovisualPictureExecution,
  executeAudiovisualPicture,
  expandNestedAudiovisualPrograms,
  partitionAudiovisualPictureExecution,
  prepareAudiovisualPictureExecution,
  type AudiovisualPictureExecutionPreparation,
  type AudiovisualTerminalBinding,
  type AudiovisualTerminalExecutor,
  type AudiovisualTerminalRuntime,
  type DerivedRenderProductBinding,
  type PartitionedAudiovisualPictureExecution,
} from "@hypit/audiovisual-execution";
import {
  createAudiovisualHtmlTerminalCapability,
  createAudiovisualHtmlTerminalExecutor,
  resolveAudiovisualHtmlSource,
} from "@hypit/audiovisual-html";
import { assertHtmlProgram, type HtmlProgram } from "@hypit/html-program";
import type { PreparedPictureSampling } from "@hypit/media";
import type { TemporalRange } from "@hypit/temporal";

import {
  createNleAudiovisualPictureOutput,
  type NlePictureOutputSelection,
  type NleAudiovisualLink,
} from "./link.js";

export type NlePictureTerminalExecutor = AudiovisualTerminalExecutor<PreparedPictureSampling, HtmlProgram>;

export type NlePictureTerminalRuntime = AudiovisualTerminalRuntime<PreparedPictureSampling, HtmlProgram>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceKey(source: string, output: string): string {
  return `${source}\u0000${output}`;
}

/**
 * Close NLE output policy into exact AVIR demand before any Terminal binding.
 */
export function prepareNleAudiovisualPictureExecution(
  lowering: NleAudiovisualLink,
  selection: NlePictureOutputSelection,
  range?: TemporalRange,
): AudiovisualPictureExecutionPreparation {
  const program = lowering.program;
  assert(program.picture !== undefined && program.pictureDomain !== undefined,
    "NLE Project has no Picture output for terminal execution.");
  const output = createNleAudiovisualPictureOutput(program, selection);
  const prepared = prepareAudiovisualPictureExecution(program, output, range);
  return {
    ...prepared,
    demandPlan: expandNestedAudiovisualPrograms(prepared.demandPlan, lowering.nestedPrograms),
  };
}

function bindHtmlRootTerminals(
  lowering: NleAudiovisualLink,
  prepared: AudiovisualPictureExecutionPreparation,
): readonly AudiovisualTerminalBinding[] {
  const external = new Map(lowering.pictureSources.map((source) => [
    sourceKey(source.source, source.output), source,
  ]));
  assert(external.size === lowering.pictureSources.length,
    "NLE Picture terminal sources repeat a Source output.");
  const bindings: AudiovisualTerminalBinding[] = prepared.demandPlan.nodes.map((node) => ({
    node: node.id,
    terminal: "html-terminal",
  }));
  for (const task of prepared.demandPlan.sourceTasks) {
    const selected = external.get(sourceKey(task.source, task.output));
    if (selected !== undefined) {
      bindings.push({
        node: task.id,
        terminal: selected.terminal,
        sourceAccess: structuredClone(selected.sourceAccess),
      });
      continue;
    }
    const implementation = resolveAudiovisualHtmlSource(
      lowering.htmlSources,
      task.source,
      task.output,
    ).implementation;
    bindings.push({
      node: task.id,
      terminal: "html-terminal",
      sourceAccess: task.temporal.kind === "constant"
        ? { kind: "constant" }
        : implementation.kind === "prepared-media" || implementation.kind === "picture-product"
          ? { kind: "range" }
          : { kind: "point" },
    });
  }
  return bindings;
}

function bindHtmlRootProducts(
  lowering: NleAudiovisualLink,
  partitioned: PartitionedAudiovisualPictureExecution,
): readonly DerivedRenderProductBinding[] {
  const external = new Map(lowering.pictureSources.map((source) => [
    sourceKey(source.source, source.output), source,
  ]));
  const tasks = new Map(partitioned.execution.demand.sourceTasks.map((task) => [task.id, task]));
  return partitioned.execution.products.map((product) => {
    const task = tasks.get(product.node);
    assert(task !== undefined,
      `NLE HTML profile cannot bind non-Source Product ${product.id}.`);
    const selected = external.get(sourceKey(task.source, task.output));
    assert(selected !== undefined,
      `NLE Picture Product ${product.id} has no selected external Source implementation.`);
    return { product: product.id, representation: selected.representation };
  });
}

/** Execute selected non-HTML Picture Sources, then close the root graph through HTML. */
export async function executeNleAudiovisualPictureToHtmlProgram(
  lowering: NleAudiovisualLink,
  selection: NlePictureOutputSelection,
  runtimes: readonly NlePictureTerminalRuntime[],
  range?: TemporalRange,
): Promise<HtmlProgram> {
  const prepared = prepareNleAudiovisualPictureExecution(lowering, selection, range);
  const htmlCapability = createAudiovisualHtmlTerminalCapability({
    terminal: "html-terminal",
    sources: lowering.htmlSources,
  });
  const partitioned = partitionAudiovisualPictureExecution(
    prepared,
    bindHtmlRootTerminals(lowering, prepared),
    [htmlCapability, ...runtimes.map((runtime) => runtime.capability)],
  );
  const plan = bindAudiovisualPictureExecution(
    partitioned,
    bindHtmlRootProducts(lowering, partitioned),
  );
  const html = createAudiovisualHtmlTerminalExecutor({
    terminal: "html-terminal",
    program: lowering.program,
    sources: lowering.htmlSources,
    output: plan.output,
    demand: plan.demand,
  });
  const output = await executeAudiovisualPicture<PreparedPictureSampling, HtmlProgram>(
    plan,
    [{ capability: htmlCapability, executor: html }, ...runtimes],
  );
  assertHtmlProgram(output);
  return structuredClone(output);
}
