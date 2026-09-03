import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { CliIo } from "@hypit/cli";

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
  const pipeline = listing.find((item) => item.name === "@hypit/media-pipeline");
  assert.ok(pipeline !== undefined, "media-pipeline is listed");
  assert.ok(pipeline.tags.includes("StillVideo"), `tags: ${pipeline.tags.join(", ")}`);
  assert.equal(pipeline.unreadable, undefined);
});

test("a named package answers with its own Surfaces only", async () => {
  const surfaces = await listSurfaces(repositoryRoot, ["@hypit/media-pipeline"], ["StillVideo"]);
  assert.equal(surfaces.length, 1);
  const [still] = surfaces;
  assert.equal(still!.package, "@hypit/media-pipeline");
  assert.equal(still!.tag, "StillVideo");
  const vocabulary = still!.vocabulary as { attributes: readonly { name: string }[] };
  assert.ok(vocabulary.attributes.some((attribute) => attribute.name === "duration"));
  assert.match(still!.readme ?? "", /media-pipeline\/README\.md$/);
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
  await runVocabularyCli(["vocabulary", "@hypit/media-pipeline", "--tag", "StillVideo"], human.io, repositoryRoot);
  assert.match(human.text(), /<StillVideo>/);
  assert.match(human.text(), /duration/);

  const json = io();
  await runVocabularyCli(["vocabulary", "--json"], json.io, repositoryRoot);
  const parsed = JSON.parse(json.text()) as { packages: readonly { name: string }[] };
  assert.ok(parsed.packages.some((item) => item.name === "@hypit/media-pipeline"));

  await assert.rejects(runVocabularyCli(["vocabulary", "--tag", "x"], io().io, repositoryRoot), /name the package first/);
});
