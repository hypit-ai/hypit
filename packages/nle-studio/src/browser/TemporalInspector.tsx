import type { NleItem } from "@hypit/nle";
import { NumberField, Row, Section, Toggle } from "./controls.js";
import { uniformSpeed } from "./editPlans.js";

const frameNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3, useGrouping: false });

export function TemporalInspector({ item, start, duration, sourceOffset, disabled, onStart, onDuration, onSpeed, onReverse, onSlipEarlier, onSlipLater, canFreeze, onFreeze }: {
  readonly item: NleItem;
  readonly start: number;
  readonly duration: number;
  readonly sourceOffset: number | undefined;
  readonly disabled: boolean;
  readonly onStart: (frame: number) => void;
  readonly onDuration: (frames: number) => void;
  readonly onSpeed: (speed: number) => void;
  readonly onReverse: () => void;
  readonly onSlipEarlier: (() => void) | undefined;
  readonly onSlipLater: (() => void) | undefined;
  readonly onFreeze: () => void;
  readonly canFreeze: boolean;
}) {
  const speed = uniformSpeed(item);
  const offsetLabel = item.kind === "adjust" ? "效果时间偏移" : "素材偏移";
  return <>
    <Section title="时间">
      <Row label="起始帧"><NumberField label="起始帧" value={start} min={0} precision={0} disabled={disabled} onCommit={value => onStart(Math.round(value))}/></Row>
      <Row label="持续帧数"><NumberField label="持续帧数" value={duration} min={1} precision={0} disabled={disabled} onCommit={value => onDuration(Math.round(value))}/></Row>
      <Row label={offsetLabel}>
        {sourceOffset !== undefined && <output aria-label={`当前${offsetLabel}`}>{frameNumber.format(sourceOffset)} 帧</output>}
        <button type="button" className="button small" disabled={disabled || !onSlipEarlier} onClick={onSlipEarlier}>前移一帧</button>
        <button type="button" className="button small" disabled={disabled || !onSlipLater} onClick={onSlipLater}>后移一帧</button>
      </Row>
    </Section>
    {item.kind === "present" && <Section title="变速">
      <Row label="倍速">{speed !== undefined && speed !== 0 ? <NumberField label="倍速" value={Math.abs(speed)} min={0.01} max={100} step={0.1} disabled={disabled} onCommit={onSpeed}/> : <output>{speed === 0 ? "定格" : "分段时间映射"}</output>}</Row>
      <Row label="反向播放"><Toggle label="反向播放" checked={speed !== undefined && speed < 0} disabled={disabled} onChange={onReverse}/></Row>
      {item.picture && <Row label="定格"><button type="button" className="button small" disabled={disabled || !canFreeze} onClick={onFreeze}>在播放头创建定格</button></Row>}
    </Section>}
  </>;
}
