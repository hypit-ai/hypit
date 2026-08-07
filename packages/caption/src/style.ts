import type { Narrative, NarrativeSelectionRef } from "@narratage/narrative";
import { canonicalize, digestOf } from "@narratage/protocol";

import { captionDisplayAtoms, displayAtomMatchesSelection } from "./display.js";
import type {
  CaptionDisplayAtom,
  CaptionFieldDeclaration,
  CaptionProgram,
  CaptionStyleIntent,
} from "./types.js";

export type CaptionStyleSelector =
  | { readonly kind: "role"; readonly role: string }
  | { readonly kind: "selection"; readonly selection: NarrativeSelectionRef };

export type CaptionStyleApplication = {
  readonly id: string;
  readonly selector: CaptionStyleSelector;
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

function styleContent(value: CaptionStyleIntent) {
  return canonicalize({
    contract: "svml.caption-style@1",
    id: value.id,
    planning: {
      cueInstruction: value.planning.cueInstruction.trim(),
      fields: value.planning.fields.map(normalizedField),
    },
    presentation: canonicalize(value.presentation),
  }) as unknown as CaptionStyleIntent;
}

export function sealCaptionStyle(value: CaptionStyleIntent): CaptionStyleIntent {
  const result = styleContent(value);
  assertCaptionStyle(result);
  return result;
}

export function assertCaptionStyle(value: CaptionStyleIntent): void {
  assert(value.contract === "svml.caption-style@1" && ID.test(value.id), "Caption Style identity is invalid");
  assert(value.planning.cueInstruction.length > 0, `Caption Style ${value.id} Cue instruction is empty`);
  const fields = new Set<string>();
  for (const field of value.planning.fields) {
    assert(ID.test(field.id) && !fields.has(field.id), `Caption Style ${value.id} field id is invalid or repeated`);
    fields.add(field.id);
    assert(field.instruction.trim().length > 0, `Caption Style ${value.id} field instruction is empty`);
    assert(Number.isSafeInteger(field.minimumPerCue) && field.minimumPerCue >= 0,
      `Caption Style ${value.id} field minimum is invalid`);
    assert(Number.isSafeInteger(field.maximumPerCue) && field.maximumPerCue >= field.minimumPerCue,
      `Caption Style ${value.id} field maximum is invalid`);
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
  assert(Number.isSafeInteger(value.presentation.stackingOrder) && value.presentation.stackingOrder >= 0,
    `Caption Style ${value.id} stacking order is invalid`);
  assert(["whole", "proportional-word", "character-flow"].includes(value.presentation.mode),
    `Caption Style ${value.id} presentation mode is invalid`);
  const appearance = value.presentation.style;
  assert(appearance.fontFamily.trim().length > 0, `Caption Style ${value.id} font family is empty`);
  assert(appearance.textAlign === "left" || appearance.textAlign === "center" || appearance.textAlign === "right",
    `Caption Style ${value.id} text alignment is invalid`);
  const numeric = [
    appearance.fontSizePx,
    appearance.fontWeight,
    appearance.paddingXPx,
    appearance.paddingYPx,
    appearance.borderRadiusPx,
    appearance.bottomPercent,
    appearance.maxWidthPercent,
    appearance.leftPercent,
    appearance.topPercent,
    appearance.widthPercent,
    appearance.lineHeight,
  ].filter((item): item is number => item !== undefined);
  assert(numeric.every((item) => Number.isFinite(item) && item >= 0),
    `Caption Style ${value.id} appearance contains an invalid number`);
  assert(appearance.fontSizePx > 0 && appearance.maxWidthPercent > 0 && appearance.maxWidthPercent <= 100
    && appearance.bottomPercent <= 100,
  `Caption Style ${value.id} appearance bounds are invalid`);
  for (const color of [appearance.color, appearance.backgroundColor].filter((item): item is string => item !== undefined)) {
    assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(color), `Caption Style ${value.id} color ${color} is invalid`);
  }
}

function matches(
  atom: CaptionDisplayAtom,
  application: CaptionStyleApplication,
  narrative: Narrative,
): boolean {
  if (application.selector.kind === "role") return atom.role === application.selector.role;
  return displayAtomMatchesSelection(atom, application.selector.selection, narrative.tokens.length);
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
  assert(value.atoms.length > 0 && value.runs.length > 0 && value.styles.length > 0, "Caption Program is empty");
  const styles = new Map(value.styles.map((style) => [style.id, style]));
  assert(styles.size === value.styles.length && styles.has(value.defaultStyleId), "Caption Program styles are invalid");
  value.styles.forEach(assertCaptionStyle);
  const atomIds = value.atoms.map((atom) => atom.id);
  assert(new Set(atomIds).size === atomIds.length, "Caption Program display atom ids are repeated");
  value.atoms.forEach((atom, index) => {
    assert(atom.id.length > 0 && atom.index === index && atom.regionId.length > 0 && atom.segmentId.length > 0
      && atom.turnId.length > 0 && atom.text.length > 0, "Caption Program display atom identity is invalid");
    assert(Number.isSafeInteger(atom.displayStart) && Number.isSafeInteger(atom.displayEnd)
      && atom.displayStart >= 0 && atom.displayEnd > atom.displayStart,
    `Caption Program display atom ${atom.id} display range is invalid`);
    assert(Number.isSafeInteger(atom.sourceTokenStart) && Number.isSafeInteger(atom.sourceTokenEndExclusive)
      && atom.sourceTokenStart >= 0 && atom.sourceTokenEndExclusive > atom.sourceTokenStart,
    `Caption Program display atom ${atom.id} source range is invalid`);
    assert(atom.correspondence === "exact" || atom.correspondence === "region-envelope",
      `Caption Program display atom ${atom.id} correspondence is invalid`);
  });
  assert(new Set(value.runs.map((run) => run.id)).size === value.runs.length,
    "Caption Program run ids are repeated");
  const planned = value.runs.flatMap((run) => run.atomIds);
  assert(planned.join("\0") === atomIds.join("\0"),
    "Caption Program runs must partition every display atom exactly once and in order");
  assert(value.runs.every((run) => styles.has(run.styleId) && run.atomIds.length > 0), "Caption Program run style is invalid");
}

/** Bind a Program's immutable display universe to the exact Narrative consumed by a Producer. */
export function assertCaptionProgramForNarrative(value: CaptionProgram, narrative: Narrative): void {
  assertCaptionProgram(value);
  assert(digestOf(value.atoms) === digestOf(captionDisplayAtoms(narrative)),
    "Caption Program display atoms differ from its Narrative");
}

/** Resolve a base style plus ordered, whole-style replacements. Later matching applications win. */
export function resolveCaptionProgram(
  narrative: Narrative,
  id: string,
  defaultStyle: CaptionStyleIntent,
  applications: readonly CaptionStyleApplication[],
): CaptionProgram {
  assertCaptionStyle(defaultStyle);
  applications.forEach((application) => {
    assert(ID.test(application.id), "Caption Style Application identity is invalid");
    assertCaptionStyle(application.style);
    if (application.selector.kind === "role") {
      assert(application.selector.role.trim().length > 0, `Caption application ${application.id} Role is empty`);
    }
  });
  const atoms = captionDisplayAtoms(narrative);
  const styles = new Map<string, CaptionStyleIntent>([[defaultStyle.id, defaultStyle]]);
  applications.forEach((application) => {
    const previous = styles.get(application.style.id);
    assert(previous === undefined || digestOf(previous) === digestOf(application.style),
      `Caption Style ${application.style.id} has conflicting definitions`);
    styles.set(application.style.id, application.style);
  });
  for (const application of applications) {
    assert(atoms.some((atom) => matches(atom, application, narrative)),
      `Caption application ${application.id} selects no visible display atom`);
  }
  const assignments = atoms.map((atom) => {
    let styleId = defaultStyle.id;
    for (const application of applications) {
      if (matches(atom, application, narrative)) styleId = application.style.id;
    }
    return { atom, styleId };
  });
  const runs: Array<{ id: string; styleId: string; atomIds: string[]; turnId: string; segmentId: string }> = [];
  for (const assignment of assignments) {
    const current = runs.at(-1);
    if (current === undefined || current.styleId !== assignment.styleId
      || current.turnId !== assignment.atom.turnId || current.segmentId !== assignment.atom.segmentId) {
      runs.push({
        id: `${id}:run:${runs.length + 1}`,
        styleId: assignment.styleId,
        atomIds: [assignment.atom.id],
        turnId: assignment.atom.turnId,
        segmentId: assignment.atom.segmentId,
      });
    } else {
      current.atomIds.push(assignment.atom.id);
    }
  }
  return sealCaptionProgram({
    contract: "svml.caption-program@1",
    id,
    defaultStyleId: defaultStyle.id,
    styles: [...styles.values()],
    atoms,
    runs: runs.map(({ turnId: _turn, segmentId: _segment, ...run }) => run),
  });
}
