#!/usr/bin/env node
/**
 * Draw a package's catalogue preview images from the package's own preview Source.
 *
 * A Manifest hands Studio and the README a picture per Surface, read off disk with `readFile`. Those
 * pictures were made once and committed, and nothing could make them again: a Recipe could change, a
 * Surface could gain a port, and the catalogue would go on showing what the package used to draw.
 *
 * So the sample lives in the package as a Source it can be drawn from. `preview/preview.svml`,
 * `preview/recipes.svs` and `preview/build.svrun` hold the package's own copy, its own Recipe values
 * and its own Canvas — nothing about any project — and `render-element.mjs` draws them through the
 * real authoring path. A Surface that stopped working cannot produce a preview that looks fine.
 *
 * Which element draws which file comes from the Manifest's own naming: a Surface tagged `Track`
 * declares `preview/Track.png`, so `Track.png` is drawn from whichever element in the preview Source
 * carries that tag. No third file has to agree with the other two.
 *
 * Usage:  node --import tsx .agents/skills/hypit/scripts/render-previews.mjs <package-dir> [...]
 * Exit:   0 having written each picture, naming it. 1 when a preview Source refuses to draw.
 *         2 when a package has no preview Source, or its Manifest names a picture nothing draws.
 */
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const renderElement = fileURLToPath(new URL("./render-element.mjs", import.meta.url));

function fail(message, code = 2) {
  console.error(`render-previews: ${message}`);
  process.exit(code);
}

const directories = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (directories.length === 0) fail("usage: render-previews.mjs <package-dir> [...]");

const invokedFrom = process.env.INIT_CWD ?? process.cwd();
let written = 0;
for (const directory of directories) {
  const packageDir = resolve(invokedFrom, directory);
  const previewDir = join(packageDir, "preview");
  const run = join(previewDir, "build.svrun");
  const svml = await readFile(join(previewDir, "preview.svml"), "utf8").catch(() => undefined);
  if (svml === undefined) {
    fail(`${directory} has no preview/preview.svml. Write one: the package's own copy, its own Recipe values, its own Canvas.`);
  }

  // The alias the preview Source imports this package under. A preview Source places Tracks from
  // several packages — it needs a semantic spine and a Film like any other — and `Track` is a common
  // tag, so the tag alone would draw whichever one happened to be written first.
  const specifier = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8").catch(() => "{}")).name;
  if (typeof specifier !== "string") fail(`${directory} has no package.json name`);
  const imported = [...svml.matchAll(/<import\s+as="([^"]+)"\s+from="(@[^"]+)@\d+"/gu)];
  const alias = imported.find(([, , from]) => from === specifier)?.[1];
  if (alias === undefined) {
    fail(`${directory}'s preview Source does not import ${specifier}, so nothing in it is this package's`);
  }

  // The pictures the Manifest promises, and the element tag each one is named for.
  const manifest = await readFile(join(packageDir, "src", "manifest.ts"), "utf8").catch(() => "");
  const promised = [...new Set([...manifest.matchAll(/previewImage\(\s*["']([^"']+)["']/gu)].map(([, file]) => file))];
  const existing = (await readdir(previewDir).catch(() => []))
    .filter((name) => /\.(png|jpe?g|svg)$/iu.test(name));
  const pictures = promised.length > 0 ? promised : existing;
  if (pictures.length === 0) fail(`${directory} promises no preview picture; nothing to draw`);

  for (const picture of pictures) {
    if (/\.svg$/iu.test(picture)) {
      console.log(`  ${picture} is drawn by hand, not from a Source; left alone`);
      continue;
    }
    const tag = basename(picture).replace(/\.[^.]+$/u, "");
    const element = new RegExp(`<${alias}:${tag}\\b[^>]*?\\bid="([^"]+)"`, "su").exec(svml)?.[1];
    if (element === undefined) {
      fail(`${directory} promises ${picture} but its preview Source places no <${alias}:${tag}> to draw it from`);
    }
    const drawn = spawnSync(process.execPath, [
      "--import", "tsx", renderElement, run, "--element", element, "--out", join(previewDir, picture),
    ], { encoding: "utf8", windowsHide: true, timeout: 900_000 });
    if (drawn.status !== 0) {
      console.error((drawn.stderr ?? "").trim());
      fail(`${directory} could not draw ${picture}`, 1);
    }
    console.log(`  ${directory}/preview/${picture} ← ${tag} id=${element}`);
    written += 1;
  }
}
console.log(`render-previews: drew ${written} picture${written === 1 ? "" : "s"}.`);
