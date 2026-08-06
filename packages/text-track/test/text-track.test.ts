import assert from "node:assert/strict";
import test from "node:test";

import {
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
} from "@svml/contracts";
import { compileHyperframesDocument } from "@svml/hyperframes";
import { digestOf } from "@svml/protocol";
import {
  assertTextTrackProgramIdentity,
  renderTextTrack,
  sealTextTrackProgram,
} from "@svml/text-track";

const space = sealProgramSpace({
  contract: "svml.program-space@0",
  durationSec: 5,
  frameRate: { numerator: 30, denominator: 1 },
});

test("persistent and timed text are ordinary Presents in one VisualTrack", () => {
  const program = sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: "editorial-text",
    programSpaceDigest: space.digest,
    items: [
      {
        id: "watermark",
        text: "SVML",
        span: { startFrame: 0, endFrameExclusive: 150 },
        z: 90,
        tieBreak: "watermark",
        box: { xPercent: 70, yPercent: 4, widthPercent: 25, heightPercent: 8 },
        appearance: { color: "#ffffff", fontSizePx: 32, fontWeight: 700, align: "right" },
      },
      {
        id: "callout",
        text: "Intent, not timeline",
        span: { startFrame: 30, endFrameExclusive: 90 },
        z: 55,
        tieBreak: "callout",
        box: { xPercent: 10, yPercent: 65, widthPercent: 80, heightPercent: 12 },
        appearance: {
          color: "#111111",
          fontSizePx: 48,
          fontFamily: "Inter, sans-serif",
          fontWeight: 800,
          backgroundColor: "#f8ff66",
          borderRadiusPx: 18,
          paddingPx: 16,
        },
      },
    ],
  });
  assert.doesNotThrow(() => assertTextTrackProgramIdentity(program, space));
  const track = renderTextTrack(space, program);
  assert.deepEqual(track.presents.map((present) => present.id), ["watermark", "callout"]);
  assert.equal(track.presents[0]?.span.endFrameExclusive, 150);
  assert.equal(track.presents[1]?.span.endFrameExclusive, 90);

  const lower = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "lower",
    programSpaceDigest: space.digest,
    presents: [{
      id: "lower",
      span: { startFrame: 0, endFrameExclusive: 150 },
      stacking: { order: 40, tieBreak: "lower" },
      elements: [{ id: "root", kind: "box", order: 0, style: [] }],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: "text-film",
    programSpace: space,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track, lower],
  }));
  assert.match(document.html, /Intent, not timeline/u);
  assert.match(document.html, /font-family:Inter, sans-serif/u);
  assert.ok(document.html.indexOf('data-svml-present-id="lower"') < document.html.indexOf('data-svml-present-id="callout"'));
});

test("TextTrackProgram rejects a frame span outside its ProgramSpace", () => {
  const program = sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: "invalid-text",
    programSpaceDigest: space.digest,
    items: [{
      id: "late",
      text: "Too late",
      span: { startFrame: 149, endFrameExclusive: 151 },
      z: 1,
      tieBreak: "late",
      box: { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 10 },
      appearance: { color: "#ffffff", fontSizePx: 24 },
    }],
  });
  assert.throws(() => renderTextTrack(space, program), /outside ProgramSpace/u);
});
