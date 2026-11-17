import type { NleInspectorCollection, NleInspectorField, NleInspectorScene } from "@hypit/nle/view";
import type { NleStudioComponentInputsProjection, NleStudioMediaEntry } from "../protocol.js";
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

function Collection({ section, collection, disabled, onEdit }: {
  readonly section: string;
  readonly collection: NleInspectorCollection;
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
}) {
  return <div className="nle-inspector-collection">
    <h4>{collection.label}</h4>
    {collection.rows.map((row, index) => <div className="nle-inspector-collection-row" key={row.id}>
      <strong>{row.label ?? String(index + 1)}</strong>
      <div>{row.fields.map(field => <Field key={field.id} section={section} field={field}
        disabled={disabled} onEdit={onEdit}/>)}</div>
    </div>)}
  </div>;
}

export function Inspector({ scene, component, media, disabled, onEdit, onMedia }: {
  readonly scene: NleInspectorScene | undefined;
  readonly component: NleStudioComponentInputsProjection | undefined;
  readonly media: readonly NleStudioMediaEntry[];
  readonly disabled: boolean;
  readonly onEdit: (section: string, field: string, value: string | number | boolean) => void;
  readonly onMedia: (item: string, slot: string, media: string) => void;
}) {
  if (scene === undefined) return <p className="nle-empty">选择一个时间线项目以检查属性</p>;
  return <>{scene.sections.map(section => <Section title={section.label} key={section.id}>
    {section.fields.map(field => <Field key={field.id} section={section.id} field={field} disabled={disabled} onEdit={onEdit}/>) }
    {section.collections?.map(collection => <Collection key={collection.id} section={section.id}
      collection={collection} disabled={disabled} onEdit={onEdit}/>) }
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
