import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runVideoCli, videoCliDistribution } from "@hypit/video-cli";
import { runCli as runCommand } from "@hypit/cli";

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
  assert.equal(plan.format, "hypit.cli-plan@1");
  assert.equal(plan.steps > 0, true);
  assert.equal(plan.targets.length, 1);
});

test("check compiles a data-only package Source export without a project copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-package-source-"));
  try {
    const kitRoot = join(root, "packages", "image-kits");
    await mkdir(join(kitRoot, "kits"), { recursive: true });
    await writeFile(join(kitRoot, "package.json"), JSON.stringify({
      name: "@acme/image-kits",
      version: "1.0.0",
      type: "module",
      exports: { "./ugc-v1": "./kits/ugc-v1.svs" },
    }), "utf8");
    await writeFile(join(kitRoot, "kits", "ugc-v1.svs"), `<?svml using="@hypit/text/svs@1"?>
<sheet version="1" id="ugc-v1">
  text-template.ugc-v1 { separator: paragraph; }
  text-template.ugc-v1.block.direction { kind: slot; order: 10; slot: direction; optional: false; }
</sheet>`, "utf8");
    const source = join(root, "main.svml");
    await writeFile(source, `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="text" from="@hypit/text@1"/>
  <import as="kit" source="@acme/image-kits/ugc-v1"/>
  <text:Value id="direction">A useful photographed scene.</text:Value>
  <text:Render id="prompt" template={kit.ugc-v1}>
    <text:Set name="direction" text={direction}/>
  </text:Render>
</svml>`, "utf8");
    let output = "";
    await runCli(["check", source, "--workspace", root], {
      write: (text) => { output += text; },
    });
    const checked = JSON.parse(output) as { readonly sourceKind: string; readonly units: number };
    assert.equal(checked.sourceKind, "author");
    assert.equal(checked.units, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pricing keeps every planned generation after the old 20-request cutoff and exposes authored parameters", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-pricing-"));
  try {
    const ids = Array.from({ length: 25 }, (_, index) => `portrait-${index}`);
    await writeFile(join(root, "main.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="copy" from="@hypit/text@1"/>
  <import as="gpt" from="@hypit/gpt-image@1"/>
  ${ids.map((id) => `<copy:Value id="${id}-prompt">An original ${id}.</copy:Value>
  <gpt:Image id="${id}" prompt={${id}-prompt} aspect-ratio="9:16" resolution="2K"/>`).join("\n")}
</svml>`);
    const source = join(root, "build.svrun");
    await writeFile(source, `<?svml using="@hypit/run-markup@1"?>
<svrun version="1"><author source="./main.svml"/>
  ${ids.map((id) => `<target output="${id}.image"/>`).join("\n")}
</svrun>`);
    let queried = 0;
    let output = "";
    await runCommand(["pricing", source, "--workspace", root, "--runtime", join(root, "runtime.json"),
      "--json", "--limit", "1"], { write: (text) => { output += text; } }, {
      ...videoCliDistribution,
      bootstrapPackages: videoTestPackages,
      openRuntimeHost: async (path, options) => ({
        ...await videoCliDistribution.openRuntimeHost(path, options),
        pricing: async (requests) => {
          queried = requests.length;
          return requests.map((request) => ({
            request: request.request, capability: request.capability, status: "resolved" as const,
            endpoint: "test.vendor", use: "test.provider",
            pricingDocuments: [{ source: "https://vendor.example/rates", data: { creditsPerImage: 2 } }],
          }));
        },
        createRuntime: async () => { throw new Error("pricing cannot execute a Build"); },
      }),
    });
    const report = JSON.parse(output);
    assert.equal(queried, 25);
    assert.equal(report.format, "hypit.cli-pricing@1");
    assert.equal(report.requestCount, 25);
    assert.equal(report.groups.length, 1);
    const group = report.groups[0];
    assert.equal(group.requests.length, 25);
    assert.deepEqual(group.pricingDocuments[0].data, { creditsPerImage: 2 });
    for (const request of group.requests) {
      assert.equal(request.summary.fields.resolution, "2K");
      assert.equal(request.summary.fields.aspectRatio, "9:16");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
