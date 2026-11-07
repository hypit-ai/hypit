import { assertProgramSource, pictureType } from "@hypit/audiovisual";
import type { ProgramSource } from "@hypit/audiovisual";
import { canonicalStringify } from "@hypit/hypit/protocol";
import { assertLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertLocalTemporalDomain,
  assertTemporalMap,
  assertTemporalMapRegionSet,
  compareTemporalMapPoints,
  preimageTemporalMapRegions,
} from "@hypit/temporal/algebra";
import type {
  TemporalMap,
  TemporalMapPoint,
  TemporalMapRegion,
  TemporalMapRegionSet,
} from "@hypit/temporal/algebra";

import type {
  CaptionComponentSpec,
  CaptionDocument,
  CaptionProjection,
  CaptionPresentation,
  CaptionPresentationOverrideSpec,
  CaptionPresentationSchedule,
  CaptionPresentationValue,
  CaptionSelection,
  CaptionStyle,
  CaptionUnitEventSpec,
  LocalCaptionTiming,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function unique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    identity(value, label);
    assert(!seen.has(value), `${label} repeats ${value}.`);
    seen.add(value);
  }
}

function uniqueLabels(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assert(value.trim().length > 0, `${label} is empty.`);
    assert(!seen.has(value), `${label} repeats ${value}.`);
    seen.add(value);
  }
}

export function assertCaptionDocument(value: CaptionDocument): void {
  identity(value.id, "CaptionDocument id");
  unique(value.units.map((unit) => unit.id), "CaptionDocument unit id");
  unique(value.words.map((word) => word.id), "CaptionDocument word id");
  unique(value.cues.map((cue) => cue.id), "CaptionDocument cue id");
  const units = new Map(value.units.map((unit) => [unit.id, unit]));
  const words = new Map(value.words.map((word) => [word.id, word]));
  for (const unit of value.units) {
    assert(unit.wordIds.length > 0, `Caption unit ${unit.id} has no words.`);
    unique(unit.wordIds, `Caption unit ${unit.id} word`);
    for (const wordId of unit.wordIds) {
      const word = words.get(wordId);
      assert(word !== undefined, `Caption unit ${unit.id} references missing word ${wordId}.`);
      assert(word.unitId === unit.id, `Caption word ${wordId} belongs to ${word.unitId}, not ${unit.id}.`);
    }
  }
  for (const word of value.words) {
    identity(word.unitId, `Caption word ${word.id} unit`);
    assert(units.has(word.unitId), `Caption word ${word.id} references missing unit ${word.unitId}.`);
    assert(word.text.length > 0, `Caption word ${word.id} is empty.`);
    assert(word.separatorBefore === "" || word.separatorBefore === " ",
      `Caption word ${word.id} separator is invalid.`);
  }
  for (const cue of value.cues) {
    assert(cue.unitIds.length > 0, `Caption cue ${cue.id} has no units.`);
    unique(cue.unitIds, `Caption cue ${cue.id} unit`);
    for (const unitId of cue.unitIds) {
      assert(units.has(unitId), `Caption cue ${cue.id} references missing unit ${unitId}.`);
    }
    if (cue.role !== undefined) assert(cue.role.trim().length > 0, `Caption cue ${cue.id} role is empty.`);
  }
}

export function assertLocalCaptionTiming(value: LocalCaptionTiming): void {
  identity(value.documentId, "LocalCaptionTiming document id");
  assertLocalTemporalDomain(value.domain);
  unique(value.units.map((unit) => unit.unitId), "LocalCaptionTiming unit id");
  for (const unit of value.units) {
    assert(unit.regions.length > 0, `LocalCaptionTiming unit ${unit.unitId} has no regions.`);
    assertTemporalMapRegionSet({ domain: value.domain, regions: unit.regions });
  }
}

export function assertCaptionSelection(value: CaptionSelection): void {
  assert(value.kind === "all" || value.kind === "cues" || value.kind === "units",
    "CaptionSelection kind is invalid.");
  if (value.kind !== "all") unique(value.ids, `CaptionSelection ${value.kind}`);
}

export function assertCaptionStyle(value: CaptionStyle): void {
  identity(value.id, "CaptionStyle id");
  identity(value.family, "CaptionStyle family");
  assert(value.parameters !== undefined, "CaptionStyle parameters are missing.");
}

export function assertCaptionPresentationOverrideSpec(value: CaptionPresentationOverrideSpec): void {
  identity(value.id, "Caption presentation override id");
  const selector = value.selector;
  assert(selector !== null && typeof selector === "object" && !Array.isArray(selector),
    `Caption presentation override ${value.id} selector is invalid.`);
  assert(selector.roles !== undefined || selector.cues !== undefined,
    `Caption presentation override ${value.id} selector is empty.`);
  if (selector.roles !== undefined) {
    assert(selector.roles.length > 0, `Caption presentation override ${value.id} roles are empty.`);
    uniqueLabels(selector.roles, `Caption presentation override ${value.id} role`);
  }
  if (selector.cues !== undefined) {
    assert(selector.cues.length > 0, `Caption presentation override ${value.id} cues are empty.`);
    unique(selector.cues, `Caption presentation override ${value.id} cue`);
  }
}

export function assertCaptionPresentation(value: CaptionPresentation): void {
  identity(value.baseStyleId, "Caption presentation base Style");
  identity(value.family, "Caption presentation family");
  assert(value.styles.length > 0, "Caption presentation has no Styles.");
  const styles = new Map<string, CaptionStyle>();
  for (const style of value.styles) {
    assertCaptionStyle(style);
    assert(!styles.has(style.id), `Caption presentation repeats Style ${style.id}.`);
    assert(style.family === value.family,
      `Caption presentation cannot mix family ${style.family} with ${value.family}.`);
    styles.set(style.id, style);
  }
  assert(styles.has(value.baseStyleId), `Caption presentation has no base Style ${value.baseStyleId}.`);
  const ids = new Set<string>();
  for (const override of value.overrides) {
    assertCaptionPresentationOverrideSpec(override);
    assert(!ids.has(override.id), `Caption presentation repeats override ${override.id}.`);
    ids.add(override.id);
    assert(override.use.kind === "hidden" || override.use.kind === "style",
      `Caption presentation override ${override.id} use is invalid.`);
    if (override.use.kind === "style") {
      assert(styles.has(override.use.styleId),
        `Caption presentation override ${override.id} references missing Style ${override.use.styleId}.`);
    }
  }
}

export function assertCaptionPresentationSchedule(value: CaptionPresentationSchedule): void {
  identity(value.documentId, "Caption presentation Schedule document id");
  assertLocalTemporalDomain(value.domain);
  const styles = new Set<string>();
  for (const style of value.styles) {
    assertCaptionStyle(style);
    assert(!styles.has(style.id), `Caption presentation Schedule repeats Style ${style.id}.`);
    styles.add(style.id);
  }
  const cues = new Set<string>();
  for (const cue of value.cues) {
    identity(cue.cueId, "Caption presentation Schedule Cue id");
    assert(!cues.has(cue.cueId), `Caption presentation Schedule repeats Cue ${cue.cueId}.`);
    cues.add(cue.cueId);
    assert(cue.unitIds.length > 0, `Caption presentation Schedule Cue ${cue.cueId} has no units.`);
    unique(cue.unitIds, `Caption presentation Schedule Cue ${cue.cueId} unit`);
    assertTemporalMapRegionSet({ domain: value.domain, regions: cue.regions });
    if (cue.presentation.kind === "style") {
      assert(styles.has(cue.presentation.styleId),
        `Caption presentation Schedule Cue ${cue.cueId} references missing Style ${cue.presentation.styleId}.`);
    } else {
      assert(cue.presentation.kind === "hidden",
        `Caption presentation Schedule Cue ${cue.cueId} presentation is invalid.`);
    }
  }
}

export function createCaptionPresentation(style: CaptionStyle): CaptionPresentation {
  assertCaptionStyle(style);
  return {
    family: style.family,
    baseStyleId: style.id,
    styles: [structuredClone(style)],
    overrides: [],
  };
}

export function appendCaptionStyleOverride(
  presentation: CaptionPresentation,
  spec: CaptionPresentationOverrideSpec,
  style: CaptionStyle,
): CaptionPresentation {
  assertCaptionPresentation(presentation);
  assertCaptionPresentationOverrideSpec(spec);
  assertCaptionStyle(style);
  assert(style.family === presentation.family,
    `Caption presentation cannot mix family ${style.family} with ${presentation.family}.`);
  const existing = presentation.styles.find((candidate) => candidate.id === style.id);
  assert(existing === undefined || canonicalStringify(existing) === canonicalStringify(style),
    `Caption Style ${style.id} has conflicting definitions.`);
  const result: CaptionPresentation = {
    ...structuredClone(presentation),
    styles: existing === undefined ? [...structuredClone(presentation.styles), structuredClone(style)]
      : structuredClone(presentation.styles),
    overrides: [...structuredClone(presentation.overrides), {
      ...structuredClone(spec), use: { kind: "style", styleId: style.id },
    }],
  };
  assertCaptionPresentation(result);
  return result;
}

export function appendCaptionHiddenOverride(
  presentation: CaptionPresentation,
  spec: CaptionPresentationOverrideSpec,
): CaptionPresentation {
  assertCaptionPresentation(presentation);
  assertCaptionPresentationOverrideSpec(spec);
  const result: CaptionPresentation = {
    ...structuredClone(presentation),
    overrides: [...structuredClone(presentation.overrides), {
      ...structuredClone(spec), use: { kind: "hidden" },
    }],
  };
  assertCaptionPresentation(result);
  return result;
}

export function assertCaptionComponentSpec(value: CaptionComponentSpec): void {
  identity(value.id, "CaptionComponentSpec id");
  assertLocalSpatialDomain(value.pictureDomain);
  assertCaptionSelection(value.selection);
}

export function assertCaptionUnitEventSpec(value: CaptionUnitEventSpec): void {
  identity(value.unitId, "CaptionUnitEventSpec unit");
  assert(value.edge === "start" || value.edge === "end", "CaptionUnitEventSpec edge is invalid.");
}

export function captionSelectedUnitIds(
  document: CaptionDocument,
  selection: CaptionSelection,
): readonly string[] {
  assertCaptionDocument(document);
  assertCaptionSelection(selection);
  if (selection.kind === "all") return document.units.map((unit) => unit.id);
  if (selection.kind === "units") {
    const known = new Set(document.units.map((unit) => unit.id));
    for (const id of selection.ids) assert(known.has(id), `Caption selection references missing unit ${id}.`);
    return [...selection.ids];
  }
  const cues = new Map(document.cues.map((cue) => [cue.id, cue]));
  return selection.ids.flatMap((id) => {
    const cue = cues.get(id);
    assert(cue !== undefined, `Caption selection references missing cue ${id}.`);
    return cue.unitIds;
  });
}

export function assertCaptionInputs(
  spec: CaptionComponentSpec,
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  presentation: CaptionPresentation | CaptionStyle,
): void {
  assertCaptionComponentSpec(spec);
  assertCaptionDocument(document);
  assertLocalCaptionTiming(timing);
  assertCaptionPresentation("overrides" in presentation
    ? presentation : createCaptionPresentation(presentation));
  assert(timing.documentId === document.id,
    `Caption timing belongs to ${timing.documentId}, not document ${document.id}.`);
  const timed = new Set(timing.units.map((unit) => unit.unitId));
  for (const unit of captionSelectedUnitIds(document, spec.selection)) {
    assert(timed.has(unit), `Caption selected unit ${unit} has no local timing.`);
  }
}

function normalizedPresentation(value: CaptionPresentation | CaptionStyle): CaptionPresentation {
  return "overrides" in value ? structuredClone(value) : createCaptionPresentation(value);
}

function overrideMatches(
  override: CaptionPresentation["overrides"][number],
  cue: CaptionDocument["cues"][number],
): boolean {
  return (override.selector.roles === undefined
      || cue.role !== undefined && override.selector.roles.includes(cue.role))
    && (override.selector.cues === undefined || override.selector.cues.includes(cue.id));
}

function cueEnvelope(regions: readonly TemporalMapRegion[]): readonly TemporalMapRegion[] {
  assert(regions.length > 0, "Caption Cue has no local timing.");
  const ordered = [...regions].sort((left, right) =>
    compareTemporalMapPoints(left.start, right.start)
    || compareTemporalMapPoints(left.end, right.end));
  const end = ordered.reduce((latest, region) =>
    compareTemporalMapPoints(region.end, latest) > 0 ? region.end : latest, ordered[0]!.end);
  return [{ start: structuredClone(ordered[0]!.start), end: structuredClone(end) }];
}

/** Resolve ordered presentation rules without changing Caption timing or Cue identity. */
export function scheduleCaptionPresentation(
  spec: CaptionComponentSpec,
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  value: CaptionPresentation | CaptionStyle,
): CaptionPresentationSchedule {
  const presentation = normalizedPresentation(value);
  assertCaptionInputs(spec, document, timing, presentation);
  const selected = new Set(captionSelectedUnitIds(document, spec.selection));
  const timed = new Map(timing.units.map((unit) => [unit.unitId, unit.regions]));
  const knownCues = new Set(document.cues.map((cue) => cue.id));
  const knownRoles = new Set(document.cues.flatMap((cue) => cue.role === undefined ? [] : [cue.role]));
  for (const override of presentation.overrides) {
    for (const cue of override.selector.cues ?? []) {
      assert(knownCues.has(cue), `Caption override ${override.id} references missing Cue ${cue}.`);
    }
    for (const role of override.selector.roles ?? []) {
      assert(knownRoles.has(role), `Caption override ${override.id} references missing Role ${role}.`);
    }
  }
  const cues = document.cues.flatMap((cue) => {
    const unitIds = cue.unitIds.filter((unit) => selected.has(unit));
    if (unitIds.length === 0) return [];
    const regions = cueEnvelope(unitIds.flatMap((unit) => timed.get(unit) ?? []));
    let presentationValue: CaptionPresentationValue = {
      kind: "style", styleId: presentation.baseStyleId,
    };
    let overrideId: string | undefined;
    for (const override of presentation.overrides) {
      if (!overrideMatches(override, cue)) continue;
      presentationValue = structuredClone(override.use);
      overrideId = override.id;
    }
    return [{
      cueId: cue.id,
      unitIds,
      ...(cue.role === undefined ? {} : { role: cue.role }),
      regions,
      presentation: presentationValue,
      ...(overrideId === undefined ? {} : { overrideId }),
    }];
  });
  const result: CaptionPresentationSchedule = {
    documentId: document.id,
    domain: structuredClone(timing.domain),
    styles: structuredClone(presentation.styles),
    cues,
  };
  assertCaptionPresentationSchedule(result);
  return result;
}

function captionCueText(document: CaptionDocument, unitIds: readonly string[]): string {
  const selected = new Set(unitIds);
  return document.words.filter((word) => selected.has(word.unitId))
    .map((word, index) => `${index === 0 ? "" : word.separatorBefore}${word.text}`).join("");
}

/** Project internal Cues without promoting them to parent Programme objects. */
export function projectCaptionCues(
  spec: CaptionComponentSpec,
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  value: CaptionPresentation | CaptionStyle,
  occurrenceMapping?: TemporalMap,
): CaptionProjection {
  const presentation = normalizedPresentation(value);
  const schedule = scheduleCaptionPresentation(spec, document, timing, presentation);
  return projectCaptionScheduleCues(spec.id, document, schedule, presentation, occurrenceMapping);
}

/** Project already-compiled owner outputs; Hosts do not need to reconstruct the Caption graph. */
export function projectCaptionScheduleCues(
  componentId: string,
  document: CaptionDocument,
  schedule: CaptionPresentationSchedule,
  presentation: CaptionPresentation,
  occurrenceMapping?: TemporalMap,
): CaptionProjection {
  identity(componentId, "Caption component id");
  assertCaptionDocument(document);
  assertCaptionPresentationSchedule(schedule);
  assertCaptionPresentation(presentation);
  assert(schedule.documentId === document.id,
    `Caption Schedule belongs to ${schedule.documentId}, not document ${document.id}.`);
  if (occurrenceMapping !== undefined) assertTemporalMap(occurrenceMapping);
  const cues = schedule.cues.map((cue) => {
    const occurrence = occurrenceMapping === undefined ? undefined
      : preimageTemporalMapRegions(occurrenceMapping, {
        domain: schedule.domain, regions: cue.regions,
      });
    return {
      ...structuredClone(cue),
      text: captionCueText(document, cue.unitIds),
      ...(occurrence === undefined ? {} : { occurrenceRegions: occurrence.regions }),
    };
  });
  return {
    componentId,
    sourceDomain: structuredClone(schedule.domain),
    ...(occurrenceMapping === undefined ? {} : {
      occurrenceDomain: structuredClone(occurrenceMapping.stages[0]!.target),
    }),
    cues,
    overrides: structuredClone(presentation.overrides),
  };
}

/** One data-driven Picture Source regardless of selected cue or word count. */
export function captionProgramSource(
  spec: CaptionComponentSpec,
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  presentation: CaptionPresentation | CaptionStyle,
): ProgramSource {
  assertCaptionInputs(spec, document, timing, presentation);
  const source: ProgramSource = {
    id: spec.id,
    outputs: { picture: {
      kind: "signal",
      type: pictureType,
      domain: structuredClone(timing.domain),
      spatialDomain: structuredClone(spec.pictureDomain),
    } },
  };
  assertProgramSource(source);
  return structuredClone(source);
}

export function captionUnitEvent(
  timing: LocalCaptionTiming,
  spec: CaptionUnitEventSpec,
): TemporalMapRegionSet {
  assertLocalCaptionTiming(timing);
  assertCaptionUnitEventSpec(spec);
  const unit = timing.units.find((candidate) => candidate.unitId === spec.unitId);
  assert(unit !== undefined, `Caption timing has no unit ${spec.unitId}.`);
  const points: TemporalMapPoint[] = unit.regions.map((region) => structuredClone(
    spec.edge === "start" ? region.start : region.end,
  ));
  const result = {
    domain: structuredClone(timing.domain),
    regions: points.map((point) => ({ start: point, end: point })),
  };
  assertTemporalMapRegionSet(result);
  return result;
}
