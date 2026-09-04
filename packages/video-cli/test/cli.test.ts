import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runVideoCli, videoCliDistribution } from "@hypit/video-cli";

import { videoTestPackages } from "./packages.js";

const runCli = (
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
) => runVideoCli([...argv, "--json"], io, videoTestPackages);

test("source package selection follows Run and Author imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-package-selection-"));
  try {
    await writeFile(join(root, "style.svs"), `<?svml using="@hypit/svs@1"?>\n<sheet version="1"/>`, "utf8");
    await writeFile(join(root, "main.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@hypit/script@1"/>
  <import as="style" source="./style.svs"/>
  <script id="story"><line><HOST>Hello.</line></script>
</svml>`, "utf8");
    const run = join(root, "build.svrun");
    await writeFile(run, `<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="story"/>
</svrun>`, "utf8");
    const discovered = await videoCliDistribution.discoverSourcePackages!(run, {
      workspaceRoot: root,
      packages: videoTestPackages,
    });
    assert.deepEqual(discovered.selected, ["@hypit/run-markup", "@hypit/script", "@hypit/svs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider-free example plans from installed Source packages", async () => {
  // The examples directory is intentionally kept empty; use the maintained package preview
  // fixture instead. It is a real installed Source package and exercises the same provider-free
  // planning path (semantic track, composition and mux projections).
  const fixture = join(process.cwd(), "packages", "media-track", "preview");
  let output = "";
  await runCli([
    "plan",
    join(fixture, "build.svrun"),
    "--workspace",
    process.cwd(),
  ], { write: (text) => { output += text; } });
  const plan = JSON.parse(output) as {
    readonly format: string;
    readonly steps: number;
    readonly targets: readonly string[];
  };
  assert.equal(plan.format, "hypit.cli-plan@3");
  assert.equal(plan.steps > 0, true);
  assert.equal(plan.targets.length, 1);
});
