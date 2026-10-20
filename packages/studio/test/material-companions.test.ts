import assert from "node:assert/strict";
import test from "node:test";
import { compositionTypes } from "@hypit/composition";
import { audioTrackTypes } from "@hypit/audio-track";
import { visualTrackTypes } from "@hypit/visual-track";
import type { StudioPlacementChild, StudioTrackCompanionContext } from "@hypit/studio-companion";
import { audioTrackStudioTrackCompanions } from "../../audio-track/src/studio.js";
import { textFineStudioTrackCompanions } from "../../text-fine/src/studio.js";
import { visualTrackStudioTrackCompanions } from "../../visual-track/src/studio.js";

for (const kind of ["audio", "visual"] as const) {
  test(`${kind} Clip titles use explicit author names or exact source references without changing identity`, () => {
    const sourceType = kind === "audio" ? audioTrackTypes.clipSpec : visualTrackTypes.clipSpec;
    const subjects = ["my-chosen-name", "track.item.0002", "track.item.0003"];
    const child = (id: string, index: number): StudioPlacementChild => ({
      ...(index === 0 ? { id } : {}),
      sourcePath: "main.svml",
      tag: `${kind}:Clip`,
      attributes: index === 0 ? { id } : {},
      attributeValueRanges: {},
      referenceAttributes: { [kind === "audio" ? "source" : "image"]: "assets.shared.material" },
      referenceTypes: {},
      references: [],
      range: { start: index * 10, end: index * 10 + 9 },
      values: [{ id: `${id}.source`, type: sourceType, value: { id } }],
    });
    const clips = subjects.map((id, index) => ({
        id: `projected.${index}`, subjectId: id,
        window: { startFrame: index * 10, endFrameExclusive: index * 10 + 20 },
        span: { startFrame: index * 10, endFrameExclusive: index * 10 + 20 },
        order: index, z: index,
        source: { artifact: { resource: "res_audio" } },
        layers: [{ kind: "sample", id: "picture", source: { kind: "still", artifact: { resource: "res_image" } } }],
      }));
    const program = { id: `track.${kind}`, clips };
    const typeRef = kind === "audio" ? compositionTypes.audioTrack : compositionTypes.visualTrack;
    const children = subjects.map(child);
    const context: StudioTrackCompanionContext = {
      track: { name: `track.${kind}`, outputRef: `track.${kind}`, type: typeRef.name, typeRef,
        candidateOrigin: "source", role: "track", value: program,
        trace: { outputPorts: [{ name: "program", ref: "track.program" }], references: [] } },
      placement: {
        sourcePath: "main.svml", tag: `${kind}:Track`, module: typeRef.module, surface: "track",
        range: { start: 0, end: 100 }, records: [], values: [], outputs: [`track.${kind}`],
        outputPorts: [{ name: "program", ref: "track.program" }], children,
        attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
      },
      values: new Map([["track.program", program]]), spans: [], temporalBindings: [], temporalDomains: [], generic: () => [],
    };
    const companion = kind === "audio" ? audioTrackStudioTrackCompanions[0]!
      : visualTrackStudioTrackCompanions.find((entry) => entry.id === "visual")!;
    const items = companion.project!(context);
    assert.deepEqual(items.map((entry) => entry.display.title), ["my-chosen-name", "assets.shared.material", "assets.shared.material"]);
    assert.deepEqual(items.map((entry) => entry.authoredId), subjects);
    assert.equal(new Set(items.map((entry) => entry.id)).size, 3);
    assert.deepEqual(items.map((entry) => entry.elementRange), subjects.map(child).map((entry) => entry.range));
    assert.deepEqual(items.map((entry) => [entry.startFrame, entry.endFrameExclusive]), [[0, 20], [10, 30], [20, 40]]);
  });
}

test("audio source time stays explicit and gain remains a bounded mixing control", () => {
  const companion = audioTrackStudioTrackCompanions[0]!;
  const sourceTime = companion.bindings!.find(binding => binding.name === "source-time")!;
  assert.equal(sourceTime.writable, undefined);
  assert.equal(companion.inspector!.some(field => field.binding === sourceTime.name), false);
  const gain = companion.inspector!.find(field => field.binding === "gain")!;
  assert.equal(gain.domain, "how"); assert.equal(gain.number?.scale, 100); assert.equal(gain.number?.maximum, 6400);
});

test("official Companions expose author families without changing terminal facets", () => {
  assert.equal(visualTrackStudioTrackCompanions[0]?.family, "visual");
  assert.equal(audioTrackStudioTrackCompanions[0]?.family, "audio");
  assert.deepEqual(textFineStudioTrackCompanions.map((companion) => companion.family), [
    "typography", "typography", "typography",
  ]);
});
