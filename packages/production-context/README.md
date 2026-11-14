# `@hypit/production-context`

Request-local projection of independent Project Object owners. The package composes explicitly selected
`hypit.project-object-owner` facets into discovery and observation; it does not persist an object index,
scan package formats itself or own any domain document.

Each owner discovers and opens only its exact document format major. Observations may reference objects owned by
another facet. Missing owners remain visible as unresolved references rather than causing the Host to guess a reader.
Media, NLE, Generation, Scene, Feedback and project packages can therefore participate without entering a central
object-kind union. Bench availability is a separate application projection and is deliberately absent here.

The first composed owners cover root `media/`, freely placed NLE documents and freely placed Scene documents. The
Scene package also owns its `scenes/assets/` discovery and the explicit Scene → Library → Scene Asset reference
closure. Production Context sees only exact references; it does not interpret Scene resources or promote them into a
project-wide Asset schema.
