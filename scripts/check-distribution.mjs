import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
let passed = false;
try {
  await writeFile(join(project, "package.json"), JSON.stringify({
    name: "distribution-example",
    private: true,
    type: "module",
    hypit: { project: true },
  }));
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

  const example = join(distribution, "examples", "semantic-composition");
  await cp(join(example, "title-card.nle.json"), join(project, "title-card.nle.json"));
  const component = join(project, "packages", "audiovisual-title-card");
  await cp(join(example, "packages", "audiovisual-title-card"), component, { recursive: true });
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
  projectPackage.workspaces = ["packages/audiovisual-title-card"];
  projectPackage.dependencies = {
    ...(projectPackage.dependencies ?? {}),
    "@example/audiovisual-title-card": "file:packages/audiovisual-title-card",
  };
  await writeFile(join(project, "package.json"), JSON.stringify(projectPackage, null, 2));
  await npm("install", "--no-audit", "--no-fund");
  await npm("run", "build", "--workspace", "@example/audiovisual-title-card");
  await writeFile(join(project, "gpt-image.svml"), `module prompt from "@hypit/prompt"
module gpt from "@hypit/gpt-image"
source ugc from "@hypit/gpt-image-kits/phone-ugc-v1"

prompt.Render "portrait-prompt" {
  template: @ugc.phone-ugc-v1
  bind "shot" { value: "A candid close portrait in window light." }
}

gpt.image {
  id: portrait
  prompt: @portrait-prompt
  aspect-ratio: 1:1
  resolution: 1K
}
`);
  await hypit(["check", "gpt-image.svml", "--project", project]);
  await writeFile(join(project, "default-models.svml"), `module prompt from "@hypit/prompt"
module h3 from "@hypit/minimax-h3"
module nano from "@hypit/nano-banana"
module seedream from "@hypit/seedream"
module grok from "@hypit/grok-imagine"
module pix from "@hypit/pixverse"
module wan from "@hypit/wan"

prompt.Prompt "video-prompt" { text: "A paper boat crossing a rain puddle in one continuous shot." }
prompt.Prompt "image-prompt" { text: "A small red chair against a quiet blue wall." }

h3.text-video { id: boat prompt: @video-prompt duration: 6 resolution: 768P aspect-ratio: 16:9 }
nano.image { id: chair prompt: @image-prompt aspect-ratio: 1:1 resolution: 2K output-format: png }
seedream.text-image { id: wall prompt: @image-prompt aspect-ratio: 1:1 quality: high output-format: png nsfw-check: true }
grok.preview-video { id: puddle prompt: @video-prompt duration: 6 aspect-ratio: 16:9 resolution: 720p }
pix.video { id: boat-alt model: v6 prompt: @video-prompt duration: 5 quality: 720p aspect-ratio: 16:9 generate-audio: false }
wan.image { id: chair-alt prompt: @image-prompt resolution: 2K }
`);
  await hypit(["check", "default-models.svml", "--project", project]);
  const output = join(project, "title-card.mp4");
  await hypit(["nle", "export", "title-card.nle.json", "--to", output, "--workers", "1"]);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], true));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  assert.ok(video, "the exported file must contain video");
  assert.equal(video.width, 540);
  assert.equal(video.height, 960);
  assert.equal(video.avg_frame_rate, "30/1");
  assert.equal(Number(video.nb_frames), 60);
  await run("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
  passed = true;
  console.log(`Installed @hypit/hypit@${installed.version}: package build, NLE render and export passed.`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Distribution execution files retained at ${root}`);
}
