# Application Home

> Status: current application-level Surface for discovering products, opening Project Boundaries and launching Product
> Sessions through one ApplicationHost.

## Boundary

Application Home is the browser Surface of the Application Lifetime. It observes one ApplicationHost and presents its
registered products, active ProjectHosts, Product Sessions and selected AIGC Execution Environments. It is the default content of an
application-level tab in a browser or Desktop shell.

```text
Desktop tab · browser
        │
Application Home
        │ finite Application projection and control operations
ApplicationHost
├─ Product Providers
├─ ProjectHost registry
├─ Product Session registry
└─ AIGC Execution Directory
```

Opening a product begins with an explicit Project Boundary selected by the caller. Application Home obtains a temporary
project lease, submits the selected Product Provider's declared launch parameters and releases that lease after the
Product Session has been created. The Product Session then retains its ProjectHost independently.

Product Providers own launch-parameter names, presentation labels, initial text and validation. Application Home renders
those finite declarations without interpreting NLE, Canvas, Scene or another product's document format. Native directory
or file selection is an Interaction supplied by the presenting caller adapter.

Application Home keeps no author facts. Its form contents, selected product and status messages are current browser
interaction state. Projects, Media, packages, NLE documents and other owner facts remain in their established Project
and owner scopes.

## Local capability route

The Node Application adapter issues one opaque Application Home capability URL for its service lifetime:

```text
http://127.0.0.1:<port>/home/<capability>/
```

Requests below that mount may call its application control projection without placing the Application bearer token in
browser source or query parameters. The capability resolves only inside the issuing Application server and ends with
that server. Product Session URLs remain separate capabilities beneath `/sessions/`.

The default `@hypit/hypit` distribution serves the `@hypit/application-home` browser artifact at this route. A Desktop
shell presents that URL as its application-level tab and presents returned Product Session URLs as product tabs.

## Shared endpoint discovery

The Node distribution publishes a permission-restricted endpoint record while the ApplicationHost is running. It
contains the loopback origin, Application instance identity, bearer token, Application Home capability URL and process
identity. Desktop, Agent and CLI adapters validate the service identity at the recorded origin before attaching.

An application process holds the endpoint lock for its lifetime and removes its own record on orderly shutdown. A new
process may claim a stale record after confirming that its lock owner is absent. The record is runtime coordination,
not a Project or owner document.

## Package

`@hypit/application-home` is an independent release because it owns a browser artifact and application-level Surface
lifecycle distinct from the headless `@hypit/application` control plane. It depends only on the public Application
projection and Node Home adapter contract. The root `@hypit/hypit` distribution selects and serves it.
