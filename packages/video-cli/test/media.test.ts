import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CliIo } from "@hypit/cli";

import { probeMedia, runMediaCli, shotBoundaries, tileFrameCount } from "../src/media.js";

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

/** Three seconds of two flat colours with a hard cut at 1.5 s, 24 fps, no audio. */
async function sample(directory: string): Promise<string> {
  const path = join(directory, "sample.mp4");
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=320x240:r=24:d=1.5",
    "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=24:d=1.5",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", path,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return path;
}

test("tile frame counts follow the measured bounds", () => {
  assert.equal(tileFrameCount(0.5), 4);
  assert.equal(tileFrameCount(4), 6);
  assert.equal(tileFrameCount(30), 9);
});

test("media help names every command and no state", () => {
  const out = io();
  runMediaCli(["media"], out.io);
  for (const name of ["probe", "cut", "frames", "tile", "shots", "fetch"]) assert.match(out.text(), new RegExp(`hypit media ${name}`));
  assert.match(out.text(), /no state/);
});

test("probe, cut, frames, tile and shots read one file and write only what --to names", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
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

    const frames = io();
    await runMediaCli(["media", "frames", source, "--at", "0.2,2.5", "--to", "out/frames"], frames.io, work);
    const written = (await readdir(join(work, "out", "frames"))).sort();
    assert.deepEqual(written, ["frame-0_20s.jpg", "frame-2_50s.jpg"]);

    const every = io();
    await runMediaCli(["media", "frames", source, "--every", "1", "--to", "out/every", "--json"], every.io, work);
    assert.equal((JSON.parse(every.text()) as { frames: unknown[] }).frames.length, 3);

    const tile = io();
    await runMediaCli(["media", "tile", source, "--to", "out/grid.jpg", "--json"], tile.io, work);
    const grid = JSON.parse(tile.text()) as { frames: number; columns: number; rows: number; cellWidth: number };
    assert.equal(grid.frames, tileFrameCount(info.duration));
    assert.equal(grid.columns, 3);
    assert.equal(grid.cellWidth, 320, "a grid never enlarges a small source");
    assert.ok((await stat(join(work, "out", "grid.jpg"))).size > 0);

    const bounds = await shotBoundaries(source, info.duration);
    assert.equal(bounds.length, 2, JSON.stringify(bounds));
    assert.ok(Math.abs(bounds[1]!.start - 1.5) < 0.2, `cut found at ${bounds[1]!.start}`);
    const shots = io();
    await runMediaCli(["media", "shots", source], shots.io, work);
    assert.match(shots.text(), /2 pixel-jump stretches/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("fetch refuses anything but an http link and an explicit video destination", async () => {
  await assert.rejects(runMediaCli(["media", "fetch", "./local.mp4", "--to", "x.mp4"], io().io), /http or https link/);
  await assert.rejects(runMediaCli(["media", "fetch", "https://example.com/v", "--to", "x.txt"], io().io, tmpdir()), /must end in/);
});
