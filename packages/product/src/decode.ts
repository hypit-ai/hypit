import { createModuleRef, createTypeRef } from "@hypit/protocol";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import type { ProductFileRef, ProductValueDocument, ProductValuePath, StoredProduct } from "./materialize.js";
import type { StoredProductPublication } from "./publication.js";
import type { Product } from "./history.js";
import { productAddress } from "./address.js";
import { assertProductFileRef, assertProductPath } from "./materialize.js";

function object(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function canonicalValue(value: unknown, subject: string): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((child, index) => canonicalValue(child, `${subject}[${index}]`));
  return Object.fromEntries(Object.entries(object(value, subject))
    .map(([name, child]) => [name, canonicalValue(child, `${subject}.${name}`)]));
}

function typeRef(value: unknown, subject: string): TypeRef {
  const item = object(value, subject);
  const module = object(item.module, `${subject}.module`);
  return createTypeRef(createModuleRef(
    text(module.name, `${subject}.module.name`),
    text(module.version, `${subject}.module.version`),
  ), text(item.name, `${subject}.name`));
}

function fileRef(value: unknown, subject: string): ProductFileRef {
  assertProductFileRef(value, subject);
  return { kind: "product-file", path: value.path, size: value.size, mediaType: value.mediaType };
}

function valueAtPath(value: CanonicalValue, path: ProductValuePath, subject: string): CanonicalValue {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0 || !Array.isArray(current) || segment >= current.length) {
        throw new Error(`${subject} does not address a value slot`);
      }
      current = current[segment]!;
      continue;
    }
    if (current === null || Array.isArray(current) || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`${subject} does not address a value slot`);
    }
    current = (current as Readonly<Record<string, CanonicalValue>>)[segment]!;
  }
  return current;
}

export function decodeProductValueDocument(
  value: unknown,
  subject = "Product value",
): ProductValueDocument {
  const item = object(value, subject);
  if (item.format !== "hypit.product-value@1") throw new Error(`${subject} is not a Product value document`);
  if (!Array.isArray(item.resources)) throw new Error(`${subject}.resources must be an array`);
  const decodedValue = canonicalValue(item.value, `${subject}.value`);
  const occupied = new Set<string>();
  const resources = item.resources.map((raw, index) => {
    const binding = object(raw, `${subject}.resources[${index}]`);
    if (!Array.isArray(binding.at) || binding.at.length === 0) {
      throw new Error(`${subject}.resources[${index}].at must be a non-empty array`);
    }
    const at = binding.at.map((segment, segmentIndex) => {
      if (typeof segment === "string") return segment;
      if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) return segment;
      throw new Error(`${subject}.resources[${index}].at[${segmentIndex}] is invalid`);
    });
    const address = JSON.stringify(at);
    if (occupied.has(address)) throw new Error(`${subject} binds ${address} more than once`);
    occupied.add(address);
    if (valueAtPath(decodedValue, at, `${subject}.resources[${index}].at`) !== null) {
      throw new Error(`${subject}.resources[${index}].at must address a null Resource slot`);
    }
    return { at, file: fileRef(binding.file, `${subject}.resources[${index}].file`) };
  });
  return { format: "hypit.product-value@1", value: decodedValue, resources };
}

export function decodeStoredProduct(value: unknown, subject: string): StoredProduct {
  const item = object(value, subject);
  const stored = object(item.value, `${subject}.value`);
  let decoded: StoredProduct["value"];
  if (stored.kind === "product-file") decoded = fileRef(stored, `${subject}.value`);
  else if (stored.kind === "value") {
    assertProductPath(stored.path, `${subject}.value.path`);
    decoded = { kind: "value", path: stored.path };
  } else if (stored.kind === "inline") {
    const scalar = stored.value;
    if (scalar !== null && typeof scalar !== "boolean" && typeof scalar !== "string"
      && !(typeof scalar === "number" && Number.isFinite(scalar))) {
      throw new Error(`${subject}.value must be a scalar`);
    }
    decoded = { kind: "inline", value: scalar };
  } else throw new Error(`${subject}.value.kind is invalid`);
  return {
    type: typeRef(item.type, `${subject}.type`),
    publisher: text(item.publisher, `${subject}.publisher`),
    ...(item.publicationParameters === undefined
      ? {}
      : { publicationParameters: canonicalValue(item.publicationParameters, `${subject}.publicationParameters`) }),
    value: decoded,
  };
}

export function decodeProduct(value: unknown, subject = "Product"): Product {
  const item = object(value, subject);
  const rawAddress = object(item.address, `${subject}.address`);
  const address = productAddress(
    text(rawAddress.publication, `${subject}.address.publication`),
    text(rawAddress.name, `${subject}.address.name`),
  );
  const common = {
    address,
    type: typeRef(item.type, `${subject}.type`),
    publisher: text(item.publisher, `${subject}.publisher`),
    ...(item.publicationParameters === undefined
      ? {}
      : { publicationParameters: canonicalValue(item.publicationParameters, `${subject}.publicationParameters`) }),
  };
  if (item.representation === "inline") {
    const scalar = item.value;
    if (scalar !== null && typeof scalar !== "boolean" && typeof scalar !== "string"
      && !(typeof scalar === "number" && Number.isFinite(scalar))) {
      throw new Error(`${subject}.value must be a scalar`);
    }
    return { ...common, representation: "inline", value: scalar };
  }
  if (item.representation === "structured") return { ...common, representation: "structured" };
  if (item.representation === "file") {
    if (typeof item.mediaType !== "string" || item.mediaType.length === 0
      || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0) {
      throw new Error(`${subject} has invalid file metadata`);
    }
    return { ...common, representation: "file", mediaType: item.mediaType, size: item.size };
  }
  throw new Error(`${subject}.representation is invalid`);
}

export function decodeStoredProductPublication(
  value: unknown,
  publication: string,
  subject = `Product publication ${publication}`,
): StoredProductPublication {
  if (publication.trim().length === 0) throw new Error("Product publication address must not be empty");
  const item = object(value, subject);
  if (item.format !== "hypit.product-publication@1") {
    throw new Error(`${subject} is not a Product publication`);
  }
  const rawProducts = object(item.products, `${subject}.products`);
  const products = Object.fromEntries(Object.entries(rawProducts).map(([name, product]) => {
    text(name, `${subject} Product name`);
    return [name, decodeStoredProduct(product, `${subject}.products[${JSON.stringify(name)}]`)] as const;
  }));
  let closedAt: number | undefined;
  if (item.closedAt !== undefined) {
    if (typeof item.closedAt !== "number" || !Number.isSafeInteger(item.closedAt) || item.closedAt < 0) {
      throw new Error(`${subject}.closedAt must be a non-negative integer timestamp`);
    }
    closedAt = item.closedAt;
  }
  return {
    format: "hypit.product-publication@1",
    publication,
    products,
    ...(closedAt === undefined ? {} : { closedAt }),
  };
}
