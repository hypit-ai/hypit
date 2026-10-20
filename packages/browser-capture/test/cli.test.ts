import assert from "node:assert/strict";
import test from "node:test";
import { runCaptureCli } from "../src/cli.js";
import type { CliIo } from "@hypit/hypit/cli";

test("capture rejects incomplete or contradictory requests before browser work", async () => {
  const io: CliIo = { write: () => {}, setExitCode: () => {} };
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com"], io), /requires --to/);
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com", "--to", "x.png",
    "--full-page", "--selector", "main"], io), /Choose --full-page/);
  await assert.rejects(runCaptureCli(["capture", "screenshot", "https://example.com", "--to", "x.png",
    "--clip", "1,2,3"], io), /--clip needs/);
  await assert.rejects(runCaptureCli(["capture", "run", "x.mjs", "--to", "x.png"], io), /belongs to capture screenshot/);
});
