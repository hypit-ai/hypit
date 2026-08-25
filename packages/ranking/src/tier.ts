import { resolveTierBoardMotion } from "./schedule.js";
import type { TierBoardStyle } from "./types.js";

export type TierBoardGeometry = {
  readonly width: number;
  readonly height: number;
  readonly rowHeight: number;
  readonly labelWidth: number;
  readonly gap: number;
  readonly iconSize: number;
};

export type TierStageGeometry = {
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
};

export type TierCell = {
  readonly x: number;
  readonly y: number;
  readonly size: number;
};

export type TierItemPose = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  readonly rotateDeg: number;
  readonly blurPx: number;
  readonly shadowY: number;
  readonly shadowBlur: number;
  readonly shadowOpacity: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function outCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export function tierBoardGeometry(width: number, height: number, style: TierBoardStyle): TierBoardGeometry {
  const rowHeight = height / style.rows.length;
  const labelWidth = Math.round(style.labelWidthRatio === undefined
    ? rowHeight * 1.5
    : width * style.labelWidthRatio);
  const gap = Math.max(4, Math.round(rowHeight * 0.03));
  return {
    width,
    height,
    rowHeight,
    labelWidth,
    gap,
    iconSize: rowHeight - gap * 2,
  };
}

export function tierStageGeometry(width: number, height: number, style: TierBoardStyle): TierStageGeometry {
  return {
    centerX: Math.round(width * style.stagePoint.x),
    centerY: Math.round(height * style.stagePoint.y),
    size: style.stageSizePx,
  };
}

export function tierCell(geometry: TierBoardGeometry, rowIndex: number, column: number): TierCell {
  return {
    x: geometry.labelWidth + geometry.gap + column * (geometry.iconSize + geometry.gap),
    y: Math.round(rowIndex * geometry.rowHeight
      + (geometry.rowHeight - geometry.iconSize) / 2),
    size: geometry.iconSize,
  };
}

function settled(cell: TierCell): TierItemPose {
  return {
    x: cell.x,
    y: cell.y,
    scale: 1,
    opacity: 1,
    rotateDeg: 0,
    blurPx: 0,
    shadowY: 7,
    shadowBlur: 10,
    shadowOpacity: 0.2,
  };
}

export function directTierItemPose(
  localFrame: number,
  cell: TierCell,
  appearFrames: number,
): TierItemPose {
  if (localFrame >= appearFrames) return settled(cell);
  const progress = clamp01(localFrame / appearFrames);
  const eased = outCubic(progress);
  const overshoot = Math.sin(Math.PI * progress) * 0.075;
  return {
    x: cell.x,
    y: cell.y,
    scale: 0.76 + 0.24 * eased + overshoot,
    opacity: Math.min(1, progress * 4),
    rotateDeg: 0,
    blurPx: (1 - eased) * 1.2,
    shadowY: 12 - 5 * eased,
    shadowBlur: 18 - 8 * eased,
    shadowOpacity: 0.28 - 0.08 * eased,
  };
}

export function fromHighTierItemPose(
  localFrame: number,
  durationFrames: number,
  stage: TierStageGeometry,
  cell: TierCell,
  appearFrames: number,
  moveFrames: number,
): TierItemPose {
  const phases = resolveTierBoardMotion(durationFrames, appearFrames, moveFrames);
  const stageX = stage.centerX - cell.size / 2;
  const stageY = stage.centerY - cell.size / 2;
  const stageScale = stage.size / cell.size;
  if (localFrame < phases.appearEndFrame) {
    const progress = clamp01(localFrame / appearFrames);
    const eased = outCubic(progress);
    const overshoot = Math.sin(Math.PI * progress) * 0.06;
    return {
      x: stageX,
      y: stageY,
      scale: stageScale * (0.76 + 0.24 * eased + overshoot),
      opacity: Math.min(1, progress * 4),
      rotateDeg: 0,
      blurPx: (1 - eased) * 1.6,
      shadowY: 18 - 2 * eased,
      shadowBlur: 28 - 4 * eased,
      shadowOpacity: 0.3,
    };
  }
  if (localFrame < phases.moveStartFrame) return {
    x: stageX,
    y: stageY,
    scale: stageScale,
    opacity: 1,
    rotateDeg: 0,
    blurPx: 0,
    shadowY: 16,
    shadowBlur: 24,
    shadowOpacity: 0.3,
  };
  if (localFrame < durationFrames) {
    const actualMoveFrames = (phases.moveEndFrame ?? durationFrames) - phases.moveStartFrame;
    const progress = clamp01((localFrame - phases.moveStartFrame) / actualMoveFrames);
    const eased = smootherStep(progress);
    const arc = Math.sin(Math.PI * eased);
    const arcHeight = Math.min(48, Math.max(20, Math.abs(cell.y - stageY) * 0.09));
    return {
      x: stageX + (cell.x - stageX) * eased,
      y: stageY + (cell.y - stageY) * eased - arcHeight * arc,
      scale: stageScale + (1 - stageScale) * eased + 0.025 * arc,
      opacity: 1,
      rotateDeg: 0,
      blurPx: 0,
      shadowY: 16 - 8 * eased,
      shadowBlur: 24 - 12 * eased,
      shadowOpacity: 0.3 - 0.1 * eased,
    };
  }
  return settled(cell);
}
