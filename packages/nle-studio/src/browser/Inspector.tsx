import type { NleInspectorCollection, NleInspectorField, NleInspectorScene } from "@hypit/nle/view";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { NleStudioComponentInputsProjection, NleStudioMediaEntry, NleStudioProcessEdit } from "../protocol.js";
import { IconButton } from "./common.js";
import { NumberField, Row, Section, Toggle } from "./controls.js";

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
  const type = field.control === "color" ? "color" : "text";
  return <Row label={field.label}><input disabled={disabled} type={type} value={String(field.value)} onChange={event => onEdit(section, field.id, event.target.value)}/></Row>;
}

function Collection({ section, collection, disabled, onEdit, onInvoke }: {
  readonly section: string;
  readonly collection: NleInspectorCollection;
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
  readonly onInvoke: (section: string, collection: string, row: string, action: string) => void;
}) {
  return <div className="nle-inspector-collection">
    <h4>{collection.label}</h4>
    {collection.rows.map((row, index) => <div className="nle-inspector-collection-row" key={row.id}>
      <strong>{row.label ?? String(index + 1)}</strong>
      <div>{row.fields.map(field => <Field key={field.id} section={section} field={field}
        disabled={disabled} onEdit={onEdit}/>)}</div>
      {row.actions?.map(action => <button type="button" className="button" key={action.id}
        disabled={disabled || !action.enabled} onClick={() => onInvoke(section, collection.id, row.id, action.id)}>
        {action.label}
      </button>)}
    </div>)}
  </div>;
}

export function Inspector({ scene, component, media, disabled, onEdit, onMedia, onProcessEdit, onInvoke }: {
  readonly scene: NleInspectorScene | undefined;
  readonly component: NleStudioComponentInputsProjection | undefined;
  readonly media: readonly NleStudioMediaEntry[];
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
  readonly onMedia: (item: string, slot: string, media: string) => void;
  readonly onProcessEdit: (edit: NleStudioProcessEdit) => void;
  readonly onInvoke: (item: string, section: string, collection: string, row: string, action: string) => void;
}) {
  if (scene === undefined) return <p className="nle-empty">选择一个时间线项目以检查属性</p>;
  return <>{(["picture", "audio"] as const).map(medium => {
    const processes = scene.processes.filter(process => process.medium === medium);
    if (processes.length === 0) return null;
    return <Section key={medium} title={medium === "picture" ? "画面效果" : "音频效果"}>
      {processes.map((process, index) => {
        const address = { item: scene.item, medium, process: process.id };
        const editable = !disabled && process.editable;
        const before = processes[index + 2]?.id;
        return <Row key={process.id} label={process.label}>
          <Toggle disabled={!editable} label={`启用 ${process.label}`} checked={process.enabled}
            onChange={enabled => onProcessEdit({ kind: "process.enable", ...address, enabled })}/>
          <IconButton label={`向前移动 ${process.label}`} disabled={!editable || index === 0}
            onClick={() => onProcessEdit({ kind: "process.move", ...address, before: processes[index - 1]!.id })}><ArrowUp size={14}/></IconButton>
          <IconButton label={`向后移动 ${process.label}`} disabled={!editable || index === processes.length - 1}
            onClick={() => onProcessEdit({ kind: "process.move", ...address, ...(before === undefined ? {} : { before }) })}><ArrowDown size={14}/></IconButton>
          <IconButton label={`删除 ${process.label}`} disabled={!editable}
            onClick={() => onProcessEdit({ kind: "process.remove", ...address })}><Trash2 size={14}/></IconButton>
        </Row>;
      })}
    </Section>;
  })}{scene.sections.map(section => <Section title={section.label} key={section.id}>
    {section.fields.map(field => <Field key={field.id} section={section.id} field={field} disabled={disabled} onEdit={onEdit}/>) }
    {section.collections?.map(collection => <Collection key={collection.id} section={section.id}
      collection={collection} disabled={disabled} onEdit={onEdit}
      onInvoke={(section, collection, row, action) => onInvoke(scene.item, section, collection, row, action)}/>) }
  </Section>)}{component !== undefined && component.inputs.length > 0 && <Section title="媒体输入">
    {component.inputs.map(input => {
      const options = media.filter(entry => entry.state === "available" && (
        input.picture === undefined || (entry.pictureKind !== undefined
          && (input.picture === "any" || entry.pictureKind === input.picture))
      ) && (input.audio !== true || entry.kind === "audio" || entry.kind === "audiovisual"));
      return <Row key={input.slot} label={input.label}><select aria-label={input.label} disabled={disabled || !component.editable}
        value={input.media ?? ""} onChange={event => onMedia(component.item, input.slot, event.target.value)}>
        <option value="">{input.required ? "待绑定（必需）" : "未绑定"}</option>
        {input.media !== undefined && !options.some(entry => entry.id === input.media)
          && <option value={input.media}>{input.media}</option>}
        {options.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></Row>;
    })}
  </Section>}</>;
}
