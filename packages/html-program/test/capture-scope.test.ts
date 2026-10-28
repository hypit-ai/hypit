import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

import { presentationCaptureScopeRuntime } from "../src/capture-scope.js";
import { frameSelectionRuntime } from "../src/frame-work.js";

test("compiled capture scope retains selected roots and makes unrelated media inert", () => {
  const { document } = parseHTML(`<!doctype html><body>
    <svg id="definitions" data-hypit-document-definitions></svg>
    <div id="early" data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="30">
      <img id="early-image" data-hypit-artifact-src="early.png" srcset="early-2x.png 2x"/>
      <video id="early-video" data-hypit-artifact-src="early.mp4" poster="early.jpg"></video>
      <svg><image id="early-svg" data-hypit-artifact-href="early.svg"/></svg>
    </div>
    <div id="selected" data-hypit-capture-root data-hypit-contribution-start-frame="90" data-hypit-contribution-end-frame="120">
      <img id="selected-image" data-hypit-artifact-src="selected.png"/>
      <video id="selected-media" data-hypit-source-frame="media" data-hypit-artifact-src="media.mp4"></video>
      <video id="selected-surface" data-hypit-source-frame="0/1" data-hypit-sampling-part="1" data-hypit-artifact-src="surface.mp4"></video>
      <svg><image id="selected-svg" data-hypit-artifact-href="selected.svg"/></svg>
    </div>
  </body>`);
  const early = document.getElementById("early")!;
  const earlyImage = document.getElementById("early-image")!;
  const earlyVideo = document.getElementById("early-video")!;
  const earlySvg = document.getElementById("early-svg")!;
  const context: { document: Document; __hypitCaptureRoots?: readonly Element[] } = { document };
  runInNewContext(`${frameSelectionRuntime}
    ${presentationCaptureScopeRuntime}
    htmlPrepareFrameSelection([{ startFrame: 100, endFrameExclusive: 101 }]);
    for (const initialize of htmlFrameProgramInitializers) initialize();`, context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.__hypitCaptureRoots?.map(root => root.id))), ["definitions", "selected"]);
  assert.equal(early.style.getPropertyValue("display"), "none");
  assert.equal(early.isConnected, false);
  assert.equal(document.getElementById("early"), null);
  for (const element of [earlyImage, earlyVideo, earlySvg]) {
    assert.equal(element.hasAttribute("src"), false);
    assert.equal(element.hasAttribute("href"), false);
  }
  assert.equal(earlyImage.hasAttribute("srcset"), false);
  assert.equal(earlyVideo.hasAttribute("poster"), false);
  assert.equal(document.getElementById("selected-image")!.getAttribute("src"), "selected.png");
  assert.equal(document.getElementById("selected-image")!.hasAttribute("data-hypit-artifact-src"), false);
  for (const id of ["selected-media", "selected-surface"]) {
    assert.equal(document.getElementById(id)!.hasAttribute("src"), false);
    assert.equal(document.getElementById(id)!.getAttribute("data-hypit-artifact-src"), `${id.slice(9)}.mp4`);
  }
  assert.equal(document.getElementById("selected-svg")!.getAttribute("href"), "selected.svg");
  assert.equal(document.getElementById("selected-svg")!.hasAttribute("data-hypit-artifact-href"), false);
});

test("compiled capture scope removes unselected contribution descendants from generic live-DOM discovery", () => {
  const { document } = parseHTML(`<!doctype html><body>
    <div id="selected" data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="30"><span></span></div>
    <div id="unselected" data-hypit-capture-root data-hypit-contribution-start-frame="30" data-hypit-contribution-end-frame="60">
      ${"<span><i></i></span>".repeat(200)}
    </div>
  </body>`);
  const before = document.querySelectorAll("*").length;
  const context: { document: Document; __hypitCaptureRoots?: readonly Element[] } = { document };
  runInNewContext(`${frameSelectionRuntime}
    ${presentationCaptureScopeRuntime}
    htmlPrepareFrameSelection([{ startFrame: 0, endFrameExclusive: 1 }]);
    for (const initialize of htmlFrameProgramInitializers) initialize();`, context);

  assert.ok(before >= 400);
  assert.equal(document.getElementById("unselected"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__hypitCaptureRoots?.map(root => root.id))), ["selected"]);
  assert.ok(document.querySelectorAll("*").length <= 5);
});

test("compiled capture scope defaults to every contribution outside a render selection", () => {
  const { document } = parseHTML(`<!doctype html><body>
    <div id="one" data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="30">
      <img data-hypit-artifact-src="one.png"/>
      <video data-hypit-source-frame="media" data-hypit-artifact-src="one.mp4"></video>
    </div>
    <div id="two" data-hypit-capture-root data-hypit-contribution-start-frame="30" data-hypit-contribution-end-frame="60"><img data-hypit-artifact-src="two.png"/></div>
  </body>`);
  const context: { document: Document; __hypitCaptureRoots?: readonly Element[] } = { document };
  runInNewContext(`${frameSelectionRuntime}
    ${presentationCaptureScopeRuntime}
    htmlPrepareFrameSelection();
    for (const initialize of htmlFrameProgramInitializers) initialize();`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__hypitCaptureRoots?.map(root => root.id))), ["one", "two"]);
  assert.equal(document.querySelector("[data-hypit-capture-excluded]"), null);
  assert.deepEqual(Array.from(document.querySelectorAll("img")).map(image => image.getAttribute("src")), ["one.png", "two.png"]);
  assert.equal(document.querySelector("video")!.getAttribute("src"), "one.mp4");
});

test("compiled capture scope preserves nested process inputs as one structural root", () => {
  const { document } = parseHTML(`<!doctype html><body>
    <div id="process" data-hypit-capture-root data-hypit-contribution-start-frame="20" data-hypit-contribution-end-frame="30">
      <div id="outgoing" data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="30">
        <img id="outgoing-image" data-hypit-artifact-src="outgoing.png"/>
      </div>
      <div id="incoming" data-hypit-contribution-start-frame="20" data-hypit-contribution-end-frame="50">
        <img id="incoming-image" data-hypit-artifact-src="incoming.png"/>
      </div>
    </div>
  </body>`);
  const context: { document: Document; __hypitCaptureRoots?: readonly Element[] } = { document };
  runInNewContext(`${frameSelectionRuntime}
    ${presentationCaptureScopeRuntime}
    htmlPrepareFrameSelection([{ startFrame: 25, endFrameExclusive: 26 }]);
    for (const initialize of htmlFrameProgramInitializers) initialize();`, context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.__hypitCaptureRoots?.map(root => root.id))), ["process"]);
  assert.notEqual(document.getElementById("outgoing"), null);
  assert.notEqual(document.getElementById("incoming"), null);
  assert.equal(document.getElementById("outgoing-image")!.getAttribute("src"), "outgoing.png");
  assert.equal(document.getElementById("incoming-image")!.getAttribute("src"), "incoming.png");
});
