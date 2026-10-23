import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { FragmentOperation } from "@hypit/hypit/author";
import type { ModuleManifest, TypeRef, TypedRecord } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { assertTemporalInstantFor, temporalTypes } from "@hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";
import { resolveTemporalInstantReference, resolveTemporalWindowReference, resolveTemporalContext,
  temporalContextAttributeVocabulary, temporalInstantAttributeNames, temporalInstantAttributeVocabulary,
  temporalWindowAttributeNames, temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";
import { renderChat } from "./render.js";
import type { ChatOptions, Message } from "./render.js";

const module = { name: "@example/chat-scene", version: "1" } as const;
const types = Object.fromEntries(["Options", "Message", "Messages"].map(name => [name, { module, name }])) as Record<"Options" | "Message" | "Messages", TypeRef>;
const producers = Object.fromEntries(["empty", "append", "render"].map(name => [name, { module, name }])) as Record<"empty" | "append" | "render", { module: typeof module; name: string }>;
export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [compositionTypes.visualTrack, mediaTypes.fontStack, timelineTypes.timeline, spatialTypes.frame, temporalTypes.instant].map(type => type.module),
  types: Object.values(types).map(type => type.name), capabilities: [], producers: [
    { name: "empty", inputs: [], result: { kind: "output" as const, name: "messages", type: types.Messages } },
    { name: "append", inputs: [{ name: "messages", type: types.Messages }, { name: "message", type: types.Message },
      { name: "at", type: temporalTypes.instant }, { name: "timeline", type: timelineTypes.timeline }], result: { kind: "output" as const, name: "messages", type: types.Messages } },
    { name: "render", inputs: [{ name: "messages", type: types.Messages }, { name: "options", type: types.Options },
      { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window }, { name: "font", type: mediaTypes.fontStack }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
  ],
};
const valueOf = <T>(record: TypedRecord | undefined): T => {
  if (record?.value === undefined) throw new Error("Chat inputs are missing.");
  return record.value as T;
};
const value = (data: unknown) => ((canonicalize(data)));
const component: { producers?: ProducerPackage; refinements?: RefinementPackage } = { producers: [
  { producer: producers.empty, handler: () => ({ kind: "output", value: value([]) }) },
  { producer: producers.append, handler: ({ inputs }) => {
    const message = valueOf<Omit<Message, "at">>(inputs.message), at = valueOf<TemporalInstant>(inputs.at);
    const messages = valueOf<Message[]>(inputs.messages);
    assertTemporalInstantFor(at, { timeline: valueOf<Timeline>(inputs.timeline) });
    if (messages.some(item => item.id === message.id) || (messages.at(-1)?.at.frame ?? -1) > at.frame) throw new Error("Chat messages need unique ids and chronological arrival times.");
    return { kind: "output", value: value([...messages, { ...message, at }]) };
  } },
  { producer: producers.render, handler: ({ inputs }) => ({ kind: "output", value: value(renderChat(valueOf<Timeline>(inputs.timeline),
    valueOf<SpatialFrame>(inputs.within), valueOf<TemporalWindow>(inputs.window), valueOf<FontStackRef>(inputs.font),
    valueOf<Message[]>(inputs.messages), valueOf<ChatOptions>(inputs.options))) }) },
] };

export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "within", "font", "title", "entrance-frames", ...temporalWindowAttributeNames]);
  const id = textAttribute(element, "id"), context = resolveTemporalContext({ element, resolveReference });
  const window = resolveTemporalWindowReference({ element, resolveReference });
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const found = resolveReference(raw.path);
    if (found === undefined || !sameType(found.type, type)) throw new Error(`${name} has the wrong Type.`);
    return found;
  };
  const options: ChatOptions = { id, title: textAttribute(element, "title"), entranceFrames: Number(element.attributes["entrance-frames"] ?? "10") };
  const records = [{ id: `${id}.options`, type: types.Options, value: value(options), range: element.range }];
  const inputs = [{ name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
    { name: "font", type: mediaTypes.fontStack }, { name: "window", type: temporalTypes.window }, { name: "options", type: types.Options }];
  const bindings: Record<string, SurfaceResolvedReference["ref"]> = { timeline: context.timeline.ref, within: reference("within", spatialTypes.frame).ref,
    font: reference("font", mediaTypes.fontStack).ref, window: window.ref, options: { kind: "record", id: `${id}.options` } };
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });
  const operations: FragmentOperation[] = [{ id: "empty", producer: producers.empty, inputs: {}, result: { kind: "output" as const, name: "messages" } }];
  let previous = "empty", index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error("Chat Scene accepts Message children."); continue; }
    if (child.name.split(":").at(-1) !== "Message") throw new Error("Chat Scene accepts Message children.");
    assertAttributes(child, ["id", "sender", "text", "side", ...temporalInstantAttributeNames]); assertEmptyElement(child);
    const messageId = textAttribute(child, "id"), side = textAttribute(child, "side");
    if (side !== "left" && side !== "right") throw new Error("Message side must be left or right.");
    const at = resolveTemporalInstantReference({ element: child, resolveReference });
    const key = `message-${++index}`;
    records.push({ id: `${id}.${key}`, type: types.Message, value: value({ id: messageId, sender: textAttribute(child, "sender"), text: textAttribute(child, "text"), side }), range: child.range });
    inputs.push({ name: key, type: types.Message }, { name: `${key}-at`, type: temporalTypes.instant });
    bindings[key] = { kind: "record", id: `${id}.${key}` }; bindings[`${key}-at`] = at.ref;
    operations.push({ id: key, producer: producers.append, inputs: { messages: operation(previous), message: input(key), at: input(`${key}-at`), timeline: input("timeline") }, result: { kind: "output" as const, name: "messages" } });
    previous = key;
  }
  if (!index) throw new Error("Chat Scene requires a Message.");
  operations.push({ id: "render", producer: producers.render, inputs: { messages: operation(previous), options: input("options"),
    timeline: input("timeline"), within: input("within"), font: input("font"), window: input("window") }, result: { kind: "output" as const, name: "visual" } });
  const fragment = sealGraphFragment({ inputs, operations, exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("render") }] });
  return { records, components:
    [{ id, fragment, inputs: bindings, outputs: { visual: `${id}.visual` }, range: element.range }], exports: [`${id}.visual`] };
};
const declaration = { name: "scene", tag: "Scene", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack, ...Object.values(types)],
  vocabulary: { summary: "A conversation whose message arrivals and scrolling form one visual scene.", attributes: [
    ...temporalContextAttributeVocabulary, ...temporalWindowAttributeVocabulary,
    ...["id", "title", "within", "font"].map(name => ({ name, kind: "expression" as const, required: true, summary: name })),
    { name: "entrance-frames", kind: "literal" as const, required: false, summary: "Arrival and scrolling duration; defaults to 10 frames." },
  ], children: [{ tag: "Message", cardinality: "many" as const, summary: "One authored message and the event that reveals it.", attributes: [
    ...["id", "sender", "text", "side"].map(name => ({ name, kind: "literal" as const, required: true, summary: name })), ...temporalInstantAttributeVocabulary,
  ] }], ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The complete conversation scene." }],
    example: '<chat:Scene id="chat" timeline={speech.timeline} within={within} font={font} during={speech.window} title="Conversation"><chat:Message id="answer" sender="Maya" side="left" text="Here it is." at={answer}/></chat:Scene>',
  },
};
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest }],
  facets: [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? []),
    createMarkupSurfaceFacet({ module, declaration, handler: decodeSurface })] };
export default hypitPackage;
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
