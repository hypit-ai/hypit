import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";

/**
 * Export settings mock. Defaults follow the active Composition's canvas and edit rate; choosing settings does not
 * render anything yet, because Studio has no audiovisual delivery Executor.
 */
type Quality = "small" | "recommended" | "high";
type Format = "mp4" | "mov";

const resolutions = [
  { label: "480P", short: 480 }, { label: "720P", short: 720 }, { label: "1080P", short: 1080 },
  { label: "2K", short: 1440 }, { label: "4K", short: 2160 },
] as const;
const frameRates = [24, 25, 30, 50, 60] as const;
const qualities: readonly { readonly id: Quality; readonly label: string }[] = [
  { id: "small", label: "更小文件" }, { id: "recommended", label: "推荐" }, { id: "high", label: "更高画质" },
];
const formats: readonly { readonly id: Format; readonly label: string }[] = [{ id: "mp4", label: "MP4" }, { id: "mov", label: "MOV" }];

function even(value: number): number { return Math.max(2, Math.round(value / 2) * 2); }

/** Output size for a resolution tier, keeping the canvas aspect: the tier names the canvas's shorter side. */
function outputSize(canvas: { readonly width: number; readonly height: number }, short: number) {
  const scale = short / Math.min(canvas.width, canvas.height);
  return { width: even(canvas.width * scale), height: even(canvas.height * scale) };
}

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string; readonly disabled?: boolean; readonly hint?: string }[];
  readonly onChange: (value: T) => void;
}) {
  return <div className="export-row"><span className="export-label">{label}</span>
    <div className="export-segmented" role="radiogroup" aria-label={label}>{options.map(option =>
      <button key={String(option.value)} type="button" role="radio" aria-checked={option.value === value} disabled={option.disabled}
        title={option.hint} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
  </div>;
}

export function ExportDialog({ projectName, canvas, fps, onClose, onExport }: {
  readonly projectName: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly fps: number;
  readonly onClose: () => void;
  readonly onExport: () => void;
}) {
  const [open, setOpen] = useState(true);
  const native = Math.min(canvas.width, canvas.height);
  const nativeRate = Math.round(fps);
  const defaultTier = [...resolutions].reverse().find(tier => tier.short <= native)?.short ?? resolutions[0].short;
  const [name, setName] = useState(projectName);
  const [short, setShort] = useState<number>(defaultTier);
  const [rate, setRate] = useState<number>(frameRates.includes(nativeRate as typeof frameRates[number]) ? nativeRate : frameRates.filter(value => value <= nativeRate).at(-1) ?? 24);
  const [quality, setQuality] = useState<Quality>("recommended");
  const [format, setFormat] = useState<Format>("mp4");
  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={value => { if (!value) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="studio-dialog-backdrop"/>
      <Dialog.Popup className="studio-dialog modal export-dialog">
        <Dialog.Title>导出视频</Dialog.Title>
        <form onSubmit={event => { event.preventDefault(); setOpen(false); onExport(); }}>
          <label className="export-row"><span className="export-label">文件名</span>
            <span className="export-name"><input required value={name} onChange={event => setName(event.target.value)} onFocus={event => event.target.select()}/><small>.{format}</small></span></label>
          <div className="export-row"><span className="export-label">导出位置</span>
            <span className="export-location"><span title="~/Movies/Hypit">~/Movies/Hypit</span><button type="button" className="button">更改</button></span></div>
          <Segmented label="分辨率" value={short} onChange={setShort} options={resolutions.map(tier => ({
            value: tier.short, label: tier.label, disabled: tier.short > native,
            hint: tier.short > native ? "高于时间线画布，画面不会更清晰" : (() => { const value = outputSize(canvas, tier.short); return `${value.width}×${value.height}`; })(),
          }))}/>
          <Segmented label="帧率" value={rate} onChange={setRate} options={frameRates.map(value => ({
            value, label: `${value}`, disabled: value > nativeRate, ...(value > nativeRate ? { hint: "高于工程帧率，画面不会更流畅" } : {}),
          }))}/>
          <Segmented label="画质" value={quality} onChange={setQuality} options={qualities.map(value => ({ value: value.id, label: value.label }))}/>
          <Segmented label="格式" value={format} onChange={setFormat} options={formats.map(value => ({ value: value.id, label: value.label }))}/>
          <footer><button type="button" className="button" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary">导出</button></footer>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
