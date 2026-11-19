import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { NleInspectorField, NleInspectorScene } from "@hypit/nle/view";
import { NumberField, Row, Section, Toggle } from "./controls.js";
import { useRef, useState } from "react";

/** Studio's Chinese labels for the NLE-owned Inspector sections and fields, keyed by their stable ids. */
const sectionLabels: Readonly<Record<string, string>> = { "nle-occurrence": "片段", "nle-picture-layout": "画面布局" };
const fieldLabels: Readonly<Record<string, string>> = {
  name: "名称", track: "所在轨道", enabled: "启用", start: "开始", duration: "时长", mapping: "时间映射",
  x: "X", y: "Y", width: "宽度", height: "高度", fit: "填充方式", contentX: "水平焦点", contentY: "垂直焦点",
};
const optionLabels: Readonly<Record<string, string>> = { fill: "拉伸", contain: "适应", cover: "填满" };
const unitLabels: Readonly<Record<string, string>> = { frames: "帧" };

function localized(field: NleInspectorField): NleInspectorField {
  const value = field.id === "mapping" && typeof field.value === "string" ? field.value.replace(/^(\d+) pieces?$/u, "$1 段") : field.value;
  return {
    ...field, value,
    label: fieldLabels[field.id] ?? field.label,
    ...(field.unit === undefined ? {} : { unit: unitLabels[field.unit] ?? field.unit }),
    ...(field.options === undefined ? {} : { options: field.options.map(option => ({ ...option, label: optionLabels[option.value] ?? option.label })) }),
  };
}

function TextField({ field, disabled, onCommit }: {
  readonly field: NleInspectorField;
  readonly disabled: boolean;
  readonly onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const cancel = useRef(false);
  return <input aria-label={field.label} disabled={disabled} value={draft ?? String(field.value)}
    onFocus={() => { cancel.current = false; }} onChange={event => setDraft(event.target.value)}
    onBlur={event => { const value = event.target.value; setDraft(undefined); if (!cancel.current && value !== String(field.value)) onCommit(value); }}
    onKeyDown={event => { if (event.key === "Escape") { cancel.current = true; setDraft(undefined); event.currentTarget.blur(); } else if (event.key === "Enter") event.currentTarget.blur(); }}/>;
}

function Field({ section, field, disabled, onEdit }: {
  readonly section: string;
  readonly field: NleInspectorField;
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
}) {
  if (field.editable !== true || field.control === "readout") {
    return <Row label={field.label}><output>{String(field.value)}{field.unit === undefined ? "" : ` ${field.unit}`}</output></Row>;
  }
  if (field.control === "boolean") {
    return <Row label={field.label}><Toggle disabled={disabled} label={field.label} checked={field.value === true} onChange={value => onEdit(section, field.id, value)}/></Row>;
  }
  if (field.control === "select") {
    const options = field.options ?? [];
    return <Row label={field.label}>
      <Select.Root items={options} value={String(field.value)} disabled={disabled} modal={false}
        onValueChange={value => { if (value !== null) onEdit(section, field.id, value); }}>
        <Select.Trigger className="select-trigger dropdown-trigger" aria-label={field.label}>
          <Select.Value className="select-value"/>
          <Select.Icon className="dropdown-chevron"><ChevronDown size={16}/></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="dropdown-positioner" alignItemWithTrigger={false} sideOffset={6} collisionPadding={12}>
            <Select.Popup className="dropdown-content" data-dropdown-content="">
              <Select.List className="dropdown-list">
                {options.map(option => <Select.Item key={option.value} value={option.value} className="dropdown-item">
                  <Select.ItemText className="dropdown-item-label">{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="dropdown-item-check"><Check size={16}/></Select.ItemIndicator>
                </Select.Item>)}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </Row>;
  }
  if (field.control === "number") return <Row label={field.label}><NumberField disabled={disabled} label={field.label} value={Number(field.value)}
    {...(field.minimum === undefined ? {} : { min: field.minimum })}
    {...(field.maximum === undefined ? {} : { max: field.maximum })}
    {...(field.step === undefined ? {} : { step: field.step })}
    onCommit={value => onEdit(section, field.id, value)}/>{field.unit !== undefined && <small>{field.unit}</small>}</Row>;
  return <Row label={field.label}>{field.control === "color"
    ? <input aria-label={field.label} disabled={disabled} type="color" value={String(field.value)} onChange={event => onEdit(section, field.id, event.target.value)}/>
    : <TextField field={field} disabled={disabled} onCommit={value => onEdit(section, field.id, value)}/>}</Row>;
}

export function Inspector({ scene, disabled, onEdit }: {
  readonly scene: NleInspectorScene | undefined;
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
}) {
  if (scene === undefined) return <p className="nle-empty">选择一个时间线项目以检查属性</p>;
  return <AnimatePresence initial={false}>{scene.sections.map(section => {
    const owned = section.owner.kind !== "package";
    return <Section title={owned ? sectionLabels[section.id] ?? section.label : section.label} key={section.id}>
    {section.fields.map(field => <Field key={`${scene.item}/${field.id}`} section={section.id} field={owned ? localized(field) : field} disabled={disabled} onEdit={onEdit}/>) }
  </Section>; })}</AnimatePresence>;
}
