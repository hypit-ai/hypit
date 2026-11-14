import assert from "node:assert/strict";
import test from "node:test";

import { applyNleTransaction, createNleProject, nleLinearTimeMapping } from "@hypit/nle";

import {
  nleTransactionAffectsProgramme,
  nleTransactionChanges,
  nleTransactionItemPreviewInvalidations,
  nleViewTransactionAffectsProgramme,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

function project() {
  return applyNleTransaction(createNleProject({ id: "impact", name: "Impact" }), {
    revision: 0,
    commands: [{
      kind: "track.add",
      track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [{
        id: "camera",
        kind: "present",
        source: "media",
        asset: { path: "../media/camera/camera.media.json" },
        start: second(0),
        duration: second(2),
        sourceTime: nleLinearTimeMapping(second(2)),
        enabled: true,
        picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover" } },
      }] },
    }],
  });
}

test("NLE service impact follows real Programme and source-preview dependencies", () => {
  const document = project();
  const rename = { revision: document.revision, commands: [
    { kind: "item.update" as const, id: "camera", name: "Opening" },
  ] };
  assert.equal(nleTransactionAffectsProgramme(rename), false);
  assert.deepEqual(nleTransactionItemPreviewInvalidations(document, rename), []);

  const move = { revision: document.revision, commands: [
    { kind: "item.move" as const, ids: ["camera"], delta: second(1) },
  ] };
  assert.equal(nleTransactionAffectsProgramme(move), true);
  assert.deepEqual(nleTransactionItemPreviewInvalidations(document, move), []);
  assert.deepEqual(nleTransactionChanges(document, move), {
    project: true,
    tracks: ["picture"],
    items: ["camera"],
  });

  const trim = { revision: document.revision, commands: [
    { kind: "item.trim" as const, id: "camera", edge: "end" as const, at: second(1) },
  ] };
  assert.equal(nleTransactionAffectsProgramme(trim), true);
  assert.deepEqual(nleTransactionItemPreviewInvalidations(document, trim), ["camera"]);
});

test("Timeline View transactions never invalidate the audiovisual Programme", () => {
  assert.equal(nleViewTransactionAffectsProgramme({ revision: 0, commands: [
    { kind: "track-height.set", track: "picture", heightPx: 88 },
  ] }), false);
  assert.equal(nleViewTransactionAffectsProgramme({ revision: 0, commands: [
    { kind: "view.update", editRate: { numerator: 24, denominator: 1 } },
  ] }), false);
});

