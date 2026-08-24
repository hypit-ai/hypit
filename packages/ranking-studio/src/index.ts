import { rankingMarkupSurfaces } from "@hypit/ranking";
import type { RankingProgram, RankingSchedule } from "@hypit/ranking";
import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft, StudioParameterDeclaration, StudioRecipeParameterDeclaration } from "@hypit/studio-adapter";
import { artifactPreview, previewLayer, projectedPointTimelineEdits, requiredSurfaceValue, selectionWindowTimelineEdits, temporalLineageFor } from "@hypit/studio-adapter";

const frameParameters: readonly StudioParameterDeclaration[] = [
  { name: "within", label: "Within", writable: false },
  { name: "left", label: "Left", writable: true },
  { name: "top", label: "Top", writable: true },
  { name: "right", label: "Right", writable: true },
  { name: "bottom", label: "Bottom", writable: true },
  { name: "x", label: "X", writable: true },
  { name: "y", label: "Y", writable: true },
  { name: "width", label: "Width", writable: true },
  { name: "height", label: "Height", writable: true },
];

function rankingRecipe(surface: "column-style" | "tier-style" | "top-three-style"): readonly StudioRecipeParameterDeclaration[] {
  const properties = rankingMarkupSurfaces.find((candidate) => candidate.name === surface)
    ?.vocabulary.attributes.find((attribute) => attribute.name === "recipe")?.recipe ?? [];
  return properties.map((property) => {
    const when = property.name.includes("frames") || property.name.includes("easing") || property.name.includes("fade");
    const where = /(?:^|[-])(x|y|width|height|size|gap|padding|stack|rows|radius)(?:$|[-])/u.test(property.name);
    return {
      name: property.name,
      group: when ? "when" : where ? "where" : "how",
      section: when ? "motion" : where ? "layout" : "appearance",
    };
  });
}

function rankingStyle(surface: "column-style" | "tier-style" | "top-three-style"): StudioParameterDeclaration {
  return {
    name: "style", label: "Style", writable: false,
    recipe: { through: ["recipe"], parameters: rankingRecipe(surface) },
  };
}

function projectRanking(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const placement = context.placement;
  const schedule = requiredSurfaceValue(context, "schedule") as RankingSchedule;
  const program = requiredSurfaceValue(context, "program") as RankingProgram;
  if (placement === undefined) return context.generic();
  const boardId = placement.id ?? context.track.outputRef;
  const outerTemporal = temporalLineageFor(context, boardId, "outer");
  const group: StudioEntityDraft = {
    id: `${context.track.outputRef}:entity:${boardId}`,
    authoredId: boardId,
    ...(outerTemporal?.source.id === undefined ? {} : { markerId: outerTemporal.source.id }),
    display: { title: boardId, layers: [] },
    startFrame: schedule.outer.startFrame,
    endFrameExclusive: schedule.outer.endFrameExclusive,
    stackOrder: Math.max(...context.spans.map((span) => span.stackOrder), 0),
    elementRange: placement.range,
    renderIds: context.spans.map((span) => span.id),
    presentation: { entity: "ranking", chrome: "group" },
    ...(outerTemporal === undefined ? {} : { temporal: outerTemporal }),
  };
  const children = new Map(placement.children.flatMap((child) =>
    child.id === undefined ? [] : [[child.id, child] as const]));
  const programItems = new Map(program?.items.map((item) => [item.id, item] as const) ?? []);
  const reveals = schedule.entries.flatMap((entry): readonly StudioEntityDraft[] => {
    if ("mode" in entry && entry.mode !== "reveal") return [];
    const child = children.get(entry.itemId);
    const item = programItems.get(entry.itemId);
    const temporal = temporalLineageFor(context, entry.itemId, "mode" in entry ? "window" : "activation");
    const visible = "mode" in entry ? entry.window : entry.cumulative;
    const icon = item?.icon;
    const label = item !== undefined && "label" in item ? item.label : child?.attributes.label ?? entry.itemId;
    return [{
      id: `${context.track.outputRef}:entity:${entry.itemId}`,
      authoredId: entry.itemId,
      ...(temporal?.source.id === undefined ? {} : { markerId: temporal.source.id }),
      display: {
        title: label,
        layers: icon === undefined ? [] : [previewLayer(artifactPreview("image", icon.digest), "repeat-x")],
      },
      startFrame: visible.startFrame,
      endFrameExclusive: visible.endFrameExclusive,
      stackOrder: group.stackOrder + 1,
      ...(child === undefined ? {} : { elementRange: child.range }),
      lane: "mode" in entry ? "reveal" : "activation",
      presentation: { entity: "ranking-reveal", chrome: "standard" },
      ...(temporal === undefined ? {} : { temporal }),
    }];
  }).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  return [group, ...reveals];
}

const commonParameters: readonly StudioParameterDeclaration[] = [
  { name: "frame", label: "Frame", writable: false, referenced: frameParameters },
  { name: "appear-sound", label: "Appear sound", writable: false },
  { name: "move-sound", label: "Move sound", writable: false },
];

export const rankingStudioAdapters: readonly StudioAdapter[] = [
  {
    id: "column", role: "track",
    output: { type: "VisualTrack", surface: "column", modules: ["@hypit/ranking"] },
    family: "ranking", tone: "orange", label: "Ranking", icon: "ranking", requiredValues: ["schedule", "program"],
    timelineEdits: selectionWindowTimelineEdits(),
    parameters: [
      ...commonParameters,
      rankingStyle("column-style"),
    ],
    poster: { source: "surface-preview" },
    lane: {
      heightPx: 80, groupId: "ranking-reveals",
    },
    attachments: [{
      id: "reveal", family: "ranking-reveal", tone: "orange-muted", label: "Reveals", icon: "ranking", facet: "visual",
      lane: { heightPx: 40 },
      parameters: [
        { name: "label", label: "Label", writable: true },
        { name: "icon", label: "Icon", writable: false },
        { name: "rank", label: "Rank", control: "number", writable: true },
        { name: "preset", label: "Preset", control: "boolean", writable: true },
        { name: "stack", label: "Stack", control: "number", writable: true },
      ],
      timelineEdits: selectionWindowTimelineEdits(),
    }],
    project: projectRanking,
  },
  ...([[
    "tier", "tier", "Tier Board",
  ], [
    "top-three", "top-three", "Top Three",
  ]] as const).map(([id, surface, label]): StudioAdapter => ({
    id, role: "track",
    output: { type: "VisualTrack", surface, modules: ["@hypit/ranking"] },
    family: "ranking", tone: "orange", label, icon: "ranking", requiredValues: ["schedule", "program"],
    timelineEdits: selectionWindowTimelineEdits(),
    parameters: [
      ...commonParameters,
      rankingStyle(surface === "tier" ? "tier-style" : "top-three-style"),
      { name: "terminal", label: "Terminal", writable: false },
    ],
    poster: { source: "surface-preview" },
    lane: { heightPx: 80, groupId: `${id}-activations` },
    attachments: [{
      id: "activation", family: "ranking-reveal", tone: "orange-muted", label: "Activations", icon: "ranking", facet: "visual",
      lane: { heightPx: 40 },
      parameters: id === "tier" ? [
        { name: "tier", label: "Tier", writable: true },
        { name: "entry", label: "Entry", control: "select", writable: true, options: ["direct", "stage"] },
        { name: "icon", label: "Icon", writable: false },
        { name: "stack", label: "Stack", control: "number", writable: true },
      ] : [
        { name: "label", label: "Label", writable: true },
        { name: "icon", label: "Icon", writable: false },
        { name: "stack", label: "Stack", control: "number", writable: true },
      ],
      timelineEdits: projectedPointTimelineEdits(),
    }],
    project: projectRanking,
  })),
];
