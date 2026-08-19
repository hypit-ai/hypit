# `@hypit/protocol`

Data contracts shared across package boundaries.

This package defines module manifests, nominal references, typed values, author and run graphs,
build plans, Core commands, command results, build facts and build state. It also parses a module
manifest from JSON without loading executable package code.

Protocol contains no source parser, package loader, runtime, filesystem access or video vocabulary.
Packages own their types, producers and capabilities by module name and version. Core and Hosts
communicate through those names and the values declared here.
