import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { textTypes } from "@hypit/text";

import { notepadProducers, notepadTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type NotepadFragmentRow = {
  readonly suffix: string;
  readonly specName: string;
  readonly contentName?: string;
};

/**
 * Builds the Row set, resolves the Schedule against the measured map, folds
 * everything into one Program and renders it to a peer VisualTrack.
 */
export function createNotepadFragment(
  rows: readonly NotepadFragmentRow[],
  hasOpening: boolean,
): GraphFragment {
  if (rows.length === 0) throw new Error("Notepad Fragment requires at least one Row.");
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "header", type: notepadTypes.header },
    { name: "map", type: semanticMapTypes.complete },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "during", type: narrativeTypes.selection },
    { name: "triggers", type: narrativeTypes.moment },
    { name: "terminal", type: narrativeTypes.moment },
    { name: "frame", type: spatialTypes.frame },
    { name: "surface", type: mediaTypes.blobArtifact },
    { name: "style", type: notepadTypes.style },
    { name: "title", type: notepadTypes.title },
  ];
  if (hasOpening) inputs.push({ name: "opening", type: narrativeTypes.selection });

  const operations: FragmentOperation[] = [
    { id: "rows", producer: notepadProducers.createRows, inputs: { header: input("header") }, result: { kind: "output", name: "set" } },
  ];
  let set = operation("rows");
  for (const row of rows) {
    inputs.push({
      name: row.specName,
      type: row.contentName === undefined ? notepadTypes.rowSpec : notepadTypes.rowShell,
    });
    if (row.contentName !== undefined) inputs.push({ name: row.contentName, type: textTypes.text });
    const materializedId = `materialize-${row.suffix}`;
    if (row.contentName !== undefined) operations.push({
      id: materializedId,
      producer: notepadProducers.materializeRow,
      inputs: { shell: input(row.specName), content: input(row.contentName) },
      result: { kind: "output", name: "spec" },
    });
    const resolved = row.contentName === undefined ? input(row.specName) : operation(materializedId);
    const appendId = `row-${row.suffix}`;
    operations.push({
      id: appendId,
      producer: notepadProducers.appendRow,
      inputs: { set, spec: resolved },
      result: { kind: "output", name: "set" },
    });
    set = operation(appendId);
  }

  operations.push({
    id: "schedule",
    producer: hasOpening ? notepadProducers.openedSchedule : notepadProducers.schedule,
    inputs: {
      header: input("header"), rows: set, map: input("map"), space: input("space"),
      during: input("during"), triggers: input("triggers"), terminal: input("terminal"),
      ...(hasOpening ? { opening: input("opening") } : {}),
    },
    result: { kind: "output", name: "schedule" },
  });
  operations.push({
    id: "program",
    producer: notepadProducers.program,
    inputs: {
      header: input("header"), frame: input("frame"), surface: input("surface"),
      schedule: operation("schedule"), style: input("style"), title: input("title"), rows: set,
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "visual",
    producer: notepadProducers.render,
    inputs: { space: input("space"), program: operation("program") },
    result: { kind: "output", name: "track" },
  });

  return sealGraphFragment({
    inputs,
    operations,
    exports: [
      { name: "schedule", type: notepadTypes.schedule, root: operation("schedule") },
      { name: "program", type: notepadTypes.program, root: operation("program") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("visual") },
    ],
  });
}
