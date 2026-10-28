import assert from "node:assert/strict";
import test from "node:test";
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanionContext } from "@hypit/studio-companion";
import { rankingStudioTrackCompanions } from "../src/studio.js";

test("each Ranking declaration has independent visual and audio Companions", () => {
  for (const declaration of ["column", "tier", "top-three"]) {
    const companions = rankingStudioTrackCompanions.filter((entry) => entry.output.declaration === declaration);
    assert.equal(companions.length, 2);
    const audio = companions.find((entry) => entry.output.type.name === compositionTypes.audioTrack.name)!;
    const visual = companions.find((entry) => entry.output.type.name === compositionTypes.visualTrack.name)!;
    assert.equal(audio.label, "Ranking Sounds");
    assert.ok(audio.inspector?.some((field) => field.binding === "style.appear-gain" && field.number?.scale === 100));
    const audioBindings = new Set(audio.inspector?.map((field) => field.binding));
    assert.ok(visual.inspector?.every((field) => !audioBindings.has(field.binding)));
  }
});

test("Ranking Companion owns scalar and recursive color presentation", () => {
  const visual = (id: string) => rankingStudioTrackCompanions.find((entry) =>
    entry.id === id && entry.output.type.name === compositionTypes.visualTrack.name)!;
  const field = (id: string, binding: string) => visual(id).inspector?.find((entry) => entry.binding === binding);
  assert.deepEqual(field("column", "style.text-color")?.valuePresentation, { kind: "color" });
  assert.deepEqual(field("column", "style.rank-colors")?.valuePresentation,
    { kind: "list", item: { kind: "color" } });
  assert.deepEqual(field("tier", "style.rows")?.valuePresentation,
    { kind: "list", item: { kind: "record", fields: { color: { kind: "color" } } } });
  assert.deepEqual(field("top-three", "style.slot-colors")?.valuePresentation,
    { kind: "list", item: { kind: "color" } });
});

test("audio uses exact event identities and emitted clips, with shared recipe ownership", () => {
  const audio = rankingStudioTrackCompanions.find((entry) => entry.id === "tier-audio")!;
  const context = {
    track: {
      name: "board.audio", type: "AudioTrack", typeRef: compositionTypes.audioTrack,
      outputRef: "board.audio",
      value: { graph: {
        nodes: [{ kind: "source", id: "source", clip: { id: "opaque-event-id",
          source: { source: { kind: "blob", resource: "res_sound", size: 1, mediaType: "audio/wav" } } } }],
        output: { node: "source", port: "signal" },
      } },
      trace: { references: [], outputPorts: [{ name: "events", ref: "board.events" }] },
    },
    placement: {
      sourcePath: "ranking.svml", tag: "Tier", module: { name: "@hypit/ranking", version: "1" },
      declaration: "tier", id: "board", range: { start: 0, end: 100 }, records: [], values: [], outputs: [],
      outputPorts: [], attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {},
      referenceTypes: {},
      children: [{
        sourcePath: "ranking.svml", tag: "Item", id: "player", range: { start: 10, end: 20 },
        attributes: { label: "Player One" }, attributeValueRanges: {}, references: [], referenceAttributes: {},
        referenceTypes: {}, values: [],
      }],
    },
    values: new Map([["board.events", { events: [
      { id: "opaque-event-id", itemId: "player", kind: "move", frame: 90 },
      { id: "unprovided-sound", itemId: "player", kind: "appear", frame: 0 },
    ] }]]),
    spans: [{ id: "opaque-event-id", startFrame: 90, endFrameExclusive: 99, stackOrder: 0 }],
    temporalBindings: [], temporalDomains: [], generic: () => [],
  } satisfies StudioTrackCompanionContext;
  const items = audio.project!(context);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.display.title, "Player One · Move");
  assert.equal(items[0]!.authoredId, "board");
  assert.deepEqual(items[0]!.elementLocation, { path: context.placement!.sourcePath, range: context.placement!.range });
  assert.equal(items[0]!.temporal, undefined);
  assert.equal(items[0]!.inspector![0]!.value, "Player One · Move · 90f");
  assert.deepEqual([items[0]!.startFrame, items[0]!.endFrameExclusive], [90, 99]);
});
