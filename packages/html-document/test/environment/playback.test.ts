import assert from "node:assert/strict";
import test from "node:test";

import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisualElement } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import puppeteer from "puppeteer-core";

import { browserExecutablePath } from "../../../provider-html-local/src/browser.js";
import { compileHtmlDocument, materializeHtmlDocument } from "../../src/index.js";

test("standalone HTML Document prepares once across ready, seek, play and pause", async () => {
  const timeline = sealTimeline({ id: "document-playback", frameCount: 2,
    frameRate: { numerator: 2, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "picture", timelineId: timeline.id, presents: [{
    id: "picture",
    span: { startFrame: 0, endFrameExclusive: 2 },
    root: htmlVisualElement({ id: "fill", kind: "box", children: [], style: [
      { name: "position", value: "absolute" },
      { name: "inset", value: 0 },
      { name: "background", value: "#ff0000" },
    ] }),
  }] });
  const composition = sealComposition({ id: "document-playback", visual: {
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: { members: [{ kind: "track", id: track.id, track }] },
  }, audio: { contributions: [] } }, timeline);
  const html = materializeHtmlDocument(compileHtmlDocument(composition), () => {
    throw new Error("The fixture has no material resources");
  }, { autoplay: false, loop: false, muted: true, responsive: false });

  const browser = await puppeteer.launch({
    executablePath: process.env.HYPIT_TEST_CHROME_PATH ?? browserExecutablePath({}),
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error instanceof Error ? error.message : String(error)));
    await page.setContent(html, { waitUntil: "load" });
    const state = await page.evaluate(async () => {
      const documentPlayer = (window as unknown as { __hypitDocument: {
        readonly ready: Promise<void>;
        readonly frame: number;
        readonly playing: boolean;
        seekFrame(frame: number): Promise<void>;
        play(): Promise<void>;
        pause(): Promise<void>;
      } }).__hypitDocument;
      await documentPlayer.ready;
      await documentPlayer.seekFrame(1);
      await documentPlayer.play();
      await documentPlayer.pause();
      return { frame: documentPlayer.frame, playing: documentPlayer.playing };
    });
    assert.deepEqual(state, { frame: 1, playing: false });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
