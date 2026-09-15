import { createConnectLifecycle } from "./connect-lifecycle.js";
import { bindDropdown } from "./dropdown.js";
import { icon } from "./icons.js";
import { t, uiAttr, uiText, userText, type Message } from "./i18n.js";
import type { StudioAccountView, StudioModelView } from "../accounts.js";

type AccountsPane = {
  readonly element: HTMLElement;
  /** Re-read the stored credential and the catalogue; called when the panel is shown. */
  refresh(): Promise<void>;
  /** Release any open authorization without writing to the page. */
  release(): void;
};

type Pending = { readonly generation: number; readonly authorizeUrl: string };
type CatalogOption = { readonly id: string; readonly label: string; readonly contextLength?: number };

async function accountRequest(body: Record<string, unknown>): Promise<StudioAccountView & { readonly error?: string }> {
  const response = await fetch("/__studio/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json() as StudioAccountView & { readonly error?: string };
  if (!response.ok) throw new Error(parsed.error ?? `Studio account request failed (${response.status})`);
  return parsed;
}

/**
 * The OrcaRouter account panel. It presents the two authentication choices side by side, and binds
 * its model selector to the catalogue the Provider returns — never to a hand-written list.
 */
export function createAccountsPane(): AccountsPane {
  const element = document.createElement("section");
  element.className = "account-panel";
  element.dataset.accountEndpoint = "orcarouter.default";
  element.innerHTML = `
    <div class="account-head">
      <span class="account-mark" aria-hidden="true">${icon("globe")}</span>
      <strong data-account-provider></strong>
      <span class="account-state" data-account-state></span>
    </div>
    <p class="account-hint" data-account-hint hidden></p>
    <div class="account-methods">
      <div class="account-method-body" data-account-body="api-key">
        <div class="account-method-head"><span data-account-key-method></span><span class="account-method-tag" data-account-key-tag></span></div>
        <label class="account-field"><span data-account-key-label></span>
          <input type="password" autocomplete="off" spellcheck="false" data-account-key></label>
        <div class="account-actions">
          <button type="button" class="account-primary" data-account-save></button>
          <button type="button" class="account-secondary" data-account-clear hidden></button>
        </div>
      </div>
      <div class="account-method-body" data-account-body="oauth">
        <div class="account-method-head"><span data-account-oauth-method></span><span class="account-method-tag" data-account-oauth-tag></span></div>
        <p class="account-hint" data-account-oauth-hint></p>
        <div class="account-actions">
          <button type="button" class="account-primary" data-account-connect></button>
          <button type="button" class="account-secondary" data-account-cancel hidden></button>
        </div>
        <p class="account-link" data-account-authorize hidden></p>
        <div class="account-code" data-account-code hidden>
          <label class="account-field"><span data-account-code-label></span>
            <input type="text" autocomplete="off" spellcheck="false" data-account-code-input></label>
          <button type="button" class="account-primary" data-account-submit></button>
        </div>
      </div>
    </div>
    <div class="account-models">
      <div class="account-models-head"><span data-account-models-label></span>
        <span class="account-catalog" data-account-catalog></span></div>
      <label class="account-attach"><input type="checkbox" data-account-attach><span data-account-attach-label></span></label>
      <div class="parameter-select parameter-control" data-account-control>
        <button type="button" class="parameter-select-trigger" aria-haspopup="listbox" aria-expanded="false" data-account-trigger>
          <span class="parameter-select-value" data-account-value></span>
          <span class="parameter-select-chevron" aria-hidden="true">${icon("chevron")}</span>
        </button>
        <div class="parameter-select-menu" role="listbox" hidden data-account-menu></div>
      </div>
      <p class="account-hint" data-account-models-detail hidden></p>
    </div>`;

  const pick = <T extends Element>(selector: string): T => element.querySelector<T>(selector)!;
  const state = pick<HTMLElement>("[data-account-state]");
  const hint = pick<HTMLElement>("[data-account-hint]");
  const keyBody = pick<HTMLElement>("[data-account-body='api-key']");
  const oauthBody = pick<HTMLElement>("[data-account-body='oauth']");
  const keyInput = pick<HTMLInputElement>("[data-account-key]");
  const keyTag = pick<HTMLElement>("[data-account-key-tag]");
  const oauthTag = pick<HTMLElement>("[data-account-oauth-tag]");
  const save = pick<HTMLButtonElement>("[data-account-save]");
  const clear = pick<HTMLButtonElement>("[data-account-clear]");
  const connect = pick<HTMLButtonElement>("[data-account-connect]");
  const cancel = pick<HTMLButtonElement>("[data-account-cancel]");
  const codeBox = pick<HTMLElement>("[data-account-code]");
  const codeInput = pick<HTMLInputElement>("[data-account-code-input]");
  const submit = pick<HTMLButtonElement>("[data-account-submit]");
  const authorize = pick<HTMLElement>("[data-account-authorize]");
  const catalog = pick<HTMLElement>("[data-account-catalog]");
  const control = pick<HTMLElement>("[data-account-control]");
  const trigger = pick<HTMLButtonElement>("[data-account-trigger]");
  const value = pick<HTMLElement>("[data-account-value]");
  const menu = pick<HTMLElement>("[data-account-menu]");
  const modelsDetail = pick<HTMLElement>("[data-account-models-detail]");
  const attach = pick<HTMLInputElement>("[data-account-attach]");

  for (const [selector, message] of [
    ["[data-account-provider]", "account.provider"],
    ["[data-account-key-label]", "account.api-key.label"],
    ["[data-account-code-label]", "account.oauth.code"],
    ["[data-account-models-label]", "account.models"],
    ["[data-account-key-method]", "account.method.api-key"],
    ["[data-account-oauth-method]", "account.method.oauth"],
    ["[data-account-oauth-hint]", "account.oauth.hint"],
    ["[data-account-attach-label]", "account.models.attach-images"],
  ] as const) uiText(pick(selector), message);
  uiText(save, "account.api-key.save");
  uiText(clear, "account.api-key.clear");
  uiText(connect, "account.oauth.connect");
  uiText(cancel, "account.oauth.cancel");
  uiText(submit, "account.oauth.submit");
  uiAttr(keyInput, "placeholder", "account.api-key.placeholder");
  uiAttr(trigger, "aria-label", "account.models");

  // bindDropdown keeps this exact array, so the options are replaced in place on every catalogue read.
  const options: HTMLButtonElement[] = [];
  const dropdown = bindDropdown(control, trigger, menu, options);

  let view: StudioAccountView | undefined;
  let pending: Pending | undefined;
  let selected: string | undefined;
  let currentOptions: readonly CatalogOption[] = [];
  let source: StudioModelView["source"] | undefined;
  let catalogDetail: string | undefined;
  // Every async answer must still belong to this attempt before it may change the panel.
  const lifecycle = createConnectLifecycle();

  /**
   * The one model control follows the request being composed. Turning on image attachments makes it
   * the multimodal control, so its options are recomputed from the catalogue and any model that does
   * not declare image input is dropped rather than kept.
   */
  const capabilityFor = (): { capability: StudioModelView["capability"]; modality?: "image" } =>
    attach.checked ? { capability: "multimodal", modality: "image" } : { capability: "chat" };

  /** Show or hide one message line without leaving stale text behind a hidden node. */
  function message(node: HTMLElement, text: string | undefined): void {
    node.hidden = text === undefined;
    userText(node, text ?? "");
  }

  function setEnabled(enabled: boolean): void {
    lifecycle.setBusy(!enabled);
    save.disabled = !enabled;
    clear.disabled = !enabled;
    connect.disabled = !enabled;
    trigger.disabled = !enabled;
    submit.disabled = !enabled;
    element.dataset.controlsEnabled = String(enabled);
  }

  function clearConnectHints(): void {
    pending = undefined;
    codeBox.hidden = true;
    cancel.hidden = true;
    authorize.hidden = true;
    codeInput.value = "";
    element.dataset.connecting = "false";
    uiText(connect, "account.oauth.connect");
    setEnabled(true);
  }

  function render(next: StudioAccountView): void {
    view = next;
    message(hint, next.detail);
    userText(state, t(next.state === "needsReauth" ? "account.state.needs-reauth"
      : next.configured ? "account.state.connected" : "account.state.disconnected"));
    element.dataset.accountState = next.configured ? next.state : "disconnected";
    // Both entry points stay on screen together: a user with a key never has to open the other one,
    // and a user without one sees the authorization it can run. Only the entry that stored the
    // current key is marked in use.
    const inUse = t("account.method.in-use");
    userText(keyTag, next.authMethods[0]?.selected === true ? inUse : "");
    userText(oauthTag, next.authMethods[1]?.selected === true ? inUse : "");
    // A configured key is shown only masked; the panel never renders the secret it stored.
    keyInput.value = "";
    keyInput.placeholder = next.secretMasked ?? t("account.api-key.placeholder");
    clear.hidden = !next.configured;
    userText(catalog, next.origins.api);
    keyBody.hidden = false;
    oauthBody.hidden = false;
    element.dataset.apiKeyVisible = String(!keyBody.hidden);
    element.dataset.pkceVisible = String(!oauthBody.hidden);
    element.dataset.secretMasked = next.secretMasked ?? "";
    if (next.connecting !== undefined) {
      pending = { generation: next.connecting.generation, authorizeUrl: next.connecting.authorizeUrl };
      lifecycle.open(next.connecting.generation);
      authorize.hidden = false;
      userText(authorize, next.connecting.authorizeUrl);
      codeBox.hidden = false;
      cancel.hidden = false;
      element.dataset.connecting = "true";
      element.dataset.authorizeUrl = next.connecting.authorizeUrl;
      uiText(connect, "account.oauth.restart");
    } else if (pending === undefined) {
      clearConnectHints();
    }
    element.dataset.selectedModel = selected ?? "";
  }

  function renderOptions(): void {
    menu.replaceChildren(...currentOptions.map((model) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `parameter-select-option${model.id === selected ? " active" : ""}`;
      item.dataset.modelId = model.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(model.id === selected));
      item.innerHTML = "<span data-option-label></span><small data-option-meta></small>";
      userText(item.querySelector("[data-option-label]")!, model.label);
      userText(item.querySelector("[data-option-meta]")!, model.id);
      item.addEventListener("click", () => {
        selected = model.id;
        userText(value, model.id);
        dropdown.close(true);
        renderOptions();
      });
      return item;
    }));
    control.classList.toggle("rich-options", currentOptions.length > 0);
    options.splice(0, options.length, ...Array.from(menu.querySelectorAll<HTMLButtonElement>("button")));
    if (currentOptions.length === 0) uiText(value, "account.models.empty");
    else if (selected === undefined) uiText(value, "account.models.choose");
    if (source !== undefined) uiText(catalog, source === "live" ? "account.models.live" : "account.models.degraded");
    message(modelsDetail, catalogDetail);
    element.dataset.catalogSource = source ?? "none";
    element.dataset.itemCount = String(currentOptions.length);
    element.dataset.selectedModel = selected ?? "";
  }

  /** Recompute the options for the current control and drop a selection the new control rejects. */
  async function loadModels(): Promise<void> {
    const attempt = lifecycle.state().generation;
    const target = capabilityFor();
    trigger.disabled = true;
    uiText(value, "account.models.loading");
    try {
      const result = await accountRequest({
        action: "models",
        capability: target.capability,
        ...(target.modality === undefined ? {} : { modality: target.modality }),
      }) as unknown as StudioModelView;
      if (attempt !== lifecycle.state().generation) return;
      source = result.source;
      catalogDetail = result.detail;
      currentOptions = result.models;
      // A model this control does not accept must not stay selected.
      if (selected !== undefined && !result.models.some((model) => model.id === selected)) {
        const previous = selected;
        selected = undefined;
        catalogDetail = `${previous} is not available for this selection; choose another model.`;
      }
      renderOptions();
    } catch (error) {
      if (attempt !== lifecycle.state().generation) return;
      source = undefined;
      catalogDetail = error instanceof Error ? error.message : String(error);
      currentOptions = [];
      selected = undefined;
      renderOptions();
    } finally {
      if (attempt === lifecycle.state().generation) trigger.disabled = false;
    }
  }

  /** Invalidate the current attempt and release it, without letting a late answer touch the panel. */
  function release(): void {
    const current = pending;
    clearConnectHints();
    lifecycle.release();
    if (current === undefined) return;
    void accountRequest({ action: "cancel-connect", generation: current.generation })
      .then((next) => render(next), () => undefined);
  }

  save.addEventListener("click", () => {
    void (async () => {
      setEnabled(false);
      try {
        render(await accountRequest({ action: "save-api-key", key: keyInput.value }));
        await loadModels();
      } catch (error) {
        message(hint, error instanceof Error ? error.message : String(error));
      } finally {
        setEnabled(true);
      }
    })();
  });

  clear.addEventListener("click", () => {
    void (async () => {
      setEnabled(false);
      try {
        render(await accountRequest({ action: "clear" }));
        selected = undefined;
        await loadModels();
      } catch (error) {
        message(hint, error instanceof Error ? error.message : String(error));
      } finally {
        setEnabled(true);
      }
    })();
  });

  connect.addEventListener("click", () => {
    void (async () => {
      release();
      setEnabled(false);
      try {
        const next = await accountRequest({ action: "begin-connect" });
        render(next);
        // Shown for browsers that do not open a window, and to copy by hand.
        if (next.connecting !== undefined) window.open(next.connecting.authorizeUrl, "_blank", "noopener");
      } catch (error) {
        clearConnectHints();
        message(hint, error instanceof Error ? error.message : String(error));
      }
    })();
  });

  cancel.addEventListener("click", () => { release(); });

  // Turning attachments on or off changes which models are compatible, so the options are recomputed
  // and a model that no longer qualifies is cleared before the user can send with it.
  attach.addEventListener("change", () => { void loadModels(); });

  submit.addEventListener("click", () => {
    void (async () => {
      const current = pending;
      if (current === undefined) {
        message(hint, t("account.oauth.expired"));
        return;
      }
      setEnabled(false);
      try {
        render(await accountRequest({ action: "submit-code", generation: current.generation, code: codeInput.value }));
        clearConnectHints();
        await loadModels();
      } catch (error) {
        clearConnectHints();
        message(hint, error instanceof Error ? error.message : String(error));
      }
    })();
  });

  /**
   * `pagehide` may put this page into the back-forward cache. The guarded cleanup of a cancelled
   * request refuses to touch state, so the busy flags and the authorization hints are cleared here,
   * synchronously, before the server is asked to release the authorization. A second authorization
   * can then start from the restored page without a remount.
   */
  window.addEventListener("pagehide", () => {
    const current = pending;
    pending = undefined;
    codeBox.hidden = true;
    cancel.hidden = true;
    authorize.hidden = true;
    element.dataset.connecting = "false";
    // Release before the server is told: the restored page must be able to start again immediately.
    lifecycle.release();
    setEnabled(true);
    if (current !== undefined) {
      try {
        void fetch("/__studio/account", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel-connect", generation: current.generation }),
          keepalive: true,
        }).catch(() => undefined);
      } catch { /* The page is leaving; nothing can be reported here. */ }
    }
  });

  return {
    element,
    release,
    async refresh() {
      lifecycle.begin();
      setEnabled(false);
      try {
        render(await accountRequest({ action: "view" }));
        await loadModels();
      } finally {
        setEnabled(true);
      }
    },
  };
}

export type { AccountsPane, Message };
