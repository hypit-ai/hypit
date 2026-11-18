# Hypit design authority

## Reading map

Read the current system from authority toward implementation.

### 1. Constitution

- [System constitution](system-constitution.md) — Hypit's definition, authorities, seams, Host hierarchy and
  distribution rules.

### 2. Cross-owner composition and execution

- [Project owners and application hosts](project-owners-and-hosts.md) — the long-lived ApplicationHost, author facts,
  Services, Executors, local filesystem layout, caller adapters and product operation forms.
- [Project Boundary and Project Host](project-host.md) — project files, package activation, shared Media, open
  document Services and Product Sessions.
- [Host backend API](host-backend-api.md) — the shared ApplicationHost backend, ProjectHost, Product Providers, Product
  Sessions, Action lifetimes and their transport projections.
- [Hypit CLI and shared Host operations](cli.md) — the executable, Host client, account diagnostics, quotation and
  terminal access to NLE operations.
- [Explicit programs and execution](explicit-programs-and-execution.md) — action coordination, Invocation recovery,
  Publication and TypeScript project programs.

### 3. Domain and owner designs

- [Media](media.md) — accepted media, signal interpretation, representations, adoption, the open Project Media
  Service and local media execution.
- [Component authoring](authoring.md) — TSX author programs, NLE materialization, component expansion and the boundary
  between author source and the durable edit.
- [Canvas 后端和项目文件](canvas.md) — Canvas 的项目文档、npm 边界、生成操作和 Studio。
- [Canvas 操作与终端接口](canvas-api.md) — 修订事务、报价、提交恢复、卡片历史和采用。
- [HTML 视听执行与导出 API](html-video-delivery.md) — NLE 编译、HTML/Audio Program、视频
  Delivery Action 与 npm 执行边界。
- [NLE](nle.md) — direct audiovisual composition, the SVML Project document, per-document Service transactions and
  exact composition semantics.
- [NLE View](nle-view.md) — durable editing arrangement, per-Composition guards, independent Service lifetime and the
  finite projection seam.

### 4. Product and Surface designs

- [Application Home](application-home.md) — the application-level browser Surface, product launcher and shared local
  endpoint discovery.
- [NLE Editing Surface](nle-surface.md) — application composition over Project and View Services, guarded operations,
  finite observations and projection invalidation.
- [NLE Studio](nle-studio.md) — NLE Product Provider, browser-session boundary, persistence and Media/preview ports.
- [NLE 后端能力审计](nle-backend-capability-audit.md) — 把产品验收能力映射到当前 Owner 事实、Product Operation、
  Executor Action 与实现缺口。

### 5. Distribution and implementation growth

- [Package architecture](package-architecture.md) — release boundaries for authoring, NLE compilation and Executors.
- [Repository bootstrap](repository-bootstrap.md) — implementation birth sequence and selective code reuse.

The constitution precedes package layout. The other pages project it into engineering decisions. Exact
schemas, operations and adapters live beside their owner code.

## Authority order

Architectural decisions follow this order:

1. the system constitution;
2. the current owner design;
3. the owner's public types and implementation README;
4. current implementation and working production paths;
5. public product documentation;
6. historical material in the previous repository.

## Growing the design

An owner design records:

- the author or execution facts under that owner;
- the commands and Actions it accepts;
- the references and Published Surfaces it provides or consumes;
- the state that survives process or project reopen;
- the compatibility promise carried by each external interface or package.

Git records the evolution of these decisions. The current design tree stays focused on active authorities,
current reasons and executable production behavior.
