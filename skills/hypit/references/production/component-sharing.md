# Sharing an Author Package

Read this when a project component has become useful in another project.

## Keep one identity

A new component begins as an ordinary package in the video's project, normally under `packages/`.
Give it the owner's scope from the start, such as `@studio/score-strip`. Its Source import names the
logical Module ABI:

```xml
<import as="score" from="@studio/score-strip@1"/>
```

The trailing `1` is the Module interface version. The package manager separately records the npm
release installed by this project. Moving the same package from a project workspace to a registry
does not require a new Module name, a new tag, or a copy in the Hypit repository.

## Share with the ordinary package system

When the owner wants cross-project use, build the package to JavaScript and include the activation,
preview assets, and files its vocabulary opens. Publish that package to the owner's npm scope or
private registry. The consumer installs an explicit release and commits its ordinary lockfile:

```bash
pnpm add @studio/score-strip@1.2.0
```

Changing the installed release is an explicit package-manager operation. A Build never installs or
updates component code. Hypit reads the version already selected by the project, and a missing
package remains a precise installation problem.

An executable Author Package uses `hypit/author-kit` plus the relevant `hypit/*` domain subpaths while
it is developed, then publishes only its own built code and assets. The current Hypit Distribution
supplies those APIs when it loads the activation. Package code is trusted JavaScript in the current
process, so install only code the project owner chooses to run.

## Data packages remain data

A Prompt Kit does not need activation code. It can export an `.svs` Source from ordinary package
`exports`, and a project imports that exact Source:

```xml
<import as="ugc" source="@studio/image-kits/phone-ugc-v1"/>
```

This reads the selected package data without activating JavaScript. The package manager still owns
installation and versioning; Hypit does not scan a registry or maintain a second catalogue.

If Hypit itself later adopts a component as an official Distribution capability, that is a separate
product and framework decision. Cross-project reuse does not depend on that adoption.
