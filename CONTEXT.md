# Tagsmith

Tagsmith is a CLI for making a repository's git-tag convention explicit and for safely creating the next tag within that convention.

## Language

**Core promise**:
Tagsmith provides safe, predictable git tags through local validation of a proposed tag against the configured convention and known local tag history before creation. Remote enforcement, concurrent-maintainer coordination, and correction of ambiguous history are outside this promise.
_Avoid_: Release automation platform

**Hero demonstration**:
The landing-page terminal example uses real, safe-to-copy evaluation commands. Any displayed result is labelled illustrative; tag creation is not a hero action.
_Avoid_: Fabricated operational result, creation call to action

**Validated creation**:
The later completion of the Tagsmith story: create a tag only after inspection, preview, and validation against the explicit convention.
_Avoid_: First-use action, primary call to action

**Ambiguous history**:
Existing tags that do not establish one clear convention. Tagsmith flags the ambiguity; maintainers resolve the intended convention, and history is never rewritten automatically.
_Avoid_: Automatically repairable history

**Automation integration**:
The use of `--json` to let CI and scripts consume Tagsmith's convention-evaluation results. Tagsmith defines and evaluates the convention; surrounding automation acts on the result.
_Avoid_: Replacing the release system

**Adoption evidence**:
Out-of-page signals used to learn whether Tagsmith is useful, including package activity, repository activity, and maintainer feedback. It does not include visitor instrumentation.
_Avoid_: Page analytics, visitor tracking

**Verifiable claim**:
A landing-page statement that demonstrates a real Tagsmith behavior or links to a route where it can be checked. Claims without durable evidence are excluded.
_Avoid_: Unsubstantiated marketing claim

**Landing-page release gate**:
Before merge, every changed product claim must be verified against Tagsmith behavior, updated in both language editions, accessible, progressively enhanced, and responsive. After deployment, availability, asset integrity, navigation, primary routes, and external verification links must be smoke-tested.
_Avoid_: Copy-only change, single-language update, unverified deployment

**Landing-page scope**:
The static site's content, presentation, accessibility, behavior, and deployment validation. It excludes CLI behavior, package metadata, release behavior, and repository workflow policy.
_Avoid_: Product behavior change

**Remote publication**:
The separate, intentional act of pushing a locally created tag to a remote. It defaults to off and remains governed by the team's Git and release workflow.
_Avoid_: Automatic creation outcome, release itself

**Language edition**:
A complete Traditional Chinese or English version of the same Tagsmith product story and user journey. Each uses natural local wording while retaining equivalent claims, calls to action, and completeness.
_Avoid_: Primary language, secondary translation

**Repository maintainer or release owner**:
The person responsible for a repository's release convention and able to adopt Tagsmith for the team.
_Avoid_: General developer, individual contributor

**Primary conversion**:
For the Tagsmith landing page, the intended successful visitor action: copy and run `npx @carllee1983/tagsmith list` in an existing repository.
_Avoid_: Repository visit, vanity engagement

**Full-workflow route**:
The documentation route that takes a maintainer from safe evaluation through explicit configuration and later validated creation.
_Avoid_: Primary conversion, project-verification link

**First-use path**:
The zero-commitment way a visitor attempts Tagsmith for the first time: in a Git repository with Node.js 18+ available, run `npx @carllee1983/tagsmith list`. Preview with `next` only when the convention is clear; otherwise configure it, inspect again, then preview.
_Avoid_: Global installation, project adoption

**Zero-configuration evaluation**:
The SemVer-style discovery path that infers a common existing tag pattern. Other version models and ambiguous histories require an explicit convention.
_Avoid_: Universal convention inference

**Project adoption**:
The step that makes the tag convention shared and durable: initialize and commit `.tagsmith.json` after evaluating Tagsmith.
_Avoid_: Zero-configuration evaluation

**Tag line**:
An independent sequence of tags with its own pattern, version model, and push behavior. A project starts with one tag line; multiple tag lines are an advanced capability for distinct release streams.
_Avoid_: Required initial configuration, a branch

**Version model**:
The rule used by a tag line to represent and advance its version. Tagsmith supports SemVer, CalVer, and monotonically increasing build numbers; SemVer is the default evaluation path.
_Avoid_: A required choice before first use

**Merge policy**:
An optional, local workflow guardrail that helps maintainers enforce repository conventions during git workflows. It is not remote branch protection or server-side policy enforcement.
_Avoid_: Branch protection, remote policy, core product promise

**Evaluation path**:
The GitHub and documentation routes through which a visitor verifies Tagsmith before or after attempting the primary conversion.
_Avoid_: Primary call to action
