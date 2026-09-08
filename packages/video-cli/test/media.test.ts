import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import type { CliIo } from "@hypit/cli";

import { probeMedia, runMediaCli, tileFrameCount, tileSampleTimes, visualBoundaries } from "../src/media.js";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function io(): { readonly io: CliIo; text: () => string } {
  let out = "";
  return {
    io: {
      write: (chunk) => { out += chunk; },
      setExitCode: () => {},
      readSecret: async () => "",
      terminal: { isTTY: false, color: false, unicode: false, columns: 100 },
    },
    text: () => out,
  };
}

/** Three seconds with three sub-second cuts, 24 fps and no audio. */
async function sample(directory: string): Promise<string> {
  const path = join(directory, "sample.mp4");
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=green:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=white:s=320x240:r=24:d=1.5",
    "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", path,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return path;
}

test("tile frame counts follow the measured bounds", () => {
  assert.equal(tileFrameCount(0.5), 4);
  assert.equal(tileFrameCount(4), 6);
  assert.equal(tileFrameCount(30), 9);
  assert.deepEqual(tileSampleTimes(1, 2, 4), [1.125, 1.375, 1.625, 1.875]);
});

test("media help names every command and no state", () => {
  const out = io();
  runMediaCli(["media"], out.io);
  for (const name of ["probe", "cut", "frames", "tile", "tiles", "boundaries", "fetch"]) assert.match(out.text(), new RegExp(`hypit media ${name}`));
  assert.match(out.text(), /no state/);
});

test("media evidence keeps source times and sub-second visual changes", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-media-"));
  try {
    const source = await sample(work);
    const info = await probeMedia(source);
    assert.equal(info.width, 320);
    assert.equal(info.height, 240);
    assert.equal(info.hasAudio, false);
    assert.ok(Math.abs(info.duration - 3) < 0.1, `duration ${info.duration}`);

    const probe = io();
    await runMediaCli(["media", "probe", source, "--json"], probe.io, work);
    assert.equal((JSON.parse(probe.text()) as { width: number }).width, 320);

    const cut = io();
    await runMediaCli(["media", "cut", source, "--start", "0.5", "--end", "2", "--to", "out/piece.mp4"], cut.io, work);
    const piece = await probeMedia(join(work, "out", "piece.mp4"));
    assert.ok(Math.abs(piece.duration - 1.5) < 0.15, `cut duration ${piece.duration}`);
    await assert.rejects(
      runMediaCli(["media", "cut", source, "--start", "0", "--end", "1", "--to", "out/piece.mp4"], io().io, work),
      /already exists/,
    );
    const labeledCut = io();
    await runMediaCli(["media", "cut", source, "--start", "0.5", "--end", "1", "--label-time", "--to", "out/labeled.mp4", "--json"], labeledCut.io, work);
    assert.equal((JSON.parse(labeledCut.text()) as { labeled: boolean }).labeled, true);

    const frames = io();
    await runMediaCli(["media", "frames", source, "--at", "0.2,2.5", "--to", "out/frames"], frames.io, work);
    const written = (await readdir(join(work, "out", "frames"))).sort();
    assert.deepEqual(written, ["frame-0_200s.jpg", "frame-2_500s.jpg"]);

    const every = io();
    await runMediaCli(["media", "frames", source, "--every", "1", "--label-time", "--to", "out/every", "--json"], every.io, work);
    const everyView = JSON.parse(every.text()) as { labeled: boolean; frames: unknown[] };
    assert.equal(everyView.frames.length, 3);
    assert.equal(everyView.labeled, true);

    const tile = io();
    await runMediaCli(["media", "tile", source, "--at", "0.2,1.1,2.5", "--columns", "2", "--to", "out/grid.jpg", "--json"], tile.io, work);
    const grid = JSON.parse(tile.text()) as { samples: number[]; columns: number; rows: number; cellWidth: number };
    assert.deepEqual(grid.samples, [0.2, 1.1, 2.5]);
    assert.equal(grid.columns, 2);
    assert.equal(grid.rows, 2);
    assert.equal(grid.cellWidth, 320, "a grid never enlarges a small source");
    assert.ok((await stat(join(work, "out", "grid.jpg"))).size > 0);

    const ranges = join(work, "ranges.json");
    await writeFile(ranges, JSON.stringify([
      { id: "opening", start: 0, end: 0.8, frames: 3 },
      { start: 1.5, end: 3 },
    ]));
    const tiles = io();
    await runMediaCli(["media", "tiles", source, "--ranges", ranges, "--to", "out/grids", "--json"], tiles.io, work);
    const grids = (JSON.parse(tiles.text()) as { grids: { samples: number[]; path: string }[] }).grids;
    assert.equal(grids.length, 2);
    assert.equal(grids[0]!.samples.length, 3);
    assert.deepEqual((await readdir(join(work, "out", "grids"))).sort(), ["001-opening.jpg", "002-1_500s-3_000s.jpg"]);

    const changes = await visualBoundaries(source);
    assert.ok(changes.some((item) => Math.abs(item.at - 0.5) < 0.1), JSON.stringify(changes));
    assert.ok(changes.some((item) => Math.abs(item.at - 1) < 0.1), JSON.stringify(changes));
    assert.ok(changes.some((item) => Math.abs(item.at - 1.5) < 0.1), JSON.stringify(changes));
    const boundaries = io();
    await runMediaCli(["media", "boundaries", source], boundaries.io, work);
    assert.match(boundaries.text(), /visual-change candidates/);
    assert.match(boundaries.text(), /scores are not shot labels/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("fetch refuses anything but an http link and an explicit video destination", async () => {
  await assert.rejects(runMediaCli(["media", "fetch", "./local.mp4", "--to", "x.mp4"], io().io), /http or https link/);
  await assert.rejects(runMediaCli(["media", "fetch", "https://example.com/v", "--to", "x.txt"], io().io, tmpdir()), /must end in/);
});

test("word-located grids paginate dense samples without covering the source picture", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-word-grids-"));
  try {
    const source = await sample(work);
    const transcript = join(work, "words.json");
    await writeFile(transcript, JSON.stringify({ format: "hypit.transcript@1", passages: [{ words: [
      { text: "Hello", start_seconds: 0.1, end_seconds: 0.4 },
      { text: "world!", start_seconds: 0.4, end_seconds: 0.8 },
      { text: "<你好 & café>" },
      { text: "Hello", start_seconds: 2.1, end_seconds: 2.4 },
      { text: "world!", start_seconds: 2.4, end_seconds: 2.8 },
    ] }] }));
    await assert.rejects(runMediaCli(["media", "tile", source, "--around", "hello world", "--transcript", transcript,
      "--to", "ambiguous.jpg"], io().io, work), /occurs 2 times.*--occurrence/);
    const around = io();
    await runMediaCli(["media", "tile", source, "--around", "hello world", "--occurrence", "2", "--padding", "0.1",
      "--every", "0.2", "--transcript", transcript, "--to", "around.jpg", "--json"], around.io, work);
    const located = JSON.parse(around.text());
    assert.deepEqual(located.samples, [2, 2.2, 2.4, 2.6, 2.8]);
    assert.deepEqual(located.frames[0].words.active, []);
    assert.equal(located.frames[1].words.active[0].text, "Hello");
    assert.equal(located.frames[1].requestedAt, 2.2);
    assert.ok(Math.abs(located.frames[1].at - 53 / 24) < 0.000001, "labels use the decoded frame time, not the requested seek time");
    assert.equal(located.frames[2].words.active[0].text, "world!");

    const pages = io();
    await runMediaCli(["media", "tiles", source, "--start", "0", "--end", "3", "--every", "0.6",
      "--transcript", transcript, "--columns", "2", "--rows", "1", "--to", "pages", "--json"], pages.io, work);
    const grids = JSON.parse(pages.text()).grids;
    assert.deepEqual(grids.map((grid: { samples: number[] }) => grid.samples), [[0, 0.6], [1.2, 1.8], [2.4]]);
    assert.ok(grids.every((grid: { start: number; end: number }) => grid.start === 0 && grid.end === 3));
    assert.equal((await readdir(join(work, "pages"))).length, 3);
    const image = await sharp(grids[0].path).raw().toBuffer({ resolveWithObject: true });
    const center = (128 * image.info.width + 168) * image.info.channels;
    assert.ok(image.data[center]! > 220 && image.data[center + 1]! < 20, "the first source frame stays red and unobscured");
    assert.ok(image.info.height > 240 + 32, "word annotations have their own space beneath the picture");

    const frames = io();
    await runMediaCli(["media", "frames", source, "--start", "0.5", "--end", "1.5", "--every", "0.4",
      "--transcript", transcript, "--to", "frames", "--json"], frames.io, work);
    assert.deepEqual(JSON.parse(frames.text()).frames.map((frame: { requestedAt: number }) => frame.requestedAt), [0.5, 0.9, 1.3]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
