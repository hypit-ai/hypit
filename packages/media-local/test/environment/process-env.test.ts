import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import test from "node:test";

import { mediaProcessEnv } from "../../src/process-env.js";

test("media processes inherit PATH without the rest of the Host environment", () => {
  const previous = process.env.HYPIT_MEDIA_ENV_PROBE;
  process.env.HYPIT_MEDIA_ENV_PROBE = "secret";
  try {
    const env = mediaProcessEnv();
    assert.equal(env.PATH, process.env.PATH ?? "");
    assert.equal(env.HYPIT_MEDIA_ENV_PROBE, undefined);
    const previousTemp = process.env.TEMP;
    process.env.TEMP = "C:\\Windows\\Temp";
    try {
      const windows = mediaProcessEnv(undefined, "win32");
      assert.equal(windows.TEMP, "C:\\Windows\\Temp");
      assert.equal(windows.HYPIT_MEDIA_ENV_PROBE, undefined);
    } finally {
      if (previousTemp === undefined) delete process.env.TEMP;
      else process.env.TEMP = previousTemp;
    }
    if (process.platform === "win32") {
      if (process.env.SYSTEMROOT !== undefined) assert.equal(env.SYSTEMROOT, process.env.SYSTEMROOT);
      if (process.env.PATHEXT !== undefined) assert.equal(env.PATHEXT, process.env.PATHEXT);
    }
    const report = spawnSync(basename(process.execPath), ["-e", "process.stdout.write(JSON.stringify({ secret: process.env.HYPIT_MEDIA_ENV_PROBE, path: Boolean(process.env.PATH), systemRoot: Boolean(process.env.SYSTEMROOT) }))"], {
      env,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(report.status, 0, report.stderr);
    const body = JSON.parse(report.stdout) as { secret?: string; path: boolean; systemRoot: boolean };
    assert.equal(body.secret, undefined);
    assert.equal(body.path, true);
    if (process.platform === "win32") assert.equal(body.systemRoot, true);
  } finally {
    if (previous === undefined) delete process.env.HYPIT_MEDIA_ENV_PROBE;
    else process.env.HYPIT_MEDIA_ENV_PROBE = previous;
  }
});

test("media binaries can start by PATH under the reduced media environment", {
  skip: ["ffmpeg", "ffprobe"].some(command => spawnSync(command, ["-version"], { stdio: "ignore", windowsHide: true }).status !== 0),
}, () => {
  for (const command of ["ffmpeg", "ffprobe"]) {
    const child = spawnSync(command, ["-version"], { env: mediaProcessEnv(), encoding: "utf8", windowsHide: true });
    assert.equal(child.status, 0, `${command}: ${child.error?.message ?? child.stderr}`);
    assert.ok(child.stdout.startsWith(`${command} version`));
  }
});
