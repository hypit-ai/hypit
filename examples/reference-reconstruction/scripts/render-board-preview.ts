/**
 * Local, Provider-free render of the lined-paper ranking board to a PNG still.
 * Builds the board Program directly (bypassing the paid schedule/alignment path)
 * and compiles it through the local HyperFrames Runtime, exactly as
 * packages/hyperframes/test/browser-visual.test.ts does.
 *
 * Run with:  node --import tsx examples/reference-reconstruction/scripts/render-board-preview.ts
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { sealProgramSpace } from "@hypit/program-space";
import { sealComposition } from "@hypit/composition";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import { decodeOpenFontFaceSurface } from "@hypit/fonts-open";
import type { FontArtifactRef } from "@hypit/media";
import type { SvsRecipe } from "@hypit/svs";

import {
  buildLinerankProgram,
  renderLinerankBoard,
} from "@hypit/local-linerank";
import { decodeLinerankStyle } from "@hypit/local-linerank";

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const hyperframesCli = createRequire(path.join(process.cwd(), "packages/provider-hyperframes-local/package.json"))
  .resolve("hyperframes/bin/hyperframes.mjs");

async function installedOpenFont(
  family: string,
  weight: number,
  style: "normal" | "italic",
): Promise<{ readonly font: FontArtifactRef; readonly bytes: ReadonlyMap<string, Uint8Array> }> {
  const bytes = new Map<string, Uint8Array>();
  const output = await decodeOpenFontFaceSurface({
    sourceName: "render-board-preview.svml",
    element: {
      kind: "element",
      name: "fonts:Face",
      attributes: { id: `${family}-${weight}-${style}`, family, weight: String(weight), style },
      children: [],
      range: { start: 0, end: 1 },
    },
    resolveReference: () => undefined,
    resolveAsset(request) {
      if (request.bytes === undefined) throw new Error(`Open font ${family} resolved without bytes.`);
      const copy = Uint8Array.from(request.bytes);
      const artifactDigest = digest(copy);
      bytes.set(artifactDigest, copy);
      return {
        artifact: {
          kind: "blob",
          digest: artifactDigest,
          size: copy.byteLength,
          mediaType: request.mediaType,
        },
      };
    },
  });
  const stored = output.records[0]?.value;
  if (stored?.kind !== "inline") throw new Error("Open font did not resolve inline.");
  return { font: stored.value as FontArtifactRef, bytes };
}

async function main() {
  const { font, bytes } = await installedOpenFont("shadows-into-light", 400, "normal");

  const recipe: SvsRecipe = {
    path: "studio.linerank.board",
    properties: {
      "paper-background": "#F7F7F4", "rule-color": "#D8DEE6", "rule-gap": 64,
      "title-size": 40, "title-weight": 700, "title-color": "#111111", "title-line-height": 1.15,
      "number-size": 34, "number-weight": 600, "number-color": "#222222",
      "label-size": 38, "label-weight": 500, "label-color": "#111111", "label-line-height": 1.2,
      "top-padding": 188, "left-padding": 56, "right-padding": 40,
      "row-height": 74, "row-gap": 12, "number-width": 66,
      "type-frames-per-char": 4,
      "circle-color": "#111111", "circle-width": 4, "circle-frames": 20,
      "board-stack": 20, "row-stack": 30, "circle-stack": 40,
    },
  };
  const style = decodeLinerankStyle(recipe, font);

  // 720x1280 at 30fps; five board windows mirroring the reference's five appearances.
  const space = sealProgramSpace({ durationSec: 45, frameRate: { numerator: 30, denominator: 1 } });
  const frame = { xPx: 0, yPx: 0, widthPx: 720, heightPx: 1280 };

  const windows = [
    { startFrame: 85, endFrameExclusive: 125 },
    { startFrame: 283, endFrameExclusive: 321 },
    { startFrame: 488, endFrameExclusive: 521 },
    { startFrame: 667, endFrameExclusive: 680 },
    { startFrame: 944, endFrameExclusive: 975 },
  ];
  const entries = [
    { itemId: "item-5", rank: 5, triggerFrame: 85 },
    { itemId: "item-4", rank: 4, triggerFrame: 283 },
    { itemId: "item-3", rank: 3, triggerFrame: 488 },
    { itemId: "item-2", rank: 2, triggerFrame: 667 },
    { itemId: "item-1", rank: 1, triggerFrame: 944 },
  ];
  const schedule = { id: "board", windows, terminalFrame: 962, entries };
  const items = [
    { id: "item-5", rank: 5, label: "Instagram" },
    { id: "item-4", rank: 4, label: "AI Courses" },
    { id: "item-3", rank: 3, label: "YouTube" },
    { id: "item-2", rank: 2, label: "Twitter/X" },
    { id: "item-1", rank: 1, label: "The Rundown" },
  ];
  const program = buildLinerankProgram(
    { id: "board" },
    frame,
    schedule,
    style,
    "Top 5 Most Popular Ways to learn AI",
    { items },
  );
  const track = renderLinerankBoard(space, program);

  const composition = sealComposition({
    id: "board-proof",
    canvas: { width: 720, height: 1280, clearColor: "#09090B" },
    tracks: [track],
  });
  const document = compileHyperframesDocument(composition, space);
  const html = materializeHyperframesHtml(document, (artifact) => {
    const name = `${artifact.digest.replace(/[^a-zA-Z0-9]/g, "")}.woff2`;
    return `./${name}`;
  });

  const temp = path.join(process.cwd(), "examples/reference-reconstruction/.render-board");
  await mkdir(path.join(temp, "frames"), { recursive: true });
  for (const [artifactDigest, fileBytes] of bytes) {
    const name = `${artifactDigest.replace(/[^a-zA-Z0-9]/g, "")}.woff2`;
    await writeFile(path.join(temp, name), fileBytes);
  }
  await writeFile(path.join(temp, "index.html"), html);

  const result = spawnSync(process.execPath, [
    hyperframesCli, "render", temp,
    "--format", "png-sequence",
    "--output", path.join(temp, "frames"),
    "--fps", "30",
    "--workers", "1",
    "--no-browser-gpu",
    "--no-best-effort",
    "--quiet",
  ], { encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(`Hyperframes render failed:\n${result.stdout}\n${result.stderr}`);
  }
  console.log("RENDER_OK", result.stdout.split("\n").slice(0, 5).join(" "));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
