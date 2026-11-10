import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { CliIo } from "@hypit/cli";
import { markupSurfaceFacetAbi } from "@hypit/markup";

import { listPackages, listSurfaces, runVocabularyCli, visualSchema } from "../src/vocabulary.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function io(): { readonly io: CliIo; text: () => string } {
  let out = "";
  return {
    io: {
      write: (chunk) => { out += chunk; },
      setExitCode: () => {},
      readSecret: async () => "",
      terminal: { isTTY: false, color: false, unicode: false, columns: 100 },
    },
    text: () => out,
  };
}

test("the listing sees every activatable package from the repository root", async () => {
  const listing = await listPackages(repositoryRoot);
  assert.equal(new Set(listing.map((item) => item.name)).size, listing.length);
  const pipeline = listing.find((item) => item.name === "@hypit/media-operations");
  assert.ok(pipeline !== undefined, "media-operations is listed");
  assert.ok(pipeline.tags.includes("StillVideo"), `tags: ${pipeline.tags.join(", ")}`);
  assert.equal(pipeline.unreadable, undefined);
});

test("vocabulary discovers bundled packages from a separate project without node_modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-vocabulary-"));
  const project = join(root, "project");
  const distribution = join(root, "distribution");
  async function packageAt(directory: string, name: string, description = name): Promise<void> {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({
      name, version: "1.0.0", type: "module", description,
      hypit: { activation: "./activation.mjs" },
    }));
    await writeFile(join(directory, "activation.mjs"), `export default {
      format: "hypit.package@1",
      facets: [{
        abi: ${JSON.stringify(markupSurfaceFacetAbi)},
        implementation: {
          module: { name: ${JSON.stringify(name)}, version: "1" },
          surface: "card", tag: "Card", mode: "raw", outputs: [], handler: () => [],
        },
      }],
    };`);
  }
  try {
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "package.json"), JSON.stringify({ name: "example-project", private: true }));
    const bundled = join(distribution, "packages", "bundled");
    await packageAt(bundled, "@hypit/bundled");
    await writeFile(join(bundled, "README.md"), "Example bundled component.\n");
    await mkdir(join(distribution, "packages", "inactive"), { recursive: true });
    await writeFile(join(distribution, "packages", "inactive", "package.json"), JSON.stringify({ name: "@hypit/inactive" }));

    const human = io();
    await runVocabularyCli(["vocabulary"], human.io, project, distribution);
    assert.match(human.text(), /@hypit\/bundled\n\s+tags: Card/u);
    const json = io();
    await runVocabularyCli(["vocabulary", "--json"], json.io, project, distribution);
    assert.deepEqual(JSON.parse(json.text()).packages, [{
      name: "@hypit/bundled", description: "@hypit/bundled", tags: ["Card"],
    }]);

    const named = io();
    await runVocabularyCli(["vocabulary", "@hypit/bundled", "--tag", "Card", "--json"], named.io, project, distribution);
    const surfaces = JSON.parse(named.text()).surfaces;
    assert.equal(surfaces.length, 1);
    assert.equal(surfaces[0].package, "@hypit/bundled");
    assert.equal(surfaces[0].tag, "Card");
    assert.equal(basename(surfaces[0].readme), "README.md");

    // Workspace links and project components must not duplicate the bundled listing.
    await packageAt(join(distribution, "node_modules", "@hypit", "bundled"), "@hypit/bundled");
    await packageAt(join(project, "packages", "local"), "@studio/local");
    await packageAt(join(project, "node_modules", "@studio", "custom"), "@studio/custom", "project package");
    await packageAt(join(distribution, "packages", "custom"), "@studio/custom", "distribution fallback");
    const listing = await listPackages(project, distribution);
    assert.deepEqual(listing.map((item) => item.name).sort(), ["@hypit/bundled", "@studio/custom", "@studio/local"]);
    assert.equal(listing.find((item) => item.name === "@studio/custom")!.description, "project package");
    assert.ok(listing.every((item) => item.unreadable === undefined && item.tags.includes("Card")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a named package answers with its own Surfaces only", async () => {
  const surfaces = await listSurfaces(repositoryRoot, ["@hypit/media-operations"], ["StillVideo"]);
  assert.equal(surfaces.length, 1);
  const [still] = surfaces;
  assert.equal(still!.package, "@hypit/media-operations");
  assert.equal(still!.tag, "StillVideo");
  const vocabulary = still!.vocabulary as { attributes: readonly { name: string }[] };
  assert.ok(vocabulary.attributes.some((attribute) => attribute.name === "duration"));
  assert.ok(still!.readme !== undefined);
  assert.equal(basename(still!.readme), "README.md");
  assert.equal(basename(dirname(still!.readme)), "media-operations");
});

test("the visual schema prints every shape and refuses an unknown one", () => {
  const all = visualSchema();
  assert.ok(all.shapes.some((item) => item.shape === "text"));
  assert.ok(all.rules.length > 0);
  assert.equal(visualSchema("box").shapes.length, 1);
  assert.throws(() => visualSchema("sprite"), /shape must be one of/);
});

test("the command prints human and JSON views", async () => {
  const human = io();
  await runVocabularyCli(["vocabulary", "@hypit/media-operations", "--tag", "StillVideo"], human.io, repositoryRoot);
  assert.match(human.text(), /<StillVideo>/);
  assert.match(human.text(), /duration/);

  const json = io();
  await runVocabularyCli(["vocabulary", "--json"], json.io, repositoryRoot);
  const parsed = JSON.parse(json.text()) as { packages: readonly { name: string }[] };
  assert.ok(parsed.packages.some((item) => item.name === "@hypit/media-operations"));

  await assert.rejects(runVocabularyCli(["vocabulary", "--tag", "x"], io().io, repositoryRoot), /name the package first/);
});

test("the human view distinguishes logical Modules contributed by one physical package", async () => {
  const human = io();
  await runVocabularyCli(["vocabulary", "@hypit/gpt-image", "--tag", "Image"], human.io, repositoryRoot);
  assert.match(human.text(), /package  @hypit\/gpt-image/u);
  assert.match(human.text(), /module   @hypit\/gpt-image@1/u);
  assert.match(human.text(), /import   <import as="gpt" from="@hypit\/gpt-image@1"\/>/u);
  assert.match(human.text(), /module   @hypit\/gpt-image\/clean@1/u);
  assert.match(human.text(), /import   <import as="gpt" from="@hypit\/gpt-image\/clean@1"\/>/u);
  assert.match(human.text(), /image  Blob \(@hypit\/blob@1\)/u);
  assert.doesNotMatch(human.text(), /\{"name":"image"/u);
});

test("the printed import uses the Surface's own prefix when its example opens with another element", async () => {
  const human = io();
  await runVocabularyCli(["vocabulary", "@hypit/visual-track", "--tag", "Track"], human.io, repositoryRoot);
  assert.match(human.text(), /example\n\s+<visual:Motion/u);
  assert.match(human.text(), /import   <import as="visual" from="@hypit\/visual-track@1"\/>/u);
});
