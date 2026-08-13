import assert from "node:assert/strict";
import test from "node:test";

import {
  compositionComponent, mediaComponent, spatialComponent, videoContractManifests,
} from "../../../test/support/video-domain.js";
import { registerProducerFacets, registerTypeValidatorFacets } from "@narratage/component-kit";
import {
  createResolvedClosure, link, sealBuildRequest, sealRecord, sealTypedModule, start,
} from "@narratage/core";
import { NodeDriver, ProducerRegistry } from "@narratage/driver-node";
import { elaborateAuthorModule, sealAuthorModule } from "@narratage/elaborator";
import type { MarkupAttributeValue, StructuredElement, StructuredNode, SurfaceResolvedReference } from "@narratage/markup";
import type { FontArtifactRef } from "@narratage/media";
import { mediaTypes } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { semanticMapTypes } from "@narratage/semantic-map";
import { sealSpatialFrame, spatialTypes } from "@narratage/spatial";
import { svsManifest, svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import { textManifest } from "@narratage/text";
import { admitRecord, TypeValidatorRegistry } from "@narratage/validation";

import {
  decodeColumnStyleSurface, decodeColumnSurface,
  decodeTierBoardStyleSurface, decodeTierBoardSurface,
  rankingComponent, rankingManifest,
} from "@narratage/ranking";

const space = sealProgramSpace({
  contract: "svml.program-space@1", durationSec: 8, frameRate: { numerator: 30, denominator: 1 },
});
const frame = sealSpatialFrame({
  contract: "svml.spatial-frame@1", xPx: 40, yPx: 80, widthPx: 720, heightPx: 560,
});
const map: CompleteSemanticMap = {
  contract: "svml.complete-semantic-map@1", tokens: [],
  anchors: [
    { identity: "outer-start", timeSec: 10 / 30, frame: 10 },
    { identity: "one", timeSec: 1, frame: 30 },
    { identity: "two", timeSec: 70 / 30, frame: 70 },
    { identity: "terminal", timeSec: 190 / 30, frame: 190 },
    { identity: "outer-end", timeSec: 230 / 30, frame: 230 },
  ],
};
const outer: NarrativeSelectionRef = {
  contract: "svml.narrative-selection@1", id: "board-window",
  occurrences: [{ occurrence: 0, startAnchorId: "outer-start", endAnchorId: "outer-end" }],
};
const terminal: NarrativeMomentRef = {
  contract: "svml.narrative-moment@1", id: "settled",
  occurrences: [{ occurrence: 0, anchorId: "terminal" }],
};
const triggers: NarrativeMomentRef = {
  contract: "svml.narrative-moment@1", id: "place",
  occurrences: [{ occurrence: 0, anchorId: "one" }, { occurrence: 1, anchorId: "two" }],
};
const font: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  sources: [{ artifact: { kind: "blob", digest: digestOf("font"), size: 32, mediaType: "font/woff2" } }],
  weight: 700, style: "normal",
};
const icon = (id: string) => ({
  kind: "blob" as const, digest: digestOf(`icon:${id}`), size: 64, mediaType: "image/png",
});

const range = { source: "ranking.svml", start: 0, end: 1 };
const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
const node = (
  name: string,
  attributes: Record<string, MarkupAttributeValue>,
  children: StructuredNode[] = [],
): StructuredElement => ({ kind: "element", name, attributes, children, range });

const closure = createResolvedClosure([
  ...videoContractManifests, textManifest, svsManifest, rankingManifest,
]);

function validators(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
  registerTypeValidatorFacets(registry, mediaComponent.validators);
  registerTypeValidatorFacets(registry, spatialComponent.validators);
  registerTypeValidatorFacets(registry, rankingComponent.validators);
  return registry;
}

/**
 * Author a board the way the compiler does — call the Surface, elaborate what it
 * returns, run the Producers — and read the Visual Track out of the finished
 * build. Every other test in this package calls the projection functions
 * directly, so nothing else proves the graph the Surface actually emits can be
 * executed at all.
 */
async function build(
  handler: typeof decodeTierBoardSurface,
  styleHandler: typeof decodeTierBoardStyleSurface,
  properties: SvsRecipe["properties"],
  element: (style: string) => StructuredElement,
  target: string,
): Promise<{ readonly status: string; readonly track: { readonly id: string; readonly presents: readonly unknown[] } | undefined }> {
  const registry = validators();
  const origin = { kind: "authored" as const };
  const records: unknown[] = [];
  const references = new Map<string, SurfaceResolvedReference>();
  const define = async (id: string, type: unknown, value: unknown, isBlob = false): Promise<void> => {
    const record = await admitRecord(closure, sealRecord({
      id, type, value: (isBlob ? value : { kind: "inline", value }), origin,
    } as never), registry);
    records.push(record);
    references.set(id, { path: id, ref: { kind: "record", id }, type: type as never, record });
  };

  await define("map", semanticMapTypes.complete, map);
  await define("space", programSpaceTypes.programSpace, space);
  await define("frame", spatialTypes.frame, frame);
  await define("outer", narrativeTypes.selection, outer);
  await define("triggers", narrativeTypes.moment, triggers);
  await define("terminal", narrativeTypes.moment, terminal);
  await define("font", mediaTypes.fontArtifact, font);
  await define("icon-1", mediaTypes.blobArtifact, icon("one"), true);
  await define("icon-2", mediaTypes.blobArtifact, icon("two"), true);
  await define("recipe", svsRecipeType, {
    contract: "svml.svs-recipe@1", path: "ranking.board", properties,
  });

  const surface = {
    sourceName: "ranking.svml",
    resolveReference: (path: string) => references.get(path),
    resolveAsset: async () => { throw new Error("no assets"); },
  };
  const styleOut = await styleHandler({
    ...surface,
    element: node("ranking:Style", { id: "style", recipe: ref("recipe"), font: ref("font") }),
  } as never);
  for (const draft of styleOut.records) {
    const record = await admitRecord(closure, sealRecord({ ...draft, origin } as never), registry);
    records.push(record);
    references.set(draft.id, { path: draft.id, ref: { kind: "record", id: draft.id }, type: draft.type, record });
  }

  const out = await handler({ ...surface, element: element("style") } as never);
  for (const draft of out.records) {
    records.push(await admitRecord(closure, sealRecord({ ...draft, origin } as never), registry));
  }

  const program = link(closure, [sealTypedModule({
    id: "author:ranking-execute", closureDigest: closure.digest, records: records as never,
  })]);
  const fragments = new Map(out.fragments.map((fragment) => [fragment.id, fragment]));
  const elaborated = elaborateAuthorModule(
    program,
    sealAuthorModule({ name: "board", components: out.components } as never),
    (id) => fragments.get(id),
  );
  const producers = new ProducerRegistry();
  registerProducerFacets(producers, rankingComponent.producers);
  const result = await new NodeDriver({ producers, validators: registry }).run(
    start(program, elaborated.graph, sealBuildRequest({ graph: elaborated.graph.id, targets: [{ output: target }] })),
  );
  const selection = result.state.plan.selections.find((item) => item.output === target);
  const record = result.state.records.find((item) => item.id === selection?.record);
  const stored = record?.value as { kind: string; value?: unknown } | undefined;
  return {
    status: result.status,
    track: stored?.kind === "inline"
      ? stored.value as { id: string; presents: readonly unknown[] }
      : undefined,
  };
}

test("a Tier Board Surface produces a Visual Track when its graph is executed", async () => {
  const { status, track } = await build(
    decodeTierBoardSurface, decodeTierBoardStyleSurface,
    { rows: "top:1:#ff3f56|next:2:#31add0" } as never,
    (style) => node("ranking:TierBoard", {
      id: "board", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref(style),
    }, [
      node("ranking:TierItem", { id: "worst", tier: "next", entry: "stage", icon: ref("icon-1") }),
      node("ranking:TierItem", { id: "best", tier: "top", entry: "stage", icon: ref("icon-2") }),
    ]),
    "board.visual",
  );
  assert.equal(status, "complete");
  assert.equal(track?.id, "board");
  // A board that draws nothing would still have completed the build.
  assert.ok((track?.presents.length ?? 0) > 0, "the Track carries the board and its Items");
});

test("a Column Surface carries an Item icon through to its Visual Track", async () => {
  const { status, track } = await build(
    decodeColumnSurface, decodeColumnStyleSurface, {},
    (style) => node("ranking:Column", {
      id: "column", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref(style),
    }, [
      node("ranking:ColumnItem", { id: "first", label: "First", icon: ref("icon-1") }),
      node("ranking:ColumnItem", { id: "second", label: "Second", icon: ref("icon-2") }),
    ]),
    "column.visual",
  );
  assert.equal(status, "complete");
  assert.equal(track?.id, "column");
  assert.ok((track?.presents.length ?? 0) > 0);
});
