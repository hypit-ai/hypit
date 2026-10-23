import assert from "node:assert/strict";
import test from "node:test";
import { visualElements } from "@hypit/composition";
import type { HtmlVisual } from "@hypit/html-program";
import type { FontStackRef } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import { composeTemporalWindow, projectProgramInstant } from "@hypit/temporal";
import { narrativeProjectionFixture, timelineFixture } from "../../../../../test/timeline-fixture.js";
import { projectMomentInstantFixture } from "../../../../../test/temporal-fixture.js";
import { fixtureResource } from "../../../../../test/fixture-resource.js";
import { renderChat } from "../src/render.js";

const space: Timeline = { id: "animation", frameCount: 240, frameRate: { numerator: 30, denominator: 1 } };
const font: FontStackRef = { faces: [{ sources: [{ artifact: { kind: "blob", resource: fixtureResource("chat-font"), size: 32, mediaType: "font/woff2" } }], weight: 600, style: "normal" }] };
const point = (id: string, frame: number) => projectProgramInstant({ itemId: id, subjectId: id, timeline: { ...space },
  projection: { ref: "absolute", at: { unit: "frames", value: frame } } });
const window = composeTemporalWindow({ id: "chat", subjectId: "chat" }, point("chat", 0), point("chat", 240));

test("the same chat renderer consumes authored and word-bound events; changing performance moves only the word-bound message", () => {
  const scene = (wordFrame: number) => {
    const timeline = timelineFixture(space);
    const narrative = narrativeProjectionFixture(timeline, { segments: [{ id: "dialogue", frameCount: 240 }],
      anchors: [{ identity: "answer", frame: wordFrame }] });
    const at = projectMomentInstantFixture({ itemId: "reply", subjectId: "reply", semantic: timeline, narrative,
      moment: { narrativeId: narrative.narrativeId, id: "answer", anchorId: "answer" }, projection: { ref: "moment.cue" } });
    return renderChat(timeline, { xPx: 0, yPx: 0, widthPx: 540, heightPx: 960 }, window, font, [
      { id: "opening", sender: "Maya", text: "Ready?", side: "left", at: point("opening", 15) },
      { id: "reply", sender: "Leo", text: "Ready.", side: "right", at },
    ], { id: "chat", title: "Launch", entranceFrames: 10 });
  };
  const program = (value: ReturnType<typeof scene>) => {
    const element = visualElements(value.items[0]!.root).find(element => element.kind === "program")!;
    assert.equal(element.kind, "program");
    return element.program.payload as unknown as HtmlVisual;
  };
  const before = program(scene(60)), after = program(scene(90));
  assert.equal(before.html, after.html);
  assert.deepEqual(before.data, { times: [15, 60], entrance: 10 });
  assert.deepEqual(after.data, { times: [15, 90], entrance: 10 });
});
