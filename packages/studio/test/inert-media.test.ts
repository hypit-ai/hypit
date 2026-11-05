import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createVideoDistribution } from "@hypit/video";
import { loadStudioDomain } from "../src/domain.js";
import { loadStudioCompanionRegistry } from "../src/companion-assembly.js";
import { loadStudioRun } from "../src/run.js";
import type { StudioBuildLibrary } from "../src/build-library.js";
import { inertWorkspaceFile, studioPlugin } from "../src/server.js";

const studioPackage = fileURLToPath(new URL("..", import.meta.url));
const inertPolicy = "sandbox allow-downloads";

function assertInert(response: Response, label: string): void {
  assert.equal(response.headers.get("content-security-policy"), inertPolicy, `${label} carries the sandbox CSP`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${label} carries nosniff`);
}

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
  const artifactBytes = Buffer.from(payload);
  const buildLibrary = {
    library: async () => { throw new Error("unused"); },
    renameArtifact: async () => undefined,
    locateHistoricalOutput: async () => undefined,
    resolveHistoricalOutput: async () => undefined,
    openArtifact: async (build: string, output: string) => build === "build_1" && output === "main"
      ? {
          mediaType: "image/svg+xml",
          size: artifactBytes.byteLength,
          open: async (range?: { readonly start: number; readonly endExclusive: number }) => (async function* () {
            yield range === undefined ? artifactBytes : artifactBytes.subarray(range.start, range.endExclusive);
          })(),
        }
      : undefined,
    close: async () => {},
  } as unknown as StudioBuildLibrary;
  // Mirror Studio's real layout: Vite's root is the Studio package, and the
  // author workspace is only reachable through `server.fs.allow`.
  const server = await createServer({
    configFile: false, root: studioPackage, logLevel: "silent",
    server: { port: 0, strictPort: false, host: "127.0.0.1", fs: { allow: [root, studioPackage, process.cwd()] } },
    plugins: [studioPlugin({ source: run.authorSource, runPath, workspaceRoot: root, domain, registry, buildLibrary })],
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
  assertInert(svg, "material");
  const svgUrl = new URL(svg.url);

  const partial = await fetch(svgUrl, { headers: { range: "bytes=0-3" } });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), payload.slice(0, 4));
  assertInert(partial, "a material Range response");

  const head = await fetch(svgUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assertInert(head, "a material HEAD response");

  const artifactUrl = new URL("/__studio/artifact?build=build_1&output=main", base);
  const artifact = await fetch(artifactUrl);
  assert.equal(artifact.status, 200);
  assert.equal(await artifact.text(), payload);
  assertInert(artifact, "a Result");
  const artifactPartial = await fetch(artifactUrl, { headers: { range: "bytes=4-" } });
  assert.equal(artifactPartial.status, 206);
  assert.equal(await artifactPartial.text(), payload.slice(4));
  assertInert(artifactPartial, "a Result Range response");
  const artifactHead = await fetch(artifactUrl, { method: "HEAD" });
  assert.equal(artifactHead.status, 200);
  assertInert(artifactHead, "a Result HEAD response");

  // Vite serves `/@fs/<absolute path>` for everything in `server.fs.allow`,
  // which includes the workspace. Those raw project bytes must be just as inert.
  await writeFile(join(root, "evil.html"), `<!doctype html><script>fetch("/__studio/source",{method:"PUT"})</script>`);
  for (const name of ["logo.svg", "evil.html"]) {
    const raw = await fetch(new URL(`/@fs${join(root, name).replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/u, "/")}`, base));
    assert.ok(raw.status === 403 || raw.status === 404
      || raw.headers.get("content-security-policy") === inertPolicy,
      `/@fs/${name} is refused or served as an inert document (status ${raw.status})`);
    if (raw.ok) assertInert(raw, `/@fs/${name}`);
  }

  // Studio's own modules are still served normally by Vite.
  const ui = await fetch(new URL("/src/ui/main.ts", base));
  assert.equal(ui.status, 200);
  assert.equal(ui.headers.get("content-security-policy"), null);
});

test("only workspace files reached through Vite's /@fs and /@id are marked inert", () => {
  const workspace = join(tmpdir(), "project");
  const fsUrl = (path: string) => `/@fs${path.replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/u, "/")}`;
  assert.equal(inertWorkspaceFile(workspace, fsUrl(join(workspace, "art", "logo.svg"))), true);
  assert.equal(inertWorkspaceFile(workspace, `${fsUrl(join(workspace, "evil.html"))}?t=1`), true);
  assert.equal(inertWorkspaceFile(workspace, `/@id${fsUrl(join(workspace, "evil.svg")).slice("/@fs".length)}`), true);
  assert.equal(inertWorkspaceFile(workspace, fsUrl(join(workspace, "node_modules", "@hypit", "studio", "src", "ui", "main.ts"))), false);
  assert.equal(inertWorkspaceFile(workspace, fsUrl(join(tmpdir(), "elsewhere", "logo.svg"))), false);
  assert.equal(inertWorkspaceFile(workspace, "/src/ui/main.ts"), false);
  assert.equal(inertWorkspaceFile(workspace, "/__studio/session"), false);
});
