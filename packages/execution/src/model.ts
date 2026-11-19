import type { JsonValue, PublicationResource } from "./index.js";

export type CapabilityOutput<Value extends JsonValue = JsonValue> = {
  readonly type: string;
  readonly media?: "image" | "video" | "audio";
  read(value: unknown, resources: Readonly<Record<string, PublicationResource>>): Value;
};

export type ResourceMetadata = { readonly mediaType: string; readonly size?: number };
export type InvocationInputs = Readonly<Record<string, ResourceMetadata>>;

export type ModelField = {
  readonly name: string;
  readonly kind: "text" | "number" | "boolean" | "choice" | "resource" | "resources";
  readonly choices?: readonly string[];
  readonly default?: JsonValue;
  readonly modes?: readonly string[];
  readonly required?: boolean;
  readonly media?: "image" | "video" | "audio";
  readonly maxItems?: number;
  readonly personReference?: boolean;
};

/** A model owns portable request values and the meaning of each named input and output. */
export type Capability<Request extends JsonValue = JsonValue> = {
  readonly id: string;
  readonly title: string;
  readonly authoring?: readonly ModelField[];
  readRequest(value: unknown): Request;
  checkInputs?(request: Request, inputs: InvocationInputs): void;
  readonly outputs: Readonly<Record<string, CapabilityOutput>>;
};

export * from "./model-media.js";
