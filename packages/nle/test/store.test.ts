import assert from "node:assert/strict";
import test from "node:test";

import {
  NleSaveTicketMismatch,
  commitNleEdit,
  completeNleProjectSave,
  createNleEditSession,
  createNleProject,
  isNleEditSessionDirty,
  openNleProjectText,
  prepareNleProjectSave,
  undoNleEdit,
  type NleEditSession,
} from "../src/index.js";

function session(): NleEditSession {
  return createNleEditSession(createNleProject({
    id: "project-file",
    name: "Project file",
    editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
  }));
}

function addTrack(value: NleEditSession, id: string): NleEditSession {
  return commitNleEdit(value, {
    label: `Add ${id}`,
    transaction: { revision: value.current.revision, commands: [{
      kind: "track.add",
      track: { id, name: id, kind: "picture", locked: false, muted: false, items: [] },
    }] },
  });
}

test("the project file is strict JSON containing current NLE facts but no Session history", () => {
  const edited = addTrack(session(), "picture-main");
  const ticket = prepareNleProjectSave(edited);
  const json = JSON.parse(ticket.text) as Record<string, unknown>;

  assert.equal(json.format, "hypit.nle@1");
  assert.equal(json.revision, 1);
  assert.ok(Array.isArray(json.tracks));
  assert.equal("history" in json, false);
  assert.equal("cursor" in json, false);
  assert.equal("savepoint" in json, false);

  const reopened = openNleProjectText(ticket.text);
  assert.deepEqual(reopened.current, edited.current);
  assert.equal(reopened.history.length, 0);
  assert.equal(isNleEditSessionDirty(reopened), false);
});

test("an asynchronous save confirms only the exact prepared history position", () => {
  const first = addTrack(session(), "picture-main");
  const ticket = prepareNleProjectSave(first);
  const later = addTrack(first, "titles");
  const completed = completeNleProjectSave(later, ticket);

  assert.equal(completed.current.tracks.length, 2);
  assert.equal(completed.savepoint, first.position);
  assert.equal(isNleEditSessionDirty(completed), true);

  const restored = undoNleEdit(completed);
  assert.equal(restored.current.tracks.length, 1);
  assert.equal(isNleEditSessionDirty(restored), false);
});

test("a completed ticket cannot mark a replacement history branch clean", () => {
  const first = addTrack(session(), "picture-main");
  const second = addTrack(first, "old-branch");
  const ticket = prepareNleProjectSave(second);
  const undone = undoNleEdit(second);
  const replacement = addTrack(undone, "new-branch");
  const completed = completeNleProjectSave(replacement, ticket);

  assert.deepEqual(completed.current.tracks.map((track) => track.id), ["picture-main", "new-branch"]);
  assert.equal(completed.savepoint, undefined);
  assert.equal(isNleEditSessionDirty(completed), true);
});

test("save tickets cannot cross open document sessions", () => {
  const ticket = prepareNleProjectSave(session());
  assert.throws(() => completeNleProjectSave(session(), ticket), NleSaveTicketMismatch);
});
