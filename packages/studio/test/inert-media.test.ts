import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createVideoDistribution } from "@hypit/video";
import { loadStudioDomain } from "../src/domain.js";
import { loadStudioCompanionRegistry } from "../src/companion-assembly.js";
import { loadStudioRun } from "../src/run.js";
import { studioPlugin } from "../src/server.js";

test("Studio serves authored material as an inert document, so an SVG cannot script the Studio origin", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-inert-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>fetch("/__studio/source",{method:"PUT"})</script></svg>`;
  await writeFile(join(root, "logo.svg"), payload);
  await writeFile(join(root, "look.svs"), '<?svml using="@hypit/recipe@1"?><sheet version="1">film.main { background: #000000; }</sheet>');
  await writeFile(join(root, "main.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="media" from="@hypit/media@1"/>
  <import as="time" from="@hypit/timeline-author@1"/>
  <import as="visual" from="@hypit/visual-track@1"/>
  <import as="space" from="@hypit/spatial@1"/>
  <import as="film" from="@hypit/film@1"/>
  <import as="look" source="./look.svs"/>
  <space:Canvas id="canvas" width="64" height="64"/>
  <time:Clock id="clock" frame-rate="30"/>
  <space:Frame id="full" within={canvas.bounds} left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Extent id="size" width="4" height="4"/>
  <media:Image id="logo" src="./logo.svg" media-type="image/svg+xml"/>
  <time:Timeline id="program" clock={clock} end="shown.end">
    <time:Window id="shown" from="start" for="1s"/>
  </time:Timeline>
  <visual:Track id="picture" timeline={program.timeline}>
    <visual:Clip id="logo-card" image={logo} extent={size} during={program.shown} frame={full} z="1" fit="cover"/>
  </visual:Track>
  <film:Film id="main" canvas={canvas.canvas} timeline={program.timeline} appearance={look.film.main}>
    <film:Track source={picture.visual}/>
  </film:Film>
</svml>`);
  const runPath = join(root, "main.svrun");
  await writeFile(runPath, `<?svml using="@hypit/markup/run@1"?>
<svrun version="1"><author source="./main.svml"/><target output="main.composition"/></svrun>`);
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot: root,
    packageRoot: process.cwd(), distribution: createVideoDistribution() });
  const registry = await loadStudioCompanionRegistry({ distributionPackageRoot: process.cwd(), sourcePackages: domain.packages });
  const run = await loadStudioRun({ run: runPath, domain, registry });
  const server = await createServer({
    configFile: false, root, logLevel: "silent",
    server: { port: 0, strictPort: false, host: "127.0.0.1" },
    plugins: [studioPlugin({ source: run.authorSource, runPath, workspaceRoot: root, domain, registry })],
  });
  t.after(() => server.close());
  await server.listen();
  const base = server.resolvedUrls!.local[0]!;

  const session = await fetch(new URL("/__studio/session", base));
  assert.equal(session.status, 200);
  const resources = [...new Set((await session.text()).match(/res_[a-zA-Z0-9._:-]+/gu) ?? [])];
  const served = await Promise.all(resources.map(async (resource) => await fetch(new URL(`/__studio/material/${resource}`, base))));
  const svg = served.find((response) => response.headers.get("content-type") === "image/svg+xml");
  assert.ok(svg, "the authored SVG is served as Studio material");
  assert.equal(await svg.text(), payload, "bytes are unchanged for <img> use");
  assert.equal(svg.headers.get("content-security-policy"), "sandbox");
  assert.equal(svg.headers.get("x-content-type-options"), "nosniff");
});
