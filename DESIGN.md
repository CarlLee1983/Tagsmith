# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-07-17
- Primary product surfaces: GitHub Pages landing pages at `/` and `/en/`
- Evidence reviewed: `README.md`, `docs/index.html`, `docs/en/index.html`,
  `docs/assets/site.css`, and the approved Editorial release log mockup.

## Brand

- Personality: precise, assured, editorial, and developer-literate.
- Trust signals: real commands, version markers, deliberate hierarchy, and
  factual language.
- Avoid: generic SaaS gradients, rounded-card grids, decorative icon badges,
  neon terminal tropes, and inflated promises.

## Product goals

- Goals: explain Tagsmith's release-safety value quickly; send visitors to npm,
  GitHub, and the detailed documentation; support Chinese and English sharing.
- Non-goals: replace the README, act as a dashboard, or sell an enterprise SaaS.
- Success signals: a visitor can identify the problem, understand the workflow,
  and choose an installation or documentation CTA without reading every section.

## Personas and jobs

- Primary personas: maintainers, release engineers, and teams with CI releases.
- User jobs: establish a tag convention, diagnose tag history, and publish a
  release safely.
- Key contexts of use: GitHub and npm discovery, shared links, and desktop or
  mobile developer browsing.

## Information architecture

- Primary navigation: wordmark/home, reciprocal language switch, npm, GitHub,
  and documentation.
- Core routes/screens: `docs/index.html` (Traditional Chinese) and
  `docs/en/index.html` (English).
- Content hierarchy: release decision statement → concrete risk → workflow →
  capabilities → quick start.

## Design principles

- Make the release decision tangible: version labels, status markers, and
  command output should carry more weight than generic illustrations.
- Use editorial rhythm: varied spans, rules, labels, and whitespace instead of
  uniform card collections.
- Let restraint signal trust: one functional accent colour, no gratuitous depth.
- Tradeoff: pages favour clarity and distinctive typography over dense reference
  material; the README remains the complete specification.

## Visual language

- Color: warm paper (`#f4f0e8`), near-black ink (`#171816`), brick red
  (`#c84932`) as the active accent, and muted olive for verified states.
- Typography: system sans for prose; Georgia-style display serif for headings;
  monospace only for commands, status, and metadata.
- Spacing/layout rhythm: broad editorial margins; asymmetric desktop grids;
  hairline rules separate sections.
- Shape/radius/elevation: square or minimally rounded surfaces; no default card
  shadows; borders describe structure.
- Motion: no auto-playing motion; standard focus and hover states only.
- Imagery/iconography: no stock art; labels, typographic composition, and small
  functional marks replace decorative icon systems.

## Components

- Existing components to reuse: `.nav`, `.hero`, `.actions`, `.terminal`,
  `.grid`, `.steps`, `.feature`, `.quick`, and `.footer`.
- New/changed components: editorial masthead, bordered release-note blocks, and
  asymmetric capability layout, implemented through the existing selectors.
- Variants and states: primary CTA uses brick red; secondary CTA is outlined;
  status text uses muted olive; focus uses a visible amber outline.
- Token/component ownership: `docs/assets/site.css` owns all landing-page tokens.

## Accessibility

- Target standard: WCAG 2.1 AA for text and interactive elements.
- Keyboard/focus behavior: all links retain visible `:focus-visible` outlines.
- Contrast/readability: body text is at least 16px; no text is conveyed by colour
  alone; landmark elements remain semantic.
- Reduced motion and sensory considerations: no required animation or flashing.

## Responsive behavior

- Supported breakpoints/devices: desktop, tablet, and narrow mobile at 760px and
  430px thresholds.
- Layout adaptations: multi-column layouts collapse to a single reading column;
  the language switch and CTAs remain immediately reachable.
- Touch/hover differences: interaction does not depend on hover.

## Interaction states

- Loading/empty/error/offline: static documents require no application states.
- Success: command examples use text and a check mark, never colour alone.
- Disabled: no disabled controls.

## Content voice

- Tone: concise, factual, and quietly confident.
- Terminology: retain exact CLI names, flags, and version-model terminology.
- Microcopy rules: show a concrete command or outcome where possible; avoid
  superlatives, rhetorical filler, and claims not established by the README.

## Implementation constraints

- Framework/styling system: static HTML with shared CSS; no runtime dependency.
- Design-token constraints: use only tokens in `docs/assets/site.css`.
- Performance constraints: no external fonts, images, analytics, or build step.
- Compatibility constraints: GitHub Pages serves `docs/`; relative paths must
  work under `/Tagsmith/` and `/Tagsmith/en/`.
- Test/screenshot expectations: verify local links, root and `/en/` routes, and
  narrow-screen layout before deployment.

## Open questions

- [ ] Collect qualitative feedback from first external users before adding a
  custom wordmark or case-study content.
