import assert from "node:assert/strict";
import test from "node:test";

import { readHtmlVisual } from "@hypit/html-program";
import { nleLinearTimeMapping, type NleComponentItem } from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import { exactTemporalValue } from "@hypit/temporal/algebra";

import {
  rankingBoardHtmlResolver,
  rankingBoardNleAuthoring,
  rankingBoardNleMediaAuthoring,
  rankingBoardNleResolver,
  rankingBoardComponentSymbol,
} from "../src/index.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });

const item: NleComponentItem = {
  id: "board",
  kind: "present", source: "component",
  component: rankingBoardComponentSymbol,
  start: at(0),
  duration: at(12),
  sourceTime: nleLinearTimeMapping(at(12)),
  enabled: true,
  parameters: canonicalize({
    title: "Capability ranking",
    rows: [
      { id: "S", label: "S", color: "#fb5260" },
      { id: "A", label: "A", color: "#fbbf24" },
    ],
    entries: [
      { id: "editable", label: "Editable", tier: "S", visual: { kind: "text", text: "E" },
        revealAt: at(3), entry: "drop", preset: false },
    ],
    layout: {
      board: { x: 360, y: 24, width: 330, height: 220 },
      titleHeight: 42, labelWidthRatio: 0.16, gap: 7, itemWidth: 110,
      stagePoint: { x: 0.5, y: 0.42 }, stageSize: 170,
    },
    motion: { appearFrames: 8, holdFrames: 10, moveFrames: 16 },
    appearance: {
      background: "#0f172af2", rowBackground: "#ffffff0c", borderColor: "#ffffff2e",
      shadowColor: "#02061780", itemBackground: "#f8fafcf5", itemTextColor: "#111827",
      labelTextColor: "#111827", accent: "#38bdf8",
      fontFamily: "system-ui, sans-serif",
    },
  }),
  picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "fill" } },
};

test("project Ranking Board preserves the mature full-canvas stage-to-cell relationship", () => {
  const resolved = rankingBoardNleResolver.resolve(item, {} as never);
  const terminal = rankingBoardHtmlResolver.resolve(item, {} as never, resolved);
  if (terminal.html?.implementation.kind !== "program") throw new Error("Ranking Board is not a Program.");
  const visual = readHtmlVisual(terminal.html.implementation.program);
  assert.match(visual.html, /data-ranking-scene/u);
  assert.match(visual.html, /left:360px;top:24px/u);
  assert.match(visual.setup ?? "", /stageScale/u);
  assert.match(visual.setup ?? "", /smoother/u);
  assert.doesNotThrow(() => new Function("root", "data", "context", visual.setup ?? ""));
});

test("project Ranking Board authors a direct entry tier edit", () => {
  const edited = rankingBoardNleAuthoring.edit({ kind: "set-entry-tier", entry: "editable", tier: "A" },
    { item } as never);
  const entries = (edited as Record<string, unknown>).entries as readonly Record<string, unknown>[];
  assert.equal(entries[0]?.tier, "A");
});

test("project Ranking Board consumes a project Media input instead of serializing picture bytes in parameters", () => {
  const mediaItem: NleComponentItem = {
    ...item,
    parameters: canonicalize({
      ...(item.parameters as Readonly<Record<string, unknown>>),
      entries: [{
        id: "editable", label: "Editable", tier: "S",
        visual: { kind: "media", input: "portrait:editable" },
        revealAt: at(3), entry: "drop", preset: false,
      }],
    }),
    media: { "portrait:editable": { path: "../../media/editable.media.json" } },
  };
  const portrait = {
    id: "editable-portrait",
    source: { kind: "blob" as const, resource: "res_ranking_editable_portrait" as const,
      size: 1, mediaType: "image/png" },
    picture: {
      kind: "constant" as const,
      streamIndex: 0,
      interpretation: {
        codedWidth: 256,
        codedHeight: 256,
        sampleAspectRatio: { numerator: 1, denominator: 1 },
        rotationDegrees: 0 as const,
        picture: {
          colorPrimaries: "bt709" as const,
          colorTransfer: "srgb" as const,
          colorMatrix: "rgb" as const,
          colorRange: "full" as const,
          bitDepth: 8 as const,
          alphaMode: "opaque" as const,
        },
      },
    },
  };
  const context = { project: {} as never, media: { "portrait:editable": portrait } };
  const resolved = rankingBoardNleResolver.resolve(mediaItem, context);
  const terminal = rankingBoardHtmlResolver.resolve(mediaItem, context, resolved);
  if (terminal.html?.implementation.kind !== "program") throw new Error("Ranking Board is not a Program.");
  const visual = readHtmlVisual(terminal.html.implementation.program);
  assert.equal(visual.dependencies[0]?.artifact.resource, portrait.source.resource);
  assert.match(visual.html, /hypit-artifact:\/\/res_ranking_editable_portrait/u);
  assert.deepEqual(rankingBoardNleMediaAuthoring.inputs({ item: mediaItem } as never), [{
    key: "portrait:editable", label: "Editable image", requires: ["picture"], required: true,
  }]);
});
