/**
 * Renders the notepad list through the local HyperFrames Runtime so the
 * composition can be looked at and compared against the reference without a
 * paid Provider and without a delivery Build.
 *
 *   node --import tsx test/render-still.ts <paper.png> <state> <frame> <out.png>
 *
 * `state` is `opening` or `w1`..`w5`: which window of the list to draw. `frame`
 * counts from the first frame of that window.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { sealComposition } from "@hypit/composition";
import { decodeOpenFontStackSurface } from "@hypit/fonts-open";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import type { FontStackRef } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import type { BlobRef, Digest } from "@hypit/protocol";
import { sealSpatialFrame } from "@hypit/spatial";
import type { SvsRecipe } from "@hypit/svs";

import { buildNotepadProgram, decodeNotepadStyle, renderNotepadList } from "../src/index.js";
import type { NotepadRowSpecSet, NotepadSchedule } from "../src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../../..");
const hyperframesCli = createRequire(path.join(repositoryRoot, "packages/provider-hyperframes-local/package.json"))
  .resolve("hyperframes/bin/hyperframes.mjs");

const WINDOW_FRAMES = 46;
const LEAD_FRAMES = 4;

const bytes = new Map<Digest, Uint8Array>();

function digestOf(value: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as Digest;
}

async function fontStack(family: string, weight: number, style: "normal" | "italic"): Promise<FontStackRef> {
  const output = await decodeOpenFontStackSurface({
    sourceName: "render-still.svml",
    element: {
      kind: "element",
      name: "fonts:Stack",
      attributes: { id: `${family}-${weight}-${style}`, family, weight: String(weight), style },
      children: [],
      range: { start: 0, end: 1 },
    },
    resolveReference: () => undefined,
    resolveAsset(request: { readonly bytes?: Uint8Array; readonly mediaType: string }) {
      if (request.bytes === undefined) throw new Error("font asset has no bytes");
      const copy = Uint8Array.from(request.bytes);
      const artifactDigest = digestOf(copy);
      bytes.set(artifactDigest, copy);
      return { artifact: { kind: "blob", digest: artifactDigest, size: copy.byteLength, mediaType: request.mediaType } };
    },
  } as never);
  const stored = (output as { records: readonly { value: { kind: string; value: unknown } }[] }).records[0]?.value;
  if (stored?.kind !== "inline") throw new Error("font stack did not resolve");
  return stored.value as FontStackRef;
}

const recipe: SvsRecipe = {
  path: "notepad.list",
  properties: JSON.parse(
    await readFile(path.join(import.meta.dirname, "notepad-recipe.json"), "utf8"),
  ) as Record<string, string | number>,
};

const rows: NotepadRowSpecSet = {
  rows: [
    { id: "row-instagram", rank: 5, label: "Instagram", mark: "none" },
    { id: "row-courses", rank: 4, label: "AI Courses", mark: "none" },
    { id: "row-youtube", rank: 3, label: "YouTube", mark: "none" },
    { id: "row-twitter", rank: 2, label: "Twitter/X", mark: "none" },
    { id: "row-rundown", rank: 1, label: "The Rundown", mark: "circle" },
  ],
};

/**
 * The shortest schedule that still reaches the requested state: every earlier
 * window is collapsed to a few frames so only the window under inspection is
 * rendered at length.
 */
function scheduleFor(state: string): { readonly schedule: NotepadSchedule; readonly windowStart: number; readonly total: number } {
  const rowIds = rows.rows.map((row) => row.id);
  if (state === "opening") {
    const total = WINDOW_FRAMES + rowIds.length * LEAD_FRAMES;
    return {
      schedule: {
        id: "board",
        opening: { startFrame: 0, endFrameExclusive: WINDOW_FRAMES },
        windows: rowIds.map((_, index) => ({
          startFrame: WINDOW_FRAMES + index * LEAD_FRAMES,
          endFrameExclusive: WINDOW_FRAMES + (index + 1) * LEAD_FRAMES,
        })),
        terminalFrame: total,
        entries: rowIds.map((rowId, index) => ({ rowId, triggerFrame: WINDOW_FRAMES + index * LEAD_FRAMES })),
      },
      windowStart: 0,
      total,
    };
  }
  const index = Number(state.replace(/^w/u, "")) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= rowIds.length) {
    throw new Error(`unknown state ${state}`);
  }
  const windowStart = index * LEAD_FRAMES;
  const total = windowStart + WINDOW_FRAMES;
  return {
    schedule: {
      id: "board",
      windows: [
        ...rowIds.slice(0, index).map((_, earlier) => ({
          startFrame: earlier * LEAD_FRAMES,
          endFrameExclusive: (earlier + 1) * LEAD_FRAMES,
        })),
        { startFrame: windowStart, endFrameExclusive: total },
      ],
      terminalFrame: total,
      entries: rowIds.map((rowId, position) => ({
        rowId,
        triggerFrame: position <= index ? position * LEAD_FRAMES : windowStart + WINDOW_FRAMES - (rowIds.length - position),
      })),
    },
    windowStart,
    total,
  };
}

async function main(): Promise<void> {
  const [paperPath, state, frameArgument, outputPath] = process.argv.slice(2);
  if (paperPath === undefined || state === undefined || frameArgument === undefined || outputPath === undefined) {
    throw new Error("usage: render-still.ts <paper.png> <state> <frame> <out.png>");
  }
  const paperBytes = Uint8Array.from(await readFile(paperPath));
  const paperDigest = digestOf(paperBytes);
  bytes.set(paperDigest, paperBytes);
  const paper: BlobRef = {
    kind: "blob", digest: paperDigest, size: paperBytes.byteLength, mediaType: "image/png",
  };

  const style = decodeNotepadStyle(recipe, {
    lead: await fontStack("playfair-display", 600, "italic"),
    emphasis: await fontStack("inter", 700, "normal"),
    row: await fontStack("kalam", 400, "normal"),
    number: await fontStack("kalam", 300, "normal"),
  });

  const planned = scheduleFor(state);
  const frame = sealSpatialFrame({ xPx: 0, yPx: 0, widthPx: 1080, heightPx: 1920 });
  const program = buildNotepadProgram(
    { id: "board" }, frame, paper, planned.schedule, style,
    { lead: "Top 5 Most Popular Ways to ", emphasis: "learn AI" }, rows,
  );
  const space = sealProgramSpace({
    durationSec: planned.total / 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const track = renderNotepadList(space, program);

  const temporary = await mkdtemp(path.join(os.tmpdir(), "notepad-still-"));
  try {
    const document = compileHyperframesDocument(sealComposition({
      id: "notepad-still",
      canvas: { width: 1080, height: 1920, clearColor: "#101014" },
      tracks: [track],
    }), space);
    const names = new Map<string, string>();
    let index = 0;
    for (const artifact of document.artifacts) {
      const value = bytes.get(artifact.digest);
      if (value === undefined) throw new Error(`unknown artifact ${artifact.digest}`);
      const name = `asset-${index++}${artifact.mediaType.startsWith("image/") ? ".png" : ".ttf"}`;
      names.set(artifact.digest, `./${name}`);
      await writeFile(path.join(temporary, name), value);
    }
    await writeFile(
      path.join(temporary, "index.html"),
      materializeHyperframesHtml(document, (artifact) => {
        const name = names.get(artifact.digest);
        if (name === undefined) throw new Error(`unmapped artifact ${artifact.digest}`);
        return name;
      }),
    );
    const frames = path.join(temporary, "frames");
    await mkdir(frames);
    const render = spawnSync(process.execPath, [
      hyperframesCli, "render", temporary,
      "--format", "png-sequence", "--output", frames,
      "--fps", "30", "--workers", "4",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { encoding: "utf8", timeout: 900_000 });
    if (render.status !== 0) throw new Error(`${render.stdout}\n${render.stderr}`);
    const produced = (await readdir(frames)).filter((name) => name.endsWith(".png")).sort();
    const wanted = produced[planned.windowStart + Number(frameArgument)];
    if (wanted === undefined) throw new Error(`frame out of range; ${produced.length} rendered`);
    await copyFile(path.join(frames, wanted), outputPath);
    process.stdout.write(`${outputPath} (${produced.length} frames rendered)\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await main();
