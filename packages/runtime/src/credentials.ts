export type CredentialRef = {
  /** CredentialStore implementation name, for example env, os or aws-default. */
  readonly store: string;
  /** Store-local opaque lookup key. It is configuration, never the secret value. */
  readonly key: string;
};

export type CredentialValue = {
  /** Opaque secret revealed only to the selected Endpoint invocation. */
  readonly secret: string;
  readonly expiresAt?: number;
};

export type OAuth2Credential = {
  readonly format: "hypit.oauth2-credential@1";
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
};

export function encodeOAuth2Credential(value: Omit<OAuth2Credential, "format">): string {
  assert(value.accessToken.length > 0, "OAuth access token is empty");
  if (value.refreshToken !== undefined) assert(value.refreshToken.length > 0, "OAuth refresh token is empty");
  if (value.expiresAt !== undefined) assert(Number.isFinite(value.expiresAt), "OAuth expiry is invalid");
  return JSON.stringify({ format: "hypit.oauth2-credential@1", ...value } satisfies OAuth2Credential);
}

export function decodeOAuth2Credential(secret: string): OAuth2Credential | undefined {
  let value: unknown;
  try { value = JSON.parse(secret); } catch { return undefined; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<OAuth2Credential>;
  if (candidate.format !== "hypit.oauth2-credential@1"
    || typeof candidate.accessToken !== "string" || candidate.accessToken.length === 0
    || (candidate.refreshToken !== undefined
      && (typeof candidate.refreshToken !== "string" || candidate.refreshToken.length === 0))
    || (candidate.expiresAt !== undefined
      && (typeof candidate.expiresAt !== "number" || !Number.isFinite(candidate.expiresAt)))) return undefined;
  return candidate as OAuth2Credential;
}

/** How the consent screen hands its authorization code back to this program. */
export type CredentialAcquisitionDelivery = "loopback" | "out-of-band";

/**
 * The exchange request and credential shape, for a service that does not implement the RFC 6749
 * authorization-code grant the host otherwise sends. Declaring it keeps that service's wire spelling
 * in its Endpoint package rather than in the host's OAuth code.
 */
export type CredentialExchange = {
  readonly encoding: "form" | "json";
  /** Literal fields sent beside `code` and `code_verifier` on every exchange request. */
  readonly fields?: Readonly<Record<string, string>>;
  /** Response field carrying the credential; defaults to `access_token`. */
  readonly credentialField?: string;
  /**
   * `oauth2` stores the host's refreshable credential envelope; `opaque` stores the returned value
   * as an ordinary secret, for a durable key grant with no refresh lifecycle.
   */
  readonly credentialFormat?: "oauth2" | "opaque";
  /** The scope the credential must actually carry; a narrower grant is refused, never assumed. */
  readonly requiredScope?: string;
};

/** Host-facing way to acquire one credential; Provider-specific values stay in its Endpoint package. */
export type CredentialAcquisition = {
  readonly kind: "oauth2-pkce";
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** Maximum duration of the service-owned token exchange after browser authorization returns. */
  readonly requestTimeoutMs: number;
  /**
   * Where the code is delivered. `loopback` (the default) runs the local callback server the
   * RFC 6749 parameters describe. `out-of-band` serves a consent endpoint that accepts no redirect:
   * the code is displayed to the user and pasted into the terminal, which is why that flow must send
   * S256 — a code in human hands is redeemable only with the verifier.
   */
  readonly delivery?: CredentialAcquisitionDelivery;
  /** Authorize query parameters in the service's own spelling, replacing the RFC 6749 set. */
  readonly authorizeParams?: Readonly<Record<string, string>>;
  /** Exchange request and credential shape, when the service does not use the RFC 6749 grant. */
  readonly exchange?: CredentialExchange;
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
  const value = { store, key };
  verifyCredentialRef(value);
  return value;
}

export function verifyCredentialRef(ref: CredentialRef): void {
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
