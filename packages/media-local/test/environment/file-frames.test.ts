import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeMediaFrames } from "../../src/file-frames.js";
import { runMediaCli } from "../../src/files.js";

test("native evidence preserves variable-rate timestamps and half-open bounds across grid pages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-native-frames-test-"));
  try {
    const source = join(directory, "vfr.mkv");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=10:duration=0.4",
      "-vf", "setpts=if(lt(N\\,2)\\,N\\,N*2-1)/(10*TB)", "-fps_mode", "vfr", "-c:v", "libx264", source], { encoding: "utf8" });
    assert.equal(encoded.status, 0, encoded.stderr);
    const all = await decodeMediaFrames(source, 0, 0.6, join(directory, "all"));
    assert.deepEqual(all.map(frame => frame.at), [0, 0.1, 0.3, 0.5]);
    const selected = await decodeMediaFrames(source, 0.05, 0.5, join(directory, "selected"));
    assert.deepEqual(selected.map(frame => frame.at), [0.1, 0.3]);
    assert.equal((await readdir(join(directory, "selected"))).length, 2);
    let output = "";
    await runMediaCli(["media", "tiles", source, "--start", "0", "--end", "0.6", "--every-frame", "--columns", "2", "--rows", "1",
      "--to", "grids", "--json"], { write: text => { output += text; } }, directory);
    const grids = JSON.parse(output).grids;
    assert.deepEqual(grids.map((grid: { frames: { at: number }[] }) => grid.frames.map(frame => frame.at)), [[0, 0.1], [0.3, 0.5]]);
    assert.equal((await readdir(join(directory, "grids"))).length, 2);
    output = "";
    await runMediaCli(["media", "frames", source, "--start", "0.05", "--end", "0.5", "--every-frame", "--to", "files", "--json"],
      { write: text => { output += text; } }, directory);
    assert.deepEqual(JSON.parse(output).frames.map((frame: { at: number }) => frame.at), [0.1, 0.3]);
    await assert.rejects(runMediaCli(["media", "tiles", source, "--every-frame", "--every", "0.1", "--to", "bad"], { write() {} }, directory), /cannot be combined/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
