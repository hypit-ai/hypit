# `@hypit/svml-toolchain`

Optional application assembly for compiling SVML Sources into finite long-running Builds. It owns the
SVML Frontend choice, filesystem Workspace, explicit Source-package discovery, legacy Source CLI and
Author vocabulary view.

The executable injects the same `BuildCliContextServices` already assembled for operational commands;
this package does not construct or depend on the full Distribution toolchain. NLE projects and Generation
Graph files do not depend on this package. `@hypit/recipe` and `@hypit/document` remain
independent optional Source frontends selected by a file; they are installed here rather than being
treated as Hypit Core.
