import type { CredentialRef, CredentialStore, CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { writableCredentialStore } from "@hypit/runtime";
import {
  ORCAROUTER_DEFAULT_ENDPOINT, ORCAROUTER_KEY_DASHBOARD, ORCAROUTER_SEED_MODELS,
  apiKeyCredentialAdapter, createOrcaRouterCredential, decodeOrcaRouterCredential, encodeOrcaRouterCredential,
  filterCatalog, orcaRouterOrigins, pkceCredentialAdapter, storeOrcaRouterCredential,
} from "@hypit/provider-orcarouter";
import type { CatalogModel, OrcaRouterCapability } from "@hypit/provider-orcarouter";

import { acquireConnectCode } from "./connect.js";

/** How long a started authorization stays open before Studio releases it and asks again. */
const CONNECT_TIMEOUT_MS = 5 * 60_000;

/** The slot the shipped Distribution configures, used when no Runtime Profile is selected. */
const DEFAULT_CREDENTIAL_REF: CredentialRef = { store: "os", key: "orcarouter.apiKey" };

export type StudioAuthMethod = {
  readonly id: "orcarouter" | "orcarouter-oauth";
  readonly label: string;
  /** True when this exact entry point is the one that stored the current key. */
  readonly selected: boolean;
  /** True when this entry point can run at all with the selected Runtime Profile. */
  readonly available: boolean;
};

export type StudioAccountView = {
  readonly endpoint: string;
  readonly configured: boolean;
  /** The key with everything but its last four characters removed; never the key itself. */
  readonly secretMasked?: string;
  readonly state: "ready" | "needsReauth";
  readonly origins: { readonly auth: string; readonly api: string };
  readonly authMethods: readonly StudioAuthMethod[];
  readonly keyDashboard: string;
  /** Present while an authorization is open, so the page can show the URL it must visit. */
  readonly connecting?: { readonly generation: number; readonly authorizeUrl: string };
  readonly detail?: string;
};

export type StudioModelView = {
  readonly capability: OrcaRouterCapability;
  /** `live` when the catalogue answered; `seed` when only the verified fallback is available. */
  readonly source: "live" | "seed";
  readonly models: readonly CatalogModel[];
  readonly detail?: string;
  /** True when the live catalogue is preferred but had to be replaced by the verified seed. */
  readonly degraded: boolean;
};

export type StudioAccountsOptions = {
  readonly endpoint?: string;
  /**
   * The selected Runtime Profile's own CredentialStores and the credential slots the Endpoint
   * declares. The panel reads and writes through them, so no second store is introduced and a
   * Profile that selects a read-only store simply reports that.
   */
  readonly profile?: () => Promise<{
    readonly store: CredentialStore;
    readonly credentials: readonly { readonly slot: string; readonly ref: CredentialRef }[];
    close(): Promise<void>;
  }>;
  /** Direct store access, used when Studio already holds the profile's composite store. */
  readonly store?: CredentialStore;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
  readonly now?: () => number;
};

type PendingConnect = {
  readonly generation: number;
  readonly resolve: (code: string | undefined) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

/**
 * Studio's OrcaRouter account panel. It owns the two entry points over one credential slot and the
 * one model catalogue, and never receives or returns the key itself once stored.
 */
export class StudioAccounts {
  readonly #endpoint: string;
  readonly #options: StudioAccountsOptions;
  #generation = 0;
  #pending: PendingConnect | undefined;
  #authorizeUrl: string | undefined;
  #connectFailure: string | undefined;
  #inFlight: Promise<string> | undefined;
  #opened: Awaited<ReturnType<NonNullable<StudioAccountsOptions["profile"]>>> | undefined;

  constructor(options: StudioAccountsOptions = {}) {
    this.#endpoint = options.endpoint ?? ORCAROUTER_DEFAULT_ENDPOINT;
    this.#options = options;
  }

  get endpoint(): string {
    return this.#endpoint;
  }

  #origins() {
    return orcaRouterOrigins(process.env);
  }

  /** The credential currently stored in the endpoint's slot, if any. */
  async #secret(): Promise<{ readonly secret: string; readonly writable: boolean } | undefined> {
    const store = await this.#store();
    if (store === undefined) return undefined;
    const ref = await this.#ref();
    const value = await store.resolve(ref);
    if (value === undefined) return undefined;
    return { secret: value.secret, writable: (await writableCredentialStore(store, ref)) !== undefined };
  }

  async #writable(): Promise<WritableCredentialStore | undefined> {
    const store = await this.#store();
    if (store === undefined) return undefined;
    return await writableCredentialStore(store, await this.#ref());
  }

  async #store(): Promise<CredentialStore | undefined> {
    this.#opened ??= await this.#options.profile?.();
    return this.#options.store ?? this.#opened?.store;
  }

  /**
   * The slot the selected Endpoint declares, so a key lands wherever that Profile's own store puts
   * it. Without a Profile the public default slot is used, which is what the Distribution configures.
   */
  async #ref(): Promise<CredentialRef> {
    const opened = this.#opened ?? await this.#options.profile?.();
    this.#opened = opened;
    return opened?.credentials.find((item) => item.slot === "apiKey")?.ref ?? DEFAULT_CREDENTIAL_REF;
  }

  /** The account view the panel renders. It never includes the key. */
  async view(): Promise<StudioAccountView> {
    const origins = this.#origins();
    const stored = await this.#secret();
    const decoded = stored === undefined ? undefined : decodeOrcaRouterCredential(stored.secret);
    const generation = this.#generation;
    return {
      endpoint: this.#endpoint,
      configured: decoded !== undefined,
      ...(decoded === undefined ? {} : { secretMasked: maskKey(decoded.key) }),
      state: decoded?.state ?? "ready",
      origins: { auth: origins.authBaseUrl, api: origins.apiBaseUrl },
      authMethods: [
        {
          id: "orcarouter",
          label: "OrcaRouter - API",
          selected: decoded?.issuedVia === "api-key",
          available: stored?.writable ?? false,
        },
        {
          id: "orcarouter-oauth",
          label: "OrcaRouter - Auth",
          selected: decoded?.issuedVia === "oauth",
          available: stored?.writable ?? false,
        },
      ],
      keyDashboard: ORCAROUTER_KEY_DASHBOARD,
      ...(this.#pending === undefined || this.#authorizeUrl === undefined ? {} : {
        connecting: { generation, authorizeUrl: this.#authorizeUrl },
      }),
      ...(this.#connectFailure === undefined ? {} : { detail: this.#connectFailure }),
      ...(decoded?.state === "needsReauth"
        ? { detail: `OrcaRouter refused this key. Authorize again, or manage keys at ${ORCAROUTER_KEY_DASHBOARD}` }
        : {}),
    };
  }

  /**
   * Store a key the user pasted. It is an ordinary OrcaRouter credential: the same slot and the same
   * reading path the account-login entry point uses.
   */
  async saveApiKey(secret: string): Promise<StudioAccountView> {
    const trimmed = secret.trim();
    if (trimmed.length === 0) throw new Error("Enter an OrcaRouter API key");
    if (/\s/u.test(trimmed)) throw new Error("An OrcaRouter API key contains no whitespace");
    const decoded = decodeOrcaRouterCredential(trimmed);
    if (decoded === undefined) throw new Error("That value is not an OrcaRouter API key");
    await this.#write(encodeOrcaRouterCredential({
      key: decoded.key,
      generation: 0,
      state: "ready",
      issuedVia: "api-key",
    }));
    return await this.view();
  }

  /** Remove the stored key. Studio never keeps a copy anywhere else. */
  async clear(): Promise<StudioAccountView> {
    this.#cancelPending();
    const writable = await this.#writable();
    await writable?.delete(await this.#ref());
    return await this.view();
  }

  /**
   * Start an authorization. The consent endpoint displays a code, so this returns the URL to open and
   * leaves the exchange waiting for `submitCode`; nothing blocks a request handler.
   */
  async beginConnect(): Promise<StudioAccountView> {
    this.#cancelPending();
    const generation = this.#generation + 1;
    this.#generation = generation;
    this.#connectFailure = undefined;
    let release!: (code: string | undefined) => void;
    const code = new Promise<string | undefined>((resolve) => { release = resolve; });
    const timer = setTimeout(() => { release(undefined); }, CONNECT_TIMEOUT_MS);
    // Node keeps a pending timer alive; the authorization is user-facing work, not a reason to hang.
    timer.unref?.();
    this.#pending = { generation, resolve: release, timer };
    this.#inFlight = acquireConnectCode({
      authBaseUrl: this.#origins().authBaseUrl,
      ...(this.#options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: this.#options.requestTimeoutMs }),
      ...(this.#options.fetch === undefined ? {} : { fetch: this.#options.fetch }),
      code,
      onAuthorizeUrl: (url) => { if (this.#generation === generation) this.#authorizeUrl = url; },
    });
    // The URL is produced synchronously by the connect adapter, before it waits for the code.
    await Promise.resolve();
    return await this.view();
  }

  /** Exchange the displayed code and store the resulting key as a new generation. */
  async submitCode(generation: number, code: string): Promise<StudioAccountView> {
    const pending = this.#pending;
    if (pending === undefined || pending.generation !== generation || generation !== this.#generation) {
      throw new Error("That authorization is no longer the current one; start again");
    }
    const trimmed = code.trim();
    if (trimmed.length === 0) throw new Error("Paste the code the OrcaRouter page showed you");
    clearTimeout(pending.timer);
    const inFlight = this.#inFlight;
    pending.resolve(trimmed);
    this.#pending = undefined;
    try {
      const secret = await inFlight;
      if (secret === undefined) throw new Error("The OrcaRouter authorization ended before a key arrived");
      await this.#write(encodeOrcaRouterCredential({ key: secret, generation: 0, state: "ready", issuedVia: "oauth" }));
    } catch (error) {
      this.#authorizeUrl = undefined;
      this.#connectFailure = error instanceof Error ? error.message : String(error);
      throw error;
    }
    this.#authorizeUrl = undefined;
    this.#inFlight = undefined;
    return await this.view();
  }

  /**
   * Release an open authorization. Every terminal path calls this: an explicit cancel, switching
   * authentication method, a closed panel, and the page being hidden or unloaded.
   */
  cancel(generation?: number): StudioAccountView | Promise<StudioAccountView> {
    if (generation !== undefined && generation !== this.#generation) {
      return this.view();
    }
    this.#cancelPending();
    return this.view();
  }

  #cancelPending(): void {
    const pending = this.#pending;
    this.#pending = undefined;
    this.#authorizeUrl = undefined;
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    // Resolving without a code makes the connect adapter fail closed; its rejection is expected and
    // already recorded, so it must not surface as an unhandled rejection.
    this.#inFlight?.catch(() => undefined);
    pending.resolve(undefined);
    this.#inFlight = undefined;
  }

  async #write(secret: string): Promise<void> {
    const writable = await this.#writable();
    if (writable === undefined) {
      throw new Error("This Runtime Profile has no writable Credential Store; "
        + "select one, or set the key in the environment instead");
    }
    await writable.put(await this.#ref(), { secret } satisfies CredentialValue);
  }

  /**
   * The models one control may offer. A successful live read is authoritative; a failed one is
   * reported as degraded and paired with the verified seed rather than silently showing nothing.
   */
  async models(capability: OrcaRouterCapability, modality?: "image" | "audio" | "video"): Promise<StudioModelView> {
    const stored = await this.#secret();
    const decoded = stored === undefined ? undefined : decodeOrcaRouterCredential(stored.secret);
    if (decoded === undefined || decoded.state !== "ready") {
      return {
        capability,
        source: "seed",
        models: filterCatalog(ORCAROUTER_SEED_MODELS, capability, modality),
        degraded: true,
        detail: decoded === undefined
          ? "No OrcaRouter credential is configured; showing the verified fallback models"
          : "The stored OrcaRouter key needs authorization; showing the verified fallback models",
      };
    }
    const credential = createOrcaRouterCredential({ secret: stored!.secret, ref: await this.#ref() });
    if (credential === undefined) {
      return { capability, source: "seed", models: filterCatalog(ORCAROUTER_SEED_MODELS, capability, modality), degraded: true };
    }
    const { OrcaRouterClient } = await import("@hypit/provider-orcarouter");
    const client = new OrcaRouterClient({
      baseUrl: this.#origins().apiBaseUrl,
      timeout: this.#options.requestTimeoutMs ?? 10_000,
      ...(this.#options.fetch === undefined ? {} : { fetcher: this.#options.fetch }),
    });
    const result = await client.models(credential, capability, modality);
    if (result.source === "seed") {
      return {
        capability,
        source: "seed",
        models: filterCatalog(ORCAROUTER_SEED_MODELS, capability, modality),
        degraded: true,
        ...(result.detail === undefined ? {} : { detail: result.detail }),
      };
    }
    return { capability, source: "live", models: result.models, degraded: false };
  }
}

/**
 * Mask a stored key for display. Only the scheme prefix survives — `sk-orca-` names the service and
 * is not secret, while the tail of a live credential is material a screenshot must never carry.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  const scheme = "sk-orca-";
  const shown = trimmed.startsWith(scheme) ? scheme.length : Math.min(4, trimmed.length);
  return `${trimmed.slice(0, shown)}${"•".repeat(Math.max(0, trimmed.length - shown))}`;
}

export { apiKeyCredentialAdapter, pkceCredentialAdapter, storeOrcaRouterCredential };
