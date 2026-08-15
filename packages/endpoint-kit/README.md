# `@narratage/endpoint-kit`

Host-neutral SDK for exact external capability endpoints.

An Endpoint is any installed implementation that fulfills one declared `Need`: a vendor API, local
process, Lambda function, human service or device. `defineEndpointPackage()` produces its static
Runtime Manifest, configured instance, exact offers and installation facet from one source of
truth. It depends on no Driver, Node filesystem, queue or domain package.

Concrete distributions may still be named after a real provider, such as `@narratage/provider-kie`.
Local WhisperX and HyperFrames use the same Endpoint contract without pretending to be vendors.
Endpoint packages are trusted Host configuration and are never activated by author imports.

The Runtime Scheduler owns readiness and concurrency. A recoverable Endpoint owns only one external
operation's `start/resume/cancel` law. Process, Lambda and HTTP are lower-level Transports and do not
register capabilities by themselves.
