import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Execute the installed package as a user would, without workspace module links or host state.
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js") || process.argv.length < 3) {
  throw new Error("Use npm run check:distribution -- /path/to/hypit-hypit-<version>.tgz [/path/to/default-package.tgz ...]");
}
const tarball = resolve(process.argv[2]);
const defaultPackages = process.argv.slice(3).map((value) => resolve(value));
const root = await mkdtemp(join(tmpdir(), "hypit-distribution-"));
const project = join(root, "project");
await mkdir(project);
const env = {
  ...process.env,
  HYPIT_STATE_HOME: join(root, "state"),
  // Package installation is part of this isolated candidate. Do not inherit a user cache whose
  // permissions, configuration or partial entries belong to another environment.
  npm_config_cache: join(root, "npm-cache"),
};
// Old shell hints must not redirect the installed launcher, Worker or capture child.
env.HYPIT_DISTRIBUTION_ROOT = join(root, "stale-distribution");
env.HYPIT_CLI_LAUNCHER = join(root, "stale-distribution", "bin", "hypit.mjs");
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
// The selected Provider's installation declaration, not this test's environment,
// must suppress Puppeteer's transitive browser download.
delete env.PUPPETEER_SKIP_DOWNLOAD;
env.PUPPETEER_CACHE_DIR = join(root, "unselected-puppeteer-cache");

function run(command, args, capture = false, expectedCode = 0) {
  console.log(`> ${command} ${args.join(" ")}`);
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: project, env, windowsHide: true,
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"] });
    let stdout = "";
    child.stdout?.setEncoding("utf8").on("data", (text) => { stdout += text; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === expectedCode) resolveRun(stdout);
      else reject(new Error(`${command} ${args[0]} failed (${signal ?? code})${stdout ? `\n${stdout}` : ""}`));
    });
  });
}
const npm = (...args) => run(process.execPath, [npmCli, ...args]);
const distribution = join(project, "node_modules", "@hypit", "hypit");
const hypit = (args, capture = false, expectedCode = 0) => run(process.execPath, [join(distribution, "bin", "hypit.mjs"), ...args], capture, expectedCode);
const scope = ["--project", project, "--runtime", join(project, "hypit.runtime.json")];
let runtimeStarted = false;
let passed = false;
try {
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "distribution-example", private: true, type: "module" }));
  await npm("install", tarball, ...defaultPackages, "--no-audit", "--no-fund");
  const installedDistribution = JSON.parse(await readFile(join(distribution, "package.json"), "utf8"));
  const selectedPackages = new Set(Object.keys(installedDistribution.dependencies ?? {})
    .filter((name) => name.startsWith("@hypit/")));
  const importablePackages = [];
  for (const name of selectedPackages) {
    const packageRoot = join(project, "node_modules", ...name.split("/"));
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    for (const dependency of Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    })) {
      if (dependency.startsWith("@hypit/") && dependency !== "@hypit/hypit") selectedPackages.add(dependency);
    }
    if (typeof manifest.exports === "string" || manifest.exports?.["."] !== undefined) {
      importablePackages.push(name);
    }
  }
  const typeConsumer = join(project, "release-types.ts");
  await writeFile(typeConsumer, `${importablePackages.sort().map((name, index) =>
    `import * as package${index} from ${JSON.stringify(name)}; void package${index};`).join("\n")}\n`);
  await run(process.execPath, [
    join(project, "node_modules", "typescript", "bin", "tsc"),
    "--noEmit",
    "--target", "ES2023",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--lib", "ESNext,DOM",
    "--strict",
    typeConsumer,
  ]);
  await hypit(["--version"]);
  await hypit(["studio", "--help"]);

  const example = join(distribution, "examples", "semantic-composition");
  for (const name of ["chat.svml", "chat.svs", "hypit.runtime.json"]) {
    await cp(join(example, name), join(project, name));
  }
  const component = join(project, "packages", "chat-scene");
  await cp(join(example, "packages", "chat-scene"), component, { recursive: true });
  const installed = installedDistribution;
  const componentPackage = JSON.parse(await readFile(join(component, "package.json"), "utf8"));
  for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(componentPackage[field] ?? {})) {
      if (!range.startsWith("workspace:")) continue;
      const selected = JSON.parse(await readFile(join(project, "node_modules", ...name.split("/"), "package.json"), "utf8"));
      componentPackage[field][name] = selected.version;
    }
  }
  await writeFile(join(component, "package.json"), JSON.stringify(componentPackage, null, 2));
  const projectPackage = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  projectPackage.workspaces = ["packages/chat-scene"];
  await writeFile(join(project, "package.json"), JSON.stringify(projectPackage, null, 2));
  await npm("install", "--no-audit", "--no-fund");
  await npm("run", "build", "--workspace", "@example/chat-scene");

  const profilePath = join(project, "hypit.runtime.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  profile.endpoints["html.local"].config.browserGpu = "software";
  profile.endpoints["html.local"].config.browserCacheDirectory = join(root, "render-browser");
  await writeFile(profilePath, JSON.stringify(profile, null, 2));
  // The Distribution supplies the generic Fontsource adapter. The authored project owns the exact
  // font families it selected, through its ordinary package.json and lockfile.
  await npm("install", "--save-exact", "@fontsource-variable/inter@5.3.0", "--no-audit", "--no-fund");
  await hypit(["check", "chat.svml", "--project", project]);
  await writeFile(join(project, "gpt-image.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="text" from="@hypit/text@1"/>
  <import as="gpt" from="@hypit/gpt-image/clean@1"/>
  <import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>
  <text:Value id="shot">A candid close portrait in window light.</text:Value>
  <text:Render id="prompt" template={ugc.phone-ugc-v1}>
    <text:Set name="shot" text={shot}/>
  </text:Render>
  <gpt:Image id="portrait" prompt={prompt} aspect-ratio="1:1" resolution="1K"/>
</svml>
`);
  await hypit(["check", "gpt-image.svml", "--project", project]);
  await writeFile(join(project, "default-models.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="text" from="@hypit/text@1"/>
  <import as="h3" from="@hypit/minimax-h3@1"/>
  <import as="nano" from="@hypit/nano-banana@1"/>
  <import as="seedream" from="@hypit/seedream@1"/>
  <import as="grok" from="@hypit/grok-imagine@1"/>
  <import as="pix" from="@hypit/pixverse@1"/>
  <import as="wan" from="@hypit/wan@1"/>
  <import as="mimo" from="@hypit/mimo-speech@1"/>
  <import as="fish" from="@hypit/fishaudio-speech@1"/>
  <import as="eleven" from="@hypit/elevenlabs-speech@1"/>
  <import as="matte" from="@hypit/volcengine-matting@1"/>
  <text:Value id="videoPrompt">A paper boat crossing a rain puddle in one continuous shot.</text:Value>
  <text:Value id="imagePrompt">A small red chair against a quiet blue wall.</text:Value>
  <h3:TextVideo id="boat" prompt={videoPrompt} duration="6" resolution="768P" aspect-ratio="16:9"/>
  <nano:Image id="chair" prompt={imagePrompt} aspect-ratio="1:1" resolution="2K" output-format="png"/>
  <seedream:TextImage id="wall" prompt={imagePrompt} aspect-ratio="1:1" quality="high" output-format="png" nsfw-check="true"/>
  <grok:PreviewVideo id="puddle" prompt={videoPrompt} duration="6" aspect-ratio="16:9" resolution="720p"/>
  <pix:Video id="boat-alt" model="v6" prompt={videoPrompt} duration="5" quality="720p" aspect-ratio="16:9" generate-audio="false"/>
  <wan:Image id="chair-alt" prompt={imagePrompt} resolution="2K"/>
</svml>
`);
  await hypit(["check", "default-models.svml", "--project", project]);
  const missingBrowser = await hypit(["doctor", ...scope, "--json"], true, 1);
  assert.match(missingBrowser, /HTML browser is unavailable/u);
  runtimeStarted = true;
  await hypit(["runtime", "up", ...scope]);
  assert.deepEqual(await readdir(env.PUPPETEER_CACHE_DIR).catch(error => {
    if (error.code === "ENOENT") return []; throw error;
  }), [], "npm dependencies must not download an unselected Puppeteer browser");
  await hypit(["doctor", ...scope]);
  const result = JSON.parse(await hypit([
    "build", "chat.svml", "--target", "final.video", ...scope,
    "--follow", "--max-wait-ms", "180000", "--json",
  ], true));
  assert.equal(result.build.work.outcome, "complete", JSON.stringify(result));
  const output = join(project, "chat.mp4");
  await hypit(["result", "export", result.build.id, "--project", project, "--output", "final.video", "--to", output]);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], true));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert.ok(video, "the exported file must contain video");
  assert.equal(video.width, 540);
  assert.equal(video.height, 960);
  assert.equal(video.avg_frame_rate, "30/1");
  assert.equal(Number(video.nb_frames), 240);
  await run("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
  passed = true;
  console.log(`Installed @hypit/hypit@${installed.version}: component build, font, render and export passed.`);
} finally {
  if (runtimeStarted) {
    try { await hypit(["runtime", "down", ...scope]); }
    catch (error) { passed = false; console.error(error); process.exitCode = 1; }
  }
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Distribution execution files retained at ${root}`);
}
