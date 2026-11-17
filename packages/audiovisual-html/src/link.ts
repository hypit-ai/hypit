import {
  assertAudiovisualProgram,
  isPointwiseOperatorTemporalSupport,
  type AudiovisualProgram,
  type PictureOperator,
  type ProgramSource,
} from "@hypit/audiovisual";
import {
  assertHtmlPictureReconstruction,
  assertHtmlVisual,
  type HtmlPictureReconstruction,
  type HtmlVisual,
} from "@hypit/html-program";
import type { ResolvedMedia } from "@hypit/media";
import type {
  AudiovisualHtmlContribution,
  AudiovisualHtmlLink,
  AudiovisualHtmlOperator,
  AudiovisualHtmlReconstruction,
  AudiovisualHtmlSource,
} from "./types.js";

const key = (packageName: string, symbol: string): string => `${packageName}\u0000${symbol}`;

function resolvedMedia(source: ProgramSource): ResolvedMedia | undefined {
  if (source.implementation.package !== "@hypit/audiovisual" || source.implementation.symbol !== "resolved-media") return undefined;
  const value = source.parameters.media;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Resolved Media Source ${source.id} has no Media value.`);
  }
  return structuredClone(value) as ResolvedMedia;
}

export function linkAudiovisualProgramToHtml(
  program: AudiovisualProgram,
  contributions: readonly AudiovisualHtmlContribution[],
): AudiovisualHtmlLink {
  assertAudiovisualProgram(program);
  const sourceCompilers = new Map<string, (source: ProgramSource, output: string) => HtmlVisual>();
  const operatorCompilers = new Map<string, (operator: PictureOperator) => HtmlVisual>();
  const reconstructionCompilers = new Map<string,
    (reconstruction: import("@hypit/audiovisual").SignalReconstruction) => HtmlPictureReconstruction>();
  for (const contribution of contributions) {
    for (const source of contribution.sources ?? []) {
      const identity = key(contribution.package, source.symbol);
      if (sourceCompilers.has(identity)) throw new Error(`HTML Terminal repeats Source ${contribution.package}#${source.symbol}.`);
      sourceCompilers.set(identity, source.compile);
    }
    for (const operator of contribution.operators ?? []) {
      const identity = key(contribution.package, operator.symbol);
      if (operatorCompilers.has(identity)) throw new Error(`HTML Terminal repeats Operator ${contribution.package}#${operator.symbol}.`);
      operatorCompilers.set(identity, operator.compile);
    }
    for (const reconstruction of contribution.reconstructions ?? []) {
      const identity = key(contribution.package, reconstruction.symbol);
      if (reconstructionCompilers.has(identity)) {
        throw new Error(`HTML Terminal repeats Reconstruction ${contribution.package}#${reconstruction.symbol}.`);
      }
      reconstructionCompilers.set(identity, reconstruction.compile);
    }
  }
  const sources: AudiovisualHtmlSource[] = [];
  const reconstructions: AudiovisualHtmlReconstruction[] = [];
  const sourceKeys = new Set<string>();
  for (const occurrence of Object.values(program.occurrences)) for (const output of Object.keys(occurrence.selections)) {
    const selection = occurrence.selections[output]!;
    if (selection.kind === "signal" && selection.reconstruction !== undefined) {
      const selected = selection.reconstruction;
      const compiler = reconstructionCompilers.get(key(
        selected.implementation.package,
        selected.implementation.symbol,
      ));
      if (compiler === undefined) {
        throw new Error(`HTML Terminal has no Reconstruction implementation ${selected.implementation.package}#${selected.implementation.symbol}.`);
      }
      const reconstruction = compiler(selected);
      assertHtmlPictureReconstruction(reconstruction);
      reconstructions.push({ occurrence: occurrence.id, output, reconstruction });
    }
    const identity = `${occurrence.source.id}\u0000${output}`;
    if (sourceKeys.has(identity)) continue;
    sourceKeys.add(identity);
    const media = resolvedMedia(occurrence.source);
    if (media !== undefined) {
      sources.push({ source: occurrence.source.id, output, implementation: { kind: "media", media } });
      continue;
    }
    const compiler = sourceCompilers.get(key(
      occurrence.source.implementation.package,
      occurrence.source.implementation.symbol,
    ));
    if (compiler === undefined) {
      throw new Error(`HTML Terminal has no Source implementation ${occurrence.source.implementation.package}#${occurrence.source.implementation.symbol}.`);
    }
    const visual = compiler(occurrence.source, output);
    assertHtmlVisual(visual);
    sources.push({ source: occurrence.source.id, output, implementation: { kind: "visual", visual } });
  }
  const operators: AudiovisualHtmlOperator[] = [];
  const operatorIds = new Set<string>();
  for (const node of Object.values(program.picture?.nodes ?? {})) {
    if (node.kind !== "apply" || operatorIds.has(node.operator.id)) continue;
    if (!isPointwiseOperatorTemporalSupport(node.operator.temporalSupport)) {
      throw new Error(`HTML Terminal cannot execute non-pointwise Operator ${node.operator.id}.`);
    }
    operatorIds.add(node.operator.id);
    const compiler = operatorCompilers.get(key(node.operator.implementation.package, node.operator.implementation.symbol));
    if (compiler === undefined) {
      throw new Error(`HTML Terminal has no Operator implementation ${node.operator.implementation.package}#${node.operator.implementation.symbol}.`);
    }
    const visual = compiler(node.operator);
    assertHtmlVisual(visual);
    operators.push({ operator: node.operator.id, visual });
  }
  return { program: structuredClone(program), sources, operators, reconstructions };
}
