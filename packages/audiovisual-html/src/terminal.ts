import {
  isPointwiseOperatorTemporalSupport,
  type AudiovisualProgram,
} from "@hypit/audiovisual";
import {
  projectAudiovisualPictureIsland,
  type AudiovisualPictureDemand,
  type AudiovisualPictureOutput,
  type AudiovisualTerminalCapability,
  type AudiovisualTerminalExecutor,
  type DerivedRenderProductBinding,
  type DerivedRenderProductRequirement,
} from "@hypit/audiovisual-execution";
import { readHtmlVisual, type HtmlProgram } from "@hypit/html-program";
import {
  preparedPictureSamplingRepresentation,
  verifyPreparedPictureSampling,
  type PreparedPictureSampling,
} from "@hypit/media";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import type { TemporalMapRegionSet } from "@hypit/temporal/algebra";

import { lowerAudiovisualPictureProgramToHtmlProgram } from "./lower.js";
import {
  appendAudiovisualHtmlSource,
  assertAudiovisualHtmlSourceSet,
  pictureProductHtmlSource,
  resolveAudiovisualHtmlSource,
  type AudiovisualHtmlSourceSet,
} from "./source.js";

/** Concrete transient representation currently accepted by the HTML compositor. */
export type AudiovisualHtmlTerminal = {
  readonly terminal: string;
  readonly program: AudiovisualProgram;
  /** Implementations for Source tasks assigned to this HTML island. */
  readonly sources: AudiovisualHtmlSourceSet;
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
  /** Host-owned materialization used only when this HTML island publishes a cross-Terminal Product. */
  readonly publishPictureProduct?: (request: {
    readonly requirement: DerivedRenderProductRequirement;
    readonly binding: DerivedRenderProductBinding;
    readonly program: HtmlProgram;
    readonly domain: AudiovisualProgram["domain"];
    readonly pictureDomain: NonNullable<AudiovisualProgram["pictureDomain"]>;
  }) => Promise<PreparedPictureSampling>;
};

export type AudiovisualHtmlTerminalCapabilityInput = Pick<
  AudiovisualHtmlTerminal,
  "terminal" | "sources"
> & {
  /** True only when the Host installed a real alpha-capable Product publisher. */
  readonly publishesPictureProducts?: boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Concrete HTML capability offer; it validates choices but never selects a binding. */
export function createAudiovisualHtmlTerminalCapability(
  input: AudiovisualHtmlTerminalCapabilityInput,
): AudiovisualTerminalCapability {
  assert(input.terminal.length > 0, "Audiovisual HTML Terminal capability identity is empty.");
  assertAudiovisualHtmlSourceSet(input.sources);
  return {
    terminal: input.terminal,
    finalOutputs: ["picture"],
    verifyBinding(context) {
      assert(context.target.demand.signal === "picture",
        `HTML Terminal ${input.terminal} accepts only Picture demand.`);
      if (context.target.kind === "node") {
        const node = context.program.picture?.nodes[context.target.demand.node];
        assert(node !== undefined,
          `HTML Terminal ${input.terminal} cannot find Picture node ${context.target.demand.node}.`);
        if (node.kind === "apply") {
          assert(isPointwiseOperatorTemporalSupport(node.operator.temporalSupport),
            `HTML Terminal ${input.terminal} cannot execute non-pointwise Operator ${node.operator.id}.`);
          readHtmlVisual(node.operator.program);
        }
        return;
      }
      const source = resolveAudiovisualHtmlSource(
        input.sources,
        context.target.demand.source,
        context.target.demand.output,
      ).implementation;
      if (source.kind === "program") readHtmlVisual(source.program);
      const expected = context.target.demand.temporal.kind === "constant"
        ? "constant"
        : source.kind === "prepared-media" || source.kind === "picture-product"
          ? "range"
          : "point";
      assert(context.binding.sourceAccess?.kind === expected,
        `HTML Source ${context.target.demand.source}.${context.target.demand.output} requires ${expected} access.`);
    },
    inputRepresentations: context => context.requirement.signal === "picture"
      ? [preparedPictureSamplingRepresentation] : [],
    outputRepresentations: context => input.publishesPictureProducts === true
      && context.requirement.signal === "picture"
      ? [preparedPictureSamplingRepresentation] : [],
  };
}

function temporalBounds(value: TemporalMapRegionSet) {
  const first = value.regions[0];
  const last = value.regions.at(-1);
  assert(first !== undefined && last !== undefined,
    "HTML Picture Product has no demanded temporal region.");
  return {
    start: structuredClone(first.start.position),
    end: structuredClone(last.end.position),
  };
}

function productOutput(
  selected: AudiovisualPictureOutput,
  program: AudiovisualProgram,
): AudiovisualPictureOutput {
  const source = program.pictureDomain!;
  assert(Number.isSafeInteger(source.region.width) && source.region.width > 0
    && Number.isSafeInteger(source.region.height) && source.region.height > 0,
  `HTML Picture island ${program.id} does not close on a positive integer pixel extent.`);
  const target = sealLocalSpatialDomain({
    id: `${source.id}:product-raster`,
    region: { x: 0, y: 0, width: source.region.width, height: source.region.height },
  });
  return {
    id: selected.id,
    sampling: structuredClone(selected.sampling),
    canvas: { width: source.region.width, height: source.region.height, clearColor: "transparent" },
    pictureMapping: sealSpatialMap({
      target,
      source: structuredClone(source),
      transform: {
        kind: "affine",
        xx: 1, xy: 0, yx: 0, yy: 1,
        tx: source.region.x,
        ty: source.region.y,
      },
    }),
  };
}

/**
 * Execute the final HTML compositor island.
 *
 * Cross-island inputs are projected into transient AVIR Source contracts.
 * Publishing an intermediate HTML island delegates raster materialization to
 * the Host so browser and Artifact policy remain outside this package.
 */
export function createAudiovisualHtmlTerminalExecutor(
  input: AudiovisualHtmlTerminal,
): AudiovisualTerminalExecutor<PreparedPictureSampling, HtmlProgram> {
  assertAudiovisualHtmlSourceSet(input.sources);
  assert(input.terminal.length > 0, "Audiovisual HTML Terminal identity is empty.");
  return {
    terminal: input.terminal,
    async execute(request) {
      assert(request.island.signals.length === 1 && request.island.signals[0] === "picture",
        "Audiovisual HTML Terminal received a non-Picture island.");
      assert(request.finalOutputs.length <= 1
        && request.finalOutputs.every((signal) => signal === "picture"),
      "Audiovisual HTML Terminal received an unsupported final output.");
      assert(request.nodes.every((node) => node.signal === "picture"),
        "Audiovisual HTML Terminal received non-Picture graph nodes.");

      const products = new Map(request.inputs.map((product) => {
        assert(product.requirement.signal === "picture",
          `HTML island received non-Picture product ${product.requirement.id}.`);
        assert(product.binding.representation === preparedPictureSamplingRepresentation,
          `HTML island does not support representation ${product.binding.representation}.`);
        verifyPreparedPictureSampling(product.value);
        return [product.requirement.id, product.value] as const;
      }));
      assert(products.size === request.inputs.length,
        "HTML island received the same Product more than once.");

      const close = (
        root: string,
        output: AudiovisualPictureOutput,
        demand: AudiovisualPictureDemand,
      ): { readonly projection: ReturnType<typeof projectAudiovisualPictureIsland>; readonly document: HtmlProgram } => {
        const projection = projectAudiovisualPictureIsland(input.program, request, root);
        const replaced = new Set(projection.inputs.map((entry) => `${entry.source}\u0000${entry.output}`));
        let sources: AudiovisualHtmlSourceSet = {
          sources: input.sources.sources.filter((source) =>
            !replaced.has(`${source.source}\u0000${source.output}`)),
        };
        for (const entry of projection.inputs) {
          const product = products.get(entry.product);
          assert(product !== undefined,
            `HTML island projection is missing Product ${entry.product}.`);
          sources = appendAudiovisualHtmlSource(sources, pictureProductHtmlSource(
            entry.source,
            entry.output,
            product,
          ));
        }
        return { projection, document: lowerAudiovisualPictureProgramToHtmlProgram({
          program: projection.program,
          sources,
          output,
          demand,
        }) };
      };

      const published = [];
      for (const product of request.products) {
        assert(product.requirement.signal === "picture"
          && product.binding.representation === preparedPictureSamplingRepresentation,
        `HTML island cannot publish Product ${product.requirement.id}.`);
        assert(input.publishPictureProduct !== undefined,
          `HTML island ${request.island.id} has no Host Picture Product publisher.`);
        assert(product.requirement.temporal.kind === "signal",
          `HTML Product ${product.requirement.id} is not a Picture signal.`);
        const root = request.nodes.find((node) => node.id === product.requirement.node);
        assert(root !== undefined,
          `HTML Product ${product.requirement.id} is not rooted in an island graph node.`);
        const range = temporalBounds(product.requirement.temporal.regions);
        const projected = projectAudiovisualPictureIsland(input.program, request, root.id);
        const closed = close(root.id, productOutput(input.output, projected.program), { range });
        const value = await input.publishPictureProduct({
          requirement: product.requirement,
          binding: product.binding,
          program: closed.document,
          domain: structuredClone(closed.projection.program.domain),
          pictureDomain: structuredClone(closed.projection.program.pictureDomain!),
        });
        verifyPreparedPictureSampling(value);
        published.push({ product: product.requirement.id, value });
      }

      if (request.finalOutputs.length === 0) return { products: published };
      const root = request.nodes.find((node) => node.node === input.program.picture!.root);
      assert(root !== undefined,
        `HTML island ${request.island.id} does not own the Programme Picture root.`);
      const document = close(root.id, input.output, input.demand).document;
      return { products: published, outputs: { picture: document } };
    },
  };
}
