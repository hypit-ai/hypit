import { assertAttributes, assertEmptyElement, canonicalize, createMarkupSurfaceHostFacet, sameType, sealGraphFragment, textAttribute } from "hypit/author-kit";
import type { ComponentPackage, FragmentOperation, ModuleManifest, StructuredSurfaceHandler, SurfaceResolvedReference, TypeRef } from "hypit/author-kit";
import { compositionTypes } from "hypit/composition";
import { mediaTypes } from "hypit/media";
import type { FontStackRef } from "hypit/media";
import { programSpaceTypes } from "hypit/program-space";
import type { ProgramSpace } from "hypit/program-space";
import { semanticTrackTypes } from "hypit/semantic-track";
import { spatialTypes } from "hypit/spatial";
import type { CanvasSpace } from "hypit/spatial";
import { assertTemporalInstantFor, temporalTypes } from "hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "hypit/temporal";
import { createTemporalInstantProjection, createTemporalSpace, createTemporalWindowProjection, resolveTemporalContext,
  temporalContextAttributeVocabulary, temporalInstantAttributeNames, temporalInstantAttributeVocabulary,
  temporalWindowAttributeNames, temporalWindowAttributeVocabulary } from "hypit/temporal-markup";
import { renderChat } from "./render.js";
import type { ChatOptions, Message } from "./render.js";

const module = { name: "@example/chat-scene", version: "1" } as const;
const types = Object.fromEntries(["Options", "Message", "Messages"].map(name => [name, { module, name }])) as Record<"Options" | "Message" | "Messages", TypeRef>;
const producers = Object.fromEntries(["empty", "append", "render"].map(name => [name, { module, name }])) as Record<"empty" | "append" | "render", { module: typeof module; name: string }>;
export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [compositionTypes.visualTrack, mediaTypes.fontStack, programSpaceTypes.programSpace,
    semanticTrackTypes.track, spatialTypes.canvas, temporalTypes.instant].map(type => ({ module: type.module })),
  types: Object.values(types).map(type => ({ name: type.name })), capabilities: [], producers: [
    { name: "empty", inputs: [], outputs: [{ name: "messages", type: types.Messages }], needs: [] },
    { name: "append", inputs: [{ name: "messages", type: types.Messages }, { name: "message", type: types.Message },
      { name: "at", type: temporalTypes.instant }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "messages", type: types.Messages }], needs: [] },
    { name: "render", inputs: [{ name: "messages", type: types.Messages }, { name: "options", type: types.Options },
      { name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
      { name: "window", type: temporalTypes.window }, { name: "font", type: mediaTypes.fontStack }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};
const inline = <T>(record: { value: { kind: string; value?: unknown } } | undefined): T => {
  if (record?.value.kind !== "inline") throw new Error("Chat inputs must be inline values.");
  return record.value.value as T;
};
const value = (data: unknown) => ({ kind: "inline" as const, value: canonicalize(data) });
const component: ComponentPackage = { producers: [
  { producer: producers.empty, handler: () => ({ outputs: { messages: value([]) }, needs: {} }) },
  { producer: producers.append, handler: ({ inputs }) => {
    const message = inline<Omit<Message, "at">>(inputs.message), at = inline<TemporalInstant>(inputs.at);
    const messages = inline<Message[]>(inputs.messages);
    assertTemporalInstantFor(at, { subjectId: message.id, space: inline<ProgramSpace>(inputs.space) });
    if (messages.some(item => item.id === message.id) || (messages.at(-1)?.at.frame ?? -1) > at.frame) throw new Error("Chat messages need unique ids and chronological arrival times.");
    return { outputs: { messages: value([...messages, { ...message, at }]) }, needs: {} };
  } },
  { producer: producers.render, handler: ({ inputs }) => ({ outputs: { track: value(renderChat(inline<ProgramSpace>(inputs.space),
    inline<CanvasSpace>(inputs.canvas), inline<TemporalWindow>(inputs.window), inline<FontStackRef>(inputs.font),
    inline<Message[]>(inputs.messages), inline<ChatOptions>(inputs.options))) }, needs: {} }) },
] };

export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "semantic", "space", "canvas", "font", "title", "entrance-frames", ...temporalWindowAttributeNames]);
  const id = textAttribute(element, "id"), context = resolveTemporalContext({ element, resolveReference });
  const time = createTemporalSpace({ id, element, ...context });
  const window = createTemporalWindowProjection({ id: `${id}.window`, subjectId: id, element, ...context, space: time.space, resolveReference });
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const found = resolveReference(raw.path);
    if (found === undefined || !sameType(found.type, type)) throw new Error(`${name} has the wrong Type.`);
    return found;
  };
  const options: ChatOptions = { id, title: textAttribute(element, "title"), entranceFrames: Number(element.attributes["entrance-frames"] ?? "10") };
  const records = [...window.records, { id: `${id}.options`, type: types.Options, value: value(options), range: element.range }];
  const components = [...time.components, ...window.components], fragments = [...time.fragments, ...window.fragments];
  const inputs = [{ name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
    { name: "font", type: mediaTypes.fontStack }, { name: "window", type: temporalTypes.window }, { name: "options", type: types.Options }];
  const bindings: Record<string, SurfaceResolvedReference["ref"]> = { space: time.space.ref, canvas: reference("canvas", spatialTypes.canvas).ref,
    font: reference("font", mediaTypes.fontStack).ref, window: window.ref, options: { kind: "record", id: `${id}.options` } };
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });
  const operations: FragmentOperation[] = [{ id: "empty", producer: producers.empty, inputs: {}, result: { kind: "output", name: "messages" } }];
  let previous = "empty", index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error("Chat Scene accepts Message children."); continue; }
    if (child.name.split(":").at(-1) !== "Message") throw new Error("Chat Scene accepts Message children.");
    assertAttributes(child, ["id", "sender", "text", "side", ...temporalInstantAttributeNames]); assertEmptyElement(child);
    const messageId = textAttribute(child, "id"), side = textAttribute(child, "side");
    if (side !== "left" && side !== "right") throw new Error("Message side must be left or right.");
    const at = createTemporalInstantProjection({ id: `${id}.${messageId}`, subjectId: messageId, element: child, ...context, space: time.space, resolveReference });
    records.push(...at.records); components.push(...at.components); fragments.push(...at.fragments);
    const key = `message-${++index}`;
    records.push({ id: `${id}.${key}`, type: types.Message, value: value({ id: messageId, sender: textAttribute(child, "sender"), text: textAttribute(child, "text"), side }), range: child.range });
    inputs.push({ name: key, type: types.Message }, { name: `${key}-at`, type: temporalTypes.instant });
    bindings[key] = { kind: "record", id: `${id}.${key}` }; bindings[`${key}-at`] = at.ref;
    operations.push({ id: key, producer: producers.append, inputs: { messages: operation(previous), message: input(key), at: input(`${key}-at`), space: input("space") }, result: { kind: "output", name: "messages" } });
    previous = key;
  }
  if (!index) throw new Error("Chat Scene requires a Message.");
  operations.push({ id: "render", producer: producers.render, inputs: { messages: operation(previous), options: input("options"),
    space: input("space"), canvas: input("canvas"), font: input("font"), window: input("window") }, result: { kind: "output", name: "track" } });
  const fragment = sealGraphFragment({ inputs, operations, exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation("render") }] });
  return { records, fragments: [...fragments, fragment], components: [...components,
    { id, fragment: fragment.id, inputs: bindings, outputs: { track: `${id}.track` }, range: element.range }], exports: [`${id}.track`] };
};
const declaration = { name: "scene", tag: "Scene", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack, programSpaceTypes.programSpace, temporalTypes.window, temporalTypes.instant, temporalTypes.windowSpec, temporalTypes.instantSpec, ...Object.values(types)],
  vocabulary: { summary: "A conversation whose message arrivals and scrolling form one visual scene.", attributes: [
    ...temporalContextAttributeVocabulary, ...temporalWindowAttributeVocabulary,
    ...["id", "title", "canvas", "font"].map(name => ({ name, kind: "expression" as const, required: true, summary: name })),
    { name: "entrance-frames", kind: "literal" as const, required: false, summary: "Arrival and scrolling duration; defaults to 10 frames." },
  ], children: [{ tag: "Message", cardinality: "many" as const, summary: "One authored message and the event that reveals it.", attributes: [
    ...["id", "sender", "text", "side"].map(name => ({ name, kind: "literal" as const, required: true, summary: name })), ...temporalInstantAttributeVocabulary,
  ] }], ports: [{ name: "track", type: compositionTypes.visualTrack, summary: "The complete conversation scene." }],
    example: '<chat:Scene id="chat" semantic={speech.semantic} canvas={canvas} font={font} during="program" title="Conversation"><chat:Message id="answer" sender="Maya" side="left" text="Here it is." at={story.moment.answer}/></chat:Scene>',
  },
};
export const hypitPackage = { format: "hypit.node-package@1" as const, modules: [{ manifest }], components: [component],
  hostFacets: [createMarkupSurfaceHostFacet({ module, declaration, handler: decodeSurface })] };
export default hypitPackage;
