import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Scan } from 'lucide-react';
import { DraftField } from './ui.js';
import { popupMotion } from './motion.js';

export type GenerationSetting = { field: string; label: string; value: string; values?: readonly string[] };

const ratioPattern = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
const isRatioSetting = (setting: GenerationSetting) => setting.field === 'aspect-ratio' || Boolean(setting.values?.length && setting.values.filter(value => ratioPattern.test(value)).length >= 2);
const tile = 46, tileGap = 2, inset = 16, controlInset = 2, panelGap = 8;

/**
 * The parameter row of a generation composer. A `model` setting opens a list; the other settings share one button
 * showing their values, which opens a panel of segmented choices above the row.
 */
export function GenerationSettings({ settings, zh, disabled, icon, onChange, onSave, revision }: {
  settings: GenerationSetting[]; zh: boolean; disabled?: boolean; icon: ReactNode; revision: string;
  onChange(field: string, value: string): void; onSave(field: string, value: string, revision: string): Promise<void>;
}) {
  const group = useRef<HTMLDivElement>(null);
  const modelTrigger = useRef<HTMLButtonElement>(null), sizeTrigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<'model' | 'size'>();
  const model = settings.find(setting => setting.field === 'model' && setting.values?.length);
  const rest = settings.filter(setting => setting !== model);
  const label = (value: string) => value === 'auto' ? (zh ? '智能' : 'Auto') : value === 'adaptive' ? (zh ? '自适应' : 'Adaptive') : value;
  const parts = rest.map(setting => setting.value ? label(setting.value) : setting.label);
  const toggle = (panel: 'model' | 'size') => setOpen(current => current === panel ? undefined : panel);
  return <div ref={group} className="generation-parameters">
    {model && <button ref={modelTrigger} type="button" className="generation-parameter-trigger" aria-haspopup="listbox" aria-expanded={open === 'model'} aria-label={`${model.label}: ${model.value}`} disabled={disabled} onClick={() => toggle('model')}>
      <span className="generation-parameter-value">{model.value || model.label}</span><ChevronDown size={12} aria-hidden="true"/>
    </button>}
    {rest.length > 0 && <button ref={sizeTrigger} type="button" className="generation-parameter-trigger size" aria-haspopup="dialog" aria-expanded={open === 'size'} aria-label={`${rest.map(setting => setting.label).join(', ')}: ${parts.join(', ')}`} disabled={disabled} onClick={() => toggle('size')}>
      <span className="generation-parameter-value">{parts.map((part, index) => <span key={index} className="generation-parameter-part">{index > 0 && <span className="generation-parameter-separator" aria-hidden="true"/>}{part}</span>)}</span>
      <ChevronDown size={12} aria-hidden="true"/>
    </button>}
    <AnimatePresence>
      {open === 'model' && model && <ParameterPanel key="model" group={group} trigger={modelTrigger} align="start" className="generation-model-panel" role="listbox" label={model.label} onClose={() => setOpen(undefined)}>
        <div className="generation-model-header" role="presentation">{zh ? '选择模型：' : 'Choose model: '}{model.value}</div>
        <div className="generation-model-list" role="presentation">
          {model.values!.map(value => <button key={value} type="button" role="option" aria-selected={value === model.value} className="generation-model-option"
            onClick={() => { onChange(model.field, value); setOpen(undefined); }}>
            <span className="generation-model-icon" aria-hidden="true">{icon}</span>
            <span className="generation-model-title">{value}</span>
          </button>)}
        </div>
      </ParameterPanel>}
      {open === 'size' && <ParameterPanel key="size" group={group} trigger={sizeTrigger} align="center" className="generation-size-panel" role="dialog" label={rest.map(setting => setting.label).join(', ')} onClose={() => setOpen(undefined)}
        width={(() => { const count = Math.max(6, Math.min(9, rest.find(isRatioSetting)?.values?.length ?? 6)); return inset * 2 + controlInset * 2 + count * tile + (count - 1) * tileGap; })()}>
        {rest.map(setting => <fieldset key={setting.field} className="generation-size-field">
          <legend>{setting.label}</legend>
          {setting.values?.length
            ? <div role="listbox" aria-label={setting.label} className={`generation-segmented ${isRatioSetting(setting) ? 'ratio' : setting.values.every(value => /^\d+$/.test(value)) ? 'count' : ''}`}>
              {setting.values.map(value => <button key={value} type="button" role="option" aria-selected={value === setting.value} aria-label={label(value)} tabIndex={value === setting.value ? 0 : -1}
                className="generation-segment" onClick={() => onChange(setting.field, value)}>
                {isRatioSetting(setting) && <span className="generation-ratio-artwork" aria-hidden="true"><RatioIcon value={value}/></span>}
                <span className="generation-segment-label">{label(value)}</span>
              </button>)}
            </div>
            : <div className="generation-segmented field"><DraftField value={setting.value} revision={revision} onSave={(value, at) => onSave(setting.field, value, at)}/></div>}
        </fieldset>)}
      </ParameterPanel>}
    </AnimatePresence>
  </div>;
}

/** A frame drawn at the ratio inside 16px, its long side 12.1px; `auto` and `adaptive` show corners. */
function RatioIcon({ value }: { value: string }) {
  const match = ratioPattern.exec(value);
  if (!match) return <Scan size={16} strokeWidth={1.33}/>;
  const width = Number(match[1]), height = Number(match[2]), long = 12.11, scale = long / Math.max(width, height);
  const w = width * scale, h = height * scale;
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x={(16 - w) / 2} y={(16 - h) / 2} width={w} height={h} rx="1.6" stroke="currentColor" strokeWidth="1.33"/>
  </svg>;
}

/**
 * A panel 8px above the parameter row. `start` panels line up with the row's left edge; `center` panels centre on
 * their trigger, kept inside the row. They grow from 80% at the trigger's centre over 200ms and shrink back on exit.
 */
function ParameterPanel({ group, trigger, align, width, className, role, label, onClose, children }: {
  group: RefObject<HTMLDivElement | null>; trigger: RefObject<HTMLButtonElement | null>; align: 'start' | 'center'; width?: number;
  className: string; role: 'listbox' | 'dialog'; label: string; onClose(): void; children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; bottom: number; origin: string }>();
  useLayoutEffect(() => {
    const measure = () => {
      const row = group.current?.getBoundingClientRect(), button = trigger.current?.getBoundingClientRect(), own = panel.current;
      if (!row || !button || !own) return;
      const panelWidth = Math.min(own.offsetWidth, window.innerWidth - 32), centre = button.left + button.width / 2;
      const left = align === 'start' ? row.left : Math.min(Math.max(centre - panelWidth / 2, row.left), Math.max(row.left, row.right - panelWidth));
      const bottom = window.innerHeight - row.top + panelGap;
      setPlace({ left, bottom, origin: `${centre - left}px ${own.offsetHeight + (button.top + button.height / 2 - row.top) + panelGap}px` });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [align]);
  useEffect(() => {
    const own = panel.current;
    (own?.querySelector<HTMLElement>('[aria-selected="true"]') ?? own?.querySelector<HTMLElement>('[role="option"]'))?.focus({ preventScroll: true });
    const down = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) onClose();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, []);
  return createPortal(<motion.div ref={panel} role={role} aria-label={label} className={`generation-parameter-panel ${className} nodrag nopan nowheel`}
    style={{ left: place?.left ?? 0, bottom: place?.bottom ?? 0, width, transformOrigin: place?.origin, visibility: place ? 'visible' : 'hidden' }}
    {...popupMotion(reducedMotion, .8)}>
    {children}
  </motion.div>, document.body);
}
