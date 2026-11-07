import assert from "node:assert/strict";
import test from "node:test";

import { compileHtmlPictureProgram } from "@hypit/html-program";
import { sealAudioProgram } from "@hypit/audio-program";
import { exactTemporalValueFromFrames } from "@hypit/temporal";
import puppeteer from "puppeteer-core";

import { browserExecutablePath } from "@hypit/html-chromium-local";
import { compileHtmlDocument, materializeHtmlDocument } from "../../src/index.js";

test("standalone HTML Document prepares once across ready, seek, play and pause", async () => {
  const frameRate = { numerator: 2, denominator: 1 };
  const program = compileHtmlPictureProgram({ id: "document-playback", frameRate, frameCount: 2,
    root: { id: "fill", kind: "box" as const, spans: [{ startFrame: 0, endFrameExclusive: 2 }], children: [], style: [
      { name: "position", value: "absolute" },
      { name: "inset", value: 0 },
      { name: "background", value: "#ff0000" },
    ] },
    canvas: { width: 64, height: 64, clearColor: "#000000" },
  });
  const audio = sealAudioProgram({
    domain: { id: "document-playback:audio", duration: exactTemporalValueFromFrames(2, { frameRate }) },
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "silence", id: "silence" }], output: { node: "silence" } },
  });
  const html = materializeHtmlDocument(compileHtmlDocument(program, audio), () => {
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
