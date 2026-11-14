import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleAudiovisualComponentResolver } from "@hypit/nle-audiovisual";
import { verifyPictureInterpretation, type PictureInterpretation } from "@hypit/media";
import type {
  NleComponentItem,
  NleComponentLoweringContext,
  NleComponentMediaAuthoring,
  NleComponentParameterAuthoring,
  NleComponentResolver,
  NlePackageSymbol,
} from "@hypit/nle";
import { resolveNlePictureLayout } from "@hypit/nle";
import { canonicalize, type BlobRef } from "@hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

export const rankingBoardComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-debate-components" },
  name: "ranking-board",
};

export const verdictBurstComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-debate-components" },
  name: "verdict-burst",
};

/** Logical package identity selected from Component symbols; rendering remains facet-owned. */
export const rankingDebateComponentsManifest = {
  name: rankingBoardComponentSymbol.module.name,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be a record.`);
  return value as Readonly<Record<string, unknown>>;
}

function fields(value: Readonly<Record<string, unknown>>, allowed: readonly string[], label: string): void {
  const known = new Set(allowed);
  for (const name of Object.keys(value)) assert(known.has(name), `${label} field ${name} is unknown.`);
}

function text(value: unknown, label: string): string {
  assert(typeof value === "string" && value.trim().length > 0 && value.length <= 160, `${label} is invalid.`);
  return value;
}

function color(value: unknown, label: string): string {
  assert(typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    `${label} is invalid.`);
  return value;
}

function exact(value: unknown, label: string): ExactTemporalValue {
  assertExactTemporalValue(value as ExactTemporalValue, label);
  return value as ExactTemporalValue;
}

type NleProjectContext = Pick<NleComponentLoweringContext, "project"> &
  Partial<Pick<NleComponentLoweringContext, "media">>;

function source(
  item: NleComponentItem,
  context: NleProjectContext,
  suffix: string,
): { source: ProgramSource; output: "picture" } {
  assert(item.picture !== undefined, `NLE Component ${item.id} has no Picture appearance.`);
  const layout = resolveNlePictureLayout(context.project, item.picture.layout);
  const id = `${item.id}:${suffix}`;
  return {
    source: {
      id,
      outputs: { picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: `${id}:time`, duration: structuredClone(item.duration) }),
        spatialDomain: sealLocalSpatialDomain({
          id: `${id}:picture`,
          region: { x: 0, y: 0, width: layout.width, height: layout.height },
        }),
      } },
    },
    output: "picture",
  };
}

type RankingRow = { readonly id: string; readonly label: string; readonly color: string };
type RankingEntryVisual =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "media"; readonly input: string };
type RankingEntry = {
  readonly id: string;
  readonly label: string;
  readonly tier: string;
  readonly visual: RankingEntryVisual;
  readonly revealAt: ExactTemporalValue;
  readonly entry: "direct" | "drop";
  readonly preset: boolean;
};
type RankingBoardLayout = {
  readonly board: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly titleHeight: number;
  readonly labelWidthRatio: number;
  readonly gap: number;
  readonly itemWidth: number;
  readonly stagePoint: { readonly x: number; readonly y: number };
  readonly stageSize: number;
};

function number(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  assert(typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} is invalid.`);
  return value;
}

function point(value: unknown, fallback: { readonly x: number; readonly y: number }, label: string) {
  const selected = value === undefined ? {} : record(value, label);
  fields(selected, ["x", "y"], label);
  return {
    x: number(selected.x, fallback.x, `${label}.x`, 0, 1),
    y: number(selected.y, fallback.y, `${label}.y`, 0, 1),
  };
}

function rankingVisual(value: unknown, label: string): RankingEntryVisual {
  const selected = record(value, label);
  if (selected.kind === "text") {
    fields(selected, ["kind", "text"], label);
    return { kind: "text", text: text(selected.text, `${label}.text`) };
  }
  if (selected.kind === "media") {
    fields(selected, ["kind", "input"], label);
    return { kind: "media", input: text(selected.input, `${label}.input`) };
  }
  throw new Error(`${label}.kind is invalid.`);
}

function resolveRankingBoard(item: NleComponentItem, context: NleProjectContext) {
  const parameters = record(item.parameters, `Ranking Board ${item.id}`);
  fields(parameters, ["appearance", "entries", "layout", "motion", "rows", "title"], `Ranking Board ${item.id}`);
  const title = text(parameters.title, `Ranking Board ${item.id}.title`);
  assert(Array.isArray(parameters.rows) && parameters.rows.length >= 2 && parameters.rows.length <= 8,
    `Ranking Board ${item.id}.rows is invalid.`);
  const rows: RankingRow[] = parameters.rows.map((value, index) => {
    const row = record(value, `Ranking Board ${item.id}.rows.${index}`);
    fields(row, ["color", "id", "label"], `Ranking Board ${item.id}.rows.${index}`);
    return {
      id: text(row.id, `Ranking Board ${item.id}.rows.${index}.id`),
      label: text(row.label, `Ranking Board ${item.id}.rows.${index}.label`),
      color: color(row.color, `Ranking Board ${item.id}.rows.${index}.color`),
    };
  });
  assert(new Set(rows.map((row) => row.id)).size === rows.length, `Ranking Board ${item.id} repeats a row.`);
  const rowIds = new Set(rows.map((row) => row.id));
  assert(Array.isArray(parameters.entries) && parameters.entries.length > 0,
    `Ranking Board ${item.id}.entries is invalid.`);
  const entries: RankingEntry[] = parameters.entries.map((value, index) => {
    const entry = record(value, `Ranking Board ${item.id}.entries.${index}`);
    fields(entry, ["entry", "id", "label", "preset", "revealAt", "tier", "visual"],
      `Ranking Board ${item.id}.entries.${index}`);
    const tier = text(entry.tier, `Ranking Board ${item.id}.entries.${index}.tier`);
    assert(rowIds.has(tier), `Ranking Board ${item.id} entry ${index} references missing tier ${tier}.`);
    assert(entry.entry === "direct" || entry.entry === "drop",
      `Ranking Board ${item.id}.entries.${index}.entry is invalid.`);
    assert(typeof entry.preset === "boolean", `Ranking Board ${item.id}.entries.${index}.preset is invalid.`);
    return {
      id: text(entry.id, `Ranking Board ${item.id}.entries.${index}.id`),
      label: text(entry.label, `Ranking Board ${item.id}.entries.${index}.label`),
      tier,
      visual: rankingVisual(entry.visual, `Ranking Board ${item.id}.entries.${index}.visual`),
      revealAt: exact(entry.revealAt, `Ranking Board ${item.id}.entries.${index}.revealAt`),
      entry: entry.entry,
      preset: entry.preset,
    };
  });
  assert(new Set(entries.map((entry) => entry.id)).size === entries.length,
    `Ranking Board ${item.id} repeats an entry.`);

  assert(item.picture !== undefined, `Ranking Board ${item.id} has no Picture appearance.`);
  const pictureLayout = resolveNlePictureLayout(context.project, item.picture.layout);
  const width = pictureLayout.width;
  const height = pictureLayout.height;
  const layoutInput = parameters.layout === undefined ? {} : record(parameters.layout, `Ranking Board ${item.id}.layout`);
  fields(layoutInput, ["board", "gap", "itemWidth", "labelWidthRatio", "stagePoint", "stageSize", "titleHeight"],
    `Ranking Board ${item.id}.layout`);
  const boardInput = layoutInput.board === undefined ? {} : record(layoutInput.board, `Ranking Board ${item.id}.layout.board`);
  fields(boardInput, ["height", "width", "x", "y"], `Ranking Board ${item.id}.layout.board`);
  const layout: RankingBoardLayout = {
    board: {
      x: number(boardInput.x, Math.max(0, width - 320), `Ranking Board ${item.id}.layout.board.x`, 0, width),
      y: number(boardInput.y, 24, `Ranking Board ${item.id}.layout.board.y`, 0, height),
      width: number(boardInput.width, Math.min(320, width), `Ranking Board ${item.id}.layout.board.width`, 1, width),
      height: number(boardInput.height, Math.min(286, height), `Ranking Board ${item.id}.layout.board.height`, 1, height),
    },
    titleHeight: number(layoutInput.titleHeight, 42, `Ranking Board ${item.id}.layout.titleHeight`, 0, height),
    labelWidthRatio: number(layoutInput.labelWidthRatio, 0.16,
      `Ranking Board ${item.id}.layout.labelWidthRatio`, 0.05, 0.5),
    gap: number(layoutInput.gap, 7, `Ranking Board ${item.id}.layout.gap`, 0, 100),
    itemWidth: number(layoutInput.itemWidth, 104, `Ranking Board ${item.id}.layout.itemWidth`, 1, width),
    stagePoint: point(layoutInput.stagePoint, { x: 0.5, y: 0.42 }, `Ranking Board ${item.id}.layout.stagePoint`),
    stageSize: number(layoutInput.stageSize, 172, `Ranking Board ${item.id}.layout.stageSize`, 1, 1_000),
  };
  assert(layout.board.x + layout.board.width <= width && layout.board.y + layout.board.height <= height,
    `Ranking Board ${item.id}.layout.board exceeds the Component picture.`);
  assert(layout.titleHeight < layout.board.height, `Ranking Board ${item.id}.layout.titleHeight is too large.`);

  const motionInput = parameters.motion === undefined ? {} : record(parameters.motion, `Ranking Board ${item.id}.motion`);
  fields(motionInput, ["appearFrames", "holdFrames", "moveFrames"], `Ranking Board ${item.id}.motion`);
  const motion = {
    appearFrames: integer(motionInput.appearFrames ?? 8, `Ranking Board ${item.id}.motion.appearFrames`, 1, 240),
    holdFrames: integer(motionInput.holdFrames ?? 12, `Ranking Board ${item.id}.motion.holdFrames`, 0, 600),
    moveFrames: integer(motionInput.moveFrames ?? 16, `Ranking Board ${item.id}.motion.moveFrames`, 1, 240),
  };
  const appearanceInput = parameters.appearance === undefined
    ? {} : record(parameters.appearance, `Ranking Board ${item.id}.appearance`);
  fields(appearanceInput, ["accent", "background", "borderColor", "fontFamily", "itemBackground",
    "itemTextColor", "labelTextColor", "rowBackground", "shadowColor"], `Ranking Board ${item.id}.appearance`);
  const appearance = {
    background: color(appearanceInput.background ?? "#111827f2", `Ranking Board ${item.id}.appearance.background`),
    rowBackground: color(appearanceInput.rowBackground ?? "#ffffff0d", `Ranking Board ${item.id}.appearance.rowBackground`),
    borderColor: color(appearanceInput.borderColor ?? "#ffffff2e", `Ranking Board ${item.id}.appearance.borderColor`),
    shadowColor: color(appearanceInput.shadowColor ?? "#02061780", `Ranking Board ${item.id}.appearance.shadowColor`),
    itemBackground: color(appearanceInput.itemBackground ?? "#f8fafcf5", `Ranking Board ${item.id}.appearance.itemBackground`),
    itemTextColor: color(appearanceInput.itemTextColor ?? "#111827", `Ranking Board ${item.id}.appearance.itemTextColor`),
    labelTextColor: color(appearanceInput.labelTextColor ?? "#111827", `Ranking Board ${item.id}.appearance.labelTextColor`),
    accent: color(appearanceInput.accent ?? "#38bdf8", `Ranking Board ${item.id}.appearance.accent`),
    fontFamily: appearanceInput.fontFamily === undefined
      ? '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
      : text(appearanceInput.fontFamily, `Ranking Board ${item.id}.appearance.fontFamily`),
  };

  const rowHeight = (layout.board.height - layout.titleHeight) / rows.length;
  const labelWidth = layout.board.width * layout.labelWidthRatio;
  const itemHeight = rowHeight - layout.gap * 2;
  const iconSize = Math.min(40, Math.max(20, itemHeight - 10));
  assert(itemHeight > 0, `Ranking Board ${item.id} rows are too short for the authored gap.`);
  const counts = new Map<string, number>();
  const placed = entries.map((entry) => {
    const row = rows.findIndex((candidate) => candidate.id === entry.tier);
    const column = counts.get(entry.tier) ?? 0;
    counts.set(entry.tier, column + 1);
    const final = {
      x: layout.board.x + labelWidth + layout.gap + column * (layout.itemWidth + layout.gap),
      y: layout.board.y + layout.titleHeight + row * rowHeight + layout.gap,
      width: layout.itemWidth,
      height: itemHeight,
    };
    assert(final.x + final.width <= layout.board.x + layout.board.width,
      `Ranking Board row ${entry.tier} cannot fit Entry ${entry.id}.`);
    return { ...entry, final };
  });
  const dependencies = new Map<string, { readonly artifact: BlobRef; readonly picture: PictureInterpretation }>();
  for (const entry of entries) if (entry.visual.kind === "media" && context.media !== undefined) {
    const media = context.media[entry.visual.input];
    assert(media !== undefined,
      `Ranking Board ${item.id} is missing Media input ${entry.visual.input}.`);
    assert(media.picture?.kind === "constant",
      `Ranking Board ${item.id} Media input ${entry.visual.input} must be a still Picture.`);
    const picture = media.picture.interpretation.picture;
    verifyPictureInterpretation(picture, `Ranking Board ${item.id} Media input ${entry.visual.input}`);
    const previous = dependencies.get(media.source.resource);
    assert(previous === undefined || JSON.stringify(previous) === JSON.stringify({ artifact: media.source, picture }),
      `Ranking Board ${item.id} gives one Media Artifact conflicting picture meaning.`);
    dependencies.set(media.source.resource, { artifact: media.source, picture });
  }
  const visualHtml = (visual: RankingEntryVisual): string => visual.kind === "text"
    ? `<span data-ranking-icon>${escapeHtml(visual.text)}</span>`
    : context.media === undefined
      ? `<span data-ranking-icon></span>`
      : `<img data-ranking-icon src="hypit-artifact://${escapeHtml(context.media[visual.input]!.source.resource)}"/>`;
  const resolved = source(item, context, "ranking-board");
  return {
    ...resolved,
    html: visualProgramHtmlSource(resolved.source.id, resolved.output, htmlVisual({
      dependencies: [...dependencies.values()].map((visual) => ({
        kind: "picture" as const, artifact: visual.artifact, picture: visual.picture,
      })),
      data: {
        entries: placed.map(({ visual: _visual, label: _label, tier: _tier, ...entry }) => entry),
        motion,
        stage: { x: width * layout.stagePoint.x, y: height * layout.stagePoint.y, size: layout.stageSize },
      },
      html: `<div data-ranking-scene><div data-ranking-board style="left:${layout.board.x}px;top:${layout.board.y}px;width:${layout.board.width}px;height:${layout.board.height}px"><div data-ranking-title style="height:${layout.titleHeight}px"><span></span>${escapeHtml(title)}</div>${rows.map((row, index) =>
        `<div data-ranking-row style="--tier:${escapeHtml(row.color)};left:0;top:${layout.titleHeight + index * rowHeight}px;width:100%;height:${rowHeight}px"><div data-ranking-label style="width:${labelWidth}px">${escapeHtml(row.label)}</div><div data-ranking-row-fill style="left:${labelWidth}px"></div></div>`).join("")}</div>${placed.map((entry) =>
        `<div data-ranking-entry="${escapeHtml(entry.id)}" style="--tier:${escapeHtml(rows.find((row) => row.id === entry.tier)!.color)};left:${entry.final.x}px;top:${entry.final.y}px;width:${entry.final.width}px;height:${entry.final.height}px">${visualHtml(entry.visual)}<b>${escapeHtml(entry.label)}</b></div>`).join("")}</div>`,
      css: `:scope>[data-ranking-scene]{position:absolute;inset:0;overflow:visible;color:#f8fafc;font-family:${appearance.fontFamily};pointer-events:none}:scope [data-ranking-board]{position:absolute;box-sizing:border-box;border:1px solid ${appearance.borderColor};border-radius:20px;background:${appearance.background};box-shadow:0 18px 44px ${appearance.shadowColor};overflow:hidden;backdrop-filter:blur(14px)}:scope [data-ranking-title]{display:flex;align-items:center;gap:9px;padding:0 15px;box-sizing:border-box;font-size:18px;font-weight:850;letter-spacing:.2px}:scope [data-ranking-title]>span{width:8px;height:8px;border-radius:50%;background:${appearance.accent};box-shadow:0 0 15px ${appearance.accent}}:scope [data-ranking-row]{position:absolute;box-sizing:border-box;border-top:1px solid ${appearance.borderColor}}:scope [data-ranking-label]{position:absolute;inset:0 auto 0 0;display:flex;align-items:center;justify-content:center;background:var(--tier);color:${appearance.labelTextColor};font-size:${Math.max(24, rowHeight * 0.46)}px;font-weight:950;line-height:1}:scope [data-ranking-row-fill]{position:absolute;top:0;right:0;bottom:0;background:${appearance.rowBackground}}:scope [data-ranking-entry]{position:absolute;display:grid;grid-template-columns:${iconSize}px minmax(0,1fr);align-items:center;gap:6px;padding:5px 8px 5px 5px;box-sizing:border-box;border:1px solid #ffffff42;border-radius:${Math.min(13, itemHeight * 0.2)}px;background:${appearance.itemBackground};color:${appearance.itemTextColor};box-shadow:0 7px 16px #0206174d;transform-origin:center;will-change:transform,opacity,filter;z-index:4}:scope [data-ranking-icon]{display:flex;width:${iconSize}px;height:${iconSize}px;align-items:center;justify-content:center;border-radius:${Math.min(10, itemHeight * 0.16)}px;background:var(--tier);object-fit:cover;font-size:${Math.max(13, iconSize * 0.38)}px;font-weight:950}:scope [data-ranking-entry]>b{overflow:hidden;font-size:${Math.max(11, itemHeight * 0.2)}px;font-weight:850;letter-spacing:-.3px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}`,
      setup: `
        const entries = new Map([...root.querySelectorAll('[data-ranking-entry]')]
          .map(element => [element.getAttribute('data-ranking-entry'), element]));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const clamp = value => Math.max(0, Math.min(1, value));
        const outCubic = value => 1 - Math.pow(1 - value, 3);
        const smoother = value => value * value * value * (value * (value * 6 - 15) + 10);
        return localFrame => {
          for (const entry of data.entries) {
            const element = entries.get(entry.id);
            const start = seconds(entry.revealAt) * fps;
            const elapsed = localFrame - start;
            if (entry.preset) {
              element.style.opacity = '1'; element.style.transform = '';
              continue;
            }
            if (elapsed < 0) {
              element.style.opacity = '0'; element.style.transform = 'scale(.76)';
              continue;
            }
            if (entry.entry === 'direct') {
              const progress = clamp(elapsed / data.motion.appearFrames), eased = outCubic(progress);
              const overshoot = Math.sin(Math.PI * progress) * .075;
              element.style.opacity = String(Math.min(1, progress * 4));
              element.style.transform = 'scale(' + (.76 + .24 * eased + overshoot) + ')';
              continue;
            }
            const finalCenterX = entry.final.x + entry.final.width / 2;
            const finalCenterY = entry.final.y + entry.final.height / 2;
            const stageX = data.stage.x - finalCenterX;
            const stageY = data.stage.y - finalCenterY;
            const stageScale = data.stage.size / entry.final.height;
            if (elapsed < data.motion.appearFrames) {
              const progress = clamp(elapsed / data.motion.appearFrames), eased = outCubic(progress);
              const overshoot = Math.sin(Math.PI * progress) * .06;
              element.style.opacity = String(Math.min(1, progress * 4));
              element.style.transform = 'translate(' + stageX + 'px,' + stageY + 'px) scale('
                + (stageScale * (.76 + .24 * eased + overshoot)) + ')';
              element.style.zIndex = '8';
              continue;
            }
            const moveElapsed = elapsed - data.motion.appearFrames - data.motion.holdFrames;
            if (moveElapsed <= 0) {
              element.style.opacity = '1';
              element.style.transform = 'translate(' + stageX + 'px,' + stageY + 'px) scale(' + stageScale + ')';
              element.style.zIndex = '8';
              continue;
            }
            const progress = smoother(clamp(moveElapsed / data.motion.moveFrames));
            const arc = Math.sin(Math.PI * progress) * Math.min(48, Math.max(20, Math.abs(stageY) * .09));
            element.style.opacity = '1';
            element.style.transform = 'translate(' + (stageX * (1 - progress)) + 'px,'
              + (stageY * (1 - progress) - arc) + 'px) scale('
              + (stageScale + (1 - stageScale) * progress + .025 * Math.sin(Math.PI * progress)) + ')';
            element.style.zIndex = progress >= 1 ? '4' : '8';
          }
        };
      `,
    })),
  };
}

function resolveVerdictBurst(item: NleComponentItem, context: NleProjectContext) {
  const parameters = record(item.parameters, `Verdict Burst ${item.id}`);
  fields(parameters, ["kicker", "title", "accent", "enterFrames"], `Verdict Burst ${item.id}`);
  const kicker = text(parameters.kicker, `Verdict Burst ${item.id}.kicker`);
  const title = text(parameters.title, `Verdict Burst ${item.id}.title`);
  const accent = color(parameters.accent, `Verdict Burst ${item.id}.accent`);
  const enterFrames = parameters.enterFrames === undefined ? 7
    : integer(parameters.enterFrames, `Verdict Burst ${item.id}.enterFrames`, 1, 120);
  const resolved = source(item, context, "verdict-burst");
  return {
    ...resolved,
    html: visualProgramHtmlSource(resolved.source.id, resolved.output, htmlVisual({
      data: { enterFrames },
      html: `<div data-verdict><i></i><small>${escapeHtml(kicker)}</small><strong>${escapeHtml(title)}</strong></div>`,
      css: `:scope>[data-verdict]{position:absolute;inset:0;display:grid;grid-template-columns:5px 1fr;grid-template-rows:auto auto;column-gap:15px;align-content:center;padding:19px 22px;box-sizing:border-box;border:1px solid #ffffff30;border-radius:18px;background:#0f172aee;box-shadow:0 16px 42px #02061773;color:#f8fafc;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}:scope [data-verdict]>i{grid-row:1/3;width:5px;height:100%;border-radius:99px;background:${accent};box-shadow:0 0 16px ${accent}}:scope [data-verdict]>small{font-size:18px;font-style:normal;font-weight:750;letter-spacing:2px;color:#94a3b8}:scope [data-verdict]>strong{display:block;margin-top:6px;font-size:40px;font-weight:900;line-height:1.08;letter-spacing:-1px}`,
      setup: `
        const target = root.querySelector('[data-verdict]');
        return localFrame => {
          const progress = Math.max(0, Math.min(1, localFrame / data.enterFrames));
          const eased = 1 - Math.pow(1 - progress, 3);
          target.style.opacity = String(progress);
          target.style.transform = 'translateY(' + ((1 - eased) * 24) + 'px) scale(' + (0.96 + eased * 0.04) + ')';
        };
      `,
    })),
  };
}

function nleResolver(
  component: NlePackageSymbol,
  resolve: (item: NleComponentItem, context: NleProjectContext) => ReturnType<typeof resolveRankingBoard>,
): NleComponentResolver {
  return { component, resolve: (item, context) => {
    const value = resolve(item, context);
    return { source: value.source, pictureOutput: value.output };
  } };
}

function htmlResolver(
  component: NlePackageSymbol,
  resolve: (item: NleComponentItem, context: NleProjectContext) => ReturnType<typeof resolveRankingBoard>,
): NleAudiovisualComponentResolver {
  return { component, resolve: (item, context) => ({ html: resolve(item, context).html }) };
}

export const rankingBoardNleResolver = nleResolver(rankingBoardComponentSymbol, resolveRankingBoard);
export const rankingBoardHtmlResolver = htmlResolver(rankingBoardComponentSymbol, resolveRankingBoard);
export const verdictBurstNleResolver = nleResolver(verdictBurstComponentSymbol, resolveVerdictBurst);
export const verdictBurstHtmlResolver = htmlResolver(verdictBurstComponentSymbol, resolveVerdictBurst);

export const rankingBoardNleAuthoring: NleComponentParameterAuthoring = {
  component: rankingBoardComponentSymbol,
  inspect: ({ item, project }) => {
    resolveRankingBoard(item, { project });
    return canonicalize(item.parameters);
  },
  edit: (operation, { item, project }) => {
    const input = record(operation, `Ranking Board ${item.id} edit`);
    const parameters = structuredClone(record(item.parameters, `Ranking Board ${item.id}`));
    if (input.kind === "set-title") {
      fields(input, ["kind", "title"], `Ranking Board ${item.id} edit`);
      parameters.title = text(input.title, `Ranking Board ${item.id} edit.title`);
    } else if (input.kind === "set-entry-tier") {
      fields(input, ["entry", "kind", "tier"], `Ranking Board ${item.id} edit`);
      const entryId = text(input.entry, `Ranking Board ${item.id} edit.entry`);
      const tier = text(input.tier, `Ranking Board ${item.id} edit.tier`);
      assert(Array.isArray(parameters.entries), `Ranking Board ${item.id}.entries is invalid.`);
      const selected = parameters.entries.find((value) => record(value, "Ranking entry").id === entryId);
      assert(selected !== undefined, `Ranking Board ${item.id} has no Entry ${entryId}.`);
      (selected as Record<string, unknown>).tier = tier;
    } else if (input.kind === "set-entry-reveal") {
      fields(input, ["entry", "kind", "revealAt"], `Ranking Board ${item.id} edit`);
      const entryId = text(input.entry, `Ranking Board ${item.id} edit.entry`);
      const revealAt = exact(input.revealAt, `Ranking Board ${item.id} edit.revealAt`);
      assert(Array.isArray(parameters.entries), `Ranking Board ${item.id}.entries is invalid.`);
      const selected = parameters.entries.find((value) => record(value, "Ranking entry").id === entryId);
      assert(selected !== undefined, `Ranking Board ${item.id} has no Entry ${entryId}.`);
      (selected as Record<string, unknown>).revealAt = revealAt;
    } else {
      throw new Error(`Ranking Board ${item.id} edit.kind is invalid.`);
    }
    const next = canonicalize(parameters);
    resolveRankingBoard({ ...structuredClone(item), parameters: next }, { project });
    return next;
  },
};

export const rankingBoardNleMediaAuthoring: NleComponentMediaAuthoring = {
  component: rankingBoardComponentSymbol,
  inputs: ({ item }) => {
    const parameters = record(item.parameters, `Ranking Board ${item.id}`);
    assert(Array.isArray(parameters.entries), `Ranking Board ${item.id}.entries is invalid.`);
    return parameters.entries.flatMap((value, index) => {
      const entry = record(value, `Ranking Board ${item.id}.entries.${index}`);
      const visual = rankingVisual(entry.visual, `Ranking Board ${item.id}.entries.${index}.visual`);
      if (visual.kind !== "media") return [];
      return [{
        key: visual.input,
        label: `${text(entry.label, `Ranking Board ${item.id}.entries.${index}.label`)} image`,
        requires: ["picture"] as const,
        required: true,
      }];
    });
  },
};
