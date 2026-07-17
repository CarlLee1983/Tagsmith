# Tagsmith GitHub Pages Marketing Site Design

## Goal

Publish a lightweight, shareable Tagsmith introduction site on GitHub Pages. It
must give Traditional Chinese and English audiences an equally clear path from
the problem of inconsistent git tags to installation and project resources.

## Scope

- Add a Traditional Chinese landing page at `docs/index.html`.
- Add an English landing page at `docs/en/index.html`.
- Add a GitHub Actions Pages deployment workflow.
- Keep the site fully static: no build step, framework, tracking service, or
  third-party runtime dependency.

The existing Markdown documentation remains the detailed reference material; the
landing pages are a concise product introduction rather than a duplicate CLI
manual.

## Audience and message

The page serves maintainers and release engineers who need predictable git tags
across local development, CI, and release workflows. The core promise is:

> Define the convention once, inspect the repository, and create the next git
> tag safely.

The Chinese page uses the same message in Traditional Chinese. Both versions
emphasize concrete safeguards: configurable version models, tag inspection,
strict validation before creation, zero-configuration adoption, independent tag
lines, and optional local merge-policy hooks.

## Information architecture

Each language page has the same sequence and calls to action:

1. **Hero** — concise promise, product positioning, install command, and links
   to npm and GitHub.
2. **Problem** — inconsistent formats, unsafe manual version selection, and
   unclear repository history.
3. **How it works** — define or infer a convention, inspect tags, preview the
   next version, then validate and create it.
4. **Core capabilities** — SemVer/CalVer/build models, zero-configuration mode,
   multiple tag lines, JSON output for automation, and merge-policy guardrails.
5. **Quick start** — a short command sequence that works in an existing
   SemVer-style repository.
6. **Trust and call to action** — link to the GitHub repository, npm package,
   full documentation, and the other language version.

The two pages use stable dedicated URLs rather than client-side translation:

| Audience | URL | Language switch target |
| --- | --- | --- |
| Traditional Chinese | `/Tagsmith/` | `/Tagsmith/en/` |
| English | `/Tagsmith/en/` | `/Tagsmith/` |

This makes either language page directly shareable and indexable.

## Visual and technical design

The visual direction follows the approachable, single-column narrative of the
`loop-apidoc` introduction page without copying its branding. Tagsmith uses a
release-oriented palette: deep indigo for the primary action, teal for valid
states, amber for review, and coral for anomalies. The page uses responsive CSS
grids, semantic HTML, inline SVG icons, and CSS-only decorative graphics.

There are no generated image assets. This keeps the Pages artifact small and
reproducible while retaining a distinct product presentation. Shared CSS and
small JavaScript helpers may live under `docs/assets/` if they reduce duplicated
language-page markup; content remains explicit in each language page.

## Deployment

`.github/workflows/pages.yml` deploys `./docs` with the official GitHub Pages
actions. It runs on pushes to `main` that change `docs/**` or the workflow and
can also be started manually. The workflow has only the permissions required by
Pages (`contents: read`, `pages: write`, and `id-token: write`) and serializes
deployments through a `pages` concurrency group.

GitHub repository settings must select **GitHub Actions** as the Pages source if
they have not already been configured. Once enabled and the first workflow run
succeeds, the expected public address is:

`https://carllee1983.github.io/Tagsmith/`

## Validation

- Check both page files for valid local links, including the reciprocal language
  switch and relative asset paths.
- Inspect the generated pages locally in a browser or static HTTP server at
  desktop and narrow mobile widths.
- Confirm the Pages workflow syntax and that it uploads `./docs`.
- After push, inspect the GitHub Actions deployment result and open both public
  URLs. A public deployment is complete only when the root and `/en/` pages load
  without missing assets or broken links.

## Non-goals

- Replacing the README or the detailed Markdown documentation.
- Adding analytics, a CMS, a JavaScript framework, or a custom domain.
- Changing Tagsmith CLI behavior, package metadata, or release policy.
