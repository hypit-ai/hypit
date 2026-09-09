import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/release");
const github = "https://github.com/hypit-ai/hypit/blob/main/";
const assets = "https://storage.googleapis.com/hypit-public-assets/showcase/npm/2026-09-10/";

// Run through npm so its CLI entry is portable, including on Windows.
const npmCli = process.env.npm_execpath;
if (!npmCli || !npmCli.endsWith("npm-cli.js")) {
  throw new Error("Run npm run pack:distribution to prepare the npm release.");
}
function npm(args, cwd, capture = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

npm(["run", "build:public-types"], root);
const [inventory] = JSON.parse(npm(["pack", "--dry-run", "--ignore-scripts", "--json"], root, true));
let readme = await readFile(resolve(root, "README.md"), "utf8");
const examples = readme.indexOf("## Examples\n");
const next = readme.indexOf("## Use the Hypit skill\n", examples);
if (examples < 0 || next < 0) throw new Error("README Examples section could not be located.");
readme = readme.slice(0, examples)
  + "[Watch the complete video examples on GitHub](https://github.com/hypit-ai/hypit#examples).\n\n"
  + readme.slice(next);
readme = readme
  .replace(/<picture>[\s\S]*?<\/picture>/u,
    `<img alt="Hypit" src="${assets}logo.svg" width="400" height="143">`)
  .replaceAll("https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc", `${assets}demo-compact.gif`)
  .replaceAll("https://github.com/user-attachments/assets/cc929974-96b8-4166-b81d-008e130b0f24", `${assets}star.gif`)
  .replaceAll('href="./', `href="${github}`)
  .replaceAll("](./", `](${github}`)
  .replace("## Install once\n", "## Install once\n\nInstall the Hypit CLI (Node.js 22.12 or newer):\n\n```bash\nnpm install -g @hypit/hypit\n```\n\nAdd the Skill to your coding agent:\n");

const stage = await mkdtemp(resolve(tmpdir(), "hypit-npm-"));
try {
  // Use npm's own file selection; only the package-page README differs from the repository.
  for (const { path } of inventory.files) {
    if (path === "README.zh-CN.md") continue;
    const target = resolve(stage, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, path), target);
  }
  await writeFile(resolve(stage, "README.md"), readme);
  await mkdir(output, { recursive: true });
  const packed = npm(["pack", "--ignore-scripts", "--pack-destination", output, "--json"], stage, true);
  await writeFile(resolve(output, "README.md"), readme);
  console.log(packed);
} finally {
  await rm(stage, { recursive: true, force: true });
}
