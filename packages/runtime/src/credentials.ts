export type CredentialRef = {
  readonly format: "narratage.credential-ref@1";
  /** CredentialStore implementation name, for example env, keychain or aws-default. */
  readonly store: string;
  /** Store-local opaque lookup key. It is configuration, never the secret value. */
  readonly key: string;
};

export type CredentialValue = {
  /** Opaque secret revealed only to the selected Endpoint invocation. */
  readonly secret: string;
  readonly expiresAt?: number;
};

export type CredentialStore = {
  resolve(ref: CredentialRef): Promise<CredentialValue | undefined>;
};

export type WritableCredentialStore = CredentialStore & {
  owns(ref: CredentialRef): boolean;
  put(ref: CredentialRef, value: CredentialValue): Promise<void>;
  delete(ref: CredentialRef): Promise<boolean>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function credentialRef(store: string, key: string): CredentialRef {
  const value = { format: "narratage.credential-ref@1", store, key } as const;
  verifyCredentialRef(value);
  return value;
}

export function verifyCredentialRef(ref: CredentialRef): void {
  assert(ref.format === "narratage.credential-ref@1", "unsupported CredentialRef format");
  assert(ref.store.trim().length > 0, "CredentialRef store is empty");
  assert(ref.key.trim().length > 0, "CredentialRef key is empty");
}

export function isWritableCredentialStore(value: CredentialStore): value is WritableCredentialStore {
  return "owns" in value && typeof value.owns === "function"
    && "put" in value && typeof value.put === "function"
    && "delete" in value && typeof value.delete === "function";
}

export async function writableCredentialStore(
  store: CredentialStore,
  ref: CredentialRef,
): Promise<WritableCredentialStore | undefined> {
  verifyCredentialRef(ref);
  if (store instanceof CompositeCredentialStore) return await store.writable(ref);
  return isWritableCredentialStore(store) && store.owns(ref) ? store : undefined;
}

/**
 * Compose independently selected stores without a central store-name registry. Every implementation
 * sees the exact CredentialRef and must decline names it does not own. Ambiguous ownership fails.
 */
export class CompositeCredentialStore implements CredentialStore {
  readonly #stores: readonly CredentialStore[];

  constructor(stores: readonly CredentialStore[]) {
    this.#stores = [...stores];
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    const resolved = (await Promise.all(this.#stores.map(async (store) => await store.resolve(ref))))
      .filter((value): value is CredentialValue => value !== undefined);
    assert(resolved.length <= 1, `CredentialRef store ${ref.store} is implemented more than once`);
    return resolved[0];
  }

  async writable(ref: CredentialRef): Promise<WritableCredentialStore | undefined> {
    verifyCredentialRef(ref);
    const candidates: WritableCredentialStore[] = [];
    for (const store of this.#stores) {
      if (!isWritableCredentialStore(store)) continue;
      // A read cannot prove ownership for a missing key. Writable implementations therefore expose
      // an optional structural ownership predicate rather than a framework registry.
      if (store.owns(ref)) candidates.push(store);
    }
    assert(candidates.length <= 1, `CredentialRef store ${ref.store} has several writable owners`);
    return candidates[0];
  }
}
