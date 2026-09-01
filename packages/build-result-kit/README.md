# `@hypit/build-result-kit`

Host-facing package selection for project Build Result repositories. A Repository owns historical
Build manifests, public Outputs and their files. Runtime working Artifacts and active execution
state are separate concerns.

The selected repository is opened before submission and its serializable location travels with the
queued Build. A detached Worker therefore writes to the original destination even if the project's
active Runtime Profile changes later. Repository packages implement one interface; Core and author
components do not branch on filesystem, S3 or service type.
