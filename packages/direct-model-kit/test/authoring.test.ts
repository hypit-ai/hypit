import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../../../", import.meta.url));
for (const example of ["images", "video", "chain"])
  test(`direct ${example} Run compiles through the unmodified Hypit CLI`, () => {
    const output = execFileSync(
      process.execPath,
      [
        "bin/hypit.mjs",
        "check",
        `examples/direct-providers/${example}.svrun`,
        "--workspace",
        "examples/direct-providers",
      ],
      { cwd, encoding: "utf8", timeout: 20000 },
    );
    assert.match(output, /Run source is valid/);
  });

// Credentials may be absent in CI; inspect provider resolution independently of auth preflight.
test("image-to-video planning resolves both providers before the upstream image exists", () => {
  const result = spawnSync(
    process.execPath,
    [
      "bin/hypit.mjs",
      "plan",
      "examples/direct-providers/chain.svrun",
      "--workspace",
      "examples/direct-providers",
      "--runtime",
      "examples/direct-providers/hypit.runtime.json",
      "--json",
    ],
    { cwd, encoding: "utf8", timeout: 20000 },
  );
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.providerRequestCount, 2);
  assert.equal(plan.unsupportedRequestCount, 0);
});
