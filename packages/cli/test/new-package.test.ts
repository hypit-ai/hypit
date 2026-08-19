import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import { scaffoldNames } from "../src/scaffold.js";

/** new-package writes files and nothing else, so no Distribution capability is reachable. */
const distribution = {
  openRuntimeHost: () => { throw new Error("new-package must open no Runtime"); },
  generatePicture: () => { throw new Error("new-package must call no Provider"); },
} as unknown as CliDistribution;

async function scaffold(argv: readonly string[]): Promise<{ readonly output: string; readonly root: string }> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "hypit-new-package-"));
  let output = "";
  await runCli(argv.map((item) => (item === "<to>" ? temporary : item)),
    { write: (text) => { output += text; } }, distribution);
  return { output, root: temporary };
}

type Machine = {
  readonly format: string;
  readonly name: string;
  readonly path: string;
  readonly tag: string;
  readonly surface: string;
  readonly visual: boolean;
  readonly files: readonly string[];
};

test("a scaffolded package carries every role a component package fills", async () => {
  const { output, root } = await scaffold([
    "new-package", "@hypit/local-notepad-list", "--to", "<to>", "--json",
  ]);
  try {
    const machine = JSON.parse(output) as Machine;
    assert.equal(machine.format, "hypit.cli-new-package@1");
    assert.equal(machine.name, "@hypit/local-notepad-list");
    assert.equal(machine.path, root);
    assert.equal(machine.tag, "NotepadList");
    assert.equal(machine.surface, "notepad-list");
    assert.equal(machine.visual, true);
    assert.deepEqual(machine.files, [
      "package.json", "README.md",
      "src/manifest.ts", "src/types.ts", "src/surface.ts", "src/component.ts",
      "src/activation.ts", "src/index.ts",
      "test/render-still.ts",
      "assets/", "preview/",
    ]);

    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      readonly name: string;
      readonly version: string;
      readonly private: boolean;
      readonly type: string;
      readonly exports: Readonly<Record<string, string>>;
      readonly hypit: Readonly<Record<string, string>>;
      readonly dependencies: Readonly<Record<string, string>>;
    };
    assert.equal(manifest.name, "@hypit/local-notepad-list");
    assert.equal(manifest.version, "0.0.0-dev");
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, "module");
    assert.equal(manifest.exports["."], "./src/index.ts");
    assert.equal(manifest.hypit["activation"], "./src/activation.ts");
    assert.equal(manifest.dependencies["@hypit/markup"], "workspace:*");

    const module = await readFile(path.join(root, "src/manifest.ts"), "utf8");
    assert.match(module, /name: "@hypit\/local-notepad-list", version: "1"/u);
    assert.match(module, /types: \[\],/u);
    assert.match(module, /producers: \[\],/u);
    // The vocabulary is what a reader chooses the element by, so every part of it is written.
    for (const part of ["summary:", "appearance:", "preview: previewImage(\"NotepadList.png\")", "attributes:", "example:", "notes:"]) {
      assert.ok(module.includes(part), `manifest is missing ${part}`);
    }
    assert.match(module, /\{ name: "id", kind: "identifier", required: true,/u);

    // Both directories exist even before anything is put in them.
    assert.deepEqual(await readdir(path.join(root, "assets")), []);
    assert.deepEqual(await readdir(path.join(root, "preview")), []);

    const still = await readFile(path.join(root, "test/render-still.ts"), "utf8");
    assert.match(still, /preview\/NotepadList\.png/u);
    assert.match(still, /hyperframes\/bin\/hyperframes\.mjs/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--no-visual drops the still render and the preview the Surface would declare", async () => {
  const { output, root } = await scaffold([
    "new-package", "@hypit/local-quiet-thing", "--to", "<to>", "--no-visual", "--json",
  ]);
  try {
    const machine = JSON.parse(output) as Machine;
    assert.equal(machine.visual, false);
    assert.ok(!machine.files.includes("test/render-still.ts"));
    const module = await readFile(path.join(root, "src/manifest.ts"), "utf8");
    assert.ok(!module.includes("previewImage"));
    assert.ok(!module.includes("appearance:"));
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      readonly devDependencies?: unknown;
    };
    assert.equal(manifest.devDependencies, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the element tag drops the local- prefix, which says where a package lives", () => {
  assert.deepEqual(scaffoldNames("@hypit/local-notepad-list"),
    { slug: "local-notepad-list", tag: "NotepadList", surface: "notepad-list", symbol: "notepadList" });
  assert.deepEqual(scaffoldNames("@hypit/ranking"),
    { slug: "ranking", tag: "Ranking", surface: "ranking", symbol: "ranking" });
  assert.deepEqual(scaffoldNames("comment-sticker"),
    { slug: "comment-sticker", tag: "CommentSticker", surface: "comment-sticker", symbol: "commentSticker" });
});

test("a name that is not a package name is refused before anything is written", async () => {
  await assert.rejects(
    async () => await scaffold(["new-package", "@hypit/Notepad List", "--to", "<to>"]),
    /is not a package name/u,
  );
});

test("new-package refuses to write into a directory that already holds files", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "hypit-new-package-"));
  try {
    await writeFile(path.join(temporary, "package.json"), "{}\n");
    await assert.rejects(
      async () => await runCli(
        ["new-package", "@hypit/local-notepad-list", "--to", temporary],
        { write: () => {} }, distribution,
      ),
      /is not empty/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("new-package takes its name positionally and refuses options that do not apply", async () => {
  await assert.rejects(
    async () => await runCli(["new-package"], { write: () => {} }, distribution),
    /hypit new-package <package-name>/u,
  );
  await assert.rejects(
    async () => await runCli(
      ["new-package", "@hypit/local-notepad-list", "--runtime", "/tmp/profile.json"],
      { write: () => {} }, distribution,
    ),
    /--runtime does not apply to new-package/u,
  );
  await assert.rejects(
    async () => await runCli(["build", "run.svrun", "--no-visual"], { write: () => {} }, distribution),
    /--no-visual does not apply to build/u,
  );
});

test("help lists new-package and describes it under its own topic", async () => {
  let listing = "";
  await runCli(["--help"], { write: (text) => { listing += text; } }, distribution);
  assert.match(listing, /new-package <package-name>/u);
  let topic = "";
  await runCli(["help", "new-package"], { write: (text) => { topic += text; } }, distribution);
  assert.match(topic, /--no-visual/u);
  assert.match(topic, /packages\/<name-after-the-scope>/u);
});
