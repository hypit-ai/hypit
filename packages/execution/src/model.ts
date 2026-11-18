import type { JsonValue, PublicationResource } from "./index.js";

export type CapabilityOutput<Value extends JsonValue = JsonValue> = {
  readonly type: string;
  read(value: unknown, resources: Readonly<Record<string, PublicationResource>>): Value;
};

export type ResourceMetadata = { readonly mediaType: string; readonly size?: number };
export type InvocationInputs = Readonly<Record<string, ResourceMetadata>>;

/** A model owns portable request values and the meaning of each named input and output. */
export type Capability<Request extends JsonValue = JsonValue> = {
  readonly id: string;
  readonly title: string;
  readRequest(value: unknown): Request;
  checkInputs?(request: Request, inputs: InvocationInputs): void;
  readonly outputs: Readonly<Record<string, CapabilityOutput>>;
};

export * from "./model-media.js";
