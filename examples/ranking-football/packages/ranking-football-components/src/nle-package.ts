import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleAudiovisualComponentResolver } from "@hypit/nle-audiovisual";
import { verifyPictureInterpretation, type PictureInterpretation } from "@hypit/media";
import {
  resolveNlePictureLayout,
  type NleComponentItem,
  type NleComponentLoweringContext,
  type NleComponentMediaAuthoring,
  type NleComponentResolver,
  type NlePackageSymbol,
} from "@hypit/nle";
import type { BlobRef } from "@hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

export const footballTierBoardComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-football-components" },
  name: "tier-board",
};

export const footballTierBoardManifest = {
  name: footballTierBoardComponentSymbol.module.name,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function exact(value: unknown, label: string): ExactTemporalValue {
  assertExactTemporalValue(value as ExactTemporalValue, label);
  return value as ExactTemporalValue;
}

type Row = { readonly id: string; readonly label: string; readonly color: string };
type Entry = {
  readonly id: string;
  readonly label: string;
  readonly tier: string;
  readonly input: string;
  readonly preset: boolean;
  readonly window?: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue };
};

type EntryMotion = "stage-then-place" | "pop-in-place";
type RevealFlash = {
  readonly intensity: number;
  readonly attackFrames: number;
  readonly holdFrames: number;
  readonly decayFrames: number;
  readonly color: string;
  readonly glowColor: string;
};

function revealFlashParameters(value: unknown, label: string): RevealFlash {
  const parameters = record(value, label);
  fields(parameters, ["attackFrames", "color", "decayFrames", "glowColor", "holdFrames", "intensity"], label);
  assert(typeof parameters.intensity === "number" && Number.isFinite(parameters.intensity)
    && parameters.intensity >= 0 && parameters.intensity <= 1,
  `${label}.intensity is invalid.`);
  for (const name of ["attackFrames", "holdFrames", "decayFrames"] as const) {
    assert(Number.isSafeInteger(parameters[name]) && (parameters[name] as number) >= 0,
      `${label}.${name} is invalid.`);
  }
  return {
    intensity: parameters.intensity,
    attackFrames: parameters.attackFrames as number,
    holdFrames: parameters.holdFrames as number,
    decayFrames: parameters.decayFrames as number,
    color: color(parameters.color, `${label}.color`),
    glowColor: color(parameters.glowColor, `${label}.glowColor`),
  };
}

type ProjectContext = Pick<NleComponentLoweringContext, "project"> &
  Partial<Pick<NleComponentLoweringContext, "media">>;

function programmeSource(item: NleComponentItem, context: ProjectContext): {
  readonly source: ProgramSource;
  readonly output: "picture";
} {
  assert(item.picture !== undefined, `Football Tier Board ${item.id} has no Picture appearance.`);
  const layout = resolveNlePictureLayout(context.project, item.picture.layout);
  const id = `${item.id}:football-tier-board`;
  return {
    source: {
      id,
      outputs: {
        picture: {
          kind: "signal",
          type: pictureType,
          domain: sealLocalTemporalDomain({ id: `${id}:time`, duration: structuredClone(item.duration) }),
          spatialDomain: sealLocalSpatialDomain({
            id: `${id}:picture`,
            region: { x: 0, y: 0, width: layout.width, height: layout.height },
          }),
        },
      },
    },
    output: "picture",
  };
}

function boardParameters(item: NleComponentItem): {
  readonly rows: readonly Row[];
  readonly entries: readonly Entry[];
  readonly entryMotion: EntryMotion;
  readonly boardHeightRatio: number;
  readonly revealFlash?: RevealFlash;
} {
  const parameters = record(item.parameters, `Football Tier Board ${item.id}`);
  fields(parameters, ["boardHeightRatio", "entries", "entryMotion", "revealFlash", "rows"],
    `Football Tier Board ${item.id}`);
  const entryMotion = parameters.entryMotion ?? "stage-then-place";
  assert(entryMotion === "stage-then-place" || entryMotion === "pop-in-place",
    `Football Tier Board ${item.id}.entryMotion is invalid.`);
  const boardHeightRatio = parameters.boardHeightRatio ?? 0.45;
  assert(typeof boardHeightRatio === "number" && Number.isFinite(boardHeightRatio)
    && boardHeightRatio >= 0.25 && boardHeightRatio <= 0.55,
  `Football Tier Board ${item.id}.boardHeightRatio is invalid.`);
  let revealFlash: RevealFlash | undefined;
  if (parameters.revealFlash !== undefined) {
    revealFlash = revealFlashParameters(parameters.revealFlash,
      `Football Tier Board ${item.id}.revealFlash`);
  }
  assert(Array.isArray(parameters.rows) && parameters.rows.length >= 2 && parameters.rows.length <= 8,
    `Football Tier Board ${item.id}.rows is invalid.`);
  const rows = parameters.rows.map((value, index) => {
    const row = record(value, `Football Tier Board ${item.id}.rows.${index}`);
    fields(row, ["color", "id", "label"], `Football Tier Board ${item.id}.rows.${index}`);
    return {
      id: text(row.id, `Football Tier Board ${item.id}.rows.${index}.id`),
      label: text(row.label, `Football Tier Board ${item.id}.rows.${index}.label`),
      color: color(row.color, `Football Tier Board ${item.id}.rows.${index}.color`),
    };
  });
  assert(new Set(rows.map((row) => row.id)).size === rows.length,
    `Football Tier Board ${item.id} repeats a row.`);
  const rowIds = new Set(rows.map((row) => row.id));
  assert(Array.isArray(parameters.entries) && parameters.entries.length > 0,
    `Football Tier Board ${item.id}.entries is invalid.`);
  const entries = parameters.entries.map((value, index) => {
    const entry = record(value, `Football Tier Board ${item.id}.entries.${index}`);
    fields(entry, ["id", "input", "label", "preset", "tier", "window"],
      `Football Tier Board ${item.id}.entries.${index}`);
    const tier = text(entry.tier, `Football Tier Board ${item.id}.entries.${index}.tier`);
    assert(rowIds.has(tier), `Football Tier Board ${item.id} references missing tier ${tier}.`);
    assert(typeof entry.preset === "boolean", `Football Tier Board ${item.id}.entries.${index}.preset is invalid.`);
    let window: Entry["window"];
    if (!entry.preset) {
      const value = record(entry.window, `Football Tier Board ${item.id}.entries.${index}.window`);
      fields(value, ["end", "start"], `Football Tier Board ${item.id}.entries.${index}.window`);
      window = {
        start: exact(value.start, `Football Tier Board ${item.id}.entries.${index}.window.start`),
        end: exact(value.end, `Football Tier Board ${item.id}.entries.${index}.window.end`),
      };
    } else {
      assert(entry.window === undefined, `Football Tier Board ${item.id}.entries.${index} preset cannot have a window.`);
    }
    return {
      id: text(entry.id, `Football Tier Board ${item.id}.entries.${index}.id`),
      label: text(entry.label, `Football Tier Board ${item.id}.entries.${index}.label`),
      tier,
      input: text(entry.input, `Football Tier Board ${item.id}.entries.${index}.input`),
      preset: entry.preset,
      ...(window === undefined ? {} : { window }),
    };
  });
  assert(new Set(entries.map((entry) => entry.id)).size === entries.length,
    `Football Tier Board ${item.id} repeats an entry.`);
  assert(new Set(entries.map((entry) => entry.input)).size === entries.length,
    `Football Tier Board ${item.id} repeats a Media input.`);
  return { rows, entries, entryMotion, boardHeightRatio, revealFlash };
}

function resolveBoard(item: NleComponentItem, context: ProjectContext) {
  const { rows, entries, entryMotion, boardHeightRatio, revealFlash } = boardParameters(item);
  assert(item.picture !== undefined, `Football Tier Board ${item.id} has no Picture appearance.`);
  const layout = resolveNlePictureLayout(context.project, item.picture.layout);

  // Exact geometry from the original ranking package and recipes.svs.
  const boardHeight = Math.round(layout.height * boardHeightRatio);
  const board = { x: 0, y: layout.height - boardHeight, width: layout.width, height: boardHeight };
  const rowHeight = board.height / rows.length;
  const labelWidth = Math.round(rowHeight * 1.5);
  const gap = Math.max(4, Math.round(rowHeight * 0.03));
  const iconSize = rowHeight - gap * 2;
  const radius = Math.round(rowHeight * 0.12);
  const counts = new Map<string, number>();
  const placed = entries.map((entry) => {
    const row = rows.findIndex((candidate) => candidate.id === entry.tier);
    const column = counts.get(entry.tier) ?? 0;
    counts.set(entry.tier, column + 1);
    const final = {
      x: board.x + labelWidth + gap + column * (iconSize + gap),
      y: board.y + Math.round(row * rowHeight + (rowHeight - iconSize) / 2),
      size: iconSize,
    };
    assert(final.x + final.size <= board.x + board.width,
      `Football Tier Board row ${entry.tier} cannot fit Entry ${entry.id}.`);
    return { ...entry, final };
  });

  const dependencies = new Map<string, { readonly artifact: BlobRef; readonly picture: PictureInterpretation }>();
  if (context.media !== undefined) for (const entry of entries) {
    const media = context.media[entry.input];
    assert(media !== undefined, `Football Tier Board ${item.id} is missing Media input ${entry.input}.`);
    assert(media.picture?.kind === "constant",
      `Football Tier Board ${item.id} Media input ${entry.input} must be a still Picture.`);
    const picture = media.picture.interpretation.picture;
    verifyPictureInterpretation(picture, `Football Tier Board ${item.id} Media input ${entry.input}`);
    dependencies.set(media.source.resource, { artifact: media.source, picture });
  }

  const resolved = programmeSource(item, context);
  return {
    ...resolved,
    html: visualProgramHtmlSource(resolved.source.id, resolved.output, htmlVisual({
      dependencies: [...dependencies.values()].map(({ artifact, picture }) => ({
        kind: "picture" as const,
        artifact,
        picture,
      })),
      data: {
        entries: placed,
        entryMotion,
        ...(revealFlash === undefined ? {} : { revealFlash }),
        appearFrames: 8,
        moveFrames: 14,
        stage: { centerX: Math.round(layout.width * 0.2), centerY: Math.round(layout.height * 0.3), size: 168 },
      },
      html: `<div data-football-ranking><div data-tier-flash><i data-tier-flash-exposure></i><i data-tier-flash-bloom></i></div><div data-tier-board>${rows.map((row, index) => `<div data-tier-row style="--tier:${row.color};top:${index * rowHeight}px;height:${rowHeight}px"><strong style="width:${labelWidth}px">${row.label}</strong><span style="left:${labelWidth}px"></span></div>`).join("")}</div>${placed.map((entry) => `<div data-player="${entry.id}" style="left:${entry.final.x}px;top:${entry.final.y}px;width:${entry.final.size}px;height:${entry.final.size}px"><img src="hypit-artifact://${context.media?.[entry.input]?.source.resource ?? "missing"}"/></div>`).join("")}</div>`,
      css: `:scope>[data-football-ranking]{position:absolute;inset:0;overflow:hidden;pointer-events:none}:scope [data-tier-flash]{position:absolute;inset:0;z-index:20;opacity:0;will-change:opacity}:scope [data-tier-flash]>i{position:absolute;inset:0;display:block}:scope [data-tier-flash-exposure]{opacity:.62;mix-blend-mode:screen}:scope [data-tier-flash-bloom]{opacity:.42;mix-blend-mode:screen}:scope [data-tier-board]{position:absolute;z-index:10;left:${board.x}px;top:${board.y}px;width:${board.width}px;height:${board.height}px}:scope [data-tier-row]{position:absolute;left:0;right:0;box-sizing:border-box;border-top:3px solid #111315;border-left:3px solid #111315;border-right:3px solid #111315}:scope [data-tier-row]:last-child{border-bottom:3px solid #111315}:scope [data-tier-row]>strong{position:absolute;inset:0 auto 0 0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border-right:3px solid #111315;background:var(--tier);color:#2c2c2c;font-family:Inter,Arial,sans-serif;font-size:${rowHeight * 0.3}px;font-weight:400;line-height:1}:scope [data-tier-row]>span{position:absolute;inset:0 0 0 auto;background:#2b2b30}:scope [data-player]{position:absolute;overflow:hidden;border-radius:${radius}px;filter:blur(0) drop-shadow(0 7px 10px rgba(0,0,0,.2));transform-origin:center center;will-change:transform,opacity,filter}:scope [data-player]>img{display:block;width:100%;height:100%;object-fit:cover}`,
      setup: `
        const elements = new Map([...root.querySelectorAll('[data-player]')]
          .map(element => [element.getAttribute('data-player'), element]));
        const flash = root.querySelector('[data-tier-flash]');
        const flashExposure = root.querySelector('[data-tier-flash-exposure]');
        const flashBloom = root.querySelector('[data-tier-flash-bloom]');
        if (data.revealFlash) {
          flashExposure.style.background = data.revealFlash.glowColor;
          flashBloom.style.background = data.revealFlash.color;
        }
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const clamp = value => Math.max(0, Math.min(1, value));
        const outCubic = value => 1 - Math.pow(1 - value, 3);
        const smootherStep = value => value * value * value * (value * (value * 6 - 15) + 10);
        const settle = (element) => {
          element.style.opacity = '1';
          element.style.transform = 'translate(0px,0px) scale(1) rotate(0deg)';
          element.style.filter = 'blur(0px) drop-shadow(0 7px 10px rgba(0,0,0,.2))';
          element.style.zIndex = '30';
        };
        return localFrame => {
          let flashOpacity = 0;
          for (const entry of data.entries) {
            const element = elements.get(entry.id);
            if (entry.preset) { settle(element); continue; }
            const startFrame = Math.round(seconds(entry.window.start) * fps);
            const endFrame = Math.round(seconds(entry.window.end) * fps);
            if (data.revealFlash) {
              const flashFrame = localFrame - startFrame;
              const attackEnd = data.revealFlash.attackFrames;
              const holdEnd = attackEnd + data.revealFlash.holdFrames;
              const flashEnd = holdEnd + data.revealFlash.decayFrames;
              let opacity = 0;
              if (flashFrame >= 0 && flashFrame <= flashEnd) {
                if (flashFrame <= attackEnd) {
                  opacity = attackEnd === 0
                    ? data.revealFlash.intensity
                    : data.revealFlash.intensity * flashFrame / attackEnd;
                } else if (flashFrame <= holdEnd) {
                  opacity = data.revealFlash.intensity;
                } else if (data.revealFlash.decayFrames > 0) {
                  const decay = clamp((flashFrame - holdEnd) / data.revealFlash.decayFrames);
                  opacity = data.revealFlash.intensity * Math.pow(1 - decay, 2.2);
                }
              }
              if (opacity > flashOpacity) flashOpacity = opacity;
            }
            if (localFrame < startFrame) {
              element.style.opacity = '0';
              continue;
            }
            if (data.entryMotion === 'pop-in-place') {
              const frame = localFrame - startFrame;
              if (frame >= data.appearFrames) { settle(element); continue; }
              const progress = clamp(frame / data.appearFrames);
              const eased = outCubic(progress);
              const overshoot = Math.sin(Math.PI * progress) * .1;
              const scale = .68 + .32 * eased + overshoot;
              element.style.opacity = String(Math.min(1, progress * 4));
              element.style.transform = 'translate(0px,0px) scale(' + scale + ') rotate(0deg)';
              element.style.filter = 'blur(' + ((1 - eased) * 1.2)
                + 'px) drop-shadow(0 7px 10px rgba(0,0,0,.2))';
              element.style.zIndex = '30';
              continue;
            }
            if (localFrame >= endFrame) { settle(element); continue; }
            const frame = localFrame - startFrame;
            const duration = endFrame - startFrame;
            const moveStart = Math.max(data.appearFrames, duration - data.moveFrames);
            const stageX = data.stage.centerX - entry.final.size / 2;
            const stageY = data.stage.centerY - entry.final.size / 2;
            const stageScale = data.stage.size / entry.final.size;
            let x = stageX, y = stageY, scale = stageScale, opacity = 1;
            let blur = 0, shadowY = 16, shadowBlur = 24, shadowOpacity = .3;
            if (frame < data.appearFrames) {
              const progress = clamp(frame / data.appearFrames);
              const eased = outCubic(progress);
              const overshoot = Math.sin(Math.PI * progress) * .06;
              scale = stageScale * (.76 + .24 * eased + overshoot);
              opacity = Math.min(1, progress * 4);
              blur = (1 - eased) * 1.6;
              shadowY = 18 - 2 * eased;
              shadowBlur = 28 - 4 * eased;
            } else if (frame >= moveStart) {
              const progress = clamp((frame - moveStart) / Math.max(1, duration - moveStart));
              const eased = smootherStep(progress);
              const arc = Math.sin(Math.PI * eased);
              const arcHeight = Math.min(48, Math.max(20, Math.abs(entry.final.y - stageY) * .09));
              x = stageX + (entry.final.x - stageX) * eased;
              y = stageY + (entry.final.y - stageY) * eased - arcHeight * arc;
              scale = stageScale + (1 - stageScale) * eased + .025 * arc;
              shadowY = 16 - 8 * eased;
              shadowBlur = 24 - 12 * eased;
              shadowOpacity = .3 - .1 * eased;
            }
            element.style.opacity = String(opacity);
            element.style.transform = 'translate(' + (x - entry.final.x) + 'px,' + (y - entry.final.y)
              + 'px) scale(' + scale + ') rotate(0deg)';
            element.style.filter = 'blur(' + blur + 'px) drop-shadow(0 ' + shadowY + 'px '
              + shadowBlur + 'px rgba(0,0,0,' + shadowOpacity + '))';
            element.style.zIndex = '25';
          }
          flash.style.opacity = String(flashOpacity);
        };
      `,
    })),
  };
}

export const footballTierBoardNleResolver: NleComponentResolver = {
  component: footballTierBoardComponentSymbol,
  resolve: (item, context) => {
    const value = resolveBoard(item, context);
    return { source: value.source, pictureOutput: value.output };
  },
};

export const footballTierBoardHtmlResolver: NleAudiovisualComponentResolver = {
  component: footballTierBoardComponentSymbol,
  resolve: (item, context) => ({ html: resolveBoard(item, context).html }),
};

export const footballTierBoardMediaAuthoring: NleComponentMediaAuthoring = {
  component: footballTierBoardComponentSymbol,
  inputs: ({ item }) => boardParameters(item).entries.map((entry) => ({
    key: entry.input,
    label: `${entry.label} portrait`,
    requires: ["picture"] as const,
    required: true,
  })),
};

export const footballRevealFlashComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-football-components" },
  name: "reveal-flash",
};

function resolveRevealFlash(item: NleComponentItem, context: ProjectContext) {
  const value = revealFlashParameters(item.parameters, `Football Reveal Flash ${item.id}`);
  assert(item.picture !== undefined, `Football Reveal Flash ${item.id} has no Picture appearance.`);
  const layout = resolveNlePictureLayout(context.project, item.picture.layout);
  const id = `${item.id}:football-reveal-flash`;
  const source: ProgramSource = {
    id,
    outputs: {
      picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: `${id}:time`, duration: structuredClone(item.duration) }),
        spatialDomain: sealLocalSpatialDomain({
          id: `${id}:picture`,
          region: { x: 0, y: 0, width: layout.width, height: layout.height },
        }),
      },
    },
  };
  return {
    source,
    output: "picture" as const,
    html: visualProgramHtmlSource(id, "picture", htmlVisual({
      data: { flash: value },
      html: `<div data-reveal-flash><i data-reveal-flash-exposure></i><i data-reveal-flash-color></i></div>`,
      css: `:scope>[data-reveal-flash]{position:absolute;inset:0;opacity:0;pointer-events:none;will-change:opacity}:scope [data-reveal-flash]>i{position:absolute;inset:0;display:block}:scope [data-reveal-flash-exposure]{opacity:.62;mix-blend-mode:screen}:scope [data-reveal-flash-color]{opacity:.42;mix-blend-mode:screen}`,
      setup: `
        const flash = root.querySelector('[data-reveal-flash]');
        root.querySelector('[data-reveal-flash-exposure]').style.background = data.flash.glowColor;
        root.querySelector('[data-reveal-flash-color]').style.background = data.flash.color;
        const clamp = value => Math.max(0, Math.min(1, value));
        return localFrame => {
          const attackEnd = data.flash.attackFrames;
          const holdEnd = attackEnd + data.flash.holdFrames;
          const flashEnd = holdEnd + data.flash.decayFrames;
          let opacity = 0;
          if (localFrame >= 0 && localFrame <= flashEnd) {
            if (localFrame <= attackEnd) {
              opacity = attackEnd === 0
                ? data.flash.intensity
                : data.flash.intensity * localFrame / attackEnd;
            } else if (localFrame <= holdEnd) {
              opacity = data.flash.intensity;
            } else if (data.flash.decayFrames > 0) {
              const decay = clamp((localFrame - holdEnd) / data.flash.decayFrames);
              opacity = data.flash.intensity * Math.pow(1 - decay, 2.2);
            }
          }
          flash.style.opacity = String(opacity);
        };
      `,
    })),
  };
}

export const footballRevealFlashNleResolver: NleComponentResolver = {
  component: footballRevealFlashComponentSymbol,
  resolve: (item, context) => {
    const value = resolveRevealFlash(item, context);
    return { source: value.source, pictureOutput: value.output };
  },
};

export const footballRevealFlashHtmlResolver: NleAudiovisualComponentResolver = {
  component: footballRevealFlashComponentSymbol,
  resolve: (item, context) => ({ html: resolveRevealFlash(item, context).html }),
};

export const footballTitleComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit-example/ranking-football-components" },
  name: "reference-title",
};

function titleParameters(item: NleComponentItem): {
  readonly first: string;
  readonly second: string;
  readonly top: number;
} {
  const parameters = record(item.parameters, `Football Reference Title ${item.id}`);
  fields(parameters, ["first", "second", "top"], `Football Reference Title ${item.id}`);
  const top = parameters.top ?? 42;
  assert(typeof top === "number" && Number.isFinite(top) && top >= 0 && top <= 400,
    `Football Reference Title ${item.id}.top is invalid.`);
  return {
    first: text(parameters.first, `Football Reference Title ${item.id}.first`),
    second: text(parameters.second, `Football Reference Title ${item.id}.second`),
    top,
  };
}

function resolveTitle(item: NleComponentItem, context: ProjectContext) {
  const value = titleParameters(item);
  assert(item.picture !== undefined, `Football Reference Title ${item.id} has no Picture appearance.`);
  const layout = resolveNlePictureLayout(context.project, item.picture.layout);
  const id = `${item.id}:football-reference-title`;
  const source: ProgramSource = {
    id,
    outputs: {
      picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: `${id}:time`, duration: structuredClone(item.duration) }),
        spatialDomain: sealLocalSpatialDomain({
          id: `${id}:picture`,
          region: { x: 0, y: 0, width: layout.width, height: layout.height },
        }),
      },
    },
  };
  return {
    source,
    output: "picture" as const,
    html: visualProgramHtmlSource(id, "picture", htmlVisual({
      data: {},
      html: `<div data-reference-title><div>${value.first}</div><div>${value.second}</div></div>`,
      css: `:scope>[data-reference-title]{position:absolute;left:0;right:0;top:${value.top}px;height:94px;box-sizing:border-box;padding:5px 20px 4px;background:#f4f2e8;color:#070707;font-family:Arial Black,Montserrat,Arial,Apple Color Emoji,Segoe UI Emoji,sans-serif;font-size:42px;font-weight:900;letter-spacing:-1.2px;line-height:1.02;text-align:center;white-space:nowrap}:scope>[data-reference-title]>div{height:43px}`,
    })),
  };
}

export const footballTitleNleResolver: NleComponentResolver = {
  component: footballTitleComponentSymbol,
  resolve: (item, context) => {
    const value = resolveTitle(item, context);
    return { source: value.source, pictureOutput: value.output };
  },
};

export const footballTitleHtmlResolver: NleAudiovisualComponentResolver = {
  component: footballTitleComponentSymbol,
  resolve: (item, context) => ({ html: resolveTitle(item, context).html }),
};
