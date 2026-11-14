import {
  createAudiovisualGpuCompositionTerminalCapability,
  createAudiovisualGpuCompositionTerminalExecutor,
} from "@hypit/audiovisual-gpu-composition";
import {
  bindAudiovisualPictureExecution,
  executeAudiovisualPicture,
  partitionAudiovisualPictureExecution,
  type AudiovisualTerminalBinding,
  type AudiovisualTerminalCapability,
  type AudiovisualTerminalRuntime,
} from "@hypit/audiovisual-execution";
import {
  createAudiovisualHtmlTerminalCapability,
  createAudiovisualHtmlTerminalExecutor,
  resolveAudiovisualHtmlSource,
} from "@hypit/audiovisual-html";
import {
  createLocalHtmlPictureProductPublisher,
  type LocalHtmlPictureProductOptions,
} from "@hypit/audiovisual-html-local";
import { assertGpuCompositionProgram, type GpuCompositionProgram } from "@hypit/gpu-composition-program";
import type { HtmlProgram } from "@hypit/html-program";
import type { TemporalRange } from "@hypit/temporal";
import {
  preparedPictureSamplingRepresentation,
  verifyPreparedPictureSampling,
  type PreparedPictureSampling,
} from "@hypit/media";
import {
  prepareNleAudiovisualPictureExecution,
  type NlePictureOutputSelection,
  type NlePictureTerminalRuntime,
  type NleAudiovisualLink,
} from "@hypit/nle-audiovisual";

const gpuTerminal = "gpu-composition-root";
const htmlTerminal = "html-picture-islands";
const preparedMediaTerminal = "prepared-media-picture";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceKey(source: string, output: string): string {
  return `${source}\u0000${output}`;
}

function createPreparedMediaRuntime(
  lowering: NleAudiovisualLink,
): AudiovisualTerminalRuntime<PreparedPictureSampling, never> {
  const sources = new Map(lowering.preparedPictureSources.map((source) => [
    sourceKey(source.source, source.output), source.picture,
  ]));
  const capability: AudiovisualTerminalCapability = {
    terminal: preparedMediaTerminal,
    finalOutputs: [],
    verifyBinding(context) {
      assert(context.target.kind === "source" && context.target.demand.signal === "picture",
        "Prepared Media Terminal accepts only Picture Source demand.");
      assert(sources.has(sourceKey(context.target.demand.source, context.target.demand.output)),
        `Prepared Media Source ${context.target.demand.source}.${context.target.demand.output} is unavailable.`);
      assert(context.binding.sourceAccess?.kind === "range",
        `Prepared Media Source ${context.target.demand.source}.${context.target.demand.output} requires range access.`);
    },
    inputRepresentations: () => [],
    outputRepresentations: context => context.requirement.signal === "picture"
      ? [preparedPictureSamplingRepresentation] : [],
  };
  return {
    capability,
    executor: {
      terminal: preparedMediaTerminal,
      async execute(request) {
        assert(request.nodes.length === 0 && request.uses.length === 0 && request.inputs.length === 0
          && request.finalOutputs.length === 0,
        "Prepared Media Terminal accepts only Picture Source islands.");
        const tasks = new Map(request.sources.map((source) => [source.task, source]));
        return {
          products: request.products.map(({ requirement, binding }) => {
            assert(requirement.signal === "picture"
              && binding.representation === preparedPictureSamplingRepresentation,
            `Prepared Media Terminal cannot publish Product ${requirement.id}.`);
            const task = tasks.get(requirement.node);
            assert(task !== undefined, `Prepared Media Product ${requirement.id} has no Source task.`);
            const value = sources.get(sourceKey(task.source, task.output));
            assert(value !== undefined,
              `Prepared Media Source ${task.source}.${task.output} is unavailable.`);
            verifyPreparedPictureSampling(value);
            return { product: requirement.id, value: structuredClone(value) };
          }),
        };
      },
    },
  };
}

function gpuBindings(
  lowering: NleAudiovisualLink,
  prepared: ReturnType<typeof prepareNleAudiovisualPictureExecution>,
): readonly AudiovisualTerminalBinding[] {
  const nodes = new Map(prepared.demandPlan.nodes.map((node) => [node.id, node]));
  const external = new Map(lowering.pictureSources.map((source) => [
    sourceKey(source.source, source.output), source,
  ]));
  const media = new Set(lowering.preparedPictureSources.map((source) =>
    sourceKey(source.source, source.output)));
  const html = new Set<string>();

  const bindBranchToHtml = (id: string): void => {
    if (html.has(id)) return;
    const demand = nodes.get(id);
    if (demand === undefined) return;
    html.add(id);
    for (const dependency of demand.dependencies) bindBranchToHtml(dependency);
  };

  for (const demand of prepared.demandPlan.nodes) {
    const node = lowering.program.picture!.nodes[demand.node]!;
    if (node.kind === "apply" || node.kind === "crop") bindBranchToHtml(demand.id);
    if (node.kind === "use") {
      const occurrence = lowering.program.occurrences[node.occurrence]!;
      const key = sourceKey(occurrence.source.id, node.output);
      if (!external.has(key) && !media.has(key)) bindBranchToHtml(demand.id);
    }
  }

  const bindings: AudiovisualTerminalBinding[] = prepared.demandPlan.nodes.map((node) => ({
    node: node.id,
    terminal: html.has(node.id) ? htmlTerminal : gpuTerminal,
  }));
  for (const task of prepared.demandPlan.sourceTasks) {
    const key = sourceKey(task.source, task.output);
    const selected = external.get(key);
    if (selected !== undefined) {
      bindings.push({
        node: task.id,
        terminal: selected.terminal,
        sourceAccess: structuredClone(selected.sourceAccess),
      });
      continue;
    }
    if (media.has(key)) {
      bindings.push({ node: task.id, terminal: preparedMediaTerminal, sourceAccess: { kind: "range" } });
      continue;
    }
    const implementation = resolveAudiovisualHtmlSource(
      lowering.htmlSources,
      task.source,
      task.output,
    ).implementation;
    bindings.push({
      node: task.id,
      terminal: htmlTerminal,
      sourceAccess: task.temporal.kind === "constant"
        ? { kind: "constant" }
        : implementation.kind === "prepared-media" || implementation.kind === "picture-product"
          ? { kind: "range" }
          : { kind: "point" },
    });
  }
  return bindings;
}

/** Execute one NLE Picture output through a GPU composition root selected for this invocation. */
export async function executeLocalNlePictureToGpuCompositionProgram(
  lowering: NleAudiovisualLink,
  selection: NlePictureOutputSelection,
  sourceRuntimes: readonly NlePictureTerminalRuntime[],
  htmlProducts: LocalHtmlPictureProductOptions,
  range?: TemporalRange,
): Promise<GpuCompositionProgram> {
  const prepared = prepareNleAudiovisualPictureExecution(lowering, selection, range);
  const gpuCapability = createAudiovisualGpuCompositionTerminalCapability(gpuTerminal);
  const htmlCapability = createAudiovisualHtmlTerminalCapability({
    terminal: htmlTerminal,
    sources: lowering.htmlSources,
    publishesPictureProducts: true,
  });
  const mediaRuntime = createPreparedMediaRuntime(lowering);
  const capabilities = [
    gpuCapability,
    htmlCapability,
    mediaRuntime.capability,
    ...sourceRuntimes.map((runtime) => runtime.capability),
  ];
  const partitioned = partitionAudiovisualPictureExecution(
    prepared,
    gpuBindings(lowering, prepared),
    capabilities,
    [{ signal: "picture", terminal: gpuTerminal }],
  );
  const plan = bindAudiovisualPictureExecution(
    partitioned,
    partitioned.execution.products.map((product) => ({
      product: product.id,
      representation: preparedPictureSamplingRepresentation,
    })),
  );
  const htmlRuntime = {
    capability: htmlCapability,
    executor: createAudiovisualHtmlTerminalExecutor({
      terminal: htmlTerminal,
      program: lowering.program,
      sources: lowering.htmlSources,
      output: plan.output,
      demand: plan.demand,
      publishPictureProduct: createLocalHtmlPictureProductPublisher(htmlProducts),
    }),
  };
  const runtimes: Array<
    AudiovisualTerminalRuntime<PreparedPictureSampling, HtmlProgram | GpuCompositionProgram>
  > = [
    ...sourceRuntimes,
    mediaRuntime,
    htmlRuntime,
    {
      capability: gpuCapability,
      executor: createAudiovisualGpuCompositionTerminalExecutor({
        terminal: gpuTerminal,
        program: lowering.program,
        output: plan.output,
        demand: plan.demand,
      }),
    },
  ];
  const output = await executeAudiovisualPicture<PreparedPictureSampling, HtmlProgram | GpuCompositionProgram>(
    plan,
    runtimes,
  );
  assert("sampling" in output,
    "Selected GPU Composition root returned another terminal's output value.");
  assertGpuCompositionProgram(output);
  return structuredClone(output);
}
