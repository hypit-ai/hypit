import {
  assertCaptionDocument,
  assertCaptionSelection,
  assertLocalCaptionTiming,
  captionSelectedUnitIds,
  captionUnitText,
  type CaptionDocument,
  type CaptionSelection,
  type LocalCaptionTiming,
} from "@hypit/caption";
import { canonicalStringify } from "@hypit/protocol";
import {
  assertExactTemporalValue,
  assertTemporalMap,
  assertTemporalMapRegionSet,
  compareExactTemporalValues,
  compareTemporalMapPoints,
  exactTemporalZero,
  preimageTemporalMapRegions,
  type TemporalMap,
  type TemporalMapRegion,
} from "@hypit/temporal/algebra";

import type {
  CaptionPresentation,
  CaptionPresentationOverrideSpec,
  CaptionPresentationSchedule,
  CaptionPresentationValue,
  CaptionProjection,
  CaptionStyle,
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

export function assertCaptionStyle<Family extends string>(value: CaptionStyle<Family>): void {
  identity(value.id, "CaptionStyle id");
  assert(typeof value.family === "string" && value.family.trim().length > 0,
    "CaptionStyle family is invalid.");
  assert(value.parameters !== undefined, "CaptionStyle parameters are missing.");
  if (value.visibility !== undefined) {
    assert(value.visibility !== null && typeof value.visibility === "object" && !Array.isArray(value.visibility),
      "CaptionStyle visibility is invalid.");
    for (const [name, duration] of [["lead", value.visibility.lead], ["tail", value.visibility.tail]] as const) {
      if (duration === undefined) continue;
      assertExactTemporalValue(duration, `CaptionStyle visibility ${name}`);
      assert(compareExactTemporalValues(duration, exactTemporalZero()) >= 0,
        `CaptionStyle visibility ${name} must be non-negative.`);
    }
    assert(value.visibility.handoff === undefined
      || value.visibility.handoff === "cut" || value.visibility.handoff === "overlap",
    "CaptionStyle visibility handoff is invalid.");
  }
}

export function assertCaptionPresentationOverrideSpec(value: CaptionPresentationOverrideSpec): void {
  identity(value.id, "Caption presentation override id");
  assert(value.selector !== null && typeof value.selector === "object" && !Array.isArray(value.selector),
    `Caption presentation override ${value.id} selector is invalid.`);
  assert(value.selector.roles !== undefined || value.selector.cues !== undefined,
    `Caption presentation override ${value.id} selector is empty.`);
  if (value.selector.roles !== undefined) {
    assert(value.selector.roles.length > 0, `Caption presentation override ${value.id} roles are empty.`);
    uniqueLabels(value.selector.roles, `Caption presentation override ${value.id} role`);
  }
  if (value.selector.cues !== undefined) {
    assert(value.selector.cues.length > 0, `Caption presentation override ${value.id} cues are empty.`);
    unique(value.selector.cues, `Caption presentation override ${value.id} cue`);
  }
}

export function assertCaptionPresentation<Family extends string>(value: CaptionPresentation<Family>): void {
  assert(typeof value.family === "string" && value.family.trim().length > 0,
    "Caption presentation family is invalid.");
  identity(value.baseStyleId, "Caption presentation base Style");
  assert(value.styles.length > 0, "Caption presentation has no Styles.");
  const styles = new Map<string, CaptionStyle<Family>>();
  for (const style of value.styles) {
    assertCaptionStyle(style);
    assert(style.family === value.family,
      `Caption Style ${style.id} belongs to ${style.family}, not ${value.family}.`);
    assert(!styles.has(style.id), `Caption presentation repeats Style ${style.id}.`);
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

export function createCaptionPresentation<Family extends string>(
  style: CaptionStyle<Family>,
): CaptionPresentation<Family> {
  assertCaptionStyle(style);
  return { family: style.family, baseStyleId: style.id, styles: [structuredClone(style)], overrides: [] };
}

export function appendCaptionStyleOverride<Family extends string>(
  presentation: CaptionPresentation<Family>,
  spec: CaptionPresentationOverrideSpec,
  style: CaptionStyle<Family>,
): CaptionPresentation<Family> {
  assertCaptionPresentation(presentation);
  assertCaptionPresentationOverrideSpec(spec);
  assertCaptionStyle(style);
  assert(style.family === presentation.family,
    `Caption Style ${style.id} belongs to ${style.family}, not ${presentation.family}.`);
  const existing = presentation.styles.find((candidate) => candidate.id === style.id);
  assert(existing === undefined || canonicalStringify(existing) === canonicalStringify(style),
    `Caption Style ${style.id} has conflicting definitions.`);
  const result: CaptionPresentation<Family> = {
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

export function appendCaptionHiddenOverride<Family extends string>(
  presentation: CaptionPresentation<Family>,
  spec: CaptionPresentationOverrideSpec,
): CaptionPresentation<Family> {
  assertCaptionPresentation(presentation);
  assertCaptionPresentationOverrideSpec(spec);
  const result: CaptionPresentation<Family> = {
    ...structuredClone(presentation),
    overrides: [...structuredClone(presentation.overrides), {
      ...structuredClone(spec), use: { kind: "hidden" },
    }],
  };
  assertCaptionPresentation(result);
  return result;
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
    compareTemporalMapPoints(left.start, right.start) || compareTemporalMapPoints(left.end, right.end));
  const end = ordered.reduce((latest, region) =>
    compareTemporalMapPoints(region.end, latest) > 0 ? region.end : latest, ordered[0]!.end);
  return [{ start: structuredClone(ordered[0]!.start), end: structuredClone(end) }];
}

export function scheduleCaptionPresentation<Family extends string>(
  document: CaptionDocument,
  timing: LocalCaptionTiming,
  value: CaptionPresentation<Family> | CaptionStyle<Family>,
  selection: CaptionSelection = { kind: "all" },
): CaptionPresentationSchedule<Family> {
  assertCaptionDocument(document);
  assertLocalCaptionTiming(timing);
  assertCaptionSelection(selection);
  assert(timing.documentId === document.id,
    `Caption timing belongs to ${timing.documentId}, not document ${document.id}.`);
  const presentation = "overrides" in value ? structuredClone(value) : createCaptionPresentation(value);
  assertCaptionPresentation(presentation);
  const selected = new Set(captionSelectedUnitIds(document, selection));
  const timed = new Map(timing.units.map((unit) => [unit.unitId, unit.regions]));
  for (const unit of selected) assert(timed.has(unit), `Caption selected unit ${unit} has no local timing.`);
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
    let styleId = presentation.baseStyleId;
    let use: CaptionPresentationValue = { kind: "style", styleId };
    let overrideId: string | undefined;
    for (const override of presentation.overrides) {
      if (!overrideMatches(override, cue)) continue;
      use = structuredClone(override.use);
      if (override.use.kind === "style") styleId = override.use.styleId;
      overrideId = override.id;
    }
    return [{
      cueId: cue.id,
      unitIds,
      ...(cue.role === undefined ? {} : { role: cue.role }),
      regions,
      styleId,
      presentation: use,
      ...(overrideId === undefined ? {} : { overrideId }),
    }];
  });
  const result: CaptionPresentationSchedule<Family> = {
    documentId: document.id,
    domain: structuredClone(timing.domain),
    styles: structuredClone(presentation.styles),
    cues,
  };
  for (const cue of result.cues) assertTemporalMapRegionSet({ domain: result.domain, regions: cue.regions });
  return result;
}

export function projectCaptionScheduleCues<Family extends string>(
  componentId: string,
  document: CaptionDocument,
  schedule: CaptionPresentationSchedule<Family>,
  presentation: CaptionPresentation<Family>,
  occurrenceMapping?: TemporalMap,
): CaptionProjection<Family> {
  identity(componentId, "Caption component id");
  assertCaptionDocument(document);
  assertCaptionPresentation(presentation);
  assert(schedule.documentId === document.id,
    `Caption Schedule belongs to ${schedule.documentId}, not document ${document.id}.`);
  if (occurrenceMapping !== undefined) assertTemporalMap(occurrenceMapping);
  const cues = schedule.cues.map((cue) => {
    const occurrence = occurrenceMapping === undefined ? undefined
      : preimageTemporalMapRegions(occurrenceMapping, { domain: schedule.domain, regions: cue.regions });
    return {
      ...structuredClone(cue),
      text: captionUnitText(document, cue.unitIds),
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
