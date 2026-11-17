import type { NleInspectorField, NleInspectorScene } from "@hypit/nle/view";
import { NumberField, Row, Section, Toggle } from "./controls.js";
import { useRef, useState } from "react";

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
    return <Row label={field.label}><select disabled={disabled} value={String(field.value)}
      onChange={event => onEdit(section, field.id, event.target.value)}>
      {(field.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></Row>;
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
  return <>{scene.sections.map(section => <Section title={section.label} key={section.id}>
    {section.fields.map(field => <Field key={`${scene.item}/${field.id}`} section={section.id} field={field} disabled={disabled} onEdit={onEdit}/>) }
  </Section>)}</>;
}
