import {
  writableCredentialStore,
} from "@hypit/runtime";

import type {
  CreateLocalCredentialControlOptions,
  LocalCredentialControl,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Credential management is deployment control, not execution. It needs only
 * the selected CredentialStores and the declaration of the selected Endpoint;
 * opening Build state, a Worker, unrelated Endpoints or author components here
 * would make logging into one Provider depend on the entire deployment.
 */
export function createLocalCredentialControl(
  options: CreateLocalCredentialControlOptions,
): LocalCredentialControl {
  const descriptions = options.endpoints.flatMap((item) => item.credentials);
  const credential = (endpoint: string, slot: string) => {
    const matches = descriptions.filter((item) => item.endpoint === endpoint && item.slot === slot);
    assert(matches.length === 1, matches.length === 0
      ? `Endpoint ${endpoint} has no credential slot ${slot}`
      : `Endpoint ${endpoint} repeats credential slot ${slot}`);
    return matches[0]!;
  };
  const describe = async (item: typeof descriptions[number]) => ({
    ...structuredClone(item),
    writable: await writableCredentialStore(options.credentialStore, item.ref) !== undefined,
  });

  return {
    async describeCredentials(endpoint) {
      return await Promise.all(descriptions.filter((item) => endpoint === undefined || item.endpoint === endpoint).map(describe));
    },
    async credentials(endpoint) {
      const selected = descriptions.filter((item) => endpoint === undefined || item.endpoint === endpoint);
      return await Promise.all(selected.map(async (item) => ({
        ...await describe(item),
        configured: await options.credentialStore.resolve(item.ref) !== undefined,
      })));
    },
    async putCredential(endpoint, slot, secret) {
      assert(secret.length > 0, "credential secret is empty");
      const item = credential(endpoint, slot);
      const store = await writableCredentialStore(options.credentialStore, item.ref);
      assert(store !== undefined, `CredentialStore ${item.ref.store} is not writable`);
      await store.put(item.ref, { secret });
      return { ...structuredClone(item), writable: true, configured: true };
    },
    async deleteCredential(endpoint, slot) {
      const item = credential(endpoint, slot);
      const store = await writableCredentialStore(options.credentialStore, item.ref);
      assert(store !== undefined, `CredentialStore ${item.ref.store} is not writable`);
      const deleted = await store.delete(item.ref);
      return { deleted, credential: { ...structuredClone(item), writable: true, configured: false } };
    },
    close() {
      return options.close?.();
    },
  };
}
