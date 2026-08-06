export type CredentialRef = {
  readonly format: "svml.credential-ref@1";
  /** CredentialStore implementation name, for example env, keychain or aws-default. */
  readonly store: string;
  /** Store-local opaque lookup key. It is configuration, never the secret value. */
  readonly key: string;
};

export type CredentialValue = {
  /** Opaque secret revealed only to the selected Provider invocation. */
  readonly secret: string;
  readonly expiresAt?: number;
};

export type CredentialStore = {
  resolve(ref: CredentialRef): Promise<CredentialValue | undefined>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function credentialRef(store: string, key: string): CredentialRef {
  const value = { format: "svml.credential-ref@1", store, key } as const;
  verifyCredentialRef(value);
  return value;
}

export function verifyCredentialRef(ref: CredentialRef): void {
  assert(ref.format === "svml.credential-ref@1", "unsupported CredentialRef format");
  assert(ref.store.trim().length > 0, "CredentialRef store is empty");
  assert(ref.key.trim().length > 0, "CredentialRef key is empty");
}
