import type { ApplicationProjection } from "@hypit/application/projection";
import "./style.css";

type OpenProjectReceipt = {
  readonly handle: string;
  readonly project: string;
};

type LaunchProductReceipt = {
  readonly handle: string;
  readonly project: string;
  readonly product: string;
  readonly url: string;
};

const selectedRoot = document.querySelector<HTMLElement>("#application-home");
if (selectedRoot === null) throw new Error("Application Home root is unavailable.");
const root: HTMLElement = selectedRoot;

let projection: ApplicationProjection | undefined;
let selectedProduct: string | undefined;
let projectRoot = "";
let message = "";
let pending = false;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className !== undefined) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

async function request<Value>(path: string, init?: RequestInit): Promise<Value> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(failure.error ?? `Application request failed with ${response.status}.`);
  }
  if (response.status === 204) return undefined as Value;
  return await response.json() as Value;
}

function productTitle(product: string): string {
  return projection?.products.find((entry) => entry.product === product)?.title ?? product;
}

function sectionTitle(kicker: string, title: string): HTMLElement {
  const heading = element("div", "section-heading");
  heading.append(element("span", "kicker", kicker), element("h2", undefined, title));
  return heading;
}

function productSelector(container: HTMLElement): void {
  if (projection === undefined) return;
  const products = element("div", "product-grid");
  for (const product of projection.products) {
    const button = element("button", `product-card${selectedProduct === product.product ? " selected" : ""}`);
    button.type = "button";
    const mark = element("span", "product-mark", product.title.slice(0, 1).toUpperCase());
    const copy = element("span", "product-copy");
    copy.append(element("strong", undefined, product.title), element("small", undefined, product.product));
    button.append(mark, copy);
    button.addEventListener("click", () => {
      selectedProduct = product.product;
      render();
    });
    products.append(button);
  }
  container.append(products);
}

function launchForm(): HTMLElement {
  const panel = element("section", "panel launch-panel");
  panel.append(sectionTitle("Start", "打开一个产品会话"));

  if (projection === undefined || projection.products.length === 0) {
    panel.append(element("p", "empty", "当前 Application 没有注册产品。"));
    return panel;
  }

  productSelector(panel);
  const product = projection.products.find((entry) => entry.product === selectedProduct)
    ?? projection.products[0]!;
  selectedProduct = product.product;

  const form = element("form", "launch-form");
  const rootField = element("label", "field");
  rootField.append(element("span", undefined, "Project Boundary"));
  const rootInput = element("input");
  rootInput.name = "root";
  rootInput.required = true;
  rootInput.placeholder = "/absolute/path/to/project";
  rootInput.autocomplete = "off";
  rootInput.value = projectRoot;
  rootInput.addEventListener("input", () => { projectRoot = rootInput.value; });
  rootField.append(rootInput);
  form.append(rootField);

  const parameterGrid = element("div", "parameter-grid");
  for (const parameter of product.launchParameters) {
    const field = element("label", "field");
    const label = element("span", undefined, parameter.title);
    if (!parameter.required) label.append(element("em", undefined, "optional"));
    const input = element("input");
    input.name = parameter.name;
    input.required = parameter.required;
    input.value = parameter.initial ?? "";
    input.placeholder = parameter.placeholder ?? "";
    input.autocomplete = "off";
    field.append(label, input);
    parameterGrid.append(field);
  }
  form.append(parameterGrid);

  const actions = element("div", "form-actions");
  const submit = element("button", "primary", pending ? "正在打开…" : `打开 ${product.title}`);
  submit.type = "submit";
  submit.disabled = pending;
  actions.append(submit);
  form.append(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(form);
    const rootValue = String(data.get("root") ?? "").trim();
    const input: Record<string, string> = {};
    for (const parameter of product.launchParameters) {
      const value = String(data.get(parameter.name) ?? "").trim();
      if (value.length > 0) input[parameter.name] = value;
    }
    void launch(rootValue, product.product, input);
  });
  panel.append(form);
  return panel;
}

function runtimePanel(): HTMLElement {
  const panel = element("section", "panel runtime-panel");
  panel.append(sectionTitle("Runtime", "当前应用状态"));
  if (projection === undefined) return panel;

  const metrics = element("div", "metrics");
  for (const [value, label] of [
    [projection.projects.length, "Projects"],
    [projection.sessions.length, "Sessions"],
    [projection.execution.length, "AIGC Environments"],
  ] as const) {
    const metric = element("div", "metric");
    metric.append(element("strong", undefined, String(value)), element("span", undefined, label));
    metrics.append(metric);
  }
  panel.append(metrics);

  const sessions = element("div", "runtime-list");
  if (projection.sessions.length === 0) {
    sessions.append(element("p", "empty", "还没有打开的产品会话。"));
  } else {
    for (const session of projection.sessions) {
      const row = element("div", "runtime-row");
      const link = element("a");
      link.href = `${location.origin}/sessions/${encodeURIComponent(session.handle)}/`;
      link.target = "_blank";
      link.rel = "noopener";
      link.append(
        element("strong", undefined, productTitle(session.product)),
        element("small", undefined, session.handle),
      );
      const close = element("button", "quiet", "关闭");
      close.type = "button";
      close.addEventListener("click", () => void closeSession(session.handle));
      row.append(link, close);
      sessions.append(row);
    }
  }
  panel.append(sessions);
  return panel;
}

function render(): void {
  root.replaceChildren();
  const shell = element("div", "shell");
  const header = element("header", "topbar");
  const brand = element("div", "brand");
  brand.append(element("span", "brand-mark", "H"), element("strong", undefined, "Hypit"));
  const refresh = element("button", "quiet", "刷新");
  refresh.type = "button";
  refresh.disabled = pending;
  refresh.addEventListener("click", () => void refreshProjection());
  header.append(brand, refresh);

  const hero = element("section", "hero");
  hero.append(
    element("span", "eyebrow", "APPLICATION HOME"),
    element("h1", undefined, "从一个项目，打开你的制作空间。"),
    element("p", undefined, "Application 负责项目运行时和产品会话；作品事实继续留在各自的项目与 Owner 中。"),
  );

  const content = element("div", "content-grid");
  content.append(launchForm(), runtimePanel());
  shell.append(header, hero, content);
  if (message.length > 0) shell.append(element("div", "toast", message));
  root.append(shell);
}

async function refreshProjection(clearMessage = true): Promise<void> {
  try {
    projection = await request<ApplicationProjection>("api/application");
    selectedProduct ??= projection.products[0]?.product;
    if (clearMessage) message = "";
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function launch(rootValue: string, product: string, input: Record<string, string>): Promise<void> {
  pending = true;
  message = "";
  render();
  let project: OpenProjectReceipt | undefined;
  try {
    project = await request<OpenProjectReceipt>("api/application/projects", {
      method: "POST",
      body: JSON.stringify({ root: rootValue }),
    });
    const session = await request<LaunchProductReceipt>("api/application/sessions", {
      method: "POST",
      body: JSON.stringify({ project: project.handle, product, input }),
    });
    message = `${productTitle(product)} 已打开。`;
    window.open(session.url, "_blank");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    if (project !== undefined) {
      await request<void>(`api/application/project-leases/${encodeURIComponent(project.handle)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    pending = false;
    await refreshProjection(false);
  }
}

async function closeSession(handle: string): Promise<void> {
  pending = true;
  render();
  try {
    await request<void>(`api/application/sessions/${encodeURIComponent(handle)}`, { method: "DELETE" });
    message = "产品会话已关闭。";
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    pending = false;
    await refreshProjection(false);
  }
}

void refreshProjection();
