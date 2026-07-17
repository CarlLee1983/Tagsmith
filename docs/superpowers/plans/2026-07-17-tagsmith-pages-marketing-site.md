# Tagsmith GitHub Pages Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a bilingual static Tagsmith marketing site on GitHub Pages.

**Architecture:** Serve static files directly from `docs/`. `docs/index.html` is
the Traditional Chinese entry point and `docs/en/index.html` is the English
entry point. A GitHub Actions workflow uploads `docs/` as the Pages artifact.

**Tech Stack:** Semantic HTML5, responsive CSS, inline SVG, vanilla JavaScript,
GitHub Actions Pages actions.

## Global Constraints

- Use no runtime dependencies, build tool, analytics, or external image asset.
- Keep public product claims aligned with the current README and CLI help.
- Keep `/` and `/en/` directly shareable and linked to each other.
- Deploy only the `docs/` directory through the official Pages actions.

---

### Task 1: Build the bilingual static landing pages

**Files:**
- Create: `docs/index.html`
- Create: `docs/en/index.html`

**Interfaces:**
- Consumes: product facts in `README.md` and CLI commands in `src/cli/index.ts`
- Produces: `/` Traditional Chinese and `/en/` English public Pages entry points

- [x] **Step 1: Add matching page structure**

Create semantic `header`, `main`, `section`, and `footer` landmarks for hero,
problem, workflow, capabilities, quick start, and final CTA. Include reciprocal
language links: `en/index.html` from the Chinese page and `../index.html` from
the English page.

- [x] **Step 2: Add responsive, self-contained visual design**

Use embedded CSS with a responsive card grid, accessible contrast, visible focus
styles, and a single-column layout below 700px. Use inline SVG only for product
motifs and icons.

- [x] **Step 3: Add accurate product copy and CTAs**

Use `npm install -g @carllee1983/tagsmith`, `tagsmith list`, `tagsmith next`,
and `tagsmith create --push` in the quick start. Link to the npm package,
GitHub repository, README, and translated documentation.

- [x] **Step 4: Verify page structure and links**

Run a local link checker against both HTML files and inspect the pages with a
static HTTP server at desktop and narrow mobile viewport widths.

### Task 2: Add GitHub Pages deployment

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `docs/` static site output
- Produces: GitHub Pages deployment URL from the `deploy-pages` action output

- [x] **Step 1: Add a constrained Pages workflow**

Trigger on `main` pushes affecting `docs/**` or `.github/workflows/pages.yml`,
and allow `workflow_dispatch`. Grant `contents: read`, `pages: write`, and
`id-token: write`; use a `pages` concurrency group.

- [x] **Step 2: Upload and deploy the documentation directory**

Use `actions/checkout@v4`, `actions/configure-pages@v5`,
`actions/upload-pages-artifact@v3` with `path: ./docs`, and
`actions/deploy-pages@v4`.

- [x] **Step 3: Validate workflow content**

Check required triggers, permissions, action versions, and artifact path by
reading the final YAML file. The first remote run must be checked after push.

### Task 3: Verify and publish

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/en/index.html`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: completed static site and Pages workflow
- Produces: verified local site and public GitHub Pages deployment

- [x] **Step 1: Run local verification**

Run `git diff --check`, verify all internal HTML links resolve, and use a local
HTTP server to retrieve both `/` and `/en/` successfully.

- [x] **Step 2: Commit and push the implementation**

Commit only the site, workflow, and this plan using
`docs: publish bilingual Tagsmith site`, then push `main` to `origin`.

- [x] **Step 3: Verify production deployment**

Inspect the GitHub Actions run, then request both
`https://carllee1983.github.io/Tagsmith/` and
`https://carllee1983.github.io/Tagsmith/en/`. Confirm HTTP success and that
each page exposes the reciprocal language link.
