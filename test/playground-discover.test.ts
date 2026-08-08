import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { discover } from "../tools/playground/src/svs/discover.js";
import { within } from "../tools/playground/src/server/browse.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/u, "");
const golden = readFileSync(
  fileURLToPath(new URL("../examples/talking-film-golden/studio.svs", import.meta.url)),
  "utf8",
);

test("a stylesheet is read as a list of things to preview", () => {
  const found = discover("studio.svs", golden);
  assert.equal(found.sheetId, "studio");

  // A Film Recipe is not a preview subject: it says how big the frame is.
  assert.deepEqual(found.canvases, [{
    path: "film.vertical", width: 1080, height: 1920, fps: 30, clearColor: "#09090B",
  }]);

  assert.deepEqual(
    found.subjects.map((subject) => [subject.path, subject.component.id]),
    [
      ["caption.dialogue", "caption"],
      ["caption.alice", "caption"],
      ["caption.bob", "caption"],
      ["text.title", "text-track"],
    ],
  );

  // Reported rather than dropped. These are real Recipes with no preview yet,
  // and naming them is the difference between a gap and a silent omission.
  assert.deepEqual(
    found.unmatched.map((entry) => entry.path),
    ["font.inter-semibold", "font.inter-black", "speech.full", "broll.product", "caption.short-cues"],
  );
});

test("Recipes sharing a path prefix are told apart by their shape", () => {
  const found = discover("studio.svs", golden);
  // caption.dialogue previews; caption.short-cues is Gemini planning config.
  assert.ok(found.subjects.some((subject) => subject.path === "caption.dialogue"));
  assert.ok(found.unmatched.some((entry) => entry.path === "caption.short-cues"));
});

test("each Recipe carries its own draft, so like-shaped ones stay distinct", () => {
  const subjects = discover("studio.svs", golden).subjects;
  assert.equal(new Set(subjects.map((subject) => subject.key)).size, subjects.length);
  const alice = subjects.find((subject) => subject.path === "caption.alice")!;
  const bob = subjects.find((subject) => subject.path === "caption.bob")!;
  const fill = (value: unknown) => (value as Record<string, unknown>)["fill"];
  assert.equal(fill(alice.parameters), "#73FBD3");
  assert.notEqual(fill(alice.parameters), fill(bob.parameters));
});

test("a source that is not a stylesheet is refused by name", () => {
  assert.throws(
    () => discover("main.svml", '<?svml using="@narratage/text@1"?>\n<svml/>\n'),
    /not a stylesheet/u,
  );
});

test("browsing cannot leave the repository", () => {
  assert.equal(within(repoRoot, "examples"), `${repoRoot}/examples`);
  assert.equal(within(repoRoot, "."), repoRoot);
  // Containment is checked on the resolved path, so traversal is refused
  // however it is spelled.
  assert.equal(within(repoRoot, ".."), undefined);
  assert.equal(within(repoRoot, "examples/../.."), undefined);
  assert.equal(within(repoRoot, "/etc/passwd"), undefined);
  // A sibling directory whose name merely starts with the root is not inside it.
  assert.equal(within("/srv/app", "/srv/app-secrets/key"), undefined);
});
