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
      html: `<div data-ranking-board><div data-ranking-title><span></span>${escapeHtml(title)}</div><div data-ranking-rows>${rows.map((row) =>
        `<div data-ranking-row style="--tier:${escapeHtml(row.color)}"><div data-ranking-label>${escapeHtml(row.label)}</div><div data-ranking-cells>${entries.filter((entry) => entry.tier === row.id).map((entry) =>
          `<div data-ranking-entry="${escapeHtml(entry.id)}"><span>${escapeHtml(entry.icon)}</span><b>${escapeHtml(entry.label)}</b></div>`).join("")}</div></div>`).join("")}</div></div>`,
      css: `:scope>[data-ranking-board]{position:absolute;inset:0;padding:12px;box-sizing:border-box;border:1px solid #ffffff2e;border-radius:18px;background:#0f172aeb;box-shadow:0 14px 38px #02061773;color:#f8fafc;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;backdrop-filter:blur(12px)}:scope [data-ranking-title]{height:30px;display:flex;align-items:center;gap:8px;padding:0 4px 8px;font-size:17px;font-weight:800;letter-spacing:.5px;color:#e2e8f0}:scope [data-ranking-title]>span{width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 14px #38bdf8}:scope [data-ranking-rows]{display:flex;flex-direction:column;gap:5px}:scope [data-ranking-row]{display:grid;grid-template-columns:42px 1fr;min-height:56px;border:1px solid #ffffff18;border-radius:11px;background:#ffffff0a}:scope [data-ranking-label]{display:flex;align-items:center;justify-content:center;background:var(--tier);border-radius:10px 0 0 10px;color:#0f172a;font-size:26px;font-weight:950}:scope [data-ranking-cells]{display:flex;gap:6px;align-content:center;align-items:center;padding:6px;overflow:visible}:scope [data-ranking-entry]{display:flex;align-items:center;gap:5px;padding:5px 7px 5px 5px;border:1px solid #ffffff24;border-radius:9px;background:#f8fafcf2;color:#0f172a;box-shadow:0 5px 12px #02061742;font-size:12px;white-space:nowrap;transform-origin:center;will-change:transform,opacity}:scope [data-ranking-entry]>span{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:var(--tier);font-size:12px;font-weight:900}:scope [data-ranking-entry]>b{font-weight:800;letter-spacing:-.2px}`,
      setup: `
        const board = root.querySelector('[data-ranking-board]');
        const entries = new Map([...root.querySelectorAll('[data-ranking-entry]')]
          .map(element => [element.getAttribute('data-ranking-entry'), element]));
        const boardRect = board.getBoundingClientRect();
        const stageOffsets = new Map([...entries].map(([id, element]) => {
          const itemRect = element.getBoundingClientRect();
          return [id, {
            x: boardRect.left + boardRect.width * 0.56 - (itemRect.left + itemRect.width / 2),
            y: boardRect.top + boardRect.height * 0.43 - (itemRect.top + itemRect.height / 2),
          }];
        }));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        return localFrame => {
          for (const entry of data.entries) {
            const element = entries.get(entry.id);
            const stage = stageOffsets.get(entry.id);
            const start = seconds(entry.revealAt);
            const elapsed = localFrame - start * fps;
            const progress = Math.max(0, Math.min(1, elapsed / data.revealFrames));
            const arrive = Math.max(0, Math.min(1, progress / 0.38));
            const settle = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
            const eased = 1 - Math.pow(1 - settle, 3);
            element.style.opacity = String(arrive);
            element.style.transform = progress < 0.5
              ? 'translate(' + stage.x + 'px,' + stage.y + 'px) scale(' + (0.72 + arrive * 0.78) + ')'
              : 'translate(' + (stage.x * (1 - eased)) + 'px,' + (stage.y * (1 - eased)) + 'px) scale(' + (1 + (1 - eased) * 0.5) + ')';
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
