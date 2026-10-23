import assert from "node:assert/strict";
import test from "node:test";
import { createResolvedClosure, link } from "@hypit/kernel";
import { verifyGraphFragment } from "@hypit/author";
import { temporalExtentFromDomain, temporalManifest } from "@hypit/temporal";
import { timelineManifest } from "@hypit/timeline";

import {
  compileTimelineAuthorFragment,
  constructionDuration,
  constructionEarliest,
  constructionLatest,
  constructionOffset,
  constructionOrigin,
  constructionResolvedExtent,
  constructionSpan,
  constructionSpanBetween,
  constructionSpanEnding,
  finalizeTimeline,
  materializeInstant,
  materializeWindow,
  timelineAuthorManifest,
} from "@hypit/timeline-author";

const clock = { frameRate: { numerator: 30, denominator: 1 } };
const domain = { id: "voice", frameRate: clock.frameRate, frameCount: 90 };

test("typed construction operations finalize Timeline before public values", () => {
  const start = constructionOrigin(clock);
  const speech = constructionSpan(start, constructionResolvedExtent(clock, temporalExtentFromDomain(domain)));
  const tailStart = constructionOffset({ frame: speech.endFrameExclusive }, constructionDuration(clock, { unit: "frames", value: 12 }), { direction: 1 });
  const tail = constructionSpan(tailStart, constructionDuration(clock, { unit: "seconds", numerator: 3, denominator: 1 }));
  const timeline = finalizeTimeline({ id: "film" }, clock, constructionLatest({ frame: speech.endFrameExclusive }, { frame: tail.endFrameExclusive }));
  const speechWindow = materializeWindow(timeline, speech, { id: "film.speech" });
  assert.equal(timeline.frameCount, 192);
  assert.equal(materializeInstant(timeline, tailStart, { id: "film.tail-start" }).frame, 102);
  assert.deepEqual(materializeWindow(timeline, tail, { id: "film.tail" }).span, { startFrame: 102, endFrameExclusive: 192 });
});

test("Window construction covers forward, backward and boundary-pair forms", () => {
  const extent = constructionDuration(clock, { unit: "frames", value: 12 });
  assert.deepEqual(constructionSpan({ frame: 10 }, extent), { startFrame: 10, endFrameExclusive: 22 });
  assert.deepEqual(constructionSpanEnding({ frame: 22 }, extent), { startFrame: 10, endFrameExclusive: 22 });
  assert.deepEqual(constructionSpanBetween({ frame: 10 }, { frame: 22 }), { startFrame: 10, endFrameExclusive: 22 });
  assert.deepEqual(constructionEarliest({ frame: 10 }, { frame: 22 }), { frame: 10 });
  assert.throws(() => constructionSpanEnding({ frame: 5 }, extent), /before start/);
});

test("construction rejects negative Point", () => {
  assert.throws(() => constructionOffset({ frame: 5 }, { frameCount: 6 }, { direction: -1 }), /before start/);
});

test("Surface planning lowers author Instants and Windows to typed graph operations", () => {
  const plan = compileTimelineAuthorFragment({
    id: "film",
    end: "latest(speech.end,outro.end)",
    declarations: [
      { id: "outro", kind: "window", from: "claim", duration: "3s" },
      { id: "claim", kind: "instant", at: "speech.end-12f" },
      { id: "speech", kind: "window", from: "start", extentInput: "voice-extent" },
    ],
  });
  assert.deepEqual(plan.outputNames.map((item) => item.suffix), [
    "timeline", "window", "start", "end",
    "outro", "outro.start", "outro.end", "claim", "speech", "speech.start", "speech.end",
  ]);
  assert(plan.fragment.operations.some((item) => item.producer.name === "latest-point"));
  assert(plan.fragment.operations.some((item) => item.id === "decl:claim:point"));
  assert.deepEqual(plan.extentInputs, [{ name: "voice-extent", declarationId: "speech" }]);
  assert.deepEqual(plan.inlineInputs.flatMap((item) => item.author === undefined ? [] : [{
    binding: item.author.binding, declarationId: item.author.declarationId,
    expression: item.author.expression?.kind,
  }]), [
    { binding: "for", declarationId: "outro", expression: undefined },
    { binding: "at", declarationId: "claim", expression: "offset" },
  ]);
  verifyGraphFragment(link(createResolvedClosure([
    timelineManifest,
    temporalManifest,
    timelineAuthorManifest,
  ]), []), plan.fragment);
});

test("typed graph verification rejects real cycles while named side anchors stay public", () => {
  const program = link(createResolvedClosure([timelineManifest, temporalManifest, timelineAuthorManifest]), []);
  const cyclic = compileTimelineAuthorFragment({
    id: "film",
    end: "a",
    declarations: [
      { id: "a", kind: "instant", at: "b" },
      { id: "b", kind: "instant", at: "a" },
    ],
  });
  assert.throws(() => verifyGraphFragment(program, cyclic.fragment), /cycles through/);

  const endCycle = compileTimelineAuthorFragment({
    id: "film",
    end: "tail.end",
    declarations: [{ id: "tail", kind: "window", until: "end", duration: "1s" }],
  });
  assert.throws(() => verifyGraphFragment(program, endCycle.fragment), /cycles through/);

  const sideAnchor = compileTimelineAuthorFragment({
    id: "film",
    end: "3s",
    declarations: [{ id: "cue", kind: "instant", at: "1s" }],
  });
  assert.doesNotThrow(() => verifyGraphFragment(program, sideAnchor.fragment));
});
