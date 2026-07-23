# Tagsmith GitHub Pages Marketing Site Design

## Goal

Publish a lightweight, shareable Tagsmith introduction site on GitHub Pages. It
must give Traditional Chinese and English audiences an equally clear path from
the problem of inconsistent git tags to a safe first evaluation and the full
adoption workflow.

## Scope

- Add a Traditional Chinese landing page at `docs/index.html`.
- Add an English landing page at `docs/en/index.html`.
- Add a GitHub Actions Pages deployment workflow.
- Keep the site fully static: no build step, framework, tracking service, or
  third-party runtime dependency.

The existing Markdown documentation remains the detailed reference material; the
landing pages are a concise product introduction rather than a duplicate CLI
manual or configuration reference.

## Audience and message

The page serves repository maintainers and release owners who need predictable
git tags across local development, CI, and release workflows. The core promise
is:

> Inspect the repository, make the convention explicit, and create predictable
> git tags safely.

“Safe” is deliberately local and concrete: Tagsmith validates a proposed tag
against the configured convention and known local tag history before creation.
It does not promise remote enforcement, concurrent-maintainer coordination, or
automatic correction of ambiguous history. The Chinese page carries the same
product story and user journey in natural Traditional Chinese.

Both versions emphasize inspection before action, explicit configuration for
ambiguous or non-SemVer history, strict validation before creation, later
remote publication as a separate choice, configurable version models, advanced
independent tag lines, JSON output for surrounding automation, and optional
local merge-policy hooks.

## Information architecture

Each language page has the same sequence and calls to action:

1. **Hero** — concise promise, the copyable safe-evaluation command
   `npx @carllee1983/tagsmith list`, prerequisites (Git repository and Node.js
   18+), full-workflow link, and GitHub/npm verification links. The command
   remains visible and manually copyable without JavaScript.
2. **Problem** — inconsistent formats, unsafe manual version selection, and
   unclear repository history.
3. **How it works** — inspect first; preview when the convention is clear; for
   ambiguous history configure, inspect again, then preview. Explain validated
   creation later in the story and keep remote publication a separate,
   default-off action.
4. **Core capabilities** — SemVer/CalVer/build models, zero-configuration mode,
   advanced multiple tag lines, JSON output for automation, and optional local
   merge-policy guardrails. Zero-configuration must be qualified as a
   SemVer-style discovery path, not universal convention inference.
5. **Adoption** — explain `tagsmith init` and committing the generated
   `.tagsmith.json`; direct configuration shape and examples remain in the
   Markdown documentation.
6. **Trust and call to action** — link to the GitHub repository, npm package,
   full documentation, and the other language version.

Hero output is clearly labelled illustrative, uses only real safe-to-copy
commands, and never presents tag creation as the first action.

The two pages use stable dedicated URLs rather than client-side translation:

| Audience | URL | Language switch target |
| --- | --- | --- |
| Traditional Chinese | `/Tagsmith/` | `/Tagsmith/en/` |
| English | `/Tagsmith/en/` | `/Tagsmith/` |

This makes either language page directly shareable and indexable.

## Visual and technical design

The visual direction follows the approachable, single-column narrative of the
`loop-apidoc` introduction page without copying its branding. Tagsmith uses a
semantic release-oriented palette: deep indigo for actions, teal for valid
states, amber for review, and coral for risks or anomalies. The page uses
responsive CSS grids and semantic HTML.

There are no generated image assets, analytics, trackers, external font
requests, embedded verification widgets, frameworks, or third-party runtime
dependencies. This keeps the Pages artifact private, small, reproducible, and
self-contained. Shared CSS and a small dependency-free JavaScript helper may
live under `docs/assets/`; the helper only improves command copying and must
fall back gracefully when JavaScript or clipboard access is unavailable.

Both language editions have equivalent claims, calls to action, and completeness
with independently natural wording. Every action is keyboard-operable, clearly
labelled, visibly focusable, and understandable without color alone.

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

Before merge, validate correctness against the CLI and documentation, bilingual
parity, keyboard and focus behavior, no-JavaScript use, clipboard-denied
fallback, and responsive layout at desktop and narrow mobile widths. Check both
page files for valid local links, including the reciprocal language switch and
relative asset paths, and confirm the Pages workflow uploads `./docs`.

After deployment, smoke-test availability, asset integrity, navigation, primary
routes, and external GitHub/npm verification links. A public deployment is
complete only when the root and `/en/` pages load without missing assets or
broken links.

## Non-goals

- Replacing the README or the detailed Markdown documentation.
- Adding analytics, a CMS, a JavaScript framework, a custom domain, external
  runtime dependencies, or visitor instrumentation.
- Changing Tagsmith CLI behavior, package metadata, release behavior, or
  repository workflow policy.
