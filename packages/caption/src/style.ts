import type { CaptionWord, CaptionWordSequence, CaptionWordSubset } from "@narratage/narrative";
import { canonicalize, digestOf } from "@narratage/protocol";

import { assertCaptionWordSequence, assertCaptionWordSubset } from "./display.js";
import type {
  CaptionFieldDeclaration,
  CaptionProgram,
  CaptionStyleIntent,
} from "./types.js";

export type CaptionStyleApplication = {
  readonly id: string;
  readonly words: CaptionWordSubset;
  readonly style: CaptionStyleIntent;
};

const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizedField(field: CaptionFieldDeclaration): CaptionFieldDeclaration {
  return {
    id: field.id,
    value: field.value.kind === "enum"
      ? { kind: "enum", values: [...field.value.values] }
      : field.value.kind === "number"
        ? {
            kind: "number",
            ...(field.value.minimum === undefined ? {} : { minimum: field.value.minimum }),
            ...(field.value.maximum === undefined ? {} : { maximum: field.value.maximum }),
          }
        : { kind: "boolean" },
    instruction: field.instruction.trim(),
    minimumPerCue: field.minimumPerCue,
    maximumPerCue: field.maximumPerCue,
  };
}

function styleContent(value: CaptionStyleIntent): CaptionStyleIntent {
  return canonicalize({
    contract: "svml.caption-style@1",
    id: value.id,
    planning: {
      cue: {
        minimumWords: value.planning.cue.minimumWords,
        maximumWords: value.planning.cue.maximumWords,
        instruction: value.planning.cue.instruction.trim(),
      },
      fields: value.planning.fields.map(normalizedField),
    },
    rendering: {
      family: value.rendering.family.trim(),
      parameters: canonicalize(value.rendering.parameters),
    },
  }) as unknown as CaptionStyleIntent;
}

export function sealCaptionStyle(value: CaptionStyleIntent): CaptionStyleIntent {
  const result = styleContent(value);
  assertCaptionStyle(result);
  return result;
}

export function assertCaptionStyle(value: CaptionStyleIntent): void {
  assert(value.contract === "svml.caption-style@1" && ID.test(value.id), "Caption Style identity is invalid");
  const cue = value.planning.cue;
  assert(Number.isSafeInteger(cue.minimumWords) && cue.minimumWords > 0,
    `Caption Style ${value.id} Cue minimum is invalid`);
  assert(Number.isSafeInteger(cue.maximumWords) && cue.maximumWords >= cue.minimumWords,
    `Caption Style ${value.id} Cue maximum is invalid`);
  assert(cue.instruction.length > 0, `Caption Style ${value.id} Cue instruction is empty`);
  const fields = new Set<string>();
  for (const field of value.planning.fields) {
    assert(ID.test(field.id) && !fields.has(field.id), `Caption Style ${value.id} field id is invalid or repeated`);
    fields.add(field.id);
    assert(field.instruction.trim().length > 0, `Caption Style ${value.id} field instruction is empty`);
    assert(Number.isSafeInteger(field.minimumPerCue) && field.minimumPerCue >= 0,
      `Caption Style ${value.id} field minimum is invalid`);
    assert(Number.isSafeInteger(field.maximumPerCue) && field.maximumPerCue >= field.minimumPerCue,
      `Caption Style ${value.id} field maximum is invalid`);
    assert(field.maximumPerCue <= cue.maximumWords,
      `Caption Style ${value.id} field maximum exceeds its Cue word maximum`);
    if (field.value.kind === "enum") {
      assert(field.value.values.length > 0 && new Set(field.value.values).size === field.value.values.length,
        `Caption Style ${value.id} field enum is invalid`);
    } else if (field.value.kind === "number") {
      assert(field.value.minimum === undefined || Number.isFinite(field.value.minimum),
        `Caption Style ${value.id} field numeric minimum is invalid`);
      assert(field.value.maximum === undefined || Number.isFinite(field.value.maximum),
        `Caption Style ${value.id} field numeric maximum is invalid`);
    }
  }
  assert(value.rendering.family.length > 0, `Caption Style ${value.id} rendering family is empty`);
  canonicalize(value.rendering.parameters);
}

function programContent(value: CaptionProgram) {
  return canonicalize(value) as unknown as CaptionProgram;
}

export function sealCaptionProgram(value: CaptionProgram): CaptionProgram {
  const result = programContent(value);
  assertCaptionProgram(result);
  return result;
}

export function assertCaptionProgram(value: CaptionProgram): void {
  assert(value.contract === "svml.caption-program@1" && ID.test(value.id), "Caption Program identity is invalid");
  assert(value.wordSequenceId.length > 0 && value.runs.length > 0 && value.styles.length > 0,
    "Caption Program is empty");
  const styles = new Map(value.styles.map((style) => [style.id, style]));
  assert(styles.size === value.styles.length && styles.has(value.defaultStyleId), "Caption Program styles are invalid");
  value.styles.forEach(assertCaptionStyle);
  const families = new Set(value.styles.map((style) => style.rendering.family));
  assert(families.size === 1, "One Caption Program must use one Style rendering family");
  assert(new Set(value.runs.map((run) => run.id)).size === value.runs.length,
    "Caption Program run ids are repeated");
  const planned = value.runs.flatMap((run) => run.wordIds);
  assert(new Set(planned).size === planned.length, "Caption Program runs repeat a display word");
  assert(value.runs.every((run) => styles.has(run.styleId) && run.wordIds.length > 0),
    "Caption Program run style is invalid");
  for (const run of value.runs) {
    const style = styles.get(run.styleId)!;
    const fewestCues = Math.ceil(run.wordIds.length / style.planning.cue.maximumWords);
    const mostCues = Math.floor(run.wordIds.length / style.planning.cue.minimumWords);
    assert(fewestCues <= mostCues,
      `Caption Program run ${run.id} cannot satisfy Style ${style.id} Cue word bounds`);
  }
}

/** Bind a Program's immutable display universe to the exact Script-produced sequence. */
export function assertCaptionProgramForWords(value: CaptionProgram, sequence: CaptionWordSequence): void {
  assertCaptionProgram(value);
  assertCaptionWordSequence(sequence);
  assert(value.wordSequenceId === sequence.id
    && value.runs.flatMap((run) => run.wordIds).join("\0") === sequence.words.map((word) => word.id).join("\0"),
  "Caption Program does not partition its CaptionWordSequence exactly once and in order");
}

/** Resolve an explicit default Style plus ordered whole-Style replacements. Later applications win. */
export function resolveCaptionProgram(
  sequence: CaptionWordSequence,
  id: string,
  defaultStyle: CaptionStyleIntent,
  applications: readonly CaptionStyleApplication[],
): CaptionProgram {
  assertCaptionWordSequence(sequence);
  assertCaptionStyle(defaultStyle);
  applications.forEach((application) => {
    assert(ID.test(application.id), "Caption Style Application identity is invalid");
    assertCaptionStyle(application.style);
    assertCaptionWordSubset(application.words, sequence);
    assert(application.words.wordIds.length > 0, `Caption application ${application.id} selects no visible display word`);
  });
  const styles = new Map<string, CaptionStyleIntent>([[defaultStyle.id, defaultStyle]]);
  applications.forEach((application) => {
    const previous = styles.get(application.style.id);
    assert(previous === undefined || digestOf(previous) === digestOf(application.style),
      `Caption Style ${application.style.id} has conflicting definitions`);
    styles.set(application.style.id, application.style);
  });
  const selected = applications.map((application) => new Set(application.words.wordIds));
  const assignments = sequence.words.map((word) => {
    let styleId = defaultStyle.id;
    applications.forEach((application, index) => {
      if (selected[index]!.has(word.id)) styleId = application.style.id;
    });
    return { word, styleId };
  });
  const runs: Array<{ id: string; styleId: string; wordIds: string[]; turnId: string; segmentId: string }> = [];
  for (const assignment of assignments) {
    const current = runs.at(-1);
    if (current === undefined || current.styleId !== assignment.styleId
      || current.turnId !== assignment.word.turnId || current.segmentId !== assignment.word.segmentId) {
      runs.push({
        id: `${id}:run:${runs.length + 1}`,
        styleId: assignment.styleId,
        wordIds: [assignment.word.id],
        turnId: assignment.word.turnId,
        segmentId: assignment.word.segmentId,
      });
    } else {
      current.wordIds.push(assignment.word.id);
    }
  }
  const program = sealCaptionProgram({
    contract: "svml.caption-program@1",
    id,
    wordSequenceId: sequence.id,
    defaultStyleId: defaultStyle.id,
    styles: [...styles.values()],
    runs: runs.map(({ turnId: _turn, segmentId: _segment, ...run }) => run),
  });
  assertCaptionProgramForWords(program, sequence);
  return program;
}

export type { CaptionWord };
