import { compileHyperframesDocument } from "@narratage/hyperframes";
import {
  appendSelectedTextItem,
  createTextTrackSet,
  finalizeTextTrack,
  assertTextTrackProgramIdentity,
  renderTextTrack,
  sealTextTrackProgram,
  sealTextItemSpec,
  sealTextTrackHeader,
} from "@narratage/text-track";
import type { NarrativeSelectionRef } from "@narratage/narrative";
import { sealProgramSpace } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { sealComposition, sealVisualTrack } from "@narratage/composition";
import type { VisualTrack } from "@narratage/composition";
import assert from "node:assert/strict";
import test from "node:test";


const space = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 5,
  frameRate: { numerator: 30, denominator: 1 },
});

test("persistent and timed text are ordinary Presents in one VisualTrack", () => {
  const program = sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: "editorial-text",
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
    visualIr: "svml.visual-ir@1",
    id: "lower",
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
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track, lower],
  }), space);
  assert.match(document.html, /Intent, not timeline/u);
  assert.match(document.html, /font-family:Inter, sans-serif/u);
  assert.ok(document.html.indexOf('data-svml-present-id="lower"') < document.html.indexOf('data-svml-present-id="callout"'));
});

test("TextTrackProgram rejects a frame span outside its ProgramSpace", () => {
  const program = sealTextTrackProgram({
    contract: "svml.text-track-program@1",
    id: "invalid-text",
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

test("a selected Text Item is located only through explicit Selection and SemanticMap edges", () => {
  const mapContent = {
    contract: "svml.complete-semantic-map@1" as const,
    quantizationPolicy: "nearest-frame" as const,
    durationSec: 5,
    segments: [{
      segmentId: "opening", startSec: 0, endSec: 3, startFrame: 0, endFrame: 90,
    }],
    tokens: [0, 1, 2].map((index) => ({
      tokenId: `token-${index}`,
      segmentId: "opening",
      startSec: index,
      endSec: index + 1,
      startFrame: index * 30,
      endFrame: (index + 1) * 30,
    })),
    anchors: [],
    groups: [],
  };
  const map: CompleteSemanticMap = mapContent;
  const selectionContent = {
    contract: "svml.narrative-selection@1" as const,
    id: "callout",
    occurrences: [{
      occurrence: 1,
      open: { affinity: "right" as const, boundary: { tokenIndex: 1, structuralPosition: 1, segmentId: "opening" } },
      close: { affinity: "left" as const, boundary: { tokenIndex: 2, structuralPosition: 2, segmentId: "opening" } },
    }],
  };
  const selection: NarrativeSelectionRef = selectionContent;
  const header = sealTextTrackHeader({ contract: "svml.text-track-header@1", id: "selected-text" });
  const spec = sealTextItemSpec({
    contract: "svml.text-item-spec@1",
    id: "meaning",
    text: "MEANING",
    z: 80,
    box: { xPercent: 10, yPercent: 10, widthPercent: 80, heightPercent: 10 },
    appearance: { color: "#ffffff", fontSizePx: 48 },
  });
  const program = finalizeTextTrack(header, appendSelectedTextItem(
    createTextTrackSet(),
    header,
    map,
    selection,
    space,
    spec,
  ));
  assert.deepEqual(program.items.map((item) => item.span), [{ startFrame: 30, endFrameExclusive: 60 }]);
});
