import assert from "node:assert/strict";
import test from "node:test";

import {
  NleHistoryBoundary,
  NleRevisionConflict,
  canRedoNleEdit,
  canUndoNleEdit,
  commitNleEdit,
  createNleEditSession,
  createNleProject,
  findNleItem,
  isNleEditSessionDirty,
  markNleEditSessionSaved,
  nleLinearTimeMapping,
  redoNleEdit,
  undoNleEdit,
  type NleComponentItem,
  type NleEditSession,
} from "../src/index.js";

const picture = {
  layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
} as const;

const time = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

function caption(id: string, text: string, start: number): NleComponentItem {
  return {
    id,
    kind: "present", source: "component",
    start: time(start),
    duration: time(4),
    sourceTime: nleLinearTimeMapping(time(4)),
    enabled: true,
    component: { module: { name: "@example/caption" }, name: "basic" },
    parameters: { text },
    picture,
  };
}

function emptySession(): NleEditSession {
  return createNleEditSession(createNleProject({
    id: "undo-proof",
    name: "Undo proof",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }));
}

function withCaptions(): NleEditSession {
  const session = emptySession();
  return commitNleEdit(session, {
    label: "Add caption track",
    transaction: { revision: 0, commands: [{
      kind: "track.add",
      track: {
        id: "captions",
        name: "Captions",
        kind: "picture",
        muted: false,
        items: [caption("a", "A", 0), caption("b", "B", 8), caption("c", "C", 16)],
      },
    }] },
  });
}

test("one edit intention becomes one undoable history entry", () => {
  let session = emptySession();
  assert.equal(isNleEditSessionDirty(session), false);
  assert.equal(canUndoNleEdit(session), false);

  session = commitNleEdit(session, {
    label: "Import three captions",
    transaction: { revision: 0, commands: [{
      kind: "track.add",
      track: {
        id: "captions",
        name: "Captions",
        kind: "picture",
        muted: false,
        items: [caption("a", "A", 0), caption("b", "B", 8), caption("c", "C", 16)],
      },
    }] },
  });

  assert.equal(session.history.length, 1);
  assert.equal(session.current.tracks[0]?.items.length, 3);
  assert.equal(session.current.revision, 1);
  assert.equal(isNleEditSessionDirty(session), true);

  session = undoNleEdit(session);
  assert.equal(session.current.tracks.length, 0);
  assert.equal(session.current.revision, 2);
  assert.equal(canRedoNleEdit(session), true);
  assert.equal(isNleEditSessionDirty(session), false);

  session = redoNleEdit(session);
  assert.equal(session.current.tracks[0]?.items.length, 3);
  assert.equal(session.current.revision, 3);
  assert.equal(canRedoNleEdit(session), false);
  assert.equal(isNleEditSessionDirty(session), true);
});

test("savepoint follows the logical history cursor while revisions remain monotonic", () => {
  let session = markNleEditSessionSaved(withCaptions());
  assert.equal(session.cursor, 1);
  assert.equal(isNleEditSessionDirty(session), false);

  session = commitNleEdit(session, {
    label: "Move first caption",
    transaction: { revision: 1, commands: [{ kind: "item.move", ids: ["a"], delta: time(5) }] },
  });
  assert.deepEqual(findNleItem(session.current, "a").item.start, time(5));
  assert.equal(session.current.revision, 2);
  assert.equal(isNleEditSessionDirty(session), true);

  session = undoNleEdit(session);
  assert.deepEqual(findNleItem(session.current, "a").item.start, time(0));
  assert.equal(session.current.revision, 3);
  assert.equal(session.cursor, 1);
  assert.equal(isNleEditSessionDirty(session), false);

  session = redoNleEdit(session);
  assert.deepEqual(findNleItem(session.current, "a").item.start, time(5));
  assert.equal(session.current.revision, 4);
  assert.equal(isNleEditSessionDirty(session), true);
});

test("a new edit after undo discards redo without losing exact removed state", () => {
  let session = withCaptions();
  session = commitNleEdit(session, {
    label: "Remove middle caption",
    transaction: { revision: 1, commands: [{ kind: "item.remove", ids: ["b"] }] },
  });
  session = markNleEditSessionSaved(session);
  assert.deepEqual(session.current.tracks[0]?.items.map((item) => item.id), ["a", "c"]);

  session = undoNleEdit(session);
  assert.deepEqual(session.current.tracks[0]?.items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(session.current.revision, 3);
  assert.equal(canRedoNleEdit(session), true);

  session = commitNleEdit(session, {
    label: "Move last caption",
    transaction: { revision: 3, commands: [{ kind: "item.move", ids: ["c"], delta: time(2) }] },
  });
  assert.equal(session.history.length, 2);
  assert.equal(canRedoNleEdit(session), false);
  assert.equal(session.savepoint, undefined);
  assert.equal(isNleEditSessionDirty(session), true);
  assert.throws(() => redoNleEdit(session), NleHistoryBoundary);

  session = undoNleEdit(session);
  assert.deepEqual(session.current.tracks[0]?.items.map((item) => item.id), ["a", "b", "c"]);
  assert.deepEqual(findNleItem(session.current, "c").item.start, time(16));
  assert.equal(isNleEditSessionDirty(session), true);
});

test("failed or stale commits leave the previous session usable", () => {
  const session = withCaptions();
  assert.throws(() => commitNleEdit(session, {
    label: "Stale move",
    transaction: { revision: 0, commands: [{ kind: "item.move", ids: ["a"], delta: time(1) }] },
  }), NleRevisionConflict);
  assert.equal(session.cursor, 1);
  assert.equal(session.current.revision, 1);
  assert.deepEqual(findNleItem(session.current, "a").item.start, time(0));
  assert.throws(() => undoNleEdit(emptySession()), NleHistoryBoundary);
  assert.throws(() => commitNleEdit(session, {
    label: " ",
    transaction: { revision: 1, commands: [] },
  }), /label is empty/u);
});
