import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import type { NleComponentItem, NleComponentResolver, NlePackageSymbol } from "@hypit/nle";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

export const rankingBoardComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-debate-components", version: "1" },
  name: "ranking-board",
};

export const verdictBurstComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-debate-components", version: "1" },
  name: "verdict-burst",
};

/** Logical package identity selected from Component symbols; rendering remains facet-owned. */
export const rankingDebateComponentsManifest = {
  format: "hypit.module@1" as const,
  name: rankingBoardComponentSymbol.module.name,
  version: rankingBoardComponentSymbol.module.version,
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

function source(item: NleComponentItem, suffix: string): { source: ProgramSource; output: "picture" } {
  assert(item.picture !== undefined, `NLE Component ${item.id} has no Picture appearance.`);
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
          region: { x: 0, y: 0, width: item.picture.layout.width, height: item.picture.layout.height },
        }),
      } },
    },
    output: "picture",
  };
}

type RankingRow = { readonly id: string; readonly label: string; readonly color: string };
type RankingEntry = {
  readonly id: string;
  readonly label: string;
  readonly tier: string;
  readonly icon: string;
  readonly revealAt: ExactTemporalValue;
};

function resolveRankingBoard(item: NleComponentItem) {
  const parameters = record(item.parameters, `Ranking Board ${item.id}`);
  fields(parameters, ["title", "rows", "entries", "revealFrames"], `Ranking Board ${item.id}`);
  const title = text(parameters.title, `Ranking Board ${item.id}.title`);
  assert(Array.isArray(parameters.rows) && parameters.rows.length >= 2 && parameters.rows.length <= 8,
    `Ranking Board ${item.id}.rows is invalid.`);
  const rows: RankingRow[] = parameters.rows.map((value, index) => {
    const row = record(value, `Ranking Board ${item.id}.rows.${index}`);
    fields(row, ["id", "label", "color"], `Ranking Board ${item.id}.rows.${index}`);
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
    fields(entry, ["id", "label", "tier", "icon", "revealAt"], `Ranking Board ${item.id}.entries.${index}`);
    const tier = text(entry.tier, `Ranking Board ${item.id}.entries.${index}.tier`);
    assert(rowIds.has(tier), `Ranking Board ${item.id} entry ${index} references missing tier ${tier}.`);
    return {
      id: text(entry.id, `Ranking Board ${item.id}.entries.${index}.id`),
      label: text(entry.label, `Ranking Board ${item.id}.entries.${index}.label`),
      tier,
      icon: text(entry.icon, `Ranking Board ${item.id}.entries.${index}.icon`),
      revealAt: exact(entry.revealAt, `Ranking Board ${item.id}.entries.${index}.revealAt`),
    };
  });
  assert(new Set(entries.map((entry) => entry.id)).size === entries.length,
    `Ranking Board ${item.id} repeats an entry.`);
  const revealFrames = parameters.revealFrames === undefined ? 8
    : integer(parameters.revealFrames, `Ranking Board ${item.id}.revealFrames`, 1, 120);
  const resolved = source(item, "ranking-board");
  return {
    ...resolved,
    html: visualProgramHtmlSource(resolved.source.id, resolved.output, htmlVisual({
      data: { entries, revealFrames },
      html: `<div data-ranking-board><div data-ranking-title>${escapeHtml(title)}</div><div data-ranking-rows>${rows.map((row) =>
        `<div data-ranking-row style="--tier:${escapeHtml(row.color)}"><div data-ranking-label>${escapeHtml(row.label)}</div><div data-ranking-cells>${entries.filter((entry) => entry.tier === row.id).map((entry) =>
          `<div data-ranking-entry="${escapeHtml(entry.id)}"><span>${escapeHtml(entry.icon)}</span><b>${escapeHtml(entry.label)}</b></div>`).join("")}</div></div>`).join("")}</div></div>`,
      css: `:scope>[data-ranking-board]{position:absolute;inset:0;padding:17px;box-sizing:border-box;border:3px solid #111827;border-radius:20px;background:#fff7edee;box-shadow:8px 9px 0 #111827;color:#111827;font-family:Arial,sans-serif}:scope [data-ranking-title]{font-size:27px;font-weight:900;letter-spacing:-1px;margin-bottom:11px}:scope [data-ranking-row]{display:grid;grid-template-columns:60px 1fr;min-height:76px;border:2px solid #111827;border-bottom:0;background:#ffffff}:scope [data-ranking-row]:last-child{border-bottom:2px solid #111827}:scope [data-ranking-label]{display:flex;align-items:center;justify-content:center;background:var(--tier);border-right:2px solid #111827;font-size:34px;font-weight:1000}:scope [data-ranking-cells]{display:flex;flex-wrap:wrap;gap:6px;align-content:center;align-items:center;padding:6px;overflow:hidden}:scope [data-ranking-entry]{display:flex;align-items:center;gap:4px;padding:5px 7px;border:2px solid #111827;border-radius:9px;background:#ffffff;box-shadow:3px 3px 0 #111827;font-size:15px;white-space:nowrap;transform-origin:center}:scope [data-ranking-entry]>span{font-size:20px}:scope [data-ranking-entry]>b{font-weight:850}`,
      setup: `
        const entries = new Map([...root.querySelectorAll('[data-ranking-entry]')]
          .map(element => [element.getAttribute('data-ranking-entry'), element]));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        return localFrame => {
          const time = localFrame / fps;
          for (const entry of data.entries) {
            const element = entries.get(entry.id);
            const start = seconds(entry.revealAt);
            const progress = Math.max(0, Math.min(1, (localFrame - start * fps) / data.revealFrames));
            element.style.opacity = String(progress);
            element.style.transform = 'translateY(' + ((1 - progress) * -24) + 'px) scale(' + (0.7 + progress * 0.3) + ') rotate(' + ((1 - progress) * -5) + 'deg)';
          }
        };
      `,
    })),
  };
}

function resolveVerdictBurst(item: NleComponentItem) {
  const parameters = record(item.parameters, `Verdict Burst ${item.id}`);
  fields(parameters, ["kicker", "title", "accent", "enterFrames"], `Verdict Burst ${item.id}`);
  const kicker = text(parameters.kicker, `Verdict Burst ${item.id}.kicker`);
  const title = text(parameters.title, `Verdict Burst ${item.id}.title`);
  const accent = color(parameters.accent, `Verdict Burst ${item.id}.accent`);
  const enterFrames = parameters.enterFrames === undefined ? 7
    : integer(parameters.enterFrames, `Verdict Burst ${item.id}.enterFrames`, 1, 120);
  const resolved = source(item, "verdict-burst");
  return {
    ...resolved,
    html: visualProgramHtmlSource(resolved.source.id, resolved.output, htmlVisual({
      data: { enterFrames },
      html: `<div data-verdict><small>${escapeHtml(kicker)}</small><strong>${escapeHtml(title)}</strong></div>`,
      css: `:scope>[data-verdict]{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Arial,sans-serif;text-transform:uppercase}:scope [data-verdict]>small{padding:8px 18px;border:3px solid #111827;border-radius:999px;background:#ffffff;color:#111827;font-size:24px;font-weight:900;letter-spacing:3px;box-shadow:5px 5px 0 #111827}:scope [data-verdict]>strong{display:block;margin-top:16px;padding:16px 26px;border:5px solid #111827;border-radius:18px;background:${accent};color:#ffffff;font-size:66px;font-weight:1000;line-height:.95;letter-spacing:-3px;text-shadow:4px 4px 0 #111827;box-shadow:10px 12px 0 #111827}`,
      setup: `
        const target = root.querySelector('[data-verdict]');
        return localFrame => {
          const progress = Math.max(0, Math.min(1, localFrame / data.enterFrames));
          const eased = 1 - Math.pow(1 - progress, 3);
          target.style.opacity = String(progress);
          target.style.transform = 'scale(' + (1.35 - eased * 0.35) + ') rotate(' + ((1 - eased) * -6) + 'deg)';
        };
      `,
    })),
  };
}

function nleResolver(
  component: NlePackageSymbol,
  resolve: (item: NleComponentItem) => ReturnType<typeof resolveRankingBoard>,
): NleComponentResolver {
  return { component, resolve: (item) => {
    const value = resolve(item);
    return { source: value.source, pictureOutput: value.output };
  } };
}

function htmlResolver(
  component: NlePackageSymbol,
  resolve: (item: NleComponentItem) => ReturnType<typeof resolveRankingBoard>,
): NleHtmlVideoComponentResolver {
  return { component, resolve: (item) => ({ html: resolve(item).html }) };
}

export const rankingBoardNleResolver = nleResolver(rankingBoardComponentSymbol, resolveRankingBoard);
export const rankingBoardHtmlResolver = htmlResolver(rankingBoardComponentSymbol, resolveRankingBoard);
export const verdictBurstNleResolver = nleResolver(verdictBurstComponentSymbol, resolveVerdictBurst);
export const verdictBurstHtmlResolver = htmlResolver(verdictBurstComponentSymbol, resolveVerdictBurst);
